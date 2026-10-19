// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Reads the host webapp's Redux state (set once in initialize) and turns it into unread data.
// Only hooks available since React 16.8: the host webapp's React is used at runtime.

import {useEffect, useState} from 'react';
import type {Store} from 'redux';

import {collapsedThreadsOn, computeUnreads, type UnreadChannel} from './unreads';

let store: Store<any> | null = null;

export function setStore(s: Store<any>) {
    store = s;
}

export function dispatch(action: unknown) {
    store?.dispatch(action as never);
}

const s = () => store?.getState();

export function currentUserId(): string {
    return s()?.entities.users.currentUserId || '';
}

export function currentTeamName(): string {
    const st = s();
    return st?.entities.teams.teams[st.entities.teams.currentTeamId]?.name || '';
}

export function collapsedThreads(): boolean {
    const st = s();
    return collapsedThreadsOn(st?.entities.general.config.CollapsedThreads, st?.entities.preferences.myPreferences['display_settings--collapsed_reply_threads']?.value);
}

export function uses24h(): boolean {
    return s()?.entities.preferences.myPreferences['display_settings--use_military_time']?.value === 'true';
}

export function profile(userId: string) {
    return s()?.entities.users.profiles[userId];
}

export type Snapshot = {unreads: UnreadChannel[]; unreadThreads: number; threadMentions: number};

function snapshot(): Snapshot {
    const st = s();
    if (!st) {
        return {unreads: [], unreadThreads: 0, threadMentions: 0};
    }
    const teamId = st.entities.teams.currentTeamId;
    const crt = collapsedThreads();
    const threadCounts = crt ? (st.entities.threads?.countsIncludingDirect?.[teamId] || st.entities.threads?.counts?.[teamId]) : null;
    return {
        unreads: computeUnreads({
            channels: st.entities.channels.channels,
            members: st.entities.channels.myMembers,
            counts: st.entities.channels.messageCounts || {},
            teamId,
            collapsedThreads: crt,
            currentChannelId: st.entities.channels.currentChannelId,
        }),
        unreadThreads: threadCounts?.total_unread_threads || 0,
        threadMentions: threadCounts?.total_unread_mentions || 0,
    };
}

// Recomputes on store changes, but only re-renders when the unread picture actually changed.
export function useSnapshot(): Snapshot {
    const [snap, setSnap] = useState(snapshot);
    useEffect(() => {
        let last = JSON.stringify(snap);
        const check = () => {
            const next = snapshot();
            const sig = JSON.stringify(next);
            if (sig !== last) {
                last = sig;
                setSnap(next);
            }
        };
        check();
        return store ? store.subscribe(check) : undefined;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return snap;
}

// "~Town Square", "@alice", or a group's names.
export function channelTitle(channel: UnreadChannel['channel']): string {
    if (channel.type === 'D') {
        const me = currentUserId();
        const otherId = channel.name.split('__').find((id) => id !== me) || me;
        const other = profile(otherId);
        return other ? `@${other.username}` : 'Direct message';
    }
    if (channel.type === 'G') {
        return channel.display_name || 'Group message';
    }
    return channel.display_name || channel.name;
}

// Where "Open" goes: the first unread post (Mattermost scrolls there and marks the channel
// read when you view it), or the channel itself.
export function openPath(channel: UnreadChannel['channel'], firstUnreadPostId?: string): string {
    const team = currentTeamName();
    if (firstUnreadPostId) {
        return `/${team}/pl/${firstUnreadPostId}`;
    }
    if (channel.type === 'D') {
        const t = channelTitle(channel);
        return t.startsWith('@') ? `/${team}/messages/${t}` : `/${team}/channels/${channel.name}`;
    }
    if (channel.type === 'G') {
        return `/${team}/messages/${channel.name}`;
    }
    return `/${team}/channels/${channel.name}`;
}

declare global {
    interface Window {
        WebappUtils?: {browserHistory?: {push: (path: string) => void}};
        PostUtils?: {formatText: (text: string, options?: Record<string, unknown>) => string; messageHtmlToComponent: (html: string, ...args: unknown[]) => JSX.Element};
    }
}

export function navigate(path: string) {
    if (window.WebappUtils?.browserHistory) {
        window.WebappUtils.browserHistory.push(path);
    } else {
        window.location.assign((window.basename || '') + path);
    }
}
