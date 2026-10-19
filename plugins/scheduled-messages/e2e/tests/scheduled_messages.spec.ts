import {expect, test} from '@playwright/test';

import {api, composer, login, newSession, openChannel, pluginApi, scheduleFromBox, TEAM, waitFor} from './helpers';

// Moves a queued message to ~35 s from now so the minute job sends it during the test.
async function makeDueSoon(page: import('@playwright/test').Page, id: string) {
    await pluginApi(page, 'PATCH', `/scheduled/${id}`, {send_at: Date.now() + 35_000});
}

test.describe('Scheduled messages', () => {
    test.beforeEach(async ({page}) => {
        await login(page, 'admin');
        for (const item of await pluginApi<any[]>(page, 'GET', '/scheduled') || []) {
            await pluginApi(page, 'DELETE', `/scheduled/${item.id}`);
        }
    });

    test('schedules from the message box, clears it, and lists it in the panel', async ({page}) => {
        await openChannel(page, 'town-square');
        const text = `Weekly sync starts now ${Date.now()}`;
        await page.locator('#post_textbox').fill(text);
        await scheduleFromBox(page, 'post_textbox', 'Tomorrow at 9:00');

        await expect(page.locator('#post_textbox')).toHaveValue('');
        await expect(page.getByText(/^Scheduled for /)).toBeVisible();

        const [item] = await pluginApi<any[]>(page, 'GET', '/scheduled');
        expect(item).toMatchObject({message: text, status: 'pending'});
        expect(item.root_id ?? '').toBe('');
        const sendAt = new Date(item.send_at);
        expect(new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(sendAt)).toBe('09:00');

        await page.getByRole('button', {name: 'View', exact: true}).click();
        const row = page.locator('.sm-item').filter({hasText: text});
        await expect(row).toBeVisible();
        await expect(row).toContainText('~Town Square');
    });

    test('a thread reply with an attachment is posted at its time, as the user, in the thread, with the file', async ({page}) => {
        const me = await api(page, 'GET', '/users/me');
        const town = await api(page, 'GET', `/teams/name/${TEAM}/channels/name/town-square`);
        const root = await api(page, 'POST', '/posts', {channel_id: town.id, message: `release thread ${Date.now()}`});
        await openChannel(page, 'town-square');

        const rootEl = page.locator(`#post_${root.id}`);
        await rootEl.hover();
        await rootEl.locator('button[aria-label*="reply" i]').first().click();
        const reply = composer(page, 'reply_textbox');
        await expect(page.locator('#reply_textbox')).toBeVisible();

        await reply.locator('input[type=file]').first().setInputFiles({name: 'release-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('v1.0.1 notes')});
        await expect(reply.getByText('release-notes.txt')).toBeVisible({timeout: 20_000});
        const text = `Release goes out now ${Date.now()}`;
        await page.locator('#reply_textbox').fill(text);
        await scheduleFromBox(page, 'reply_textbox', 'In 1 hour');

        // The box is empty again — text and attachment.
        await expect(page.locator('#reply_textbox')).toHaveValue('');
        await expect(reply.getByText('release-notes.txt')).toHaveCount(0);

        const [item] = await pluginApi<any[]>(page, 'GET', '/scheduled');
        expect(item).toMatchObject({root_id: root.id, message: text});
        expect(item.file_ids).toHaveLength(1);

        await makeDueSoon(page, item.id);
        const sent = await waitFor(async () => {
            const thread = await api(page, 'GET', `/posts/${root.id}/thread`);
            return Object.values<any>(thread.posts).find((p) => p.message === text);
        });
        expect(sent).toMatchObject({user_id: me.id, root_id: root.id, channel_id: town.id});
        expect(sent.file_ids).toEqual(item.file_ids);
        expect(await pluginApi<any[]>(page, 'GET', '/scheduled')).toEqual([]);
    });

    test('send now and delete from the panel', async ({page}) => {
        const town = await api(page, 'GET', `/teams/name/${TEAM}/channels/name/town-square`);
        const nowText = `Send me now ${Date.now()}`;
        const delText = `Delete me ${Date.now()}`;
        for (const message of [nowText, delText]) {
            await pluginApi(page, 'POST', '/scheduled', {channel_id: town.id, root_id: '', message, file_ids: [], send_at: Date.now() + 3_600_000});
        }
        await openChannel(page, 'town-square');
        await page.getByRole('button', {name: 'Scheduled messages'}).first().click();

        const nowRow = page.locator('.sm-item').filter({hasText: nowText});
        await nowRow.getByRole('button', {name: 'Send now'}).click();
        await expect(nowRow).toHaveCount(0);
        await expect(page.locator('.post-message__text').filter({hasText: nowText}).first()).toBeVisible();

        const delRow = page.locator('.sm-item').filter({hasText: delText});
        await delRow.getByRole('button', {name: 'Delete'}).click();
        await delRow.getByRole('button', {name: 'Delete'}).click(); // confirm
        await expect(delRow).toHaveCount(0);
        expect(await pluginApi<any[]>(page, 'GET', '/scheduled')).toEqual([]);
    });

    test('if the user can no longer post there, it is marked failed and the bot DMs them the text', async ({page, browser}) => {
        const admin = await api(page, 'GET', '/users/me');
        const team = await api(page, 'GET', `/teams/name/${TEAM}`);
        const channel = await api(page, 'POST', '/channels', {team_id: team.id, name: `project-${Date.now()}`, display_name: 'Project', type: 'P'});
        const member = await api(page, 'GET', '/users/username/member');
        await api(page, 'POST', `/channels/${channel.id}/members`, {user_id: member.id});

        const {context, page: mPage} = await newSession(browser, 'member');
        for (const item of await pluginApi<any[]>(mPage, 'GET', '/scheduled') || []) {
            await pluginApi(mPage, 'DELETE', `/scheduled/${item.id}`);
        }
        const text = `project update\nline two ${Date.now()}`;
        const queued = await pluginApi(mPage, 'POST', '/scheduled', {channel_id: channel.id, root_id: '', message: text, file_ids: [], send_at: Date.now() + 3_600_000});
        await makeDueSoon(mPage, queued.id);

        // The admin removes the member before the message goes out.
        await api(page, 'DELETE', `/channels/${channel.id}/members/${member.id}`);

        const failed = await waitFor(async () => {
            const [item] = await pluginApi<any[]>(mPage, 'GET', '/scheduled');
            return item?.status === 'failed' ? item : null;
        });
        expect(failed.error).toMatch(/can't post|no longer exists/);

        const bot = await api(mPage, 'GET', '/users/username/scheduled-messages');
        const dm = await api(mPage, 'POST', '/channels/direct', [member.id, bot.id]);
        const posts = await api(mPage, 'GET', `/channels/${dm.id}/posts?per_page=5`);
        const note = Object.values<any>(posts.posts).find((p) => p.user_id === bot.id);
        expect(note?.message).toContain("couldn't be sent");
        expect(note?.message).toContain('> project update');

        const inChannel = await api(page, 'GET', `/channels/${channel.id}/posts?per_page=20`);
        expect(Object.values<any>(inChannel.posts).some((p) => p.message === text)).toBe(false);
        expect(admin.id).toBeTruthy();
        await context.close();
    });
});
