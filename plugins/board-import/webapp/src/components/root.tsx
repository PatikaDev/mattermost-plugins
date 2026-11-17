// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useState} from 'react';
import ReactDOM from 'react-dom';

import ImportDialog from './import_dialog';

import {closeDialog, openDialog, useDialog} from '../dialog_state';

// Boards board URLs: /boards/team/<team id>/<board id>[/<view id>[/<card id>]].
const BOARD_PATH = /\/boards\/team\/([a-z0-9]{26})\/(b[a-z0-9]{26})(?:\/|$)/;

export function boardFromPath(path: string): {teamId: string; boardId: string} | null {
    const m = BOARD_PATH.exec(path);
    return m ? {teamId: m[1], boardId: m[2]} : null;
}

// Root draws the Import button in a board's toolbar (the Boards view hides Mattermost's app
// bar) and the dialog itself.
export default function Root() {
    const dialog = useDialog();
    return (
        <>
            <BoardsToolbarButton/>
            {dialog && (
                <ImportDialog
                    teamId={dialog.teamId}
                    boardId={dialog.boardId}
                    onClose={closeDialog}
                />
            )}
        </>
    );
}

// The board's toolbar is drawn by the Boards plugin, so the button is placed into it: just
// before its "New" button, which Boards only shows to people who may add cards.
function BoardsToolbarButton() {
    const [spot, setSpot] = useState<{host: HTMLElement; teamId: string; boardId: string} | null>(null);

    useEffect(() => {
        const host = document.createElement('div');
        host.className = 'bi-toolbar-host';
        let frame = 0;
        const sync = () => {
            frame = 0;
            const board = boardFromPath(window.location.pathname);
            const header = document.querySelector('.ViewHeader');
            const newButton = header && Array.from(header.children).find((el) => el.classList.contains('ButtonWithMenu'));
            if (!board || !header || !newButton) {
                host.remove();
                setSpot(null);
                return;
            }
            if (host.nextElementSibling !== newButton) {
                header.insertBefore(host, newButton);
            }
            setSpot((s) => (s && s.boardId === board.boardId && s.teamId === board.teamId ? s : {host, ...board}));
        };
        const schedule = () => {
            if (!frame) {
                frame = window.requestAnimationFrame(sync);
            }
        };
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, {childList: true, subtree: true});
        sync();
        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(frame);
            host.remove();
        };
    }, []);

    if (!spot) {
        return null;
    }
    return ReactDOM.createPortal((
        <button
            type='button'
            className='bi-toolbar-button'
            title='Import cards from an Excel or CSV file'
            onClick={() => openDialog({teamId: spot.teamId, boardId: spot.boardId})}
        >
            <ImportIcon/>
            {'Import'}
        </button>
    ), spot.host);
}

// label names the icon when it stands alone (the app bar); next to text it's hidden.
export function ImportIcon({label}: {label?: string}) {
    return (
        <svg
            width={label ? 18 : 16}
            height={label ? 18 : 16}
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        >
            <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/>
            <polyline points='7 10 12 15 17 10'/>
            <line
                x1='12'
                y1='15'
                x2='12'
                y2='3'
            />
        </svg>
    );
}
