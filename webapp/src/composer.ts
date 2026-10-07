// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Clearing the message box after a draft is scheduled.
//
// Mattermost gives toolbar plugins `updateText`, which only changes the text — the
// attachments stay in the box. Removing them through Mattermost's own remove buttons
// (`.file-preview__remove`, same on 10.11, 11.x and 12.x) only takes them off the draft;
// the uploaded files stay on the server for the scheduled post. The text is cleared
// last, because each removal re-saves the draft from a snapshot that still has it.

const nextFrame = () => new Promise<void>((resolve) => {
    setTimeout(resolve, 30);
});

// The message box that contains `el` (the channel box or a thread reply box).
export function composerRoot(el: Element | null): Element | null {
    let node = el?.parentElement || null;
    while (node) {
        if (node.querySelector('textarea#post_textbox, textarea#reply_textbox, textarea[id$="_textbox"]')) {
            return node;
        }
        node = node.parentElement;
    }
    return null;
}

export async function removeAttachments(root: Element | null): Promise<number> {
    if (!root) {
        return 0;
    }
    let removed = 0;
    for (let i = 0; i < 50; i++) {
        const button = root.querySelector<HTMLElement>('.file-preview__remove');
        if (!button) {
            break;
        }
        button.click();
        removed++;

        // Sequential on purpose: let Mattermost re-render before removing the next one.
        // eslint-disable-next-line no-await-in-loop
        await nextFrame();
    }
    return removed;
}

export async function clearComposer(button: Element | null, getUpdateText: () => (message: string) => void): Promise<void> {
    await removeAttachments(composerRoot(button));
    await nextFrame();
    getUpdateText()('');
}
