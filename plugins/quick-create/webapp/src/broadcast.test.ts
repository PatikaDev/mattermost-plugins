// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {alsoSend, canSendToChannel, markPost as mark, markSentFromMenu, PROP_REQUESTED, type OutgoingPost} from './broadcast';

const markPost = (post: OutgoingPost) => mark(post);

describe('also send to channel', () => {
    it('marks the next reply in a thread with the toggle on, then turns the toggle off', () => {
        alsoSend.toggle('root1');
        const {post} = markPost({root_id: 'root1', message: 'ship it', props: {existing: 1}});
        expect(post.props).toEqual({existing: 1, [PROP_REQUESTED]: true});
        expect(alsoSend.isOn('root1')).toBe(false);

        const second = markPost({root_id: 'root1', message: 'again'});
        expect(second.post.props).toBeUndefined();
    });

    it('leaves other threads and channel messages alone', () => {
        alsoSend.toggle('root2');
        expect(markPost({root_id: 'other', message: 'x'}).post.props).toBeUndefined();
        expect(markPost({message: 'top-level'}).post.props).toBeUndefined();
        expect(alsoSend.isOn('root2')).toBe(true);
        alsoSend.toggle('root2');
        expect(alsoSend.isOn('root2')).toBe(false);
    });

    it('notifies subscribers when the toggle changes', () => {
        const listener = jest.fn();
        const unsubscribe = alsoSend.subscribe(listener);
        alsoSend.toggle('root3');
        markPost({root_id: 'root3'});
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
    });
});

describe('Also send to channel from the menu', () => {
    const mine = {id: 'r1', root_id: 'root', user_id: 'me', type: '', delete_at: 0, pending_post_id: '', props: {}};

    test('is offered for my own thread replies only', () => {
        expect(canSendToChannel(mine, 'me')).toBe(true);
        expect(canSendToChannel({...mine, user_id: 'bob'}, 'me')).toBe(false);
        expect(canSendToChannel({...mine, root_id: ''}, 'me')).toBe(false); // already in the channel
        expect(canSendToChannel({...mine, type: 'system_join_channel'}, 'me')).toBe(false);
        expect(canSendToChannel({...mine, delete_at: 5}, 'me')).toBe(false);
        expect(canSendToChannel({...mine, pending_post_id: 'r1'}, 'me')).toBe(false); // still sending
        expect(canSendToChannel(undefined, 'me')).toBe(false);
        expect(canSendToChannel(mine, '')).toBe(false);
    });

    test('is not offered again once the reply went to the channel', () => {
        expect(canSendToChannel({...mine, id: 'r2', props: {[PROP_REQUESTED]: true}}, 'me')).toBe(false);
        const r3 = {...mine, id: 'r3'};
        expect(canSendToChannel(r3, 'me')).toBe(true);
        markSentFromMenu('r3');
        expect(canSendToChannel(r3, 'me')).toBe(false);
    });
});
