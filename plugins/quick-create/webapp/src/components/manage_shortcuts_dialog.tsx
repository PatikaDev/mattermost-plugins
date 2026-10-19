// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useRef, useState} from 'react';

import Dialog from './dialog';

import {saveShortcuts, type Shortcut} from '../api';
import {channelLabel} from '../mattermost_state';
import {isSafeLink, shortcutStore} from '../shortcuts';
import {store} from '../store';

const MAX = 10;

type Row = Shortcut & {key: number};

type Props = {channelId: string; initial: Shortcut[]; onClose: () => void};

// Add, edit, reorder or remove a channel's shortcut buttons.
export default function ManageShortcutsDialog({channelId, initial, onClose}: Props) {
    const nextKey = useRef(initial.length + 1);
    const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial : [{label: '', url: '', emoji: ''}]).map((s, i) => ({...s, key: i})));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const update = (key: number, patch: Partial<Shortcut>) => setRows(rows.map((r) => (r.key === key ? {...r, ...patch} : r)));
    const move = (i: number, by: number) => {
        const copy = rows.slice();
        const [row] = copy.splice(i, 1);
        copy.splice(i + by, 0, row);
        setRows(copy);
    };

    const filled = rows.filter((r) => r.label.trim() || r.url.trim());
    const invalid = filled.find((r) => !r.label.trim() || !isSafeLink(r.url));

    const confirm = async () => {
        setBusy(true);
        setError('');
        try {
            const saved = await saveShortcuts(channelId, filled.map(({key, ...s}) => s)); // eslint-disable-line @typescript-eslint/no-unused-vars
            shortcutStore.set(channelId, saved);
            store.showToast({text: saved.shortcuts.length ? `Shortcuts saved for ${channelLabel(channelId)}` : `Shortcuts removed from ${channelLabel(channelId)}`});
            onClose();
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    return (
        <Dialog
            title={`Shortcuts for ${channelLabel(channelId)}`}
            confirmLabel='Save'
            busy={busy}
            canConfirm={!invalid}
            error={error || (invalid ? 'Each shortcut needs a label and a full link starting with https://' : '')}
            onConfirm={confirm}
            onClose={onClose}
        >
            <p className='qc-muted'>
                {'Buttons shown to everyone in this channel, above the message box and in the ⊕ menu — for example a request form.'}
            </p>
            {rows.map((row, i) => (
                <div
                    key={row.key}
                    className='qc-shortcut-row'
                >
                    <input
                        className='qc-shortcut-row__emoji'
                        type='text'
                        aria-label={`Shortcut ${i + 1} emoji`}
                        placeholder='📋'
                        maxLength={8}
                        value={row.emoji || ''}
                        onChange={(e) => update(row.key, {emoji: e.target.value})}
                    />
                    <div className='qc-shortcut-row__fields'>
                        <input
                            type='text'
                            aria-label={`Shortcut ${i + 1} label`}
                            placeholder='Label, e.g. New design request'
                            maxLength={40}
                            value={row.label}
                            onChange={(e) => update(row.key, {label: e.target.value})}
                        />
                        <input
                            type='url'
                            aria-label={`Shortcut ${i + 1} link`}
                            placeholder='https://…'
                            value={row.url}
                            onChange={(e) => update(row.key, {url: e.target.value})}
                        />
                    </div>
                    <div className='qc-shortcut-row__actions'>
                        <button
                            type='button'
                            aria-label={`Move shortcut ${i + 1} up`}
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                        >{'↑'}</button>
                        <button
                            type='button'
                            aria-label={`Move shortcut ${i + 1} down`}
                            disabled={i === rows.length - 1}
                            onClick={() => move(i, 1)}
                        >{'↓'}</button>
                        <button
                            type='button'
                            aria-label={`Remove shortcut ${i + 1}`}
                            onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                        >{'×'}</button>
                    </div>
                </div>
            ))}
            {rows.length < MAX && (
                <button
                    type='button'
                    className='qc-add-option'
                    onClick={() => setRows([...rows, {key: nextKey.current++, label: '', url: '', emoji: ''}])}
                >
                    {'+ Add shortcut'}
                </button>
            )}
        </Dialog>
    );
}
