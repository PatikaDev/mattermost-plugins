// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {buildPlan, describe as show, guessMapping, norm, parseDateRange, SKIP, TITLE} from './convert';
import type {Board, User} from './convert';
import {toTable} from './table';

// The properties of the team's content-calendar boards.
const board: Board = {
    id: 'board1',
    teamId: 'team1',
    title: 'Content Calendar',
    cardProperties: [
        {id: 'status', name: 'Status', type: 'select', options: [{id: 'o-idea', value: 'Idea 💡', color: 'x'}, {id: 'o-draft', value: 'Draft', color: 'x'}]},
        {id: 'channel', name: 'Channel', type: 'multiSelect', options: [{id: 'c-blog', value: 'Blog', color: 'x'}, {id: 'c-email', value: 'Email', color: 'x'}, {id: 'c-li', value: 'LinkedIn', color: 'x'}]},
        {id: 'assignee', name: 'Assignee', type: 'person', options: []},
        {id: 'due', name: 'Due Date', type: 'date', options: []},
        {id: 'link', name: 'Link', type: 'url', options: []},
        {id: 'desc', name: 'Açıklama', type: 'text', options: []},
        {id: 'done', name: 'Done', type: 'checkbox', options: []},
        {id: 'created', name: 'Created', type: 'createdTime', options: []},
    ],
};

const users: User[] = [
    {id: 'u-cansin', username: 'cansin', email: 'cansin@patika.dev', first_name: 'Cansın', last_name: 'Yılmaz'},
    {id: 'u-ali1', username: 'ali1', first_name: 'Ali', last_name: 'Kaya'},
    {id: 'u-ali2', username: 'ali2', first_name: 'Ali', last_name: 'Kaya'},
];

let n = 0;
const opts = (extra = {}) => ({addMissingOptions: true, skipExisting: true, existingTitles: [], newOptionId: () => `new${++n}`, ...extra});
const noon = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);

test('norm ignores case, Turkish letters, emoji and punctuation', () => {
    expect(norm('Idea 💡')).toBe('idea');
    expect(norm('AÇIKLAMA')).toBe(norm('açıklama'));
    expect(norm('Görev')).toBe('gorev');
    expect(norm(' Due-Date ')).toBe('due date');
});

test('columns match properties by name; the card name comes from Name/Görev/… or the first free column', () => {
    expect(guessMapping(['Görev', 'status', 'Açıklama', 'Something else'], board.cardProperties)).toEqual([TITLE, 'status', 'desc', SKIP]);
    expect(guessMapping(['Name', 'Status'], board.cardProperties)).toEqual([TITLE, 'status']);
    expect(guessMapping(['Status', 'Whatever'], board.cardProperties)).toEqual(['status', TITLE]);
    expect(guessMapping(['Title', 'Created'], board.cardProperties)).toEqual([TITLE, SKIP]); // read-only: not offered
});

test('Boards CSV export round-trip: labels back to option ids, "|" lists, user ids, dates', () => {
    const table = toTable([
        ['Name', 'Status', 'Channel', 'Assignee', 'Due Date', 'Link', 'Done'],
        ['Write post ___hash_sign___1', 'Idea 💡', 'Blog|LinkedIn', 'u-cansin', 'November 20, 2026', 'https://x.dev', 'true'],
    ]);
    const plan = buildPlan(table, guessMapping(table.headers, board.cardProperties), board, users, opts());
    expect(plan.warnings).toEqual([]);
    expect(plan.cards).toEqual([{
        row: 2,
        title: 'Write post #1',
        properties: {status: 'o-idea', channel: ['c-blog', 'c-li'], assignee: 'u-cansin', due: JSON.stringify({from: noon(2026, 11, 20)}), link: 'https://x.dev', done: 'true'},
    }]);
});

test('people match by username, @username, email or full name; shared names match nobody', () => {
    const table = toTable([['Name', 'Assignee'], ['a', '@cansin'], ['b', 'CANSIN@patika.dev'], ['c', 'Cansın Yılmaz'], ['d', 'Ali Kaya'], ['e', 'ali1']]);
    const plan = buildPlan(table, [TITLE, 'assignee'], board, users, opts());
    expect(plan.cards.map((c) => c.properties.assignee)).toEqual(['u-cansin', 'u-cansin', 'u-cansin', undefined, 'u-ali1']);
    expect(plan.warnings).toEqual([{row: 5, column: 'Assignee', value: 'Ali Kaya', message: 'no Mattermost user "Ali Kaya"; left empty'}]);
});

test('unknown select values become new options once, or are left empty when that is off', () => {
    const table = toTable([['Name', 'Status', 'Channel'], ['a', 'Archived', 'Email, Podcast'], ['b', 'archived', 'podcast']]);
    const plan = buildPlan(table, [TITLE, 'status', 'channel'], board, users, opts({newOptionId: () => 'fresh'}));
    expect(plan.newOptions.status).toEqual([{id: 'fresh', value: 'Archived', color: 'propColorOrange'}]);
    expect(plan.newOptions.channel.map((o) => o.value)).toEqual(['Podcast']);
    expect(plan.cards[1].properties).toEqual({status: 'fresh', channel: ['fresh']});
    expect(show(board.cardProperties[0], plan.cards[0].properties.status, plan, users)).toBe('Archived');

    const strict = buildPlan(table, [TITLE, 'status', 'channel'], board, users, opts({addMissingOptions: false}));
    expect(strict.newOptions).toEqual({});
    expect(strict.cards[0].properties).toEqual({channel: ['c-email']});
    expect(strict.warnings.map((w) => w.message)).toContain('"Archived" isn\'t an option of Status; left empty');
});

test('rows without a name, and names already on the board, are skipped', () => {
    const table = toTable([['Name', 'Status'], ['', 'Draft'], ['Existing card', 'Draft'], ['New card', 'Draft']]);
    const plan = buildPlan(table, [TITLE, 'status'], board, users, opts({existingTitles: ['existing CARD']}));
    expect(plan.cards.map((c) => c.title)).toEqual(['New card']);
    expect(plan.withoutName).toEqual([2]);
    expect(plan.existing).toEqual([3]);
    expect(buildPlan(table, [TITLE, 'status'], board, users, opts({existingTitles: ['Existing card'], skipExisting: false})).cards).toHaveLength(2);
});

test('dates in the formats people type, Excel cells and Boards ranges', () => {
    const now = new Date(Date.UTC(2026, 10, 17));
    const from = (v: Parameters<typeof parseDateRange>[0]) => parseDateRange(v, now)?.from;
    expect(from('2026-11-20')).toBe(noon(2026, 11, 20));
    expect(from('20.11.2026')).toBe(noon(2026, 11, 20));
    expect(from('20/11/2026')).toBe(noon(2026, 11, 20));
    expect(from('11/20/2026')).toBe(noon(2026, 11, 20)); // month first only when it must be
    expect(from('03/04/2026')).toBe(noon(2026, 4, 3)); // otherwise day first
    expect(from('20 Kasım 2026')).toBe(noon(2026, 11, 20));
    expect(from('Nov 20, 2026')).toBe(noon(2026, 11, 20));
    expect(from('November 20')).toBe(noon(2026, 11, 20)); // Boards leaves out the current year
    expect(from(new Date(Date.UTC(2026, 10, 20)))).toBe(noon(2026, 11, 20));
    expect(from(46346)).toBe(noon(2026, 11, 20)); // Excel serial day
    expect(parseDateRange('November 20, 2026 -> November 22, 2026', now)).toEqual({from: noon(2026, 11, 20), to: noon(2026, 11, 22)});
    expect(from('31.02.2026')).toBeUndefined();
    expect(from('soon')).toBeUndefined();
    expect(from(5)).toBeUndefined();
});

test('checkboxes and numbers', () => {
    const numBoard: Board = {...board, cardProperties: [...board.cardProperties, {id: 'n', name: 'Budget', type: 'number', options: []}]};
    const table = toTable([['Name', 'Done', 'Budget'], ['a', 'Evet', '1,5'], ['b', 'no', 'lots'], ['c', '✓', 3]]);
    const plan = buildPlan(table, [TITLE, 'done', 'n'], numBoard, users, opts());
    expect(plan.cards.map((c) => c.properties)).toEqual([{done: 'true', n: '1.5'}, {}, {done: 'true', n: '3'}]);
    expect(plan.warnings.map((w) => w.message)).toEqual(['"lots" isn\'t a number; left empty']);
});
