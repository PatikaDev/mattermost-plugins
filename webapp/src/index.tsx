// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import manifest from 'manifest';
import React from 'react';
import type {Store} from 'redux';

import type {PluginRegistry} from 'types/mattermost-webapp';

import AppBarIcon from './components/app_bar_icon';
import Panel from './components/panel';
import {dispatch, setStore} from './state';

import './styles.css';

export default class Plugin {
    // Mattermost can call initialize twice on the same instance when a plugin is enabled again
    // while its code is still loading (e.g. during an upgrade); registering twice would show
    // every icon and button twice until the page is reloaded.
    private initialized = false;

    public uninitialize() {
        this.initialized = false;
    }

    public async initialize(registry: PluginRegistry, store: Store<any>) {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        setStore(store);

        // The "All unreads" panel, opened from its icon in the app bar (or channel header).
        const {toggleRHSPlugin} = registry.registerRightHandSidebarComponent(Panel, 'All unreads');
        registry.registerChannelHeaderButtonAction(
            <AppBarIcon/>,
            () => dispatch(toggleRHSPlugin),
            'All unreads',
            'All unreads',
        );
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(manifest.id, new Plugin());
