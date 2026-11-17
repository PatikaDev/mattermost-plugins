// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {Blob, File} from 'buffer';
import fs from 'fs';
import path from 'path';

import {readSheet} from 'read-excel-file/browser';

import {decode, parseCsv, toTable} from './table';
import type {Cell} from './table';

// read-excel-file's browser build checks for File/Blob, which Jest's node environment lacks.
Object.assign(globalThis, {Blob, File});

// The same files the end-to-end tests upload (see e2e/fixtures/make_fixtures.py).
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '../../e2e/fixtures', name));
const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

test('CSV: quotes, doubled quotes, newlines inside quotes, CRLF and a BOM', () => {
    expect(parseCsv('\uFEFFName,Note\r\n"a, b","say ""hi"""\r\n"two\nlines",x')).toEqual([
        ['Name', 'Note'],
        ['a, b', 'say "hi"'],
        ['two\nlines', 'x'],
    ]);
});

test('CSV: the separator is detected (Excel uses ";" in Turkish)', () => {
    expect(parseCsv('a;b;c\n1;2,5;3')).toEqual([['a', 'b', 'c'], ['1', '2,5', '3']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('only')).toEqual([['only']]);
});

test('CSV saved by Excel in Windows-1254 (Turkish) is read correctly', () => {
    const bytes = new Uint8Array([0x47, 0xf6, 0x72, 0x65, 0x76, 0x3b, 0xdd, 0xfe]); // "Görev;İş" in Windows-1254
    expect(decode(bytes.buffer)).toBe('Görev;İş');
    expect(decode(new TextEncoder().encode('Görev').buffer)).toBe('Görev');
});

test('headers come from the first row; empty rows and short rows are handled', () => {
    expect(toTable([['Name', ''], [null, null], ['a'], ['b', 'x ___hash_sign___2 ']])).toEqual({
        headers: ['Name', 'Column 2'],
        rows: [['a', null], ['b', 'x #2']],
    });
});

test('the semicolon CSV fixture', () => {
    const t = toTable(parseCsv(decode(toArrayBuffer(fixture('todos.csv')))));
    expect(t.headers[0]).toBe('Görev');
    expect(t.rows).toHaveLength(4);
    expect(t.rows[0].slice(0, 5)).toEqual(['Blog yazısı #1', 'Draft', 'Blog|LinkedIn', 'member', '20.11.2026']);
});

test('the Excel fixture: text, and date cells as dates', async () => {
    const t = toTable(await readSheet(toArrayBuffer(fixture('todos.xlsx'))) as Cell[][]);
    expect(t.headers).toEqual(['Görev', 'Status', 'Channel', 'Assignee', 'Due Date', 'Link', 'Açıklama', 'Ignored column']);
    expect(t.rows).toHaveLength(4);
    expect(t.rows[0][0]).toBe('Blog yazısı #1');
    expect(t.rows[0][4]).toBeInstanceOf(Date);
    expect((t.rows[0][4] as Date).toISOString().slice(0, 10)).toBe('2026-11-20');
});
