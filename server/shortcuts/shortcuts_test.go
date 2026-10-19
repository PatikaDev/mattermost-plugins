// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package shortcuts

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type memStore struct {
	data     map[string][]byte
	casFails bool
}

func (m *memStore) Get(id string) ([]Shortcut, []byte, error) {
	raw, ok := m.data[id]
	if !ok {
		return nil, nil, nil
	}
	var l []Shortcut
	return l, raw, json.Unmarshal(raw, &l)
}

func (m *memStore) CompareAndSwap(id string, old []byte, l []Shortcut) (bool, error) {
	if m.casFails || string(m.data[id]) != string(old) {
		return false, nil
	}
	raw, _ := json.Marshal(l)
	m.data[id] = raw
	return true, nil
}

type fakeMM struct {
	channels  map[string]*model.Channel
	users     map[string]*model.User
	members   map[string]*model.ChannelMember
	team      map[string]*model.TeamMember
	readers   map[string]bool
	notified  []string
	idCounter int
}

func newFake() *fakeMM {
	f := &fakeMM{
		channels: map[string]*model.Channel{
			"design": {Id: "design", TeamId: "t", Type: model.ChannelTypePrivate},
			"dm":     {Id: "dm", Type: model.ChannelTypeDirect},
			"old":    {Id: "old", TeamId: "t", Type: model.ChannelTypeOpen, DeleteAt: 1},
		},
		users: map[string]*model.User{
			"member":   {Id: "member", Roles: "system_user"},
			"chadmin":  {Id: "chadmin", Roles: "system_user"},
			"tmadmin":  {Id: "tmadmin", Roles: "system_user"},
			"sysadmin": {Id: "sysadmin", Roles: "system_user system_admin"},
			"outsider": {Id: "outsider", Roles: "system_user"},
		},
		members: map[string]*model.ChannelMember{},
		team:    map[string]*model.TeamMember{"t/tmadmin": {TeamId: "t", UserId: "tmadmin", SchemeAdmin: true}},
		readers: map[string]bool{},
	}
	for _, u := range []string{"member", "chadmin", "tmadmin"} {
		f.members["design/"+u] = &model.ChannelMember{ChannelId: "design", UserId: u, SchemeAdmin: u == "chadmin"}
		f.readers["design/"+u] = true
	}
	f.readers["design/sysadmin"] = true
	f.members["dm/member"] = &model.ChannelMember{ChannelId: "dm", UserId: "member"}
	f.readers["dm/member"] = true
	f.members["old/chadmin"] = &model.ChannelMember{ChannelId: "old", UserId: "chadmin", SchemeAdmin: true}
	f.readers["old/chadmin"] = true
	return f
}

func (f *fakeMM) GetChannel(id string) (*model.Channel, error) {
	if c, ok := f.channels[id]; ok {
		return c, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeMM) GetUser(id string) (*model.User, error) {
	if u, ok := f.users[id]; ok {
		return u, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeMM) GetChannelMember(ch, u string) (*model.ChannelMember, error) {
	if m, ok := f.members[ch+"/"+u]; ok {
		return m, nil
	}
	return nil, errors.New("not a member")
}

func (f *fakeMM) GetTeamMember(t, u string) (*model.TeamMember, error) {
	if m, ok := f.team[t+"/"+u]; ok {
		return m, nil
	}
	return nil, errors.New("not a member")
}

func (f *fakeMM) CanRead(u, ch string) bool { return f.readers[ch+"/"+u] }
func (f *fakeMM) NotifyChannel(ch string)   { f.notified = append(f.notified, ch) }
func (f *fakeMM) NewID() string {
	f.idCounter++
	return fmt.Sprintf("%026d", f.idCounter)
}

func setup() (*Service, *memStore, *fakeMM) {
	st, mm := &memStore{data: map[string][]byte{}}, newFake()
	return NewService(st, mm), st, mm
}

var form = Shortcut{Label: "  New   design request ", URL: "https://n8n.patika.dev/form/design-request", Emoji: "📋"}

func userMsg(t *testing.T, err error) string {
	t.Helper()
	var ue *UserError
	require.ErrorAs(t, err, &ue)
	return ue.Msg
}

func TestManagersCanSaveAndEveryoneCanRead(t *testing.T) {
	for _, who := range []string{"chadmin", "tmadmin", "sysadmin"} {
		t.Run(who, func(t *testing.T) {
			s, _, mm := setup()
			saved, err := s.Replace(who, "design", []Shortcut{form})
			require.NoError(t, err)
			require.Len(t, saved.Shortcuts, 1)
			assert.Equal(t, "New design request", saved.Shortcuts[0].Label, "whitespace tidied")
			assert.True(t, model.IsValidId(saved.Shortcuts[0].ID))
			assert.Equal(t, []string{"design"}, mm.notified)

			got, err := s.Get("member", "design")
			require.NoError(t, err)
			assert.Equal(t, saved.Shortcuts, got.Shortcuts)
			assert.False(t, got.CanManage, "a plain member can't manage")
		})
	}
}

func TestPlainMembersAndOutsidersCannotChangeShortcuts(t *testing.T) {
	s, st, _ := setup()
	_, err := s.Replace("member", "design", []Shortcut{form})
	assert.Equal(t, ErrForbidden, err)
	_, err = s.Replace("outsider", "design", []Shortcut{form})
	assert.Equal(t, ErrNotFound, err, "outsiders can't even see the channel")
	_, err = s.Get("outsider", "design")
	assert.Equal(t, ErrNotFound, err)
	assert.Empty(t, st.data)
}

func TestAnyMemberManagesDirectMessages(t *testing.T) {
	s, _, _ := setup()
	got, err := s.Get("member", "dm")
	require.NoError(t, err)
	assert.True(t, got.CanManage)
	_, err = s.Replace("member", "dm", []Shortcut{form})
	require.NoError(t, err)
}

func TestArchivedChannelsAreReadOnly(t *testing.T) {
	s, _, _ := setup()
	_, err := s.Replace("chadmin", "old", []Shortcut{form})
	assert.Equal(t, ErrForbidden, err)
}

func TestValidation(t *testing.T) {
	cases := map[string]struct {
		item Shortcut
		want string
	}{
		"no label":      {Shortcut{URL: "https://x.io"}, "needs a label"},
		"long label":    {Shortcut{Label: strings.Repeat("a", 41), URL: "https://x.io"}, "under 40"},
		"no link":       {Shortcut{Label: "x"}, "add a link"},
		"script link":   {Shortcut{Label: "x", URL: "javascript:alert(1)"}, "https://"},
		"relative link": {Shortcut{Label: "x", URL: "/admin"}, "https://"},
		"data link":     {Shortcut{Label: "x", URL: "data:text/html,hi"}, "https://"},
		"long emoji":    {Shortcut{Label: "x", URL: "https://x.io", Emoji: "📋📋📋📋📋📋📋📋📋"}, "single emoji"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			s, _, _ := setup()
			_, err := s.Replace("chadmin", "design", []Shortcut{tc.item})
			assert.Contains(t, userMsg(t, err), tc.want)
		})
	}
	s, _, _ := setup()
	many := make([]Shortcut, MaxPerChannel+1)
	for i := range many {
		many[i] = form
	}
	_, err := s.Replace("chadmin", "design", many)
	assert.Contains(t, userMsg(t, err), "at most 10")
}

func TestExistingIDsAreKeptAndConflictsReported(t *testing.T) {
	s, st, _ := setup()
	first, err := s.Replace("chadmin", "design", []Shortcut{form})
	require.NoError(t, err)
	id := first.Shortcuts[0].ID
	second, err := s.Replace("chadmin", "design", []Shortcut{{ID: id, Label: "Brief", URL: form.URL}, form})
	require.NoError(t, err)
	assert.Equal(t, id, second.Shortcuts[0].ID)

	st.casFails = true
	_, err = s.Replace("chadmin", "design", []Shortcut{form})
	assert.Equal(t, ErrConflict, err)
}

func TestEmptyListClearsTheChannel(t *testing.T) {
	s, _, _ := setup()
	_, err := s.Replace("chadmin", "design", []Shortcut{form})
	require.NoError(t, err)
	_, err = s.Replace("chadmin", "design", nil)
	require.NoError(t, err)
	got, err := s.Get("member", "design")
	require.NoError(t, err)
	assert.Empty(t, got.Shortcuts)
}
