// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Package scheduled holds the rules for scheduled messages: what may be scheduled,
// how the queue is stored and how due messages are sent. Mattermost, the KV store
// and the clock are behind interfaces so all of it is unit-testable.
package scheduled

import "time"

type Status string

const (
	StatusPending Status = "pending"
	// StatusSending marks a message claimed by the sender, so it is posted at most once
	// even if several Mattermost servers run the job.
	StatusSending Status = "sending"
	StatusFailed  Status = "failed"
)

// Limits.
const (
	MaxPerUser      = 200
	MaxFiles        = 10
	MinLead         = 30 * time.Second
	MaxLead         = 366 * 24 * time.Hour
	StaleSendingFor = 10 * time.Minute
)

// Post is one queued message.
type Post struct {
	ID        string   `json:"id"`
	UserID    string   `json:"user_id"`
	ChannelID string   `json:"channel_id"`
	RootID    string   `json:"root_id,omitempty"`
	Message   string   `json:"message"`
	FileIDs   []string `json:"file_ids,omitempty"`
	SendAt    int64    `json:"send_at"` // Unix milliseconds, UTC
	CreatedAt int64    `json:"created_at"`
	UpdatedAt int64    `json:"updated_at"`
	Status    Status   `json:"status"`
	Error     string   `json:"error,omitempty"`
	ClaimedAt int64    `json:"claimed_at,omitempty"`
}

// CreateRequest is what the web app sends when the user schedules a draft.
type CreateRequest struct {
	ChannelID string   `json:"channel_id"`
	RootID    string   `json:"root_id"`
	Message   string   `json:"message"`
	FileIDs   []string `json:"file_ids"`
	SendAt    int64    `json:"send_at"`
}

// UserError is an error whose message is safe and meant to be shown to the user.
type UserError struct{ Msg string }

func (e *UserError) Error() string { return e.Msg }

func userErr(msg string) error { return &UserError{Msg: msg} }

// ErrNotFound is returned for unknown IDs and for other users' messages alike,
// so one user cannot probe another's queue.
var ErrNotFound = userErr("Scheduled message not found.")
