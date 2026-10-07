// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React from 'react';

export function ClockIcon({size = 18}: {size?: number}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
        >
            <circle
                cx='12'
                cy='12'
                r='9'
            />
            <path d='M12 7v5l3 2'/>
        </svg>
    );
}
