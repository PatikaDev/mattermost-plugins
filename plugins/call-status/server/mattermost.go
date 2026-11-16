// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package main

import (
	"net/http"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"

	"github.com/PatikaDev/mattermost-plugins/plugins/call-status/server/presence"
)

// usersInCallsQuery reads the Calls plugin's own tables, which live in the Mattermost database:
// a calls_sessions row exists while a user is connected to a call that hasn't ended.
const usersInCallsQuery = `SELECT s.UserID, s.CallID FROM calls_sessions s
JOIN calls c ON c.ID = s.CallID
WHERE c.EndAt = 0 AND c.DeleteAt = 0`

// mattermostAdapter implements presence.Mattermost on top of the plugin API.
type mattermostAdapter struct {
	p *Plugin
}

func (a mattermostAdapter) UsersInCalls() (map[string]string, error) {
	db, err := a.p.client.Store.GetMasterDB()
	if err != nil {
		return nil, errors.Wrap(err, "failed to open the database")
	}
	rows, err := db.Query(usersInCallsQuery)
	if err != nil {
		if isMissingTable(err) { // the Calls plugin was never installed
			return map[string]string{}, nil
		}
		return nil, errors.Wrap(err, "failed to read who is in a call")
	}
	defer func() { _ = rows.Close() }()

	users := map[string]string{}
	for rows.Next() {
		var userID, callID string
		if err := rows.Scan(&userID, &callID); err != nil {
			return nil, errors.Wrap(err, "failed to read who is in a call")
		}
		users[userID] = callID
	}
	return users, errors.Wrap(rows.Err(), "failed to read who is in a call")
}

func isMissingTable(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "does not exist") || strings.Contains(msg, "doesn't exist")
}

func (a mattermostAdapter) GetUser(userID string) (*model.User, error) {
	user, appErr := a.p.API.GetUser(userID)
	if appErr != nil {
		if appErr.StatusCode == http.StatusNotFound {
			return nil, presence.ErrUserGone
		}
		return nil, appErr
	}
	return user, nil
}

func (a mattermostAdapter) GetPost(postID string) (*model.Post, error) {
	return a.p.client.Post.GetPost(postID)
}

func (a mattermostAdapter) CanReadChannel(userID, channelID string) bool {
	return a.p.API.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel)
}

func (a mattermostAdapter) SetCustomStatus(userID string, cs *model.CustomStatus) error {
	if appErr := a.p.API.UpdateUserCustomStatus(userID, cs); appErr != nil {
		return appErr
	}
	return nil
}

func (a mattermostAdapter) ClearCustomStatus(userID string) error {
	if appErr := a.p.API.RemoveUserCustomStatus(userID); appErr != nil {
		return appErr
	}
	return nil
}
