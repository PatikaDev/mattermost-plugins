// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package main

import (
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"
)

// WebSocketEventChanged tells a user's open Mattermost tabs to refresh their queue.
const WebSocketEventChanged = "scheduled_changed"

// mattermostAdapter implements scheduled.Mattermost on top of the plugin API.
type mattermostAdapter struct {
	p *Plugin
}

func (a mattermostAdapter) CanPost(userID, channelID string) bool {
	return a.p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost)
}

func (a mattermostAdapter) GetChannel(channelID string) (*model.Channel, error) {
	return a.p.client.Channel.Get(channelID)
}

func (a mattermostAdapter) GetPost(postID string) (*model.Post, error) {
	return a.p.client.Post.GetPost(postID)
}

func (a mattermostAdapter) GetUser(userID string) (*model.User, error) {
	return a.p.client.User.Get(userID)
}

func (a mattermostAdapter) GetFileInfo(fileID string) (*model.FileInfo, error) {
	return a.p.client.File.GetInfo(fileID)
}

// CreatePost posts as post.UserId. Attachments are linked only if that user uploaded them
// and they are not yet on another post (Mattermost enforces this in FileInfo.AttachToPost).
func (a mattermostAdapter) CreatePost(post *model.Post) error {
	return a.p.client.Post.CreatePost(post)
}

func (a mattermostAdapter) DirectMessage(userID, message string) error {
	if a.p.botID == "" {
		return errors.New("bot not ready")
	}
	return a.p.client.Post.DM(a.p.botID, userID, &model.Post{Message: message})
}

func (a mattermostAdapter) NotifyChanged(userID string) {
	a.p.API.PublishWebSocketEvent(WebSocketEventChanged, map[string]any{}, &model.WebsocketBroadcast{UserId: userID})
}

func (a mattermostAdapter) NewID() string { return model.NewId() }
