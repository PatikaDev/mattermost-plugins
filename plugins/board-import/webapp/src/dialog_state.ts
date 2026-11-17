// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {useEffect, useState} from 'react';

// Which import dialog is open, shared by the buttons that open it and the root that draws it.
export type DialogTarget = {teamId: string; boardId?: string};

let current: DialogTarget | null = null;
const listeners = new Set<() => void>();

function set(next: DialogTarget | null) {
    current = next;
    listeners.forEach((l) => l());
}

export const openDialog = (target: DialogTarget) => set(target);
export const closeDialog = () => set(null);

export function useDialog(): DialogTarget | null {
    const [value, setValue] = useState(current);
    useEffect(() => {
        const update = () => setValue(current);
        listeners.add(update);
        return () => {
            listeners.delete(update);
        };
    }, []);
    return value;
}
