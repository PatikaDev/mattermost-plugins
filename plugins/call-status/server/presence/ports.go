// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package presence

import (
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

// Store keeps the plugin's state. A nil value deletes the entry.
type Store interface {
	Tracked() (map[string]Tracked, error)
	SetTracked(userID string, t *Tracked) error
	MeetJoins() (map[string]MeetJoin, error)
	SetMeetJoin(userID string, j *MeetJoin) error
}

// Mattermost is the slice of the server the service needs.
type Mattermost interface {
	// UsersInCalls maps each user in an ongoing Mattermost call to the call's ID.
	UsersInCalls() (map[string]string, error)
	GetUser(userID string) (*model.User, error)
	GetPost(postID string) (*model.Post, error)
	CanReadChannel(userID, channelID string) bool
	SetCustomStatus(userID string, cs *model.CustomStatus) error
	ClearCustomStatus(userID string) error
}

// Clock is the time source (fixed in tests).
type Clock interface {
	Now() time.Time
}
