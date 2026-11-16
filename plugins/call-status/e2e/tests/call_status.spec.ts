import {execFileSync} from 'node:child_process';

import {test, expect, type Page} from '@playwright/test';

import {api, newSession, openChannel, waitFor, TEAM} from './helpers';

// Runs SQL in the test server's database. Calls are faked by writing the rows the Calls plugin
// writes while someone is connected (a real WebRTC call doesn't run in CI); the tables use the
// Calls plugin's column names.
function sql(statement: string) {
    execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'mmuser', '-d', 'mattermost', '-v', 'ON_ERROR_STOP=1', '-c', statement], {stdio: 'pipe'});
}

function ensureCallTables() {
    sql(`CREATE TABLE IF NOT EXISTS calls (ID varchar(26) PRIMARY KEY, ChannelID varchar(26), StartAt bigint, EndAt bigint, CreateAt bigint,
        DeleteAt bigint, Title varchar(256), PostID varchar(26), ThreadID varchar(26), OwnerID varchar(26), Participants jsonb, Stats jsonb, Props jsonb)`);
    sql(`CREATE TABLE IF NOT EXISTS calls_sessions (ID varchar(26) PRIMARY KEY, CallID varchar(26), UserID varchar(26), JoinAt bigint,
        Unmuted boolean, RaisedHand bigint)`);
}

const newId = () => Array.from({length: 26}, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

function startCall(userId: string): string {
    const callId = newId();
    const now = Date.now();
    // Column lists, not VALUES order: older Calls versions have fewer columns (no "video").
    sql(`INSERT INTO calls (ID, ChannelID, StartAt, EndAt, CreateAt, DeleteAt, Title, PostID, ThreadID, OwnerID, Participants, Stats, Props)
        VALUES ('${callId}', '${newId()}', ${now}, 0, ${now}, 0, '', '', '', '${userId}', '[]', '{}', '{}')`);
    sql(`INSERT INTO calls_sessions (ID, CallID, UserID, JoinAt, Unmuted, RaisedHand) VALUES ('${newId()}', '${callId}', '${userId}', ${now}, false, 0)`);
    return callId;
}

const endCall = (callId: string) => sql(`UPDATE calls SET EndAt = ${Date.now()} WHERE ID = '${callId}'`);

// Ends every fake call, so a failed test can't leave someone "in a call" for the next one.
const endAllCalls = () => sql(`UPDATE calls SET EndAt = ${Date.now()} WHERE EndAt = 0`);

async function postAs(page: Page, message: string, extra: Record<string, unknown> = {}) {
    const team = await api(page, 'GET', `/teams/name/${TEAM}`);
    const channel = await api(page, 'GET', `/teams/${team.id}/channels/name/town-square`);
    const post = await api(page, 'POST', '/posts', {channel_id: channel.id, message, ...extra});
    expect(post.id).toBeTruthy();
    return post as {id: string};
}

type CustomStatus = {emoji?: string; text?: string};

async function customStatus(page: Page, userId: string): Promise<CustomStatus | null> {
    const user = await api(page, 'GET', `/users/${userId}`);
    const raw = user?.props?.customStatus;
    if (!raw) {
        return null;
    }
    const cs = JSON.parse(raw) as CustomStatus;
    return cs.emoji || cs.text ? cs : null;
}

const waitForStatus = (page: Page, userId: string, text: string | null) => waitFor(async () => {
    const cs = await customStatus(page, userId);
    return text === null ? cs === null : cs?.text === text;
}, 45_000);

const setOwnStatus = (page: Page, cs: CustomStatus | null) => (cs ? api(page, 'PUT', '/users/me/status/custom', cs) : api(page, 'DELETE', '/users/me/status/custom'));

async function clickAndCloseTab(page: Page, link: ReturnType<Page['locator']>) {
    const popup = page.context().waitForEvent('page', {timeout: 5000}).catch(() => null);
    await link.click();
    (await popup)?.close().catch(() => undefined);
}

test.describe('Call status', () => {
    test.beforeAll(() => ensureCallTables());
    test.afterEach(() => endAllCalls());

    test('in a call shows 🎧 next to the name for others, and goes away after', async ({browser}) => {
        const admin = await newSession(browser, 'admin');
        const member = await newSession(browser, 'member');
        await setOwnStatus(member.page, null);

        // Someone else posts first: Mattermost hides the name (and its status emoji) on
        // back-to-back posts by the same person.
        await postAs(admin.page, 'Hi from the admin');
        const memberPost = await postAs(member.page, 'Hi from the member');

        const callId = startCall(member.me.id);
        await waitForStatus(admin.page, member.me.id, 'In a call');
        expect((await customStatus(admin.page, member.me.id))?.emoji).toBe('headphones');

        // What others see: the emoji next to the member's name on their post.
        await openChannel(admin.page, 'town-square');
        const post = admin.page.locator(`#post_${memberPost.id}`);
        await expect(post).toBeVisible();
        const emoji = post.locator('[data-emoticon="headphones"]').first();
        await expect(emoji, `status emoji next to the name; post HTML: ${(await post.innerHTML()).slice(0, 1500)}`).toBeVisible({timeout: 20_000});

        endCall(callId);
        await waitForStatus(admin.page, member.me.id, null);
        await admin.context.close();
        await member.context.close();
    });

    test('someone with their own status keeps it during a call', async ({browser}) => {
        const member = await newSession(browser, 'member');
        await setOwnStatus(member.page, {emoji: 'palm_tree', text: 'On vacation'});

        const callId = startCall(member.me.id);
        await member.page.waitForTimeout(15_000); // more than one check
        expect((await customStatus(member.page, member.me.id))?.text).toBe('On vacation');

        endCall(callId);
        await member.page.waitForTimeout(12_000);
        expect((await customStatus(member.page, member.me.id))?.text).toBe('On vacation');
        await setOwnStatus(member.page, null);
        await member.context.close();
    });

    test('clearing the status during a call keeps it cleared', async ({browser}) => {
        const member = await newSession(browser, 'member');
        await setOwnStatus(member.page, null);

        const callId = startCall(member.me.id);
        await waitForStatus(member.page, member.me.id, 'In a call');
        await setOwnStatus(member.page, null);
        await member.page.waitForTimeout(15_000);
        expect(await customStatus(member.page, member.me.id)).toBeNull();

        endCall(callId);
        await member.context.close();
    });

    test('starting or joining a Google Meet shows 📹 until the meeting ends', async ({browser}) => {
        const admin = await newSession(browser, 'admin');
        const member = await newSession(browser, 'member');
        await setOwnStatus(admin.page, null);
        await setOwnStatus(member.page, null);

        // A meeting message as the Google Meet plugin posts it, by whoever started the meeting.
        const meet = await postAs(admin.page, 'I have started a meeting: https://meet.google.com/abc-defg-hij', {
            type: 'custom_google_meet',
            props: {meeting_link: 'https://meet.google.com/abc-defg-hij', meeting_topic: ''},
        });
        await waitForStatus(admin.page, admin.me.id, 'In a Google Meet');

        // The member clicks the meeting link in the message.
        await openChannel(member.page, 'town-square');
        const link = member.page.locator(`#post_${meet.id} a[href^="https://meet.google.com/"]`).first();
        await expect(link).toBeVisible();
        await clickAndCloseTab(member.page, link);
        await waitForStatus(admin.page, member.me.id, 'In a Google Meet');
        expect((await customStatus(admin.page, member.me.id))?.emoji).toBe('video_camera');

        // The Google Meet plugin marks the message when the meeting ends.
        await api(admin.page, 'PUT', `/posts/${meet.id}/patch`, {props: {meeting_link: 'https://meet.google.com/abc-defg-hij', meeting_ended: true}});
        await waitForStatus(admin.page, member.me.id, null);
        await waitForStatus(admin.page, admin.me.id, null);
        await admin.context.close();
        await member.context.close();
    });

    test('a click on a Meet link in an ordinary message changes nothing', async ({browser}) => {
        const member = await newSession(browser, 'member');
        await setOwnStatus(member.page, null);
        const post = await postAs(member.page, 'Our meeting: https://meet.google.com/xyz-abcd-efg');
        await openChannel(member.page, 'town-square');

        const link = member.page.locator(`#post_${post.id} a[href*="meet.google.com/xyz-abcd-efg"]`).first();
        await expect(link).toBeVisible();
        await clickAndCloseTab(member.page, link);
        await member.page.waitForTimeout(12_000);
        expect(await customStatus(member.page, member.me.id)).toBeNull();
        await member.context.close();
    });
});
