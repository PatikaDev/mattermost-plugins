// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import type {Board, CardDraft, PropertyOption, PropertyTemplate, User} from './convert';

declare global {
    interface Window {
        basename?: string;
    }
}

// Everything goes through the signed-in user's own session, so Boards and Mattermost apply
// their usual permissions: you can only import into boards you're allowed to edit.
const root = () => window.basename || '';
const BOARDS = '/plugins/focalboard/api/v2';

function headers(): Record<string, string> {
    const csrf = document.cookie.split('; ').find((c) => c.startsWith('MMCSRF='))?.split('=')[1] || '';
    return {'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf};
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(root() + url, {method, headers: headers(), credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body)});
    if (!res.ok) {
        let message = '';
        try {
            const data = await res.json();
            message = data.error || data.message || '';
        } catch {
            // Not JSON: use the status below.
        }
        if (res.status === 403) {
            throw new Error(message || 'You don\'t have permission to add cards to this board.');
        }
        throw new Error(message || `Request failed (${res.status}).`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
}

export const getBoard = (boardId: string) => call<Board>('GET', `${BOARDS}/boards/${boardId}`);

// The boards you're a member of in a team (templates left out).
export async function listBoards(teamId: string): Promise<Board[]> {
    const boards = await call<Board[]>('GET', `${BOARDS}/teams/${teamId}/boards`);
    return (boards || []).filter((b) => !b.isTemplate).sort((a, b) => a.title.localeCompare(b.title));
}

// Names of the cards already on the board, to skip rows imported before.
export async function cardTitles(boardId: string): Promise<string[]> {
    const titles: string[] = [];
    for (let page = 0; ; page++) {
        // eslint-disable-next-line no-await-in-loop -- pages are read one after another
        const cards = await call<Array<{title: string}>>('GET', `${BOARDS}/boards/${boardId}/cards?page=${page}&per_page=100`);
        titles.push(...(cards || []).map((c) => c.title));
        if (!cards || cards.length < 100) {
            return titles;
        }
    }
}

// Adds new select options to the board's properties (sends the whole property, as Boards does).
export function addOptions(board: Board, newOptions: Record<string, PropertyOption[]>) {
    const updated: PropertyTemplate[] = board.cardProperties.
        filter((p) => newOptions[p.id]?.length).
        map((p) => ({...p, options: [...p.options, ...newOptions[p.id]]}));
    if (updated.length === 0) {
        return Promise.resolve();
    }
    return call('PATCH', `${BOARDS}/boards/${board.id}`, {updatedCardProperties: updated});
}

// Creates one card. disable_notify: people set as assignee aren't sent a message for each row.
export const createCard = (boardId: string, card: CardDraft) => call('POST', `${BOARDS}/boards/${boardId}/cards?disable_notify=true`, {
    title: card.title,
    properties: card.properties,
    contentOrder: [],
    icon: '',
});

// Everyone in the team, to match names, usernames and emails in person columns.
export async function teamUsers(teamId: string): Promise<User[]> {
    const users: User[] = [];
    for (let page = 0; ; page++) {
        // eslint-disable-next-line no-await-in-loop -- pages are read one after another
        const batch = await call<User[]>('GET', `/api/v4/users?in_team=${teamId}&page=${page}&per_page=200`);
        users.push(...(batch || []));
        if (!batch || batch.length < 200) {
            return users;
        }
    }
}
