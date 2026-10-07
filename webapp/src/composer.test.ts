/**
 * @jest-environment jsdom
 */
// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {clearComposer, composerRoot, removeAttachments} from './composer';

// A message box the way Mattermost renders it: textarea, file previews with their own
// remove buttons, and the toolbar where our clock button lives.
function buildComposer(files: number, events: string[]) {
    document.body.innerHTML = `
        <div class="post-create">
            <div class="cell"><textarea id="post_textbox"></textarea></div>
            <div class="previews"></div>
            <div class="toolbar"><button id="clock"></button></div>
        </div>
        <div class="post-create other">
            <textarea id="reply_textbox"></textarea>
            <div class="file-preview"><a class="file-preview__remove" id="other-remove"></a></div>
        </div>`;
    const previews = document.querySelector('.previews')!;
    for (let i = 0; i < files; i++) {
        const preview = document.createElement('div');
        preview.className = 'file-preview';
        const remove = document.createElement('a');
        remove.className = 'file-preview__remove';
        remove.addEventListener('click', () => {
            events.push(`remove ${i}`);
            preview.remove();
        });
        preview.appendChild(remove);
        previews.appendChild(preview);
    }
    return document.getElementById('clock')!;
}

describe('composer', () => {
    it('finds the message box the button belongs to, not another one', () => {
        const clock = buildComposer(0, []);
        expect(composerRoot(clock)?.querySelector('#post_textbox')).not.toBeNull();
        expect(composerRoot(clock)?.querySelector('#reply_textbox')).toBeNull();
    });

    it('removes every attachment in that box and leaves other boxes alone', async () => {
        const events: string[] = [];
        const clock = buildComposer(3, events);
        expect(await removeAttachments(composerRoot(clock))).toBe(3);
        expect(events).toEqual(['remove 0', 'remove 1', 'remove 2']);
        expect(document.getElementById('other-remove')).not.toBeNull();
    });

    it('clears the text last, with the newest updateText', async () => {
        const events: string[] = [];
        const clock = buildComposer(2, events);
        let current = (msg: string) => events.push(`stale updateText(${msg})`);
        setTimeout(() => {
            current = (msg: string) => events.push(`updateText(${JSON.stringify(msg)})`);
        }, 10);

        await clearComposer(clock, () => current);
        expect(events).toEqual(['remove 0', 'remove 1', 'updateText("")']);
    });

    it('does nothing harmful outside a message box', async () => {
        document.body.innerHTML = '<button id="lonely"></button>';
        expect(await removeAttachments(composerRoot(document.getElementById('lonely')))).toBe(0);
    });
});
