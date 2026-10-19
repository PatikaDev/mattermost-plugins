import {expect, test, type Browser, type Page} from '@playwright/test';

import {api, login, newSession, openChannel, TEAM, waitFor} from './helpers';

// The member writes; the admin reads. Each test uses fresh channels so earlier runs don't leak.
async function setup(page: Page, browser: Browser, names: string[]) {
    const me = await login(page, 'admin');
    const team = await api(page, 'GET', `/teams/name/${TEAM}`);
    const member = await newSession(browser, 'member');
    const channels: Record<string, any> = {};
    for (const n of names) {
        const ch = await api(page, 'POST', '/channels', {team_id: team.id, name: `${n}-${Date.now()}`, display_name: `${n} ${Date.now() % 10000}`, type: 'O'});
        await api(member.page, 'POST', `/channels/${ch.id}/members`, {user_id: member.me.id});
        channels[n] = ch;
    }
    await openChannel(page, 'town-square');
    return {me, member, channels};
}

const post = (page: Page, channelId: string, message: string) => api(page, 'POST', '/posts', {channel_id: channelId, message});

async function openPanel(page: Page) {
    await page.getByRole('button', {name: /All unreads/}).first().click();
    const panel = page.locator('.au-panel');
    await expect(panel).toBeVisible();
    return panel;
}

test.describe('All unreads', () => {
    test('lists unread messages grouped by channel, with mentions first', async ({page, browser}) => {
        const {member, channels} = await setup(page, browser, ['launch', 'random']);
        await post(member.page, channels.random.id, 'Lunch at 12:30?');
        await post(member.page, channels.launch.id, 'Release notes are ready');
        await post(member.page, channels.launch.id, '@admin can you approve the copy?');
        await member.context.close();

        await page.reload();
        await expect(page.locator('#post_textbox')).toBeVisible();
        const panel = await openPanel(page);

        const launch = panel.getByRole('region', {name: `~${channels.launch.display_name}`});
        const random = panel.getByRole('region', {name: `~${channels.random.display_name}`});
        await expect(launch).toContainText('Release notes are ready');
        await expect(launch).toContainText('can you approve the copy?');
        await expect(launch.locator('.au-pill--mention')).toHaveText('@1');
        await expect(random).toContainText('Lunch at 12:30?');

        // The channel with a mention comes first.
        const titles = await panel.locator('.au-group__title').allTextContents();
        expect(titles.indexOf(`~${channels.launch.display_name}`)).toBeLessThan(titles.indexOf(`~${channels.random.display_name}`));
        await expect(panel.locator('.au-summary')).toContainText(/unread messages? in \d+ channels?/);
    });

    test('mark one channel read, then mark all as read', async ({page, browser}) => {
        const {member, channels} = await setup(page, browser, ['alpha', 'beta']);
        await post(member.page, channels.alpha.id, 'alpha news');
        await post(member.page, channels.beta.id, 'beta news');
        await member.context.close();
        await page.reload();
        await expect(page.locator('#post_textbox')).toBeVisible();
        const panel = await openPanel(page);

        const alpha = panel.getByRole('region', {name: `~${channels.alpha.display_name}`});
        await alpha.getByRole('button', {name: 'Mark as read'}).click();
        await expect(alpha).toHaveCount(0);
        await waitFor(async () => {
            const m = await api(page, 'GET', `/channels/${channels.alpha.id}/members/me`);
            const c = await api(page, 'GET', `/channels/${channels.alpha.id}`);
            return m.msg_count >= c.total_msg_count;
        }, 20_000);

        await panel.getByRole('button', {name: 'Mark all as read'}).click();
        await panel.getByRole('alertdialog').getByRole('button', {name: 'Mark as read'}).click();
        await expect(panel.getByRole('region', {name: `~${channels.beta.display_name}`})).toHaveCount(0);
        await expect(panel).toContainText(/caught up|No unread channels/);
    });

    test('a new message shows up while the panel is open, and Open jumps to it', async ({page, browser}) => {
        const {member, channels} = await setup(page, browser, ['live']);
        const panel = await openPanel(page);

        const text = `Fresh update ${Date.now()}`;
        await post(member.page, channels.live.id, text);
        await member.context.close();

        const group = panel.getByRole('region', {name: `~${channels.live.display_name}`});
        await expect(group).toContainText(text, {timeout: 20_000});

        await group.getByRole('button', {name: 'Open'}).click();
        await expect(page.locator('.post-message__text').filter({hasText: text}).first()).toBeVisible();
        await expect(page).toHaveURL(new RegExp(channels.live.name));
        await expect(group).toHaveCount(0, {timeout: 20_000}); // reading the channel clears it
    });
});
