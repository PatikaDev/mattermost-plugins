// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package scheduled

import (
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mattermost/mattermost/server/public/model"
)

type Service struct {
	store Store
	mm    Mattermost
	clock Clock
	log   func(msg string, keyValuePairs ...any)
}

func NewService(store Store, mm Mattermost, clock Clock, log func(msg string, keyValuePairs ...any)) *Service {
	return &Service{store: store, mm: mm, clock: clock, log: log}
}

func (s *Service) nowMillis() int64 { return s.clock.Now().UnixMilli() }

// Create validates a draft and queues it.
func (s *Service) Create(userID string, req CreateRequest) (*Post, error) {
	message := strings.TrimRight(req.Message, " \t\r\n")
	if strings.TrimSpace(message) == "" && len(req.FileIDs) == 0 {
		return nil, userErr("Write a message or attach a file before scheduling.")
	}
	if utf8.RuneCountInString(message) > model.PostMessageMaxRunesV2 {
		return nil, userErr("The message is too long to schedule.")
	}
	if len(req.FileIDs) > MaxFiles {
		return nil, userErr(fmt.Sprintf("A scheduled message can have at most %d attachments.", MaxFiles))
	}
	if err := s.checkSendAt(req.SendAt); err != nil {
		return nil, err
	}

	mine, err := s.List(userID)
	if err != nil {
		return nil, err
	}
	if len(mine) >= MaxPerUser {
		return nil, userErr(fmt.Sprintf("You already have %d scheduled messages, the maximum.", MaxPerUser))
	}

	if err := s.checkCanPost(userID, req.ChannelID, req.RootID); err != nil {
		return nil, err
	}
	if err := s.checkFiles(userID, req.ChannelID, req.FileIDs); err != nil {
		return nil, err
	}

	now := s.nowMillis()
	p := &Post{
		ID:        s.mm.NewID(),
		UserID:    userID,
		ChannelID: req.ChannelID,
		RootID:    req.RootID,
		Message:   message,
		FileIDs:   append([]string{}, req.FileIDs...),
		SendAt:    req.SendAt,
		CreatedAt: now,
		UpdatedAt: now,
		Status:    StatusPending,
	}
	if err := s.store.Put(p); err != nil {
		return nil, err
	}
	s.mm.NotifyChanged(userID)
	return p, nil
}

// List returns the user's queue, soonest first.
func (s *Service) List(userID string) ([]*Post, error) {
	all, err := s.store.All()
	if err != nil {
		return nil, err
	}
	mine := make([]*Post, 0, len(all))
	for _, p := range all {
		if p.UserID == userID {
			mine = append(mine, p)
		}
	}
	sort.Slice(mine, func(i, j int) bool { return mine[i].SendAt < mine[j].SendAt })
	return mine, nil
}

// Reschedule moves a message to a new time. A failed message becomes pending again.
func (s *Service) Reschedule(userID, id string, sendAt int64) (*Post, error) {
	p, _, err := s.owned(userID, id)
	if err != nil {
		return nil, err
	}
	if p.Status == StatusSending {
		return nil, userErr("This message is being sent right now.")
	}
	if err := s.checkSendAt(sendAt); err != nil {
		return nil, err
	}
	p.SendAt = sendAt
	p.Status = StatusPending
	p.Error = ""
	p.UpdatedAt = s.nowMillis()
	if err := s.store.Put(p); err != nil {
		return nil, err
	}
	s.mm.NotifyChanged(userID)
	return p, nil
}

func (s *Service) Delete(userID, id string) error {
	p, _, err := s.owned(userID, id)
	if err != nil {
		return err
	}
	if p.Status == StatusSending {
		return userErr("This message is being sent right now.")
	}
	if err := s.store.Delete(id); err != nil {
		return err
	}
	s.mm.NotifyChanged(userID)
	return nil
}

// SendNow posts a pending or failed message immediately. Errors are returned to the
// caller (the user clicked the button) instead of being sent as a DM.
func (s *Service) SendNow(userID, id string) error {
	p, raw, err := s.owned(userID, id)
	if err != nil {
		return err
	}
	if p.Status == StatusSending {
		return userErr("This message is being sent right now.")
	}
	return s.send(p, raw, false)
}

// SendDue posts every pending message whose time has come. Called by the cluster job.
func (s *Service) SendDue() {
	all, err := s.store.All()
	if err != nil {
		s.log("Failed to list scheduled messages", "error", err.Error())
		return
	}
	now := s.nowMillis()
	for _, p := range all {
		switch {
		case p.Status == StatusPending && p.SendAt <= now:
			_, raw, getErr := s.store.Get(p.ID)
			if getErr != nil || raw == nil {
				continue
			}
			if err := s.send(p, raw, true); err != nil {
				s.log("Scheduled message not sent", "id", p.ID, "error", err.Error())
			}
		case p.Status == StatusSending && now-p.ClaimedAt > StaleSendingFor.Milliseconds():
			// The sender stopped mid-way (server restart). We can't know whether the post
			// went out, so don't retry automatically and risk a duplicate.
			s.fail(p, "Sending was interrupted, so it may or may not have been posted. Check the conversation before sending it again.", true)
		}
	}
}

// send claims the message atomically, re-checks everything, and posts it as the user.
func (s *Service) send(p *Post, raw []byte, notifyByDM bool) error {
	claimed := *p
	claimed.Status = StatusSending
	claimed.ClaimedAt = s.nowMillis()
	claimed.Error = ""
	ok, err := s.store.CompareAndSwap(raw, &claimed)
	if err != nil {
		return err
	}
	if !ok {
		return userErr("This message was changed or is already being sent.")
	}

	if err := s.checkStillValid(&claimed); err != nil {
		s.fail(&claimed, err.Error(), notifyByDM)
		return err
	}

	post := &model.Post{
		UserId:    claimed.UserID,
		ChannelId: claimed.ChannelID,
		RootId:    claimed.RootID,
		Message:   claimed.Message,
		FileIds:   claimed.FileIDs,
	}
	if err := s.mm.CreatePost(post); err != nil {
		msg := "Mattermost refused the message: " + err.Error()
		s.fail(&claimed, msg, notifyByDM)
		return userErr(msg)
	}

	if err := s.store.Delete(claimed.ID); err != nil {
		s.log("Sent scheduled message but could not remove it from the queue", "id", claimed.ID, "error", err.Error())
	}
	s.mm.NotifyChanged(claimed.UserID)
	return nil
}

func (s *Service) fail(p *Post, reason string, notifyByDM bool) {
	p.Status = StatusFailed
	p.Error = reason
	p.UpdatedAt = s.nowMillis()
	if err := s.store.Put(p); err != nil {
		s.log("Failed to record scheduled message failure", "id", p.ID, "error", err.Error())
	}
	s.mm.NotifyChanged(p.UserID)
	if notifyByDM {
		if err := s.mm.DirectMessage(p.UserID, s.failureMessage(p, reason)); err != nil {
			s.log("Failed to DM scheduled message failure", "id", p.ID, "error", err.Error())
		}
	}
}

func (s *Service) failureMessage(p *Post, reason string) string {
	where := "a conversation"
	if ch, err := s.mm.GetChannel(p.ChannelID); err == nil && ch != nil {
		switch ch.Type {
		case model.ChannelTypeOpen, model.ChannelTypePrivate:
			where = "~" + ch.Name
		default:
			where = "a direct message"
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Your scheduled message to %s couldn't be sent: %s\n", where, reason)
	b.WriteString("It is still in your Scheduled messages list, where you can change the time or delete it.")
	if strings.TrimSpace(p.Message) != "" {
		b.WriteString("\n\nThe message was:\n")
		for line := range strings.SplitSeq(p.Message, "\n") {
			b.WriteString("> " + line + "\n")
		}
	}
	return b.String()
}

func (s *Service) owned(userID, id string) (*Post, []byte, error) {
	p, raw, err := s.store.Get(id)
	if err != nil {
		return nil, nil, err
	}
	if p == nil || p.UserID != userID {
		return nil, nil, ErrNotFound
	}
	return p, raw, nil
}

func (s *Service) checkSendAt(sendAt int64) error {
	now := s.clock.Now()
	at := time.UnixMilli(sendAt)
	if at.Before(now.Add(MinLead)) {
		return userErr("Pick a time in the future.")
	}
	if at.After(now.Add(MaxLead)) {
		return userErr("Messages can be scheduled up to a year ahead.")
	}
	return nil
}

func (s *Service) checkCanPost(userID, channelID, rootID string) error {
	user, err := s.mm.GetUser(userID)
	if err != nil || user == nil || user.DeleteAt != 0 {
		return userErr("Your account can't post right now.")
	}
	ch, err := s.mm.GetChannel(channelID)
	if err != nil || ch == nil {
		return userErr("The conversation no longer exists.")
	}
	if ch.DeleteAt != 0 {
		return userErr("The channel has been archived.")
	}
	if !s.mm.CanPost(userID, channelID) {
		return userErr("You can't post in this conversation anymore.")
	}
	if rootID != "" {
		root, err := s.mm.GetPost(rootID)
		if err != nil || root == nil || root.DeleteAt != 0 {
			return userErr("The thread has been deleted.")
		}
		if root.ChannelId != channelID || root.RootId != "" {
			return userErr("The thread doesn't belong to this conversation.")
		}
	}
	return nil
}

func (s *Service) checkFiles(userID, channelID string, fileIDs []string) error {
	for _, id := range fileIDs {
		info, err := s.mm.GetFileInfo(id)
		if err != nil || info == nil || info.DeleteAt != 0 {
			return userErr("An attachment was removed.")
		}
		if info.CreatorId != userID {
			return userErr("You can only schedule attachments you uploaded yourself.")
		}
		if info.PostId != "" {
			return userErr("An attachment has already been posted.")
		}
		if info.ChannelId != "" && info.ChannelId != channelID {
			return userErr("An attachment was uploaded to another conversation.")
		}
	}
	return nil
}

func (s *Service) checkStillValid(p *Post) error {
	if err := s.checkCanPost(p.UserID, p.ChannelID, p.RootID); err != nil {
		return err
	}
	return s.checkFiles(p.UserID, p.ChannelID, p.FileIDs)
}
