/**
 * @jest-environment jsdom
 */
// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {meetPostId} from './meet_clicks';

const ID = 'abcdefghijklmnopqrstuvwxyz';

function render(html: string): Element {
    document.body.innerHTML = html;
    return document.getElementById('target')!;
}

test.each([
    ['channel', `<div id="post_${ID}"><a href="https://meet.google.com/abc"><span id="target">Join</span></a></div>`],
    ['thread', `<div id="rhsPost_${ID}"><p><a id="target" href="https://meet.google.com/abc?authuser=me@x.com">x</a></p></div>`],
    ['search', `<div id="searchResult_${ID}"><a id="target" href="https://meet.google.com/abc">x</a></div>`],
])('a Meet link in a %s post gives the post id', (_where, html) => {
    expect(meetPostId(render(html))).toBe(ID);
});

test.each([
    ['another site', `<div id="post_${ID}"><a id="target" href="https://zoom.us/j/1">x</a></div>`],
    ['a look-alike host', `<div id="post_${ID}"><a id="target" href="https://meet.google.com.evil.example/abc">x</a></div>`],
    ['not a link', `<div id="post_${ID}"><span id="target">https://meet.google.com/abc</span></div>`],
    ['outside a post', '<div id="sidebar"><a id="target" href="https://meet.google.com/abc">x</a></div>'],
    ['a malformed id', '<div id="post_short"><a id="target" href="https://meet.google.com/abc">x</a></div>'],
])('%s gives nothing', (_what, html) => {
    expect(meetPostId(render(html))).toBeNull();
});

test('non-elements give nothing', () => {
    expect(meetPostId(null)).toBeNull();
    expect(meetPostId(document)).toBeNull();
});
