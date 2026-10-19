// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Unread posts per channel and the people who wrote them. A channel's posts are reloaded only
// when its unread key changes (new messages, or read elsewhere).

import {useEffect, useState} from 'react';

import {recentPosts, usersByIds, type User} from './api';
import {collapsedThreads, currentUserId, profile} from './state';
import {unreadKey, unreadPosts, type Post, type UnreadChannel} from './unreads';

type Entry = {key: string; loading: boolean; posts: Post[]; error: string};

const entries = new Map<string, Entry>();
const users = new Map<string, User>();
const listeners = new Set<() => void>();

function changed() {
    listeners.forEach((l) => l());
}

async function loadUsers(ids: string[]) {
    const missing = Array.from(new Set(ids)).filter((id) => !users.has(id) && !profile(id));
    if (!missing.length) {
        return;
    }
    try {
        for (const u of await usersByIds(missing)) {
            users.set(u.id, u);
        }
    } catch {
        // Names fall back to "Someone".
    }
}

async function load(u: UnreadChannel, key: string) {
    entries.set(u.channel.id, {key, loading: true, posts: entries.get(u.channel.id)?.posts || [], error: ''});
    changed();
    try {
        const posts = unreadPosts(await recentPosts(u.channel.id), u.lastViewedAt, currentUserId(), collapsedThreads());
        await loadUsers(posts.map((p) => p.user_id));
        if (entries.get(u.channel.id)?.key === key) {
            entries.set(u.channel.id, {key, loading: false, posts, error: ''});
        }
    } catch (err) {
        if (entries.get(u.channel.id)?.key === key) {
            entries.set(u.channel.id, {key, loading: false, posts: [], error: (err as Error).message});
        }
    }
    changed();
}

export const postsCache = {
    sync(unreads: UnreadChannel[]) {
        for (const u of unreads) {
            const key = unreadKey(u);
            if (entries.get(u.channel.id)?.key !== key) {
                load(u, key);
            }
        }
    },
    get: (channelId: string): Entry | undefined => entries.get(channelId),
    user: (id: string): User | undefined => profile(id) || users.get(id),
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

export function usePostsCache(): number {
    const [version, setVersion] = useState(0);
    useEffect(() => postsCache.subscribe(() => setVersion((v) => v + 1)), []);
    return version;
}
