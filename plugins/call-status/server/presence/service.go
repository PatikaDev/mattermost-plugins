// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package presence

import (
	"errors"
	"sync"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

var (
	// ErrNotMeeting is returned when a post isn't an open Google Meet meeting the user can see.
	ErrNotMeeting = errors.New("not an open Google Meet meeting")
	// ErrUserGone is returned by Mattermost.GetUser for a user that doesn't exist, so their
	// record can be dropped.
	ErrUserGone = errors.New("user not found")
)

// Service keeps each user's custom status in step with the calls and meetings they're in.
//
// It only ever changes a status it set itself: someone with their own status keeps it, and
// someone who changes or clears the plugin's status keeps their choice until the call ends.
type Service struct {
	store Store
	mm    Mattermost
	clock Clock
	warn  func(msg string, keyValuePairs ...any)

	mu sync.Mutex // one reconcile at a time on this node
}

func NewService(store Store, mm Mattermost, clock Clock, warn func(string, ...any)) *Service {
	return &Service{store: store, mm: mm, clock: clock, warn: warn}
}

// JoinedMeet records that userID went into the meeting of postID (they clicked Join).
func (s *Service) JoinedMeet(userID, postID string) error {
	post, err := s.mm.GetPost(postID)
	if err != nil || !isOpenMeeting(post) || !s.mm.CanReadChannel(userID, post.ChannelId) {
		return ErrNotMeeting
	}
	if err := s.store.SetMeetJoin(userID, &MeetJoin{PostID: postID, At: s.clock.Now()}); err != nil {
		return err
	}
	if err := s.Reconcile(); err != nil { // the next scheduled check retries
		s.warn("Failed to update call statuses", "err", err.Error())
	}
	return nil
}

// OnPosted handles a new post: whoever starts a Google Meet from Mattermost joins it
// (the Google Meet plugin opens the meeting for them).
func (s *Service) OnPosted(post *model.Post) {
	if post == nil || post.Type != MeetPostType || post.UserId == "" {
		return
	}
	if err := s.store.SetMeetJoin(post.UserId, &MeetJoin{PostID: post.Id, At: s.clock.Now()}); err != nil {
		s.warn("Failed to record a Google Meet start", "err", err.Error())
		return
	}
	if err := s.Reconcile(); err != nil {
		s.warn("Failed to update call statuses", "err", err.Error())
	}
}

// Reconcile sets, changes and clears statuses so they match who is in a call or meeting now.
func (s *Service) Reconcile() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	desired, err := s.desired()
	if err != nil {
		return err
	}
	tracked, err := s.store.Tracked()
	if err != nil {
		return err
	}

	for userID, t := range tracked {
		want, active := desired[userID]
		user, err := s.mm.GetUser(userID)
		if err != nil {
			if errors.Is(err, ErrUserGone) {
				_ = s.store.SetTracked(userID, nil)
			}
			continue // try again next time
		}
		ours := isStatus(user.GetCustomStatus(), t.Kind)

		if active && want.Kind == t.Kind && want.Key == t.Key {
			if !t.Dismissed && !ours { // the user changed or cleared it: leave them be
				t.Dismissed = true
				s.save(userID, &t)
			}
			continue
		}

		// The activity ended or became a different one.
		if ours && !t.Dismissed {
			if !active {
				if err := s.mm.ClearCustomStatus(userID); err != nil {
					s.warn("Failed to clear a call status", "user_id", userID, "err", err.Error())
					continue
				}
			}
		} else {
			ours = false
		}
		s.save(userID, nil)
		if active {
			s.apply(user, want, ours)
		}
	}

	for userID, want := range desired {
		if _, ok := tracked[userID]; ok {
			continue
		}
		user, err := s.mm.GetUser(userID)
		if err != nil {
			continue
		}
		s.apply(user, want, false)
	}
	return nil
}

// ClearAll removes every status the plugin set (when the plugin is turned off).
func (s *Service) ClearAll() {
	s.mu.Lock()
	defer s.mu.Unlock()

	tracked, err := s.store.Tracked()
	if err != nil {
		s.warn("Failed to read call statuses", "err", err.Error())
		return
	}
	for userID, t := range tracked {
		if user, err := s.mm.GetUser(userID); err == nil && !t.Dismissed && isStatus(user.GetCustomStatus(), t.Kind) {
			if err := s.mm.ClearCustomStatus(userID); err != nil {
				s.warn("Failed to clear a call status", "user_id", userID, "err", err.Error())
				continue
			}
		}
		s.save(userID, nil)
	}
}

// desired works out what each user is in right now; a call wins over a meeting.
func (s *Service) desired() (map[string]Activity, error) {
	calls, err := s.mm.UsersInCalls()
	if err != nil {
		return nil, err // don't clear anyone's status just because the lookup failed
	}
	desired := make(map[string]Activity, len(calls))
	for userID, callID := range calls {
		desired[userID] = Activity{Kind: KindCall, Key: callID}
	}

	joins, err := s.store.MeetJoins()
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	for userID, j := range joins {
		if now.Sub(j.At) > MeetMaxAge || !s.meetingOpen(j.PostID) {
			s.saveJoin(userID, nil)
			continue
		}
		if _, inCall := desired[userID]; !inCall {
			desired[userID] = Activity{Kind: KindMeet, Key: j.PostID}
		}
	}
	return desired, nil
}

func (s *Service) meetingOpen(postID string) bool {
	post, err := s.mm.GetPost(postID)
	return err == nil && isOpenMeeting(post)
}

// apply shows want's status, unless the user already has a status of their own. replaceOurs
// is true when the current status is one the plugin set for an activity that just ended.
func (s *Service) apply(user *model.User, want Activity, replaceOurs bool) {
	if user.IsBot || user.DeleteAt != 0 {
		return
	}
	if !replaceOurs && hasStatus(user.GetCustomStatus(), s.clock.Now()) {
		return // theirs; checked again next time, so it shows once theirs is gone
	}
	cs := StatusFor(want.Kind)
	if err := s.mm.SetCustomStatus(user.Id, &cs); err != nil {
		s.warn("Failed to set a call status", "user_id", user.Id, "err", err.Error())
		return
	}
	s.save(user.Id, &Tracked{Kind: want.Kind, Key: want.Key})
}

func (s *Service) save(userID string, t *Tracked) {
	if err := s.store.SetTracked(userID, t); err != nil {
		s.warn("Failed to save a call status", "user_id", userID, "err", err.Error())
	}
}

func (s *Service) saveJoin(userID string, j *MeetJoin) {
	if err := s.store.SetMeetJoin(userID, j); err != nil {
		s.warn("Failed to save a Google Meet join", "user_id", userID, "err", err.Error())
	}
}

func isOpenMeeting(post *model.Post) bool {
	if post == nil || post.DeleteAt != 0 || post.Type != MeetPostType {
		return false
	}
	ended, _ := post.GetProp("meeting_ended").(bool)
	return !ended
}

// isStatus reports whether cs is the plugin's status for kind.
func isStatus(cs *model.CustomStatus, kind Kind) bool {
	want := StatusFor(kind)
	return cs != nil && cs.Emoji == want.Emoji && cs.Text == want.Text
}

// hasStatus reports whether cs is a status that is set and not yet expired.
func hasStatus(cs *model.CustomStatus, now time.Time) bool {
	if cs == nil || (cs.Emoji == "" && cs.Text == "") {
		return false
	}
	return cs.Duration == "" || cs.ExpiresAt.IsZero() || cs.ExpiresAt.After(now)
}
