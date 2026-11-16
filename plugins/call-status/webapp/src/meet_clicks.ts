// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Mattermost gives every rendered post an element id like post_<id> (channel), rhsPost_<id>
// (thread) or searchResult_<id> (search), the same in Mattermost 10, 11 and 12.
const POST_ELEMENT_ID = /^(?:post|rhsPost|searchResult)_([a-z0-9]{26})$/;

// meetPostId returns the post a click on a Google Meet link happened in, or null when the
// click wasn't on a meet.google.com link inside a message. The server checks that the post
// really is a Google Meet meeting.
export function meetPostId(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) {
        return null;
    }
    const link = target.closest('a[href]');
    if (!link || !isMeetLink(link.getAttribute('href') || '')) {
        return null;
    }
    for (let el: Element | null = link; el; el = el.parentElement) {
        const match = POST_ELEMENT_ID.exec(el.id);
        if (match) {
            return match[1];
        }
    }
    return null;
}

function isMeetLink(href: string): boolean {
    try {
        return new URL(href, window.location.href).hostname === 'meet.google.com';
    } catch {
        return false;
    }
}

// Cookie-authenticated plugin requests must identify as the web app and carry the CSRF token.
export function reportJoin(root: string, pluginId: string, postId: string): Promise<Response> {
    const csrf = document.cookie.split('; ').find((c) => c.startsWith('MMCSRF='))?.split('=')[1] || '';
    return fetch(`${root}/plugins/${pluginId}/api/v1/meet/joined`, {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true, // the click opens Meet in a new tab; keep the request alive regardless
        headers: {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf},
        body: JSON.stringify({post_id: postId}),
    });
}
