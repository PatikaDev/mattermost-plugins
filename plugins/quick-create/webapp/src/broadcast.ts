// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// "Also send to channel": which thread reply boxes have the toggle on. The MessageWillBePosted
// hook marks the next reply from such a thread, and the server copies it into the channel.

import {useEffect, useState} from 'react';

export const PROP_REQUESTED = 'qc_also_send_to_channel';

const enabled = new Set<string>(); // root post IDs
const listeners = new Set<() => void>();

function changed() {
    listeners.forEach((l) => l());
}

export const alsoSend = {
    isOn: (rootId: string) => enabled.has(rootId),

    toggle(rootId: string) {
        if (enabled.has(rootId)) {
            enabled.delete(rootId);
        } else {
            enabled.add(rootId);
        }
        changed();
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

export type OutgoingPost = {root_id?: string; message?: string; props?: Record<string, unknown>};

// Marks a reply whose thread has the toggle on, then switches the toggle off (like Slack).
export function markPost<T extends OutgoingPost>(post: T): {post: T} {
    const rootId = post.root_id || '';
    if (!rootId || !enabled.has(rootId)) {
        return {post};
    }
    enabled.delete(rootId);
    changed();
    return {post: {...post, props: {...(post.props || {}), [PROP_REQUESTED]: true}}};
}

// Only hooks available since React 16.8: the host webapp's React is used at runtime.
export function useAlsoSend(rootId: string): boolean {
    const [on, setOn] = useState(alsoSend.isOn(rootId));
    useEffect(() => {
        setOn(alsoSend.isOn(rootId));
        return alsoSend.subscribe(() => setOn(alsoSend.isOn(rootId)));
    }, [rootId]);
    return on;
}

// "Also send to channel" in the menu of a reply that is already posted: only for your own live
// thread replies that haven't gone to the channel yet (with the checkbox, or from this menu in
// this tab — the server refuses any other repeat).
export type MenuPost = {
    id: string;
    root_id?: string;
    user_id?: string;
    type?: string;
    delete_at?: number;
    pending_post_id?: string;
    props?: Record<string, unknown>;
};

const sentFromMenu = new Set<string>();

export function canSendToChannel(post: MenuPost | undefined, me: string): boolean {
    return Boolean(
        post &&
        me &&
        post.root_id &&
        post.user_id === me &&
        !post.type && // system messages
        !post.delete_at &&
        post.pending_post_id !== post.id && // still being sent
        post.props?.[PROP_REQUESTED] !== true &&
        !sentFromMenu.has(post.id),
    );
}

export function markSentFromMenu(postId: string) {
    sentFromMenu.add(postId);
}
