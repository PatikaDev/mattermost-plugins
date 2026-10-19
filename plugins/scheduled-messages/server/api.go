// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/PatikaDev/mattermost-plugins/plugins/scheduled-messages/server/scheduled"
)

const maxBodyBytes = 256 * 1024

// initRouter serves <siteURL>/plugins/dev.patika.scheduled-messages/api/v1/…
func (p *Plugin) initRouter() *mux.Router {
	router := mux.NewRouter()
	router.Use(p.MattermostAuthorizationRequired)

	api := router.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/scheduled", p.handleList).Methods(http.MethodGet)
	api.HandleFunc("/scheduled", p.handleCreate).Methods(http.MethodPost)
	api.HandleFunc("/scheduled/{id:[a-z0-9]{26}}", p.handleReschedule).Methods(http.MethodPatch)
	api.HandleFunc("/scheduled/{id:[a-z0-9]{26}}", p.handleDelete).Methods(http.MethodDelete)
	api.HandleFunc("/scheduled/{id:[a-z0-9]{26}}/send", p.handleSendNow).Methods(http.MethodPost)
	return router
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

// MattermostAuthorizationRequired lets only logged-in users through; Mattermost sets the
// header after authenticating the session (and checking CSRF for cookie-authenticated writes).
func (p *Plugin) MattermostAuthorizationRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-ID") == "" {
			http.Error(w, "Not authorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func userID(r *http.Request) string { return r.Header.Get("Mattermost-User-ID") }

func (p *Plugin) handleList(w http.ResponseWriter, r *http.Request) {
	posts, err := p.service.List(userID(r))
	if err != nil {
		p.writeError(w, err)
		return
	}
	p.writeJSON(w, http.StatusOK, posts)
}

func (p *Plugin) handleCreate(w http.ResponseWriter, r *http.Request) {
	var req scheduled.CreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&req); err != nil {
		p.writeError(w, &scheduled.UserError{Msg: "Invalid request."})
		return
	}
	post, err := p.service.Create(userID(r), req)
	if err != nil {
		p.writeError(w, err)
		return
	}
	p.writeJSON(w, http.StatusCreated, post)
}

func (p *Plugin) handleReschedule(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SendAt int64 `json:"send_at"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&req); err != nil {
		p.writeError(w, &scheduled.UserError{Msg: "Invalid request."})
		return
	}
	post, err := p.service.Reschedule(userID(r), mux.Vars(r)["id"], req.SendAt)
	if err != nil {
		p.writeError(w, err)
		return
	}
	p.writeJSON(w, http.StatusOK, post)
}

func (p *Plugin) handleDelete(w http.ResponseWriter, r *http.Request) {
	if err := p.service.Delete(userID(r), mux.Vars(r)["id"]); err != nil {
		p.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (p *Plugin) handleSendNow(w http.ResponseWriter, r *http.Request) {
	if err := p.service.SendNow(userID(r), mux.Vars(r)["id"]); err != nil {
		p.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (p *Plugin) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		p.API.LogError("Failed to write response", "error", err.Error())
	}
}

// writeError shows user-facing errors as they are and hides internal ones.
func (p *Plugin) writeError(w http.ResponseWriter, err error) {
	var userErr *scheduled.UserError
	switch {
	case errors.Is(err, scheduled.ErrNotFound):
		p.writeJSON(w, http.StatusNotFound, map[string]string{"message": err.Error()})
	case errors.As(err, &userErr):
		p.writeJSON(w, http.StatusBadRequest, map[string]string{"message": userErr.Msg})
	default:
		p.API.LogError("Scheduled messages request failed", "error", err.Error())
		p.writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Something went wrong. Please try again."})
	}
}
