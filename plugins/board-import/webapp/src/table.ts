// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {readSheet} from 'read-excel-file/browser';

// A cell as read from the file: text from CSV; text, numbers, booleans or dates from Excel.
export type Cell = string | number | boolean | Date | null;

export type Table = {
    headers: string[];
    rows: Cell[][];
};

// Boards' own CSV export writes every "#" as this token (a Boards bug), so reading it back
// restores the "#".
const BOARDS_HASH_TOKEN = /___hash_sign___/g;

export async function readTable(file: File): Promise<Table> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx')) {
        return toTable(await readSheet(file) as Cell[][]);
    }
    if (name.endsWith('.xls')) {
        throw new Error('Old Excel files (.xls) can\'t be read. In Excel, choose File → Save As → Excel Workbook (.xlsx) or CSV.');
    }
    return toTable(parseCsv(decode(await file.arrayBuffer())));
}

// Excel on Turkish Windows saves CSV in Windows-1254, not UTF-8; try UTF-8 first.
export function decode(buffer: ArrayBuffer): string {
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(buffer);
    } catch {
        return new TextDecoder('windows-1254').decode(buffer);
    }
}

// parseCsv reads RFC 4180 CSV. The separator is whichever of , ; or tab appears most on the
// first line outside quotes (Excel uses ";" in locales with a decimal comma, like Turkish).
export function parseCsv(text: string): string[][] {
    const src = text.replace(/^\uFEFF/, '');
    const sep = detectSeparator(src);
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (quoted) {
            if (c === '"' && src[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') {
                quoted = false;
            } else {
                field += c;
            }
        } else if (c === '"' && field === '') {
            quoted = true;
        } else if (c === sep) {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && src[i + 1] === '\n') {
                i++;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += c;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

function detectSeparator(text: string): string {
    const counts: Record<string, number> = {',': 0, ';': 0, '\t': 0};
    let quoted = false;
    for (const c of text) {
        if (c === '"') {
            quoted = !quoted;
        } else if (!quoted && (c === '\n' || c === '\r')) {
            break;
        } else if (!quoted && c in counts) {
            counts[c]++;
        }
    }
    const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return n > 0 ? best : ',';
}

// toTable takes the first non-empty row as headers and drops fully empty rows.
export function toTable(raw: Cell[][]): Table {
    const clean = (c: Cell): Cell => (typeof c === 'string' ? c.replace(BOARDS_HASH_TOKEN, '#').trim() : c);
    const isEmpty = (r: Cell[]) => r.every((c) => c === null || c === '');
    const rows = raw.map((r) => r.map(clean)).filter((r) => !isEmpty(r));
    if (rows.length === 0) {
        return {headers: [], rows: []};
    }
    const headers = rows[0].map((c, i) => (c === null || c === '' ? `Column ${i + 1}` : String(c)));
    const body = rows.slice(1).map((r) => headers.map((_, i) => (i < r.length ? r[i] : null)));
    return {headers, rows: body};
}
