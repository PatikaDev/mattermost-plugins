// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Package broadcast implements "Also send to channel": a thread reply is copied into its channel
// as the same user, with a line linking back to the thread — when the web app marked it while it
// was being written, or later, when its author picks "Also send to channel" in its menu.
package broadcast

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/mattermost/mattermost/server/public/model"
)

const (
	// PropRequested is set by the web app on a reply whose "Also send to channel" toggle is on.
	PropRequested = "qc_also_send_to_channel"
	// PropCopyOf marks the channel copy with the reply it came from.
	PropCopyOf = "qc_copy_of"

	rootPreviewRunes = 80
)

// Mattermost is the slice of the server API the broadcaster needs.
type Mattermost interface {
	GetPost(postID string) (*model.Post, error)
	CanPost(userID, channelID string) bool
	// CopyFileInfos duplicates the user's attachments so the copy can carry them too.
	CopyFileInfos(userID string, fileIDs []string) ([]string, error)
	CreatePost(post *model.Post) error
	SiteURL() string
	// MarkSent records that a reply has been sent to the channel; false if it already was.
	MarkSent(replyID string) (bool, error)
	UnmarkSent(replyID string) error
}

// Errors for SendExisting.
var (
	ErrNotFound     = errors.New("reply or thread not found")
	ErrNotYours     = errors.New("not the reply's author")
	ErrNoPermission = errors.New("no permission to post in the channel")
	ErrAlreadySent  = errors.New("reply already sent to the channel")
)

type Broadcaster struct {
	mm  Mattermost
	log func(msg string, keyValuePairs ...any)
}

func New(mm Mattermost, log func(msg string, keyValuePairs ...any)) *Broadcaster {
	return &Broadcaster{mm: mm, log: log}
}

// Requested reports whether a just-posted reply asked to be sent to the channel too.
func Requested(post *model.Post) bool {
	if post == nil || post.RootId == "" || post.IsSystemMessage() {
		return false
	}
	v, _ := post.GetProp(PropRequested).(bool)
	return v
}

// MessageHasBeenPosted copies a marked reply into the channel.
func (b *Broadcaster) MessageHasBeenPosted(reply *model.Post) {
	if !Requested(reply) {
		return
	}
	if err := b.send(reply); err != nil && !isExpected(err) {
		b.log("Could not send the thread reply to the channel", "post_id", reply.Id, "error", err.Error())
	}
}

// SendExisting copies a thread reply that has already been posted into its channel, when its
// author asks for it from the reply's menu.
func (b *Broadcaster) SendExisting(userID, replyID string) error {
	reply, err := b.mm.GetPost(replyID)
	if err != nil || reply == nil || reply.DeleteAt != 0 || reply.RootId == "" || reply.IsSystemMessage() {
		return ErrNotFound
	}
	if reply.UserId != userID {
		return ErrNotYours
	}
	if Requested(reply) {
		return ErrAlreadySent
	}
	return b.send(reply)
}

func isExpected(err error) bool {
	return errors.Is(err, ErrNotFound) || errors.Is(err, ErrNoPermission) || errors.Is(err, ErrAlreadySent)
}

// send posts the channel copy of a reply, at most once per reply.
func (b *Broadcaster) send(reply *model.Post) error {
	root, err := b.mm.GetPost(reply.RootId)
	if err != nil || root == nil || root.DeleteAt != 0 || root.ChannelId != reply.ChannelId {
		return ErrNotFound
	}
	if !b.mm.CanPost(reply.UserId, reply.ChannelId) {
		return ErrNoPermission
	}
	first, err := b.mm.MarkSent(reply.Id)
	if err != nil {
		return fmt.Errorf("mark the reply as sent: %w", err)
	}
	if !first {
		return ErrAlreadySent
	}

	copyPost := &model.Post{
		UserId:    reply.UserId,
		ChannelId: reply.ChannelId,
		Message:   b.message(reply, root),
	}
	copyPost.AddProp(PropCopyOf, reply.Id)
	if len(reply.FileIds) > 0 {
		ids, err := b.mm.CopyFileInfos(reply.UserId, reply.FileIds)
		if err != nil {
			b.log("Could not copy attachments for the channel copy", "post_id", reply.Id, "error", err.Error())
		} else {
			copyPost.FileIds = ids
		}
	}
	if err := b.mm.CreatePost(copyPost); err != nil {
		// Let the author try again.
		if uerr := b.mm.UnmarkSent(reply.Id); uerr != nil {
			b.log("Could not clear the sent mark", "post_id", reply.Id, "error", uerr.Error())
		}
		return fmt.Errorf("create the channel copy: %w", err)
	}
	return nil
}

// message is "↪ replied to a thread: [first words of the thread](link to the reply)" above the
// reply's own text.
func (b *Broadcaster) message(reply, root *model.Post) string {
	preview := strings.Join(strings.Fields(root.Message), " ")
	switch {
	case preview == "":
		preview = "a message"
	case utf8.RuneCountInString(preview) > rootPreviewRunes:
		preview = string([]rune(preview)[:rootPreviewRunes]) + "…"
	}
	// Square brackets would end the link text early.
	preview = strings.NewReplacer("[", "(", "]", ")").Replace(preview)
	// The query keeps Mattermost from embedding a preview of the reply (it only embeds bare
	// permalinks), which would show the same text twice; the link still opens the thread.
	link := fmt.Sprintf("%s/_redirect/pl/%s?src=channel", strings.TrimRight(b.mm.SiteURL(), "/"), reply.Id)
	header := fmt.Sprintf("↪ _replied to a thread:_ [%s](%s)", preview, link)
	if strings.TrimSpace(reply.Message) == "" {
		return header
	}
	return header + "\n\n" + reply.Message
}
