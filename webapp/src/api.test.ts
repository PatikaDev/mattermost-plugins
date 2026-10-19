/**
 * @jest-environment jsdom
 */
// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {markRead, recentPosts} from './api';

const fetchMock = jest.fn();
beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    document.cookie = 'MMCSRF=csrf-1';
});
const ok = (body: unknown) => ({ok: true, status: 200, text: async () => JSON.stringify(body)});

it('marks many channels read in one call, like the sidebar', async () => {
    fetchMock.mockResolvedValue(ok({status: 'OK'}));
    await markRead(['a', 'b']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v4/channels/members/me/mark_read');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(['a', 'b']);
    expect(init.headers).toMatchObject({'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': 'csrf-1'});
});

it('returns posts in the server order', async () => {
    fetchMock.mockResolvedValue(ok({order: ['p2', 'p1'], posts: {p1: {id: 'p1'}, p2: {id: 'p2'}}}));
    expect((await recentPosts('c')).map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v4/channels/c/posts?page=0&per_page=30');
});
