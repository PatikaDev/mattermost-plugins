// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package main

import (
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"
)

// WebSocketEventChanged tells a user's open Mattermost tabs to refresh their reminders.
const WebSocketEventChanged = "reminders_changed"

// WebSocketEventShortcutsChanged tells everyone in a channel to reload its shortcut buttons.
const WebSocketEventShortcutsChanged = "shortcuts_changed"

// mattermostAdapter implements reminders.Mattermost on top of the plugin API.
type mattermostAdapter struct {
	p *Plugin
}

func (a mattermostAdapter) GetUser(userID string) (*model.User, error) {
	return a.p.client.User.Get(userID)
}

func (a mattermostAdapter) GetChannel(channelID string) (*model.Channel, error) {
	return a.p.client.Channel.Get(channelID)
}

func (a mattermostAdapter) CanPost(userID, channelID string) bool {
	return a.p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost)
}

func (a mattermostAdapter) BotDM(userID string, post *model.Post) error {
	if a.p.botID == "" {
		return errors.New("bot not ready")
	}
	return a.p.client.Post.DM(a.p.botID, userID, post)
}

func (a mattermostAdapter) BotPost(post *model.Post) error {
	if a.p.botID == "" {
		return errors.New("bot not ready")
	}
	post.UserId = a.p.botID
	return a.p.client.Post.CreatePost(post)
}

func (a mattermostAdapter) NotifyChanged(userID string) {
	a.p.API.PublishWebSocketEvent(WebSocketEventChanged, map[string]any{}, &model.WebsocketBroadcast{UserId: userID})
}

func (a mattermostAdapter) NewID() string { return model.NewId() }

func (a mattermostAdapter) ActionURL() string {
	return "/plugins/" + manifest.Id + "/api/v1/actions"
}

// broadcastAdapter implements broadcast.Mattermost on top of the plugin API.
type broadcastAdapter struct {
	p *Plugin
}

func (a broadcastAdapter) GetPost(postID string) (*model.Post, error) {
	return a.p.client.Post.GetPost(postID)
}

func (a broadcastAdapter) CanPost(userID, channelID string) bool {
	return a.p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost)
}

func (a broadcastAdapter) CopyFileInfos(userID string, fileIDs []string) ([]string, error) {
	ids, appErr := a.p.API.CopyFileInfos(userID, fileIDs)
	if appErr != nil {
		return nil, appErr
	}
	return ids, nil
}

// CreatePost posts as post.UserId (the reply's author).
func (a broadcastAdapter) CreatePost(post *model.Post) error {
	return a.p.client.Post.CreatePost(post)
}

func (a broadcastAdapter) SiteURL() string {
	if cfg := a.p.API.GetConfig(); cfg != nil && cfg.ServiceSettings.SiteURL != nil {
		return *cfg.ServiceSettings.SiteURL
	}
	return ""
}

// shortcutsAdapter implements shortcuts.Mattermost on top of the plugin API.
type shortcutsAdapter struct {
	p *Plugin
}

func (a shortcutsAdapter) GetChannel(channelID string) (*model.Channel, error) {
	return a.p.client.Channel.Get(channelID)
}

func (a shortcutsAdapter) GetUser(userID string) (*model.User, error) {
	return a.p.client.User.Get(userID)
}

func (a shortcutsAdapter) GetChannelMember(channelID, userID string) (*model.ChannelMember, error) {
	return a.p.client.Channel.GetMember(channelID, userID)
}

func (a shortcutsAdapter) GetTeamMember(teamID, userID string) (*model.TeamMember, error) {
	return a.p.client.Team.GetMember(teamID, userID)
}

func (a shortcutsAdapter) CanRead(userID, channelID string) bool {
	return a.p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel)
}

func (a shortcutsAdapter) NotifyChannel(channelID string) {
	a.p.API.PublishWebSocketEvent(WebSocketEventShortcutsChanged, map[string]any{"channel_id": channelID}, &model.WebsocketBroadcast{ChannelId: channelID})
}

func (a shortcutsAdapter) NewID() string { return model.NewId() }
