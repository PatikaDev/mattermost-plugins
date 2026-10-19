// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useState} from 'react';
import ReactDOM from 'react-dom';

import {formatSendAt, fromInputs, toInputs} from '../time';

type Props = {
    title: string;
    confirmLabel: string;
    initialSendAt: number;
    timeZone: string;
    use24h: boolean;
    onConfirm: (sendAt: number) => Promise<void>;
    onClose: () => void;
};

export default function TimePickerDialog({title, confirmLabel, initialSendAt, timeZone, use24h, onConfirm, onClose}: Props) {
    const initial = toInputs(initialSendAt, timeZone);
    const [date, setDate] = useState(initial.date);
    const [time, setTime] = useState(initial.time);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const sendAt = fromInputs(date, time, timeZone);
    const inFuture = sendAt !== null && sendAt > Date.now() + 30000;

    const confirm = async () => {
        if (sendAt === null || !inFuture) {
            setError('Pick a time in the future.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await onConfirm(sendAt);
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    return ReactDOM.createPortal((
        <div
            className='sm-overlay'
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className='sm-dialog'
                role='dialog'
                aria-modal='true'
                aria-labelledby='sm-dialog-title'
            >
                <h2 id='sm-dialog-title'>{title}</h2>
                <div className='sm-dialog__fields'>
                    <label>
                        <span>{'Date'}</span>
                        <input
                            type='date'
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </label>
                    <label>
                        <span>{'Time'}</span>
                        <input
                            type='time'
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                        />
                    </label>
                </div>
                <p className='sm-muted'>
                    {sendAt !== null && inFuture ? `Sends ${formatSendAt(sendAt, timeZone, use24h)} · ` : ''}
                    {`Time zone: ${timeZone}`}
                </p>
                {error && <p className='sm-error'>{error}</p>}
                <div className='sm-dialog__actions'>
                    <button
                        type='button'
                        className='btn btn-tertiary'
                        onClick={onClose}
                    >
                        {'Cancel'}
                    </button>
                    <button
                        type='button'
                        className='btn btn-primary'
                        disabled={busy || !inFuture}
                        onClick={confirm}
                    >
                        {busy ? 'Saving…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    ), document.body);
}
