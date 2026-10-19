// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {useEffect, useState} from 'react';

// Mattermost only gives plugins a slot in the formatting toolbar. To show a row inside the
// message box (above or below the text, like Slack), a toolbar component finds the box it lives
// in and adds an empty host element next to the text area's block; the row is then portalled
// into it. The host sits beside React's own nodes, so Mattermost keeps rendering around it.
export function useComposerRowHost(
    anchor: React.RefObject<HTMLElement>,
    active: boolean,
    position: 'above' | 'below',
    className: string,
): HTMLElement | null {
    const [host, setHost] = useState<HTMLElement | null>(null);
    useEffect(() => {
        const cell = active ? anchor.current?.closest('.AdvancedTextEditor__cell') : null;
        const textarea = cell?.querySelector('textarea');
        const textBlock = textarea && Array.from(cell!.children).find((child) => child.contains(textarea));
        if (!textBlock) {
            setHost(null);
            return undefined;
        }
        const el = document.createElement('div');
        el.className = className;
        if (position === 'above') {
            textBlock.before(el);
        } else {
            textBlock.after(el);
        }
        setHost(el);
        return () => {
            el.remove();
        };
    }, [anchor, active, position, className]);
    return host;
}
