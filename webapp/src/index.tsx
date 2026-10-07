// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import manifest from 'manifest';
import React from 'react';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import type {PluginRegistry} from 'types/mattermost-webapp';

import {ClockIcon} from './components/icons';
import Panel from './components/panel';
import Root from './components/root';
import ScheduleButton from './components/schedule_button';
import {dispatch, setStore} from './mattermost_state';
import {queue} from './queue';

import './styles.css';

export default class Plugin {
    public async initialize(registry: PluginRegistry, store: Store<GlobalState>) {
        setStore(store);

        // The clock button in every message box (channel and thread reply).
        registry.registerPostEditorActionComponent(ScheduleButton);

        // The "Scheduled messages" panel, opened from the channel header / app bar.
        const {showRHSPlugin, toggleRHSPlugin} = registry.registerRightHandSidebarComponent(Panel, 'Scheduled messages');
        registry.registerChannelHeaderButtonAction(
            <ClockIcon label='Scheduled messages'/>,
            () => dispatch(toggleRHSPlugin),
            'Scheduled messages',
            'Scheduled messages',
        );

        // "Scheduled for …  View" after scheduling.
        registry.registerRootComponent(() => <Root onView={() => dispatch(showRHSPlugin)}/>);

        // Keep every open tab in sync when the queue changes (sent, edited, failed).
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_scheduled_changed`, () => {
            queue.refresh();
        });
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(manifest.id, new Plugin());
