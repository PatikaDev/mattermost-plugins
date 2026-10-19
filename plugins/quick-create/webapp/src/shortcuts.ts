// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Each channel's shortcut buttons, loaded once per channel and reloaded when the server says
// they changed (websocket), so every open tab shows the same buttons.

import {useEffect, useState} from 'react';

import {getShortcuts, type ShortcutList} from './api';

const empty: ShortcutList = {shortcuts: [], can_manage: false};
const cache = new Map<string, ShortcutList>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function changed() {
    listeners.forEach((l) => l());
}

export const shortcutStore = {
    get: (channelId: string): ShortcutList => cache.get(channelId) || empty,

    load(channelId: string, force = false): Promise<void> {
        if (!channelId || (!force && (cache.has(channelId) || loading.has(channelId)))) {
            return loading.get(channelId) || Promise.resolve();
        }
        const p = getShortcuts(channelId).
            then((list) => {
                cache.set(channelId, {shortcuts: list?.shortcuts || [], can_manage: Boolean(list?.can_manage)});
            }).
            catch(() => {
                cache.set(channelId, empty); // no access or plugin error: show nothing
            }).
            finally(() => {
                loading.delete(channelId);
                changed();
            });
        loading.set(channelId, p);
        return p;
    },

    set(channelId: string, list: ShortcutList) {
        cache.set(channelId, list);
        changed();
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

// Only hooks available since React 16.8: the host webapp's React is used at runtime.
export function useShortcuts(channelId: string): ShortcutList {
    const [list, setList] = useState(shortcutStore.get(channelId));
    useEffect(() => {
        setList(shortcutStore.get(channelId));
        shortcutStore.load(channelId);
        return shortcutStore.subscribe(() => setList(shortcutStore.get(channelId)));
    }, [channelId]);
    return list;
}

// Same rule as the server: absolute http(s) links only.
export function isSafeLink(link: string): boolean {
    try {
        const u = new URL(link.trim());
        return (u.protocol === 'https:' || u.protocol === 'http:') && Boolean(u.host);
    } catch {
        return false;
    }
}

export function openShortcut(url: string) {
    if (isSafeLink(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}
