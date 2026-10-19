// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Package shortcuts stores a channel's shortcut buttons (e.g. "📋 New design request" linking to
// a form) and decides who may change them: channel admins, team admins and system admins, or
// any member in direct and group messages. Everyone who can read the channel sees them.
package shortcuts

import (
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"
)

const (
	MaxPerChannel = 10
	MaxLabelRunes = 40
	MaxEmojiRunes = 8
	MaxURLLength  = 2000
)

// Shortcut is one button.
type Shortcut struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	URL   string `json:"url"`
	Emoji string `json:"emoji,omitempty"`
}

// List is a channel's shortcuts plus whether the requesting user may edit them.
type List struct {
	Shortcuts []Shortcut `json:"shortcuts"`
	CanManage bool       `json:"can_manage"`
}

// UserError is an error whose message is safe and meant to be shown to the user.
type UserError struct{ Msg string }

func (e *UserError) Error() string { return e.Msg }

func userErr(msg string) error { return &UserError{Msg: msg} }

var (
	ErrNotFound  = userErr("Channel not found.")
	ErrForbidden = userErr("Only channel admins, team admins and system admins can change this channel's shortcuts.")
	ErrConflict  = userErr("Someone else changed the shortcuts at the same time. Reload and try again.")
)

// Store keeps each channel's list. CompareAndSwap must be atomic.
type Store interface {
	Get(channelID string) ([]Shortcut, []byte, error)
	CompareAndSwap(channelID string, old []byte, list []Shortcut) (bool, error)
}

// Mattermost is the slice of the server API the service needs.
type Mattermost interface {
	GetChannel(channelID string) (*model.Channel, error)
	GetUser(userID string) (*model.User, error)
	GetChannelMember(channelID, userID string) (*model.ChannelMember, error)
	GetTeamMember(teamID, userID string) (*model.TeamMember, error)
	CanRead(userID, channelID string) bool
	NotifyChannel(channelID string)
	NewID() string
}

type Service struct {
	store Store
	mm    Mattermost
}

func NewService(store Store, mm Mattermost) *Service { return &Service{store: store, mm: mm} }

// Get returns the channel's shortcuts if the user can read the channel.
func (s *Service) Get(userID, channelID string) (*List, error) {
	ch, err := s.readable(userID, channelID)
	if err != nil {
		return nil, err
	}
	list, _, err := s.store.Get(channelID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []Shortcut{}
	}
	return &List{Shortcuts: list, CanManage: s.canManage(userID, ch)}, nil
}

// Replace saves a new list for the channel. Items without an ID get one.
func (s *Service) Replace(userID, channelID string, items []Shortcut) (*List, error) {
	ch, err := s.readable(userID, channelID)
	if err != nil {
		return nil, err
	}
	if !s.canManage(userID, ch) {
		return nil, ErrForbidden
	}
	clean, err := s.validate(items)
	if err != nil {
		return nil, err
	}
	_, raw, err := s.store.Get(channelID)
	if err != nil {
		return nil, err
	}
	ok, err := s.store.CompareAndSwap(channelID, raw, clean)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrConflict
	}
	s.mm.NotifyChannel(channelID)
	return &List{Shortcuts: clean, CanManage: true}, nil
}

func (s *Service) readable(userID, channelID string) (*model.Channel, error) {
	ch, err := s.mm.GetChannel(channelID)
	if err != nil || ch == nil || !s.mm.CanRead(userID, channelID) {
		return nil, ErrNotFound
	}
	return ch, nil
}

func (s *Service) canManage(userID string, ch *model.Channel) bool {
	if ch.DeleteAt != 0 {
		return false
	}
	user, err := s.mm.GetUser(userID)
	if err != nil || user == nil || user.DeleteAt != 0 || user.IsBot {
		return false
	}
	if user.IsSystemAdmin() {
		return true
	}
	member, err := s.mm.GetChannelMember(ch.Id, userID)
	if err != nil || member == nil {
		return false
	}
	if ch.Type == model.ChannelTypeDirect || ch.Type == model.ChannelTypeGroup {
		return true
	}
	if member.SchemeAdmin {
		return true
	}
	tm, err := s.mm.GetTeamMember(ch.TeamId, userID)
	return err == nil && tm != nil && tm.DeleteAt == 0 && tm.SchemeAdmin
}

func (s *Service) validate(items []Shortcut) ([]Shortcut, error) {
	if len(items) > MaxPerChannel {
		return nil, userErr(fmt.Sprintf("A channel can have at most %d shortcuts.", MaxPerChannel))
	}
	out := make([]Shortcut, 0, len(items))
	for i, it := range items {
		n := i + 1
		label := strings.Join(strings.Fields(it.Label), " ")
		if label == "" {
			return nil, userErr(fmt.Sprintf("Shortcut %d needs a label.", n))
		}
		if utf8.RuneCountInString(label) > MaxLabelRunes {
			return nil, userErr(fmt.Sprintf("Shortcut %d: keep the label under %d characters.", n, MaxLabelRunes))
		}
		link := strings.TrimSpace(it.URL)
		if err := validURL(link); err != nil {
			return nil, userErr(fmt.Sprintf("Shortcut %d: %s", n, err.Error()))
		}
		emoji := strings.TrimSpace(it.Emoji)
		if utf8.RuneCountInString(emoji) > MaxEmojiRunes {
			return nil, userErr(fmt.Sprintf("Shortcut %d: use a single emoji.", n))
		}
		id := it.ID
		if !model.IsValidId(id) {
			id = s.mm.NewID()
		}
		out = append(out, Shortcut{ID: id, Label: label, URL: link, Emoji: emoji})
	}
	return out, nil
}

// validURL accepts absolute http(s) links only, so a shortcut can never run script.
func validURL(link string) error {
	if link == "" {
		return errors.New("add a link.")
	}
	if len(link) > MaxURLLength {
		return errors.New("the link is too long.")
	}
	u, err := url.Parse(link)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return errors.New("use a full link starting with https://")
	}
	return nil
}
