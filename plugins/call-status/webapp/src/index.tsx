// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import manifest from 'manifest';

import {meetPostId, reportJoin} from './meet_clicks';

declare global {
    interface Window {
        basename?: string;
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

export default class Plugin {
    // Mattermost can call initialize twice on the same instance when a plugin is enabled again
    // while its code is still loading (e.g. during an upgrade); listening twice would report
    // every click twice.
    private initialized = false;

    // The statuses themselves are set by the server (calls are read from the database). The web
    // app only tells it when someone clicks a Google Meet link in a message: left click, or a
    // middle click that opens the meeting in a new tab.
    private readonly onClick = (event: MouseEvent) => {
        if (event.type === 'auxclick' && event.button !== 1) {
            return;
        }
        const postId = meetPostId(event.target);
        if (postId) {
            reportJoin(window.basename || '', manifest.id, postId).catch(() => {
                // Not reported: the status just won't show for this meeting.
            });
        }
    };

    public uninitialize() {
        document.removeEventListener('click', this.onClick, true);
        document.removeEventListener('auxclick', this.onClick, true);
        this.initialized = false;
    }

    public async initialize() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        // Capture phase: runs before the link opens the meeting, whatever the post renders.
        document.addEventListener('click', this.onClick, true);
        document.addEventListener('auxclick', this.onClick, true);
    }
}

window.registerPlugin(manifest.id, new Plugin());
