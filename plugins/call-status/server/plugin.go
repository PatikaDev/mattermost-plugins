// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package main

import (
	"sync"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/pluginapi"
	"github.com/mattermost/mattermost/server/public/pluginapi/cluster"
	"github.com/pkg/errors"

	"github.com/PatikaDev/mattermost-plugins/plugins/call-status/server/presence"
)

// checkEvery is how often calls and meetings are checked, so a status appears or goes away
// within about this long (a Join click in the web app shows at once).
const checkEvery = 10 * time.Second

// Plugin implements the interface expected by the Mattermost server to communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin

	client  *pluginapi.Client
	service *presence.Service
	checker *cluster.Job

	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex

	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration *configuration
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

// OnActivate is invoked when the plugin is activated. If an error is returned, the plugin will be deactivated.
func (p *Plugin) OnActivate() error {
	p.client = pluginapi.NewClient(p.API, p.Driver)

	p.service = presence.NewService(
		presence.NewKVStore(&p.client.KV),
		mattermostAdapter{p: p},
		realClock{},
		func(msg string, keyValuePairs ...any) { p.API.LogWarn(msg, keyValuePairs...) },
	)

	// cluster.Schedule runs the job on exactly one node of a cluster at a time.
	job, err := cluster.Schedule(p.API, "CallStatusCheck", cluster.MakeWaitForInterval(checkEvery), func() {
		if err := p.service.Reconcile(); err != nil {
			p.API.LogWarn("Failed to update call statuses", "err", err.Error())
		}
	})
	if err != nil {
		return errors.Wrap(err, "failed to schedule the call status check")
	}
	p.checker = job
	return nil
}

// OnDeactivate is invoked when the plugin is deactivated. Statuses the plugin set are cleared
// so nobody is left showing "In a call" while the plugin is off.
func (p *Plugin) OnDeactivate() error {
	if p.checker != nil {
		if err := p.checker.Close(); err != nil {
			p.API.LogError("Failed to stop the call status check", "err", err)
		}
	}
	if p.service != nil {
		p.service.ClearAll()
	}
	return nil
}

// MessageHasBeenPosted is invoked after a post is saved.
func (p *Plugin) MessageHasBeenPosted(_ *plugin.Context, post *model.Post) {
	if p.service != nil {
		p.service.OnPosted(post)
	}
}
