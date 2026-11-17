/**
 * @jest-environment jsdom
 */
// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// A second initialize on the same instance (Mattermost re-enabling the plugin while its code is
// still loading) must not register anything again, or every button shows up twice.
export {};

jest.mock('read-excel-file/browser', () => ({readSheet: jest.fn()}));

test('initialize registers once per instance, again after uninitialize', async () => {
    const registered: any[] = [];
    (window as any).registerPlugin = (_id: string, plugin: unknown) => registered.push(plugin);
    jest.isolateModules(() => {
        require('./index'); // eslint-disable-line global-require
    });
    const plugin = registered[0];

    const calls: string[] = [];
    const registry = new Proxy({}, {get: (_target, name) => () => calls.push(String(name))});
    const store = {getState: () => ({entities: {teams: {currentTeamId: 't'}}})};

    await plugin.initialize(registry, store);
    expect(calls).toEqual(['registerGlobalComponent', 'registerChannelHeaderButtonAction']);

    await plugin.initialize(registry, store);
    expect(calls).toHaveLength(2);

    plugin.uninitialize();
    await plugin.initialize(registry, store);
    expect(calls).toHaveLength(4);
});
