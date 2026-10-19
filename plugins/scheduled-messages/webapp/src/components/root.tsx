// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect} from 'react';

import {useQueue} from './panel';

import {queue} from '../queue';

// The "Scheduled for …" confirmation, shown after scheduling from the message box.
export default function Root({onView}: {onView: () => void}) {
    const {toast} = useQueue();

    useEffect(() => {
        if (!toast) {
            return undefined;
        }
        const timer = window.setTimeout(queue.dismissToast, 6000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    if (!toast) {
        return null;
    }
    return (
        <div
            className='sm-toast'
            role='status'
        >
            <span>{toast.text}</span>
            <button
                type='button'
                className='sm-toast__link'
                onClick={() => {
                    queue.dismissToast();
                    onView();
                }}
            >
                {'View'}
            </button>
            <button
                type='button'
                className='sm-toast__close'
                aria-label='Dismiss'
                onClick={queue.dismissToast}
            >
                {'×'}
            </button>
        </div>
    );
}
