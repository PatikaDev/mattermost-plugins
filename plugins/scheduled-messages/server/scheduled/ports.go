// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package scheduled

import (
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

// Store persists the queue. Implementations must make CompareAndSwap atomic.
type Store interface {
	Get(id string) (*Post, []byte, error) // returns nil, nil, nil when missing
	Put(p *Post) error
	CompareAndSwap(old []byte, p *Post) (bool, error)
	Delete(id string) error
	All() ([]*Post, error)
}

// Mattermost is the slice of the server API the service needs.
type Mattermost interface {
	CanPost(userID, channelID string) bool
	GetChannel(channelID string) (*model.Channel, error)
	GetPost(postID string) (*model.Post, error)
	GetUser(userID string) (*model.User, error)
	GetFileInfo(fileID string) (*model.FileInfo, error)
	CreatePost(post *model.Post) error
	DirectMessage(userID, message string) error
	NotifyChanged(userID string)
	NewID() string
}

// Clock is the time source (fixed in tests).
type Clock interface {
	Now() time.Time
}
