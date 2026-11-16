/**
 * @jest-environment jsdom
 */
// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// A second initialize on the same instance (Mattermost re-enabling the plugin while its code is
// still loading) must not listen again, or every Join click would be reported twice.
export {};

const POST_ID = 'abcdefghijklmnopqrstuvwxyz';

function loadPlugin() {
    const registered: any[] = [];
    (window as any).registerPlugin = (_id: string, plugin: unknown) => registered.push(plugin);
    jest.isolateModules(() => {
        require('./index'); // eslint-disable-line global-require
    });
    return registered[0];
}

function clickJoin() {
    document.body.innerHTML = `<div id="post_${POST_ID}"><a id="join" href="https://meet.google.com/abc-defg-hij">Join</a></div>`;
    document.getElementById('join')!.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
}

beforeEach(() => {
    (global as any).fetch = jest.fn(() => Promise.resolve({ok: true}));
});

test('a Join click is reported once, and not after uninitialize', async () => {
    const plugin = loadPlugin();
    await plugin.initialize();
    await plugin.initialize();

    clickJoin();
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe('/plugins/dev.patika.call-status/api/v1/meet/joined');
    expect(JSON.parse(init.body)).toEqual({post_id: POST_ID});

    plugin.uninitialize();
    clickJoin();
    expect((global as any).fetch).toHaveBeenCalledTimes(1);

    await plugin.initialize();
    clickJoin();
    expect((global as any).fetch).toHaveBeenCalledTimes(2);
    plugin.uninitialize();
});
