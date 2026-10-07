// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package scheduled

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- fakes ---------------------------------------------------------------

type memStore struct {
	data    map[string][]byte
	casFail bool // simulate another node changing the record first
}

func newMemStore() *memStore { return &memStore{data: map[string][]byte{}} }

func (m *memStore) Get(id string) (*Post, []byte, error) {
	raw, ok := m.data[id]
	if !ok {
		return nil, nil, nil
	}
	var p Post
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, nil, err
	}
	return &p, raw, nil
}

func (m *memStore) Put(p *Post) error {
	raw, err := json.Marshal(p)
	m.data[p.ID] = raw
	return err
}

func (m *memStore) CompareAndSwap(old []byte, p *Post) (bool, error) {
	if m.casFail || string(m.data[p.ID]) != string(old) {
		return false, nil
	}
	return true, m.Put(p)
}

func (m *memStore) Delete(id string) error { delete(m.data, id); return nil }

func (m *memStore) All() ([]*Post, error) {
	var out []*Post
	for id := range m.data {
		p, _, _ := m.Get(id)
		out = append(out, p)
	}
	return out, nil
}

type fakeMM struct {
	users     map[string]*model.User
	channels  map[string]*model.Channel
	posts     map[string]*model.Post
	files     map[string]*model.FileInfo
	canPost   map[string]bool // userID+":"+channelID
	created   []*model.Post
	createErr error
	dms       []string
	notified  []string
	nextID    int
}

func newFakeMM() *fakeMM {
	return &fakeMM{
		users:    map[string]*model.User{"alice": {Id: "alice"}, "bob": {Id: "bob"}},
		channels: map[string]*model.Channel{"town": {Id: "town", Name: "town-square", Type: model.ChannelTypeOpen}, "other": {Id: "other", Name: "other", Type: model.ChannelTypeOpen}},
		posts:    map[string]*model.Post{"root1": {Id: "root1", ChannelId: "town"}, "reply1": {Id: "reply1", ChannelId: "town", RootId: "root1"}, "rootOther": {Id: "rootOther", ChannelId: "other"}},
		files:    map[string]*model.FileInfo{"f1": {Id: "f1", CreatorId: "alice", ChannelId: "town"}, "fBob": {Id: "fBob", CreatorId: "bob"}, "fPosted": {Id: "fPosted", CreatorId: "alice", PostId: "p9"}},
		canPost:  map[string]bool{"alice:town": true, "alice:other": true, "bob:town": true},
	}
}

func (f *fakeMM) CanPost(u, c string) bool { return f.canPost[u+":"+c] }
func (f *fakeMM) GetChannel(id string) (*model.Channel, error) {
	if c, ok := f.channels[id]; ok {
		return c, nil
	}
	return nil, errors.New("not found")
}
func (f *fakeMM) GetPost(id string) (*model.Post, error) {
	if p, ok := f.posts[id]; ok {
		return p, nil
	}
	return nil, errors.New("not found")
}
func (f *fakeMM) GetUser(id string) (*model.User, error) {
	if u, ok := f.users[id]; ok {
		return u, nil
	}
	return nil, errors.New("not found")
}
func (f *fakeMM) GetFileInfo(id string) (*model.FileInfo, error) {
	if fi, ok := f.files[id]; ok {
		return fi, nil
	}
	return nil, errors.New("not found")
}
func (f *fakeMM) CreatePost(p *model.Post) error {
	if f.createErr != nil {
		return f.createErr
	}
	f.created = append(f.created, p)
	return nil
}
func (f *fakeMM) DirectMessage(userID, msg string) error {
	f.dms = append(f.dms, userID+"|"+msg)
	return nil
}
func (f *fakeMM) NotifyChanged(userID string) { f.notified = append(f.notified, userID) }
func (f *fakeMM) NewID() string               { f.nextID++; return fmt.Sprintf("id%024d", f.nextID) }

type fixedClock struct{ t time.Time }

func (c *fixedClock) Now() time.Time { return c.t }

var t0 = time.Date(2026, 10, 7, 12, 0, 0, 0, time.UTC)

func newTestService() (*Service, *memStore, *fakeMM, *fixedClock) {
	store, mm, clock := newMemStore(), newFakeMM(), &fixedClock{t: t0}
	return NewService(store, mm, clock, func(string, ...any) {}), store, mm, clock
}

func in(d time.Duration) int64 { return t0.Add(d).UnixMilli() }

func userMsg(t *testing.T, err error) string {
	t.Helper()
	var ue *UserError
	require.True(t, errors.As(err, &ue), "expected a user-facing error, got %v", err)
	return ue.Msg
}

// ---- create --------------------------------------------------------------

func TestCreateQueuesAValidDraftWithThreadAndFiles(t *testing.T) {
	s, store, mm, _ := newTestService()
	p, err := s.Create("alice", CreateRequest{ChannelID: "town", RootID: "root1", Message: "standup in 5 \n", FileIDs: []string{"f1"}, SendAt: in(time.Hour)})
	require.NoError(t, err)
	assert.Equal(t, StatusPending, p.Status)
	assert.Equal(t, "standup in 5", p.Message, "trailing whitespace trimmed")
	assert.Len(t, store.data, 1)
	assert.Equal(t, []string{"alice"}, mm.notified)
}

func TestCreateRejectsWhatCannotBePosted(t *testing.T) {
	cases := map[string]struct {
		req  CreateRequest
		want string
	}{
		"empty":            {CreateRequest{ChannelID: "town", Message: "  ", SendAt: in(time.Hour)}, "Write a message"},
		"too soon":         {CreateRequest{ChannelID: "town", Message: "x", SendAt: in(10 * time.Second)}, "in the future"},
		"in the past":      {CreateRequest{ChannelID: "town", Message: "x", SendAt: in(-time.Hour)}, "in the future"},
		"too far":          {CreateRequest{ChannelID: "town", Message: "x", SendAt: in(400 * 24 * time.Hour)}, "a year"},
		"no permission":    {CreateRequest{ChannelID: "nope", Message: "x", SendAt: in(time.Hour)}, "no longer exists"},
		"thread elsewhere": {CreateRequest{ChannelID: "town", RootID: "rootOther", Message: "x", SendAt: in(time.Hour)}, "doesn't belong"},
		"reply as root":    {CreateRequest{ChannelID: "town", RootID: "reply1", Message: "x", SendAt: in(time.Hour)}, "doesn't belong"},
		"someone's file":   {CreateRequest{ChannelID: "town", FileIDs: []string{"fBob"}, SendAt: in(time.Hour)}, "uploaded yourself"},
		"posted file":      {CreateRequest{ChannelID: "town", FileIDs: []string{"fPosted"}, SendAt: in(time.Hour)}, "already been posted"},
		"too many files":   {CreateRequest{ChannelID: "town", FileIDs: make([]string, MaxFiles+1), SendAt: in(time.Hour)}, "at most"},
		"too long":         {CreateRequest{ChannelID: "town", Message: strings.Repeat("a", model.PostMessageMaxRunesV2+1), SendAt: in(time.Hour)}, "too long"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			s, store, _, _ := newTestService()
			_, err := s.Create("alice", tc.req)
			assert.Contains(t, userMsg(t, err), tc.want)
			assert.Empty(t, store.data)
		})
	}
}

func TestCreateRejectsWhenUserLacksPermission(t *testing.T) {
	s, _, _, _ := newTestService()
	_, err := s.Create("bob", CreateRequest{ChannelID: "other", Message: "x", SendAt: in(time.Hour)})
	assert.Contains(t, userMsg(t, err), "can't post")
}

func TestCreateEnforcesPerUserLimit(t *testing.T) {
	s, _, _, _ := newTestService()
	for i := 0; i < MaxPerUser; i++ {
		_, err := s.Create("alice", CreateRequest{ChannelID: "town", Message: "x", SendAt: in(time.Hour)})
		require.NoError(t, err)
	}
	_, err := s.Create("alice", CreateRequest{ChannelID: "town", Message: "x", SendAt: in(time.Hour)})
	assert.Contains(t, userMsg(t, err), "maximum")
}

// ---- list / ownership ------------------------------------------------------

func TestListIsPerUserAndSoonestFirst(t *testing.T) {
	s, _, _, _ := newTestService()
	_, _ = s.Create("alice", CreateRequest{ChannelID: "town", Message: "later", SendAt: in(3 * time.Hour)})
	_, _ = s.Create("alice", CreateRequest{ChannelID: "town", Message: "sooner", SendAt: in(time.Hour)})
	_, _ = s.Create("bob", CreateRequest{ChannelID: "town", Message: "bob's", SendAt: in(time.Hour)})

	mine, err := s.List("alice")
	require.NoError(t, err)
	require.Len(t, mine, 2)
	assert.Equal(t, "sooner", mine[0].Message)
	assert.Equal(t, "later", mine[1].Message)
}

func TestOtherUsersMessagesLookMissing(t *testing.T) {
	s, store, _, _ := newTestService()
	p, _ := s.Create("alice", CreateRequest{ChannelID: "town", Message: "x", SendAt: in(time.Hour)})

	assert.ErrorIs(t, s.Delete("bob", p.ID), ErrNotFound)
	_, err := s.Reschedule("bob", p.ID, in(2*time.Hour))
	assert.ErrorIs(t, err, ErrNotFound)
	assert.ErrorIs(t, s.SendNow("bob", p.ID), ErrNotFound)
	assert.Len(t, store.data, 1)
}

// ---- sending ---------------------------------------------------------------

func TestSendDuePostsAsTheUserInTheThreadWithFiles(t *testing.T) {
	s, store, mm, clock := newTestService()
	due, _ := s.Create("alice", CreateRequest{ChannelID: "town", RootID: "root1", Message: "hello @team", FileIDs: []string{"f1"}, SendAt: in(time.Hour)})
	_, _ = s.Create("alice", CreateRequest{ChannelID: "town", Message: "not yet", SendAt: in(2 * time.Hour)})

	clock.t = t0.Add(time.Hour + 30*time.Second)
	s.SendDue()

	require.Len(t, mm.created, 1)
	got := mm.created[0]
	assert.Equal(t, "alice", got.UserId)
	assert.Equal(t, "town", got.ChannelId)
	assert.Equal(t, "root1", got.RootId)
	assert.Equal(t, "hello @team", got.Message)
	assert.Equal(t, model.StringArray{"f1"}, got.FileIds)
	_, stillThere := store.data[due.ID]
	assert.False(t, stillThere, "sent message leaves the queue")
	assert.Len(t, store.data, 1, "the later message stays")
	assert.Empty(t, mm.dms)
}

func TestSendDueFailsSafelyAndDMsTheTextWhenUserCantPostAnymore(t *testing.T) {
	s, store, mm, clock := newTestService()
	p, _ := s.Create("alice", CreateRequest{ChannelID: "town", Message: "line one\nline two", SendAt: in(time.Hour)})
	mm.canPost["alice:town"] = false

	clock.t = t0.Add(2 * time.Hour)
	s.SendDue()

	assert.Empty(t, mm.created)
	saved, _, _ := store.Get(p.ID)
	assert.Equal(t, StatusFailed, saved.Status)
	assert.Contains(t, saved.Error, "can't post")
	require.Len(t, mm.dms, 1)
	assert.Contains(t, mm.dms[0], "~town-square")
	assert.Contains(t, mm.dms[0], "> line one\n> line two")

	// A failed message is not retried automatically.
	s.SendDue()
	assert.Len(t, mm.dms, 1)
}

func TestSendDueReportsServerRefusal(t *testing.T) {
	s, store, mm, clock := newTestService()
	p, _ := s.Create("alice", CreateRequest{ChannelID: "town", Message: "x", SendAt: in(time.Hour)})
	mm.createErr = errors.New("rate limited")

	clock.t = t0.Add(2 * time.Hour)
	s.SendDue()

	saved, _, _ := store.Get(p.ID)
	assert.Equal(t, StatusFailed, saved.Status)
	assert.Contains(t, saved.Error, "rate limited")
	assert.Len(t, mm.dms, 1)
}

func TestSendDueSkipsMessagesAnotherNodeClaimedFirst(t *testing.T) {
	s, store, mm, clock := newTestService()
	_, _ = s.Create("alice", CreateRequest{ChannelID: "town", Message: "x", SendAt: in(time.Hour)})
	store.casFail = true

	clock.t = t0.Add(2 * time.Hour)
	s.SendDue()
	assert.Empty(t, mm.created, "posted at most once")
}

func TestInterruptedSendIsMarkedFailedNotRepeated(t *testing.T) {
	s, store, mm, clock := newTestService()
	p, _ := s.Create("alice", CreateRequest{ChannelID: "town", Message: "x", SendAt: in(time.Hour)})
	p.Status = StatusSending
	p.ClaimedAt = t0.Add(time.Hour).UnixMilli()
	require.NoError(t, store.Put(p))

	clock.t = t0.Add(time.Hour + StaleSendingFor + time.Minute)
	s.SendDue()

	saved, _, _ := store.Get(p.ID)
	assert.Equal(t, StatusFailed, saved.Status)
	assert.Contains(t, saved.Error, "may or may not have been posted")
	assert.Empty(t, mm.created)
}

func TestSendNowReturnsErrorsToTheCallerInsteadOfDM(t *testing.T) {
	s, store, mm, _ := newTestService()
	p, _ := s.Create("alice", CreateRequest{ChannelID: "town", Message: "x", SendAt: in(time.Hour)})
	require.NoError(t, s.SendNow("alice", p.ID))
	assert.Len(t, mm.created, 1)
	assert.Empty(t, store.data)

	p2, _ := s.Create("alice", CreateRequest{ChannelID: "town", Message: "y", SendAt: in(time.Hour)})
	mm.canPost["alice:town"] = false
	err := s.SendNow("alice", p2.ID)
	assert.Contains(t, userMsg(t, err), "can't post")
	assert.Empty(t, mm.dms)
}

// ---- reschedule / delete ---------------------------------------------------

func TestRescheduleRevivesAFailedMessage(t *testing.T) {
	s, store, mm, clock := newTestService()
	p, _ := s.Create("alice", CreateRequest{ChannelID: "town", Message: "x", SendAt: in(time.Hour)})
	mm.canPost["alice:town"] = false
	clock.t = t0.Add(2 * time.Hour)
	s.SendDue()

	mm.canPost["alice:town"] = true
	updated, err := s.Reschedule("alice", p.ID, clock.t.Add(time.Hour).UnixMilli())
	require.NoError(t, err)
	assert.Equal(t, StatusPending, updated.Status)
	assert.Empty(t, updated.Error)

	clock.t = clock.t.Add(2 * time.Hour)
	s.SendDue()
	assert.Len(t, mm.created, 1)
	assert.Empty(t, store.data)
}

func TestCannotChangeAMessageWhileItIsBeingSent(t *testing.T) {
	s, store, _, _ := newTestService()
	p, _ := s.Create("alice", CreateRequest{ChannelID: "town", Message: "x", SendAt: in(time.Hour)})
	p.Status = StatusSending
	require.NoError(t, store.Put(p))

	_, err := s.Reschedule("alice", p.ID, in(2*time.Hour))
	assert.Contains(t, userMsg(t, err), "being sent")
	assert.Contains(t, userMsg(t, s.Delete("alice", p.ID)), "being sent")
}
