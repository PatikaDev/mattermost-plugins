// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {collapsedThreadsOn, computeUnreads, unreadPosts, type Channel, type Member, type Post} from './unreads';

const ch = (id: string, over: Partial<Channel> = {}): Channel => ({id, name: id, display_name: id, type: 'O', team_id: 't1', delete_at: 0, last_post_at: 100, ...over});
const mem = (id: string, over: Partial<Member> = {}): Member => ({channel_id: id, msg_count: 10, msg_count_root: 5, mention_count: 0, mention_count_root: 0, last_viewed_at: 1, ...over});

describe('collapsedThreadsOn', () => {
    it('follows the server setting and the user preference like Mattermost', () => {
        expect(collapsedThreadsOn('always_on', 'off')).toBe(true);
        expect(collapsedThreadsOn('disabled', 'on')).toBe(false);
        expect(collapsedThreadsOn('default_on', undefined)).toBe(true);
        expect(collapsedThreadsOn('default_on', 'off')).toBe(false);
        expect(collapsedThreadsOn('default_off', undefined)).toBe(false);
        expect(collapsedThreadsOn('default_off', 'on')).toBe(true);
    });
});

describe('computeUnreads', () => {
    const channels = {
        a: ch('a', {last_post_at: 300}),
        b: ch('b', {last_post_at: 200}),
        muted: ch('muted'),
        other: ch('other', {team_id: 't2'}),
        dm: ch('dm', {type: 'D', team_id: ''}),
        gone: ch('gone', {delete_at: 5}),
        read: ch('read'),
    };
    const counts = {
        a: {total: 12, root: 6},
        b: {total: 15, root: 5},
        muted: {total: 20, root: 10},
        other: {total: 20, root: 20},
        dm: {total: 3, root: 3},
        gone: {total: 99, root: 99},
        read: {total: 10, root: 5},
    };
    const members = {
        a: mem('a'),
        b: mem('b', {mention_count: 2, mention_count_root: 1}),
        muted: mem('muted', {notify_props: {mark_unread: 'mention'}}),
        other: mem('other', {msg_count: 0, msg_count_root: 0}),
        dm: mem('dm', {msg_count: 1, msg_count_root: 1}),
        gone: mem('gone'),
        read: mem('read'),
    };

    it('counts root posts with collapsed threads on, all posts with them off', () => {
        const on = computeUnreads({channels, members, counts, teamId: 't1', collapsedThreads: true});
        expect(on.map((u) => [u.channel.id, u.messages, u.mentions])).toEqual([['b', 1, 1], ['a', 1, 0], ['dm', 2, 0]]);
        const off = computeUnreads({channels, members, counts, teamId: 't1', collapsedThreads: false});
        expect(off.map((u) => [u.channel.id, u.messages, u.mentions])).toEqual([['b', 5, 2], ['a', 2, 0], ['dm', 2, 0]]);
    });

    it('leaves out muted channels without mentions, other teams, archived and read channels', () => {
        const ids = computeUnreads({channels, members, counts, teamId: 't1', collapsedThreads: true}).map((u) => u.channel.id);
        expect(ids).not.toContain('muted');
        expect(ids).not.toContain('other');
        expect(ids).not.toContain('gone');
        expect(ids).not.toContain('read');
        expect(ids).toContain('dm'); // direct messages belong to every team
    });

    it('treats the channel you are viewing as read, like the sidebar', () => {
        const ids = computeUnreads({channels, members, counts, teamId: 't1', collapsedThreads: true, currentChannelId: 'a'}).map((u) => u.channel.id);
        expect(ids).not.toContain('a');
        expect(ids).toContain('b');
    });

    it('shows a muted channel when you were mentioned', () => {
        const withMention = {...members, muted: mem('muted', {notify_props: {mark_unread: 'mention'}, mention_count_root: 1})};
        expect(computeUnreads({channels, members: withMention, counts, teamId: 't1', collapsedThreads: true}).map((u) => u.channel.id)).toContain('muted');
    });
});

describe('unreadPosts', () => {
    const p = (id: string, over: Partial<Post> = {}): Post => ({id, user_id: 'bob', channel_id: 'c', root_id: '', message: id, type: '', create_at: 10, delete_at: 0, ...over});
    const posts = [
        p('new2', {create_at: 30}),
        p('reply', {create_at: 25, root_id: 'new1'}),
        p('mine', {create_at: 24, user_id: 'me'}),
        p('join', {create_at: 23, type: 'system_join_channel'}),
        p('deleted', {create_at: 22, delete_at: 1}),
        p('new1', {create_at: 20}),
        p('old', {create_at: 5}),
    ];

    it('keeps new, visible posts from others, oldest first', () => {
        expect(unreadPosts(posts, 10, 'me', false).map((x) => x.id)).toEqual(['new1', 'reply', 'new2']);
    });

    it('leaves replies to the Threads view when collapsed threads are on', () => {
        expect(unreadPosts(posts, 10, 'me', true).map((x) => x.id)).toEqual(['new1', 'new2']);
    });
});
