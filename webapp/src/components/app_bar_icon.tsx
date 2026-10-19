// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React from 'react';

import {useSnapshot} from '../state';

// The app bar icon, with the number of unread channels (mention colours when someone mentioned
// you, like the sidebar's badges).
// Mattermost styles every <span> inside an app-bar icon as a 24px white disc (for image icons)
// and clips the icon box to 24×24, so this uses a <div> and keeps the badge inside the box.
// The label names the button for screen readers: Mattermost renders app-bar items as an
// unlabeled role="button" around the plugin's icon.
export default function AppBarIcon() {
    const {unreads} = useSnapshot();
    const count = unreads.length;
    const mentioned = unreads.some((u) => u.mentions > 0);
    return (
        <div className='au-appbar'>
            <svg
                width={18}
                height={18}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                role='img'
                aria-label={count ? `All unreads, ${count} unread channels` : 'All unreads'}
            >
                <path d='M4 13h4l2 3h4l2-3h4'/>
                <path d='M5.5 5h13L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z'/>
            </svg>
            {count > 0 && (
                <b
                    className={`au-appbar__badge${mentioned ? ' au-appbar__badge--mention' : ''}`}
                    aria-hidden='true'
                >
                    {count > 99 ? '99+' : count}
                </b>
            )}
        </div>
    );
}
