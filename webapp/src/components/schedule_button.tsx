// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom';

import {ClockIcon} from './icons';
import TimePickerDialog from './time_picker_dialog';

import {createScheduled} from '../api';
import {clearComposer} from '../composer';
import {userTimeZone, uses24h} from '../mattermost_state';
import {queue} from '../queue';
import {formatSendAt, quickOptions} from '../time';

// What Mattermost passes to toolbar plugins (the same on 10.11, 11.x and 12.x).
type Draft = {
    message: string;
    fileInfos?: Array<{id: string}>;
    uploadsInProgress?: string[];
    channelId: string;
    rootId?: string;
};

type Props = {
    draft: Draft;
    updateText: (message: string) => void;
};

export default function ScheduleButton(props: Props) {
    const {draft} = props;
    const buttonRef = useRef<HTMLButtonElement>(null);
    const latest = useRef(props);
    latest.current = props;

    const [menuOpen, setMenuOpen] = useState(false);
    const [customOpen, setCustomOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const hasContent = Boolean(draft?.message?.trim()) || Boolean(draft?.fileInfos?.length);
    const uploading = Boolean(draft?.uploadsInProgress?.length);
    const disabled = !draft?.channelId || !hasContent || uploading || busy;

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!buttonRef.current?.contains(target) && !(target as Element).closest?.('.sm-menu')) {
                setMenuOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const timeZone = userTimeZone();
    const use24h = uses24h();

    const schedule = async (sendAt: number) => {
        const d = latest.current.draft;
        setBusy(true);
        setError('');
        try {
            await createScheduled({
                channel_id: d.channelId,
                root_id: d.rootId || '',
                message: d.message || '',
                file_ids: (d.fileInfos || []).map((f) => f.id),
                send_at: sendAt,
            });
            setMenuOpen(false);
            setCustomOpen(false);
            await clearComposer(buttonRef.current, () => latest.current.updateText);
            queue.showToast(`Scheduled for ${formatSendAt(sendAt, timeZone, use24h)}`);
            queue.refresh();
        } finally {
            setBusy(false);
        }
    };

    const pickQuick = async (sendAt: number) => {
        try {
            await schedule(sendAt);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    let tooltip = 'Schedule message';
    if (uploading) {
        tooltip = 'Wait for the upload to finish';
    } else if (!hasContent) {
        tooltip = 'Write a message to schedule it';
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    const menuStyle: React.CSSProperties = rect ? {
        bottom: (window.innerHeight - rect.top) + 8,
        left: Math.max(8, Math.min(rect.left - 120, window.innerWidth - 300)),
    } : {};

    return (
        <>
            <button
                ref={buttonRef}
                type='button'
                className={`sm-toolbar-button${menuOpen ? ' sm-toolbar-button--active' : ''}`}
                aria-label='Schedule message'
                title={tooltip}
                disabled={disabled}
                onClick={() => {
                    setError('');
                    setMenuOpen(!menuOpen);
                }}
            >
                <ClockIcon/>
            </button>

            {menuOpen && ReactDOM.createPortal((
                <div
                    className='sm-menu'
                    role='menu'
                    style={menuStyle}
                >
                    <div className='sm-menu__title'>{'Schedule message'}</div>
                    {quickOptions(Date.now(), timeZone).map((option) => (
                        <button
                            key={option.key}
                            type='button'
                            role='menuitem'
                            className='sm-menu__item'
                            disabled={busy}
                            onClick={() => pickQuick(option.sendAt)}
                        >
                            <span>{option.label}</span>
                            <span className='sm-muted'>{formatSendAt(option.sendAt, timeZone, use24h)}</span>
                        </button>
                    ))}
                    <button
                        type='button'
                        role='menuitem'
                        className='sm-menu__item'
                        disabled={busy}
                        onClick={() => {
                            setMenuOpen(false);
                            setCustomOpen(true);
                        }}
                    >
                        <span>{'Custom time…'}</span>
                    </button>
                    {error && <div className='sm-error sm-menu__error'>{error}</div>}
                </div>
            ), document.body)}

            {customOpen && (
                <TimePickerDialog
                    title='Schedule message'
                    confirmLabel='Schedule'
                    initialSendAt={quickOptions(Date.now(), timeZone)[1].sendAt}
                    timeZone={timeZone}
                    use24h={use24h}
                    onConfirm={schedule}
                    onClose={() => setCustomOpen(false)}
                />
            )}
        </>
    );
}
