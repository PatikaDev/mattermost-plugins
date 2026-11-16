// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package presence

import (
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

// Kind is what someone is in.
type Kind string

const (
	KindCall Kind = "call"
	KindMeet Kind = "meet"
)

// MeetPostType is the post type the Google Meet plugin uses for a meeting started in Mattermost.
const MeetPostType = "custom_google_meet"

// MeetMaxAge is how long someone counts as in a Google Meet when the meeting's end is never
// reported (the Google Meet plugin only learns it if conference polling works for that meeting).
const MeetMaxAge = 2 * time.Hour

// statuses are the custom statuses the plugin sets. Emoji are Mattermost emoji names.
var statuses = map[Kind]model.CustomStatus{
	KindCall: {Emoji: "headphones", Text: "In a call"},
	KindMeet: {Emoji: "video_camera", Text: "In a Google Meet"},
}

// StatusFor returns the custom status shown for kind.
func StatusFor(kind Kind) model.CustomStatus { return statuses[kind] }

// Activity is one thing a user is in; Key tells two calls or meetings apart.
type Activity struct {
	Kind Kind
	Key  string // the call ID or the Google Meet post ID
}

// Tracked records a status the plugin set for a user. Dismissed means the user changed or
// cleared it during this activity, so the plugin leaves their status alone until it ends.
type Tracked struct {
	Kind      Kind   `json:"kind"`
	Key       string `json:"key"`
	Dismissed bool   `json:"dismissed,omitempty"`
}

// MeetJoin records that a user went into the Google Meet of a post.
type MeetJoin struct {
	PostID string    `json:"post_id"`
	At     time.Time `json:"at"`
}
