import path from 'node:path';

import {test, expect, type Page} from '@playwright/test';

import {api, http, newSession, openChannel, TEAM} from './helpers';

// Files written by fixtures/make_fixtures.py: 3 named rows + 1 without a name; statuses Draft,
// Idea (the board's option is "Idea 💡") and Archived (new); people member, @admin, nobody-here.
const XLSX = path.join(__dirname, '../fixtures/todos.xlsx');
const CSV = path.join(__dirname, '../fixtures/todos.csv');
const NAMES = ['Blog yazısı #1', 'Bülten', 'Podcast bölümü'];

const boards = <T = any>(page: Page, method: string, p: string, body?: unknown) => http<T>(page, method, `/plugins/focalboard/api/v2${p}`, body);

// A board like the team's, made from Boards' own "Content Calendar" template.
async function contentCalendar(page: Page, teamId: string, title: string) {
    const templates = await boards<any[]>(page, 'GET', '/teams/0/templates');
    const template = templates.find((t) => t.title.trim() === 'Content Calendar'); // Boards' own title ends with a space
    expect(template, `templates: ${templates.map((t) => t.title).join(', ')}`).toBeTruthy();
    const copy = await boards(page, 'POST', `/boards/${template.id}/duplicate?asTemplate=false&toTeam=${teamId}`);
    const board = copy.boards[0];
    await boards(page, 'PATCH', `/boards/${board.id}`, {title});
    return {...board, title};
}

// Boards sends a first-time user to its welcome page instead of the board; mark it as seen.
async function openBoard(page: Page, teamId: string, boardId: string) {
    const me = await api(page, 'GET', '/users/me');
    await boards(page, 'PUT', `/users/${me.id}/config`, {updatedFields: {welcomePageViewed: '1'}});
    await page.goto(`/boards/team/${teamId}/${boardId}`);
    await expect(page.locator('.ViewHeader')).toBeVisible({timeout: 60_000});
}

// The cards this test imported (the template's own sample cards left out).
const cardsOf = async (page: Page, boardId: string) => (await boards<any[]>(page, 'GET', `/boards/${boardId}/cards?page=0&per_page=100`)).filter((c) => NAMES.includes(c.title));

// Board names are unique per run, so a test server that's reused doesn't mix them up.
const unique = (name: string) => `${name} ${Date.now().toString(36)}`;
const prop = (board: any, name: string) => board.cardProperties.find((p: any) => p.name === name);

test.describe('Board import', () => {
    test('import an Excel file from the board toolbar, then the CSV again (duplicates skipped)', async ({browser}) => {
        const admin = await newSession(browser, 'admin');
        const member = await api(admin.page, 'GET', '/users/username/member');
        const team = await api(admin.page, 'GET', `/teams/name/${TEAM}`);
        const board = await contentCalendar(admin.page, team.id, unique('Import test'));

        await openBoard(admin.page, team.id, board.id);
        const importButton = admin.page.locator('.ViewHeader').getByRole('button', {name: 'Import'});
        await expect(importButton).toBeVisible({timeout: 60_000});
        await importButton.click();

        const dialog = admin.page.getByRole('dialog', {name: 'Import cards'});
        await expect(dialog.getByText('Into: ')).toContainText(board.title);
        await dialog.getByLabel('File').setInputFiles(XLSX);

        // Columns matched by name; "Görev" becomes the card name.
        await expect(dialog.getByLabel('Column Görev')).toHaveValue('__title');
        await expect(dialog.getByLabel('Column Status')).toHaveValue(prop(board, 'Status').id);
        await expect(dialog.getByLabel('Column Ignored column')).toHaveValue('');
        await expect(dialog.getByText('3 cards to add · 1 without a name (skipped) · 1 new option')).toBeVisible();
        await expect(dialog.getByText(/Row 4, Assignee: no Mattermost user "nobody-here"/)).toBeVisible();
        await expect(dialog.getByText(/Row 4, Due Date: "not a date" isn't a date/)).toBeVisible();

        await dialog.getByRole('button', {name: 'Import 3 cards'}).click();
        await expect(dialog.getByRole('status')).toContainText(`Added 3 cards to ${board.title}.`);
        await dialog.getByRole('button', {name: 'Done'}).click();

        // What Boards now holds.
        const saved = await boards(admin.page, 'GET', `/boards/${board.id}`);
        const status = prop(saved, 'Status');
        const channel = prop(saved, 'Channel');
        const optionId = (p: any, value: string) => p.options.find((o: any) => o.value === value)?.id;
        expect(optionId(status, 'Archived')).toBeTruthy(); // the new option was added

        const cards = await cardsOf(admin.page, board.id);
        const byTitle = Object.fromEntries(cards.map((c) => [c.title, c.properties]));
        expect(Object.keys(byTitle).sort()).toEqual([...NAMES].sort());

        const blog = byTitle['Blog yazısı #1'];
        expect(blog[status.id]).toBe(optionId(status, 'Draft'));
        expect([...blog[channel.id]].sort()).toEqual([optionId(channel, 'Blog'), optionId(channel, 'LinkedIn')].sort());
        expect(blog[prop(saved, 'Assignee').id]).toBe(member.id);
        expect(JSON.parse(blog[prop(saved, 'Due Date').id])).toEqual({from: Date.UTC(2026, 10, 20, 12)});
        expect(blog[prop(saved, 'Link').id]).toBe('https://patika.dev/blog');

        const bulletin = byTitle['Bülten'];
        expect(bulletin[status.id]).toBe(optionId(status, 'Idea 💡')); // "Idea" matched "Idea 💡"
        expect([...bulletin[channel.id]].sort()).toEqual([optionId(channel, 'Email'), optionId(channel, 'Twitter')].sort());
        expect(bulletin[prop(saved, 'Assignee').id]).toBe(admin.me.id);
        expect(byTitle['Podcast bölümü'][status.id]).toBe(optionId(status, 'Archived'));

        // The same rows again as CSV: all already on the board, nothing to import.
        await importButton.click();
        await dialog.getByLabel('File').setInputFiles(CSV);
        await expect(dialog.getByText('0 cards to add · 3 already on the board (skipped) · 1 without a name (skipped)')).toBeVisible();
        await expect(dialog.getByRole('button', {name: 'Import'})).toBeDisabled();

        // Unless that's switched off.
        await dialog.getByLabel('Skip rows whose card name is already on the board').uncheck();
        await dialog.getByRole('button', {name: 'Import 3 cards'}).click();
        await expect(dialog.getByRole('status')).toContainText('Added 3 cards');
        const all = await cardsOf(admin.page, board.id);
        expect(all).toHaveLength(6);
        // Every copy has its values, however quickly the file was picked after opening the dialog.
        expect(all.filter((c) => c.title === 'Blog yazısı #1').map((c) => c.properties[status.id])).toEqual([optionId(status, 'Draft'), optionId(status, 'Draft')]);
        await admin.context.close();
    });

    test('from Channels: pick a board in the dialog', async ({browser}) => {
        const admin = await newSession(browser, 'admin');
        const team = await api(admin.page, 'GET', `/teams/name/${TEAM}`);
        const board = await contentCalendar(admin.page, team.id, unique('Picked from Channels'));

        await openChannel(admin.page, 'town-square');
        await admin.page.getByRole('button', {name: 'Import cards into a board'}).first().click();
        const dialog = admin.page.getByRole('dialog', {name: 'Import cards'});
        await dialog.getByLabel('Board').selectOption({label: `${board.icon ? board.icon + ' ' : ''}${board.title}`});
        await dialog.getByLabel('File').setInputFiles(CSV);
        await expect(dialog.getByText(/^3 cards to add/)).toBeVisible();
        await dialog.getByRole('button', {name: 'Import 3 cards'}).click();
        await expect(dialog.getByRole('status')).toContainText(`Added 3 cards to ${board.title}.`);

        const cards = await cardsOf(admin.page, board.id);
        const saved = await boards(admin.page, 'GET', `/boards/${board.id}`);
        const due = prop(saved, 'Due Date').id;
        const blog = cards.find((c) => c.title === 'Blog yazısı #1');
        expect(JSON.parse(blog.properties[due])).toEqual({from: Date.UTC(2026, 10, 20, 12)}); // "20.11.2026" in the CSV
        await admin.context.close();
    });

    test('someone who can only view a board gets no Import button', async ({browser}) => {
        const admin = await newSession(browser, 'admin');
        const member = await newSession(browser, 'member');
        const team = await api(admin.page, 'GET', `/teams/name/${TEAM}`);
        const board = await contentCalendar(admin.page, team.id, unique('View only'));
        await boards(admin.page, 'POST', `/boards/${board.id}/members`, {
            boardId: board.id, userId: member.me.id, roles: 'viewer', schemeAdmin: false, schemeEditor: false, schemeCommenter: false, schemeViewer: true,
        });

        await openBoard(member.page, team.id, board.id);
        await member.page.waitForTimeout(2000);
        await expect(member.page.locator('.ViewHeader').getByRole('button', {name: 'Import'})).toHaveCount(0);
        await admin.context.close();
        await member.context.close();
    });
});
