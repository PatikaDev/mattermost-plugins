// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import type {Post} from './unreads';

export type User = {id: string; username: string; first_name?: string; last_name?: string; nickname?: string; last_picture_update?: number};

declare global {
    interface Window {
        basename?: string;
    }
}

const root = () => window.basename || '';

// Cookie-authenticated requests must identify as the web app, and writes need the CSRF token.
function headers(): Record<string, string> {
    const csrf = document.cookie.split('; ').find((c) => c.startsWith('MMCSRF='))?.split('=')[1] || '';
    return {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf};
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(root() + url, {method, headers: headers(), credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body)});
    if (!res.ok) {
        let message = 'Something went wrong. Please try again.';
        try {
            message = (await res.json()).message || message;
        } catch {
            // Non-JSON error body: keep the generic message.
        }
        throw new Error(message);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
}

// The channel's latest posts (newest first from the server); unread ones are picked client-side.
export async function recentPosts(channelId: string, perPage = 30): Promise<Post[]> {
    const res = await call<{order: string[]; posts: Record<string, Post>}>('GET', `/api/v4/channels/${channelId}/posts?page=0&per_page=${perPage}`);
    return (res?.order || []).map((id) => res.posts[id]).filter(Boolean);
}

// Marks channels as read in one call (the same endpoint as the sidebar's "Mark as read").
export const markRead = (channelIds: string[]) => call<unknown>('POST', '/api/v4/channels/members/me/mark_read', channelIds);

export const usersByIds = (ids: string[]) => call<User[]>('POST', '/api/v4/users/ids', ids);

export const avatarUrl = (u: {id: string; last_picture_update?: number}) => `${root()}/api/v4/users/${u.id}/image?_=${u.last_picture_update || 0}`;
