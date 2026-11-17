// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import manifest from 'manifest';
import React from 'react';

import type {PluginRegistry} from 'types/mattermost-webapp';

import Root, {ImportIcon} from './components/root';
import {closeDialog, openDialog} from './dialog_state';

import './styles.css';

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

export default class Plugin {
    // Mattermost can call initialize twice on the same instance when a plugin is enabled again
    // while its code is still loading (e.g. during an upgrade); registering twice would show
    // every button twice until the page is reloaded.
    private initialized = false;

    public uninitialize() {
        closeDialog();
        this.initialized = false;
    }

    public async initialize(registry: PluginRegistry, store: any) {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        // The Import button on a board's toolbar, and the dialog. A "global" component also
        // renders in the Boards view; a root component only in Channels (the fallback for servers
        // without registerGlobalComponent, which Mattermost marks internal).
        const anyRegistry = registry as any;
        if (typeof anyRegistry.registerGlobalComponent === 'function') {
            anyRegistry.registerGlobalComponent(Root);
        } else {
            registry.registerRootComponent(Root);
        }

        // In Channels: an app bar button that asks which board to import into. Mattermost renders
        // app bar items as an unlabeled button around the icon, so the icon carries the name.
        registry.registerChannelHeaderButtonAction(
            <ImportIcon label='Import cards into a board'/>,
            () => openDialog({teamId: store.getState().entities.teams.currentTeamId}),
            'Import cards into a board',
            'Import cards into a board',
        );
    }
}

window.registerPlugin(manifest.id, new Plugin());
