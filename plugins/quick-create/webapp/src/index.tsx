// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import manifest from 'manifest';
import React from 'react';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import type {PluginRegistry} from 'types/mattermost-webapp';

import {sendToChannel} from './api';
import {canSendToChannel, markPost, markSentFromMenu} from './broadcast';
import AlsoSendToggle from './components/also_send_toggle';
import CreateButton from './components/create_button';
import {BellIcon} from './components/icons';
import RemindersPanel from './components/reminders_panel';
import ShortcutChips from './components/shortcut_chips';
import Toast from './components/toast';
import {channelLabel, currentUserId, dispatch, getPost, setStore} from './mattermost_state';
import {shortcutStore} from './shortcuts';
import {store as reminders} from './store';

import './styles.css';

export default class Plugin {
    // Mattermost can call initialize twice on the same instance when a plugin is enabled again
    // while its code is still loading (e.g. during an upgrade); registering twice would show
    // every icon and button twice until the page is reloaded.
    private initialized = false;

    public uninitialize() {
        this.initialized = false;
    }

    public async initialize(registry: PluginRegistry, store: Store<GlobalState>) {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        setStore(store);

        // The ⊕ button in every message box (channel and thread reply).
        registry.registerPostEditorActionComponent(CreateButton);

        // The channel's shortcut buttons above the text (e.g. a request form).
        registry.registerPostEditorActionComponent(ShortcutChips);

        // "Also send to ~channel" in thread reply boxes: the hook marks the reply, the server
        // posts the channel copy.
        registry.registerPostEditorActionComponent(AlsoSendToggle);
        registry.registerMessageWillBePostedHook(async (post) => markPost(post));

        // …and in the Message actions menu (⊞) of a reply that is already posted, like Slack's.
        registry.registerPostDropdownMenuAction(
            'Also send to channel',
            (postId) => sendReplyToChannel(postId),
            (postId) => canSendToChannel(getPost(postId), currentUserId()),
        );

        // The "Reminders" panel, opened from the app bar / channel header.
        const {showRHSPlugin, toggleRHSPlugin} = registry.registerRightHandSidebarComponent(RemindersPanel, 'Reminders');
        registry.registerChannelHeaderButtonAction(
            <BellIcon label='Reminders'/>,
            () => dispatch(toggleRHSPlugin),
            'Reminders',
            'Reminders',
        );

        registry.registerRootComponent(() => <Toast onViewReminders={() => dispatch(showRHSPlugin)}/>);

        // Keep every open tab in sync when reminders are delivered, snoozed or deleted.
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_shortcuts_changed`, (msg: {data?: {channel_id?: string}}) => {
            if (msg?.data?.channel_id) {
                shortcutStore.load(msg.data.channel_id, true);
            }
        });
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_reminders_changed`, () => {
            reminders.refresh();
        });
    }
}

async function sendReplyToChannel(postId: string) {
    const channelId = getPost(postId)?.channel_id || '';
    try {
        await sendToChannel(postId);
        markSentFromMenu(postId);
        reminders.showToast({text: `Sent to ${channelLabel(channelId)}`});
    } catch (err) {
        reminders.showToast({text: err instanceof Error ? err.message : 'Something went wrong. Please try again.'});
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(manifest.id, new Plugin());
