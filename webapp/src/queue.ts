// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// The user's queue, shared by the clock button, the panel and the toast. Refreshed on
// demand and whenever the server says it changed (websocket), so every open tab agrees.

import {listScheduled, type ScheduledPost} from './api';

export type QueueState = {
    items: ScheduledPost[];
    loaded: boolean;
    error: string;
    toast: {text: string; at: number} | null;
};

let state: QueueState = {items: [], loaded: false, error: '', toast: null};
const listeners = new Set<() => void>();

function set(patch: Partial<QueueState>) {
    state = {...state, ...patch};
    listeners.forEach((l) => l());
}

export const queue = {
    getState: (): QueueState => state,

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },

    async refresh(): Promise<void> {
        try {
            const items = await listScheduled();
            set({items: items || [], loaded: true, error: ''});
        } catch (err) {
            set({loaded: true, error: (err as Error).message});
        }
    },

    showToast(text: string) {
        set({toast: {text, at: Date.now()}});
    },

    dismissToast() {
        set({toast: null});
    },
};
