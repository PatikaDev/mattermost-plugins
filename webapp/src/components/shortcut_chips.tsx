// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useRef} from 'react';
import ReactDOM from 'react-dom';

import {useComposerRowHost} from '../composer_row';
import {openShortcut, useShortcuts} from '../shortcuts';

type Props = {
    draft: {channelId: string; rootId?: string};
};

// The channel's shortcut buttons above the text of its message box (not in thread replies).
export default function ShortcutChips({draft}: Props) {
    const channelId = draft?.channelId || '';
    const inChannelBox = Boolean(channelId) && !draft?.rootId;
    const anchor = useRef<HTMLSpanElement>(null);
    const {shortcuts} = useShortcuts(inChannelBox ? channelId : '');
    const host = useComposerRowHost(anchor, inChannelBox && shortcuts.length > 0, 'above', 'qc-shortcuts-host');

    if (!inChannelBox) {
        return null;
    }
    return (
        <>
            <span
                ref={anchor}
                className='qc-also-send-anchor'
                aria-hidden='true'
            />
            {host && ReactDOM.createPortal((
                <div
                    className='qc-shortcuts'
                    role='group'
                    aria-label='Channel shortcuts'
                >
                    {shortcuts.map((s) => (
                        <button
                            key={s.id || s.url}
                            type='button'
                            className='qc-shortcut'
                            title={s.url}
                            onClick={() => openShortcut(s.url)}
                        >
                            {s.emoji && <span aria-hidden='true'>{s.emoji}</span>}
                            <span>{s.label}</span>
                            <span
                                className='qc-shortcut__ext'
                                aria-hidden='true'
                            >{'↗'}</span>
                        </button>
                    ))}
                </div>
            ), host)}
        </>
    );
}
