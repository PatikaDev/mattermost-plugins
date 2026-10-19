// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useState} from 'react';

import TimePickerDialog from './time_picker_dialog';

import {deleteScheduled, rescheduleScheduled, sendScheduledNow, type ScheduledPost} from '../api';
import {channelLabel, userTimeZone, uses24h} from '../mattermost_state';
import {queue, type QueueState} from '../queue';
import {formatSendAt, quickOptions} from '../time';

// Only hooks available since React 16.8: the host webapp's React is used at runtime.
export function useQueue(): QueueState {
    const [state, setState] = useState(queue.getState());
    useEffect(() => queue.subscribe(() => setState(queue.getState())), []);
    return state;
}

const PREVIEW_CHARS = 280;

function Item({post, timeZone, use24h}: {post: ScheduledPost; timeZone: string; use24h: boolean}) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [rescheduling, setRescheduling] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        setError('');
        try {
            await action();
            await queue.refresh();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const files = post.file_ids?.length || 0;
    const sending = post.status === 'sending';
    const text = post.message.length > PREVIEW_CHARS ? `${post.message.slice(0, PREVIEW_CHARS)}…` : post.message;

    return (
        <li className={`sm-item${post.status === 'failed' ? ' sm-item--failed' : ''}`}>
            <div className='sm-item__meta'>
                <span className='sm-item__where'>
                    {channelLabel(post.channel_id)}
                    {post.root_id ? ' · in a thread' : ''}
                </span>
                <span className='sm-item__when'>{sending ? 'Sending…' : formatSendAt(post.send_at, timeZone, use24h)}</span>
            </div>
            {text && <div className='sm-item__text'>{text}</div>}
            {files > 0 && <div className='sm-muted'>{files === 1 ? '1 attachment' : `${files} attachments`}</div>}
            {post.status === 'failed' && <div className='sm-error'>{`Not sent: ${post.error || 'unknown error'}`}</div>}
            {error && <div className='sm-error'>{error}</div>}

            {confirmDelete ? (
                <div className='sm-item__actions'>
                    <span>{'Delete this message?'}</span>
                    <button
                        type='button'
                        className='btn btn-sm btn-danger'
                        disabled={busy}
                        onClick={() => run(() => deleteScheduled(post.id))}
                    >
                        {'Delete'}
                    </button>
                    <button
                        type='button'
                        className='btn btn-sm btn-tertiary'
                        onClick={() => setConfirmDelete(false)}
                    >
                        {'Keep'}
                    </button>
                </div>
            ) : (
                <div className='sm-item__actions'>
                    <button
                        type='button'
                        className='btn btn-sm btn-primary'
                        disabled={busy || sending}
                        onClick={() => run(() => sendScheduledNow(post.id))}
                    >
                        {'Send now'}
                    </button>
                    <button
                        type='button'
                        className='btn btn-sm btn-tertiary'
                        disabled={busy || sending}
                        onClick={() => setRescheduling(true)}
                    >
                        {'Change time'}
                    </button>
                    <button
                        type='button'
                        className='btn btn-sm btn-tertiary'
                        disabled={busy || sending}
                        onClick={() => setConfirmDelete(true)}
                    >
                        {'Delete'}
                    </button>
                </div>
            )}

            {rescheduling && (
                <TimePickerDialog
                    title='Change time'
                    confirmLabel='Save'
                    initialSendAt={post.send_at > Date.now() ? post.send_at : quickOptions(Date.now(), timeZone)[1].sendAt}
                    timeZone={timeZone}
                    use24h={use24h}
                    onConfirm={async (sendAt) => {
                        await rescheduleScheduled(post.id, sendAt);
                        setRescheduling(false);
                        await queue.refresh();
                    }}
                    onClose={() => setRescheduling(false)}
                />
            )}
        </li>
    );
}

export default function Panel() {
    const {items, loaded, error} = useQueue();

    useEffect(() => {
        queue.refresh();
    }, []);

    const timeZone = userTimeZone();
    const use24h = uses24h();

    if (!loaded) {
        return <div className='sm-panel sm-muted'>{'Loading…'}</div>;
    }
    return (
        <div className='sm-panel'>
            {error && <p className='sm-error'>{error}</p>}
            {items.length === 0 ? (
                <div className='sm-empty'>
                    <p>{'No scheduled messages.'}</p>
                    <p className='sm-muted'>{'Write a message, then use the clock button in the message box to send it later.'}</p>
                </div>
            ) : (
                <ul className='sm-list'>
                    {items.map((post) => (
                        <Item
                            key={post.id}
                            post={post}
                            timeZone={timeZone}
                            use24h={use24h}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
