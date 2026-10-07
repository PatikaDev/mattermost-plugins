/**
 * @jest-environment jsdom
 */
// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {createScheduled, deleteScheduled, listScheduled} from './api';
import {queue} from './queue';

const fetchMock = jest.fn();

beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    document.cookie = 'MMCSRF=csrf-token-123';
});

const ok = (body: unknown, status = 200) => ({ok: true, status, json: async () => body});

describe('api', () => {
    it('sends the headers Mattermost requires for cookie-authenticated writes', async () => {
        fetchMock.mockResolvedValue(ok({id: 'x'}, 201));
        await createScheduled({channel_id: 'c', root_id: '', message: 'hi', file_ids: ['f'], send_at: 1});

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/plugins/dev.patika.scheduled-messages/api/v1/scheduled');
        expect(init.method).toBe('POST');
        expect(init.credentials).toBe('same-origin');
        expect(init.headers).toMatchObject({'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': 'csrf-token-123'});
        expect(JSON.parse(init.body)).toEqual({channel_id: 'c', root_id: '', message: 'hi', file_ids: ['f'], send_at: 1});
    });

    it('surfaces the server\'s user-facing message on errors', async () => {
        fetchMock.mockResolvedValue({ok: false, status: 400, json: async () => ({message: 'Pick a time in the future.'})});
        await expect(listScheduled()).rejects.toThrow('Pick a time in the future.');
    });

    it('handles empty 204 responses', async () => {
        fetchMock.mockResolvedValue({ok: true,
            status: 204,
            json: async () => {
                throw new Error('no body');
            }});
        await expect(deleteScheduled('abc')).resolves.toBeUndefined();
    });
});

describe('queue', () => {
    it('loads the list and keeps the last error visible', async () => {
        fetchMock.mockResolvedValueOnce(ok([{id: 'a'}]));
        await queue.refresh();
        expect(queue.getState()).toMatchObject({loaded: true, error: '', items: [{id: 'a'}]});

        fetchMock.mockResolvedValueOnce({ok: false, status: 500, json: async () => ({message: 'Something went wrong. Please try again.'})});
        await queue.refresh();
        expect(queue.getState().error).toBe('Something went wrong. Please try again.');
        expect(queue.getState().items).toEqual([{id: 'a'}]);
    });

    it('notifies subscribers about toasts', () => {
        const listener = jest.fn();
        const unsubscribe = queue.subscribe(listener);
        queue.showToast('Scheduled for Thu 09:00');
        expect(queue.getState().toast?.text).toBe('Scheduled for Thu 09:00');
        queue.dismissToast();
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
    });
});
