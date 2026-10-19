/**
 * @jest-environment jsdom
 */
// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {isSafeLink, openShortcut, shortcutStore} from './shortcuts';

// A script link is exactly what these tests must reject.
const SCRIPT_LINK = ['javascript', 'alert(1)'].join(':');

const fetchMock = jest.fn();
const ok = (body: unknown) => ({ok: true, status: 200, text: async () => JSON.stringify(body)});

beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
});

describe('isSafeLink', () => {
    it('accepts absolute http(s) links only', () => {
        expect(isSafeLink('https://n8n.patika.dev/form/design-request')).toBe(true);
        expect(isSafeLink(' http://example.com/x ')).toBe(true);
        for (const bad of [SCRIPT_LINK, 'data:text/html,hi', '/admin', 'n8n.patika.dev', '', 'https://']) {
            expect(isSafeLink(bad)).toBe(false);
        }
    });

    it('never opens unsafe links', () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);
        openShortcut(SCRIPT_LINK);
        expect(open).not.toHaveBeenCalled();
        openShortcut('https://example.com');
        expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
        open.mockRestore();
    });
});

describe('shortcutStore', () => {
    it('loads a channel once, and again when forced', async () => {
        fetchMock.mockResolvedValue(ok({shortcuts: [{id: 'a', label: 'Form', url: 'https://x.io'}], can_manage: true}));
        await shortcutStore.load('chan1');
        await shortcutStore.load('chan1');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('/plugins/dev.patika.quick-create/api/v1/channels/chan1/shortcuts');
        expect(shortcutStore.get('chan1')).toEqual({shortcuts: [{id: 'a', label: 'Form', url: 'https://x.io'}], can_manage: true});

        await shortcutStore.load('chan1', true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('shows nothing when the channel cannot be read', async () => {
        fetchMock.mockResolvedValue({ok: false, status: 404, json: async () => ({message: 'Channel not found.'})});
        await shortcutStore.load('secret');
        expect(shortcutStore.get('secret')).toEqual({shortcuts: [], can_manage: false});
    });

    it('notifies subscribers on changes', () => {
        const listener = jest.fn();
        const unsubscribe = shortcutStore.subscribe(listener);
        shortcutStore.set('chan2', {shortcuts: [], can_manage: true});
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });
});
