// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import manifest from 'manifest';

export type ScheduledPost = {
    id: string;
    user_id: string;
    channel_id: string;
    root_id?: string;
    message: string;
    file_ids?: string[];
    send_at: number;
    status: 'pending' | 'sending' | 'failed';
    error?: string;
};

export type CreateRequest = {
    channel_id: string;
    root_id: string;
    message: string;
    file_ids: string[];
    send_at: number;
};

declare global {
    interface Window {
        basename?: string;
    }
}

const base = () => `${window.basename || ''}/plugins/${manifest.id}/api/v1`;

// Cookie-authenticated requests must identify as the web app, and writes need the CSRF token.
function headers(): Record<string, string> {
    const csrf = document.cookie.split('; ').find((c) => c.startsWith('MMCSRF='))?.split('=')[1] || '';
    return {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf};
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(base() + path, {
        method,
        headers: headers(),
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
        let message = 'Something went wrong. Please try again.';
        try {
            message = (await res.json()).message || message;
        } catch {
            // Non-JSON error body: keep the generic message.
        }
        throw new Error(message);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
}

export const listScheduled = () => call<ScheduledPost[]>('GET', '/scheduled');
export const createScheduled = (req: CreateRequest) => call<ScheduledPost>('POST', '/scheduled', req);
export const rescheduleScheduled = (id: string, sendAt: number) => call<ScheduledPost>('PATCH', `/scheduled/${id}`, {send_at: sendAt});
export const deleteScheduled = (id: string) => call<void>('DELETE', `/scheduled/${id}`);
export const sendScheduledNow = (id: string) => call<void>('POST', `/scheduled/${id}/send`);
