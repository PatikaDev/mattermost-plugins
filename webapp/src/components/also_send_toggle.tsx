// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useRef} from 'react';
import ReactDOM from 'react-dom';

import {alsoSend, useAlsoSend} from '../broadcast';
import {useComposerRowHost} from '../composer_row';
import {channelLabel} from '../mattermost_state';

type Props = {
    draft: {channelId: string; rootId?: string};
};

// "Also send to ~channel" under the text of thread reply boxes.
export default function AlsoSendToggle({draft}: Props) {
    const rootId = draft?.rootId || '';
    const anchor = useRef<HTMLSpanElement>(null);
    const checked = useAlsoSend(rootId);
    const host = useComposerRowHost(anchor, Boolean(rootId), 'below', 'qc-also-send-host');

    if (!rootId) {
        return null;
    }
    const label = channelLabel(draft.channelId);
    return (
        <>
            <span
                ref={anchor}
                className='qc-also-send-anchor'
                aria-hidden='true'
            />
            {host && ReactDOM.createPortal((
                <label className='qc-also-send'>
                    <input
                        type='checkbox'
                        checked={checked}
                        onChange={() => alsoSend.toggle(rootId)}
                    />
                    <span>
                        {'Also send to '}
                        <strong>{label}</strong>
                    </span>
                </label>
            ), host)}
        </>
    );
}
