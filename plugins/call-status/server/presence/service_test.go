// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package presence

import (
	"errors"
	"maps"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type memStore struct {
	tracked map[string]Tracked
	joins   map[string]MeetJoin
}

func (m *memStore) Tracked() (map[string]Tracked, error) { return copyMap(m.tracked), nil }
func (m *memStore) MeetJoins() (map[string]MeetJoin, error) {
	return copyMap(m.joins), nil
}

func (m *memStore) SetTracked(userID string, t *Tracked) error {
	if t == nil {
		delete(m.tracked, userID)
	} else {
		m.tracked[userID] = *t
	}
	return nil
}

func (m *memStore) SetMeetJoin(userID string, j *MeetJoin) error {
	if j == nil {
		delete(m.joins, userID)
	} else {
		m.joins[userID] = *j
	}
	return nil
}

func copyMap[T any](in map[string]T) map[string]T { return maps.Clone(in) }

type fakeMM struct {
	calls    map[string]string
	callsErr error
	users    map[string]*model.User
	posts    map[string]*model.Post
	canRead  bool
	sets     int
}

func (f *fakeMM) UsersInCalls() (map[string]string, error) { return f.calls, f.callsErr }

func (f *fakeMM) GetUser(userID string) (*model.User, error) {
	if u, ok := f.users[userID]; ok {
		return u, nil
	}
	return nil, ErrUserGone
}

func (f *fakeMM) GetPost(postID string) (*model.Post, error) {
	if p, ok := f.posts[postID]; ok {
		return p, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeMM) CanReadChannel(string, string) bool { return f.canRead }

func (f *fakeMM) SetCustomStatus(userID string, cs *model.CustomStatus) error {
	f.sets++
	return f.users[userID].SetCustomStatus(cs)
}

func (f *fakeMM) ClearCustomStatus(userID string) error {
	f.users[userID].ClearCustomStatus()
	return nil
}

type fixedClock struct{ t time.Time }

func (c *fixedClock) Now() time.Time { return c.t }

type fixture struct {
	svc   *Service
	store *memStore
	mm    *fakeMM
	clock *fixedClock
}

func newFixture(t *testing.T, userIDs ...string) *fixture {
	t.Helper()
	users := map[string]*model.User{}
	for _, id := range userIDs {
		users[id] = &model.User{Id: id}
	}
	f := &fixture{
		store: &memStore{tracked: map[string]Tracked{}, joins: map[string]MeetJoin{}},
		mm:    &fakeMM{calls: map[string]string{}, users: users, posts: map[string]*model.Post{}, canRead: true},
		clock: &fixedClock{t: time.Date(2026, 11, 16, 10, 0, 0, 0, time.UTC)},
	}
	f.svc = NewService(f.store, f.mm, f.clock, func(string, ...any) {})
	return f
}

func (f *fixture) reconcile(t *testing.T) {
	t.Helper()
	require.NoError(t, f.svc.Reconcile())
}

func (f *fixture) status(id string) *model.CustomStatus { return f.mm.users[id].GetCustomStatus() }

func meetPost(id string) *model.Post {
	return &model.Post{Id: id, ChannelId: "ch", Type: MeetPostType, UserId: "starter"}
}

func TestCallSetsAndClearsStatus(t *testing.T) {
	f := newFixture(t, "u1")
	f.mm.calls["u1"] = "call1"
	f.reconcile(t)
	assert.True(t, isStatus(f.status("u1"), KindCall))

	f.reconcile(t) // unchanged: not set again
	assert.Equal(t, 1, f.mm.sets)

	delete(f.mm.calls, "u1")
	f.reconcile(t)
	assert.Nil(t, f.status("u1"))
	assert.Empty(t, f.store.tracked)
}

func TestOwnStatusIsKept(t *testing.T) {
	f := newFixture(t, "u1")
	require.NoError(t, f.mm.users["u1"].SetCustomStatus(&model.CustomStatus{Emoji: "palm_tree", Text: "On vacation"}))
	f.mm.calls["u1"] = "call1"
	f.reconcile(t)
	assert.Equal(t, "On vacation", f.status("u1").Text)

	delete(f.mm.calls, "u1")
	f.reconcile(t)
	assert.Equal(t, "On vacation", f.status("u1").Text)
}

func TestStatusShowsOnceOwnStatusExpires(t *testing.T) {
	f := newFixture(t, "u1")
	require.NoError(t, f.mm.users["u1"].SetCustomStatus(&model.CustomStatus{Emoji: "calendar", Text: "In a meeting", Duration: "date_and_time", ExpiresAt: f.clock.t.Add(time.Minute)}))
	f.mm.calls["u1"] = "call1"
	f.reconcile(t)
	assert.Equal(t, "In a meeting", f.status("u1").Text)

	f.clock.t = f.clock.t.Add(2 * time.Minute)
	f.reconcile(t)
	assert.True(t, isStatus(f.status("u1"), KindCall))
}

func TestClearedDuringCallIsNotSetAgain(t *testing.T) {
	f := newFixture(t, "u1")
	f.mm.calls["u1"] = "call1"
	f.reconcile(t)

	f.mm.users["u1"].ClearCustomStatus() // the user clears it
	f.reconcile(t)
	f.reconcile(t)
	assert.Nil(t, f.status("u1"))
	assert.True(t, f.store.tracked["u1"].Dismissed)

	f.mm.calls["u1"] = "call2" // a new call shows it again
	f.reconcile(t)
	assert.True(t, isStatus(f.status("u1"), KindCall))
}

func TestChangedDuringCallIsKeptAfterCall(t *testing.T) {
	f := newFixture(t, "u1")
	f.mm.calls["u1"] = "call1"
	f.reconcile(t)

	require.NoError(t, f.mm.users["u1"].SetCustomStatus(&model.CustomStatus{Emoji: "pizza", Text: "Lunch"}))
	f.reconcile(t)
	delete(f.mm.calls, "u1")
	f.reconcile(t)
	assert.Equal(t, "Lunch", f.status("u1").Text)
	assert.Empty(t, f.store.tracked)
}

func TestMeetJoinUntilMeetingEnds(t *testing.T) {
	f := newFixture(t, "u1")
	f.mm.posts["p1"] = meetPost("p1")
	require.NoError(t, f.svc.JoinedMeet("u1", "p1"))
	assert.True(t, isStatus(f.status("u1"), KindMeet))

	f.mm.posts["p1"].AddProp("meeting_ended", true)
	f.reconcile(t)
	assert.Nil(t, f.status("u1"))
	assert.Empty(t, f.store.joins)
}

func TestMeetJoinExpires(t *testing.T) {
	f := newFixture(t, "u1")
	f.mm.posts["p1"] = meetPost("p1")
	require.NoError(t, f.svc.JoinedMeet("u1", "p1"))

	f.clock.t = f.clock.t.Add(MeetMaxAge + time.Minute)
	f.reconcile(t)
	assert.Nil(t, f.status("u1"))
}

func TestJoinedMeetRejectsOtherPosts(t *testing.T) {
	f := newFixture(t, "u1")
	f.mm.posts["plain"] = &model.Post{Id: "plain", ChannelId: "ch"}
	ended := meetPost("ended")
	ended.AddProp("meeting_ended", true)
	f.mm.posts["ended"] = ended
	f.mm.posts["p1"] = meetPost("p1")

	assert.ErrorIs(t, f.svc.JoinedMeet("u1", "missing"), ErrNotMeeting)
	assert.ErrorIs(t, f.svc.JoinedMeet("u1", "plain"), ErrNotMeeting)
	assert.ErrorIs(t, f.svc.JoinedMeet("u1", "ended"), ErrNotMeeting)
	f.mm.canRead = false
	assert.ErrorIs(t, f.svc.JoinedMeet("u1", "p1"), ErrNotMeeting)
	assert.Empty(t, f.store.joins)
}

func TestStartingAMeetCountsAsJoining(t *testing.T) {
	f := newFixture(t, "starter")
	post := meetPost("p1")
	f.mm.posts["p1"] = post
	f.svc.OnPosted(post)
	assert.True(t, isStatus(f.status("starter"), KindMeet))

	f.svc.OnPosted(&model.Post{Id: "p2", UserId: "starter", Message: "hi"}) // other posts: ignored
	assert.Len(t, f.store.joins, 1)
}

func TestCallWinsOverMeetAndSwitchesBack(t *testing.T) {
	f := newFixture(t, "u1")
	f.mm.posts["p1"] = meetPost("p1")
	require.NoError(t, f.svc.JoinedMeet("u1", "p1"))
	f.mm.calls["u1"] = "call1"
	f.reconcile(t)
	assert.True(t, isStatus(f.status("u1"), KindCall))

	delete(f.mm.calls, "u1")
	f.reconcile(t)
	assert.True(t, isStatus(f.status("u1"), KindMeet))
}

func TestLookupFailureChangesNothing(t *testing.T) {
	f := newFixture(t, "u1")
	f.mm.calls["u1"] = "call1"
	f.reconcile(t)

	f.mm.callsErr = errors.New("db down")
	assert.Error(t, f.svc.Reconcile())
	assert.True(t, isStatus(f.status("u1"), KindCall))
}

func TestBotsAreSkipped(t *testing.T) {
	f := newFixture(t, "bot")
	f.mm.users["bot"].IsBot = true
	f.mm.calls["bot"] = "call1"
	f.reconcile(t)
	assert.Nil(t, f.status("bot"))
}

func TestClearAll(t *testing.T) {
	f := newFixture(t, "u1", "u2")
	f.mm.calls["u1"] = "call1"
	f.mm.calls["u2"] = "call1"
	f.reconcile(t)
	require.NoError(t, f.mm.users["u2"].SetCustomStatus(&model.CustomStatus{Emoji: "pizza", Text: "Lunch"}))

	f.svc.ClearAll()
	assert.Nil(t, f.status("u1"))
	assert.Equal(t, "Lunch", f.status("u2").Text)
	assert.Empty(t, f.store.tracked)
}

func TestDeletedUserRecordIsDropped(t *testing.T) {
	f := newFixture(t, "u1")
	f.mm.calls["u1"] = "call1"
	f.reconcile(t)
	delete(f.mm.users, "u1")
	delete(f.mm.calls, "u1")
	f.reconcile(t)
	assert.Empty(t, f.store.tracked)
}
