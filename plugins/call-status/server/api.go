// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/PatikaDev/mattermost-plugins/plugins/call-status/server/presence"
)

// ServeHTTP serves <siteURL>/plugins/dev.patika.call-status/api/v1/meet/joined, which the web
// app calls when someone clicks Join on a Google Meet message.
func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-ID") // set by Mattermost after authenticating
	switch {
	case userID == "":
		http.Error(w, "Not authorized", http.StatusUnauthorized)
	case r.URL.Path != "/api/v1/meet/joined":
		http.NotFound(w, r)
	case r.Method != http.MethodPost:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	default:
		p.handleMeetJoined(w, r, userID)
	}
}

func (p *Plugin) handleMeetJoined(w http.ResponseWriter, r *http.Request, userID string) {
	var req struct {
		PostID string `json:"post_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil || !model.IsValidId(req.PostID) {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if err := p.service.JoinedMeet(userID, req.PostID); err != nil {
		if errors.Is(err, presence.ErrNotMeeting) {
			http.Error(w, "Not an open Google Meet meeting", http.StatusNotFound)
			return
		}
		p.API.LogWarn("Failed to record a Google Meet join", "err", err.Error())
		http.Error(w, "Something went wrong", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
