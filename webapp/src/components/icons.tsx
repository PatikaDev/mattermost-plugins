// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React from 'react';

// With a label, the icon names its button for screen readers: Mattermost renders app-bar
// items as an unlabeled role="button" around the plugin's icon.
export function ClockIcon({size = 18, label}: {size?: number; label?: string}) {
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
            {...(label ? {role: 'img', 'aria-label': label} : {'aria-hidden': 'true'})}
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
