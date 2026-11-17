// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import type {Cell, Table} from './table';

// The parts of a Boards board this plugin reads (Boards REST API, /plugins/focalboard/api/v2).
export type PropertyOption = {id: string; value: string; color: string};
export type PropertyTemplate = {id: string; name: string; type: string; options: PropertyOption[]};
export type Board = {id: string; teamId: string; title: string; icon?: string; isTemplate?: boolean; cardProperties: PropertyTemplate[]};
export type User = {id: string; username: string; email?: string; first_name?: string; last_name?: string; nickname?: string};

// A column maps to the card name, to one of the board's properties (by id), or to nothing.
export const TITLE = '__title';
export const SKIP = '';
export type Mapping = string[];

// Properties Boards fills in by itself (or that hold files) can't be imported.
const READ_ONLY = new Set(['createdTime', 'createdBy', 'updatedTime', 'updatedBy', 'file', 'unknown']);
export const importable = (p: PropertyTemplate) => !READ_ONLY.has(p.type);

const TITLE_HEADERS = ['name', 'title', 'card', 'task', 'todo', 'to do', 'gorev', 'baslik', 'isim', 'ad', 'konu', 'is', 'card name', 'kart'];

// norm makes names comparable: case, Turkish dotless i, accents, emoji and punctuation ignored.
export function norm(s: string): string {
    return s.
        normalize('NFKD').
        replace(/[̀-ͯ]/g, '').
        toLowerCase().
        replace(/ı/g, 'i').
        replace(/[^\p{L}\p{N}]+/gu, ' ').
        trim();
}

// guessMapping matches each header to a property with the same name. The card name comes from a
// column called Name/Title/Görev/…, otherwise from the first column nothing else claimed.
export function guessMapping(headers: string[], props: PropertyTemplate[]): Mapping {
    const byName = new Map(props.filter(importable).map((p) => [norm(p.name), p.id]));
    const used = new Set<string>();
    const mapping = headers.map((h) => {
        const id = byName.get(norm(h));
        if (id && !used.has(id)) {
            used.add(id);
            return id;
        }
        return SKIP;
    });
    let title = headers.findIndex((h, i) => mapping[i] === SKIP && TITLE_HEADERS.includes(norm(h)));
    if (title < 0) {
        title = mapping.findIndex((m) => m === SKIP);
    }
    if (title >= 0) {
        mapping[title] = TITLE;
    }
    return mapping;
}

export type Warning = {row: number; column: string; value: string; message: string};
export type CardDraft = {row: number; title: string; properties: Record<string, string | string[]>};
export type Plan = {
    cards: CardDraft[];
    newOptions: Record<string, PropertyOption[]>; // property id → options to add to the board
    warnings: Warning[];
    withoutName: number[]; // file row numbers skipped because the name cell is empty
    existing: number[]; // file row numbers skipped because a card with that name exists
};

export type PlanOptions = {
    addMissingOptions: boolean;
    skipExisting: boolean;
    existingTitles: string[];
    newOptionId?: () => string;
};

const COLORS = ['propColorBlue', 'propColorGreen', 'propColorOrange', 'propColorPurple', 'propColorPink', 'propColorYellow', 'propColorRed', 'propColorBrown', 'propColorGray'];

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(13)), (b) => b.toString(16).padStart(2, '0')).join('');

export function buildPlan(table: Table, mapping: Mapping, board: Board, users: User[], options: PlanOptions): Plan {
    const props = new Map(board.cardProperties.map((p) => [p.id, p]));
    const people = peopleIndex(users);
    const existing = new Set(options.existingTitles.map(norm));
    const newOptionId = options.newOptionId || randomId;
    const plan: Plan = {cards: [], newOptions: {}, warnings: [], withoutName: [], existing: []};
    const titleCol = mapping.indexOf(TITLE);

    // Select options known so far, including ones this import adds.
    const optionsOf = new Map<string, PropertyOption[]>();
    const lookupOption = (p: PropertyTemplate, value: string, warn: (msg: string) => void): string | null => {
        if (!optionsOf.has(p.id)) {
            optionsOf.set(p.id, [...p.options]);
        }
        const list = optionsOf.get(p.id)!;
        const found = list.find((o) => o.value === value) || list.find((o) => norm(o.value) === norm(value));
        if (found) {
            return found.id;
        }
        if (!options.addMissingOptions) {
            warn(`"${value}" isn't an option of ${p.name}; left empty`);
            return null;
        }
        const option = {id: newOptionId(), value, color: COLORS[list.length % COLORS.length]};
        list.push(option);
        (plan.newOptions[p.id] ||= []).push(option);
        return option.id;
    };

    table.rows.forEach((cells, i) => {
        const row = i + 2; // as numbered in the spreadsheet: row 1 holds the headers
        const title = titleCol >= 0 ? text(cells[titleCol]) : '';
        if (!title) {
            plan.withoutName.push(row);
            return;
        }
        if (options.skipExisting && existing.has(norm(title))) {
            plan.existing.push(row);
            return;
        }
        const card: CardDraft = {row, title, properties: {}};
        mapping.forEach((target, col) => {
            const p = props.get(target);
            const cell = cells[col];
            if (!p || cell === null || cell === '') {
                return;
            }
            const warn = (message: string) => plan.warnings.push({row, column: table.headers[col], value: text(cell), message});
            const value = convert(p, cell, people, (v) => lookupOption(p, v, warn), warn);
            if (value !== null && value.length > 0) {
                card.properties[p.id] = value;
            }
        });
        plan.cards.push(card);
    });
    return plan;
}

function convert(
    p: PropertyTemplate,
    cell: Cell,
    people: Map<string, string>,
    option: (value: string) => string | null,
    warn: (message: string) => void,
): string | string[] | null {
    const raw = text(cell);
    switch (p.type) {
    case 'select':
        return option(raw);
    case 'multiSelect':
        return splitList(raw).map(option).filter((id): id is string => Boolean(id));
    case 'person': {
        const id = people.get(norm(raw.replace(/^@/, '')));
        if (!id) {
            warn(`no Mattermost user "${raw}"; left empty`);
        }
        return id || null;
    }
    case 'multiPerson':
        return splitList(raw).flatMap((name) => {
            const id = people.get(norm(name.replace(/^@/, '')));
            if (!id) {
                warn(`no Mattermost user "${name}"; skipped`);
            }
            return id ? [id] : [];
        });
    case 'date': {
        const range = parseDateRange(cell);
        if (!range) {
            warn(`"${raw}" isn't a date; left empty`);
            return null;
        }
        return JSON.stringify(range);
    }
    case 'checkbox':
        return isTrue(cell) ? 'true' : null;
    case 'number': {
        const n = typeof cell === 'number' ? cell : Number(raw.replace(/\s/g, '').replace(/^(-?\d+),(\d+)$/, '$1.$2'));
        if (Number.isNaN(n)) {
            warn(`"${raw}" isn't a number; left empty`);
            return null;
        }
        return String(n);
    }
    default: // text, url, email, phone
        return raw;
    }
}

// describe shows a converted value the way the card will show it (for the preview).
export function describe(p: PropertyTemplate, value: string | string[] | undefined, plan: Plan, users: User[]): string {
    if (value === undefined || value.length === 0) {
        return '';
    }
    const options = [...p.options, ...(plan.newOptions[p.id] || [])];
    const label = (id: string) => options.find((o) => o.id === id)?.value ?? id;
    const person = (id: string) => {
        const u = users.find((x) => x.id === id);
        return u ? `@${u.username}` : id;
    };
    const list = Array.isArray(value) ? value : [value];
    switch (p.type) {
    case 'select':
    case 'multiSelect':
        return list.map(label).join(', ');
    case 'person':
    case 'multiPerson':
        return list.map(person).join(', ');
    case 'date': {
        const range = JSON.parse(String(value)) as DateRange;
        const day = (t: number) => new Date(t).toISOString().slice(0, 10);
        return range.to ? `${day(range.from)} → ${day(range.to)}` : day(range.from);
    }
    case 'checkbox':
        return '✓';
    default:
        return list.join(', ');
    }
}

// text turns a cell into its text; dates become YYYY-MM-DD.
export function text(cell: Cell): string {
    if (cell === null) {
        return '';
    }
    if (cell instanceof Date) {
        return cell.toISOString().slice(0, 10);
    }
    return String(cell).trim();
}

// Boards' export joins multiple values with "|"; people often type commas or semicolons.
function splitList(s: string): string[] {
    const parts = s.includes('|') ? s.split('|') : s.split(/[,;]/);
    return parts.map((x) => x.trim()).filter(Boolean);
}

const TRUE_WORDS = new Set(['true', 'yes', 'evet', '1', 'x', 'done', 'tamam', 'var', 'on']);
function isTrue(cell: Cell): boolean {
    if (typeof cell === 'boolean') {
        return cell;
    }
    const t = text(cell);
    return (/^[✓✔☑]$/).test(t) || TRUE_WORDS.has(norm(t));
}

// peopleIndex finds a user by id, username, email, full name or nickname. A name shared by two
// users is left out so nobody is assigned by mistake.
function peopleIndex(users: User[]): Map<string, string> {
    const index = new Map<string, string>();
    const ambiguous = new Set<string>();
    const add = (key: string | undefined, id: string) => {
        const k = key ? norm(key) : '';
        if (!k || ambiguous.has(k)) {
            return;
        }
        if (index.has(k) && index.get(k) !== id) {
            index.delete(k);
            ambiguous.add(k);
            return;
        }
        index.set(k, id);
    };
    for (const u of users) {
        add(u.id, u.id);
        add(u.username, u.id);
        add(u.email, u.id);
        add(`${u.first_name || ''} ${u.last_name || ''}`, u.id);
        add(u.nickname, u.id);
    }
    return index;
}

// --- dates ---------------------------------------------------------------------------------

export type DateRange = {from: number; to?: number};

// Boards stores a date as noon UTC of the calendar day.
const noonUTC = (y: number, m: number, d: number) => Date.UTC(y, m, d, 12);

const MONTHS: Record<string, number> = {};
[
    ['january', 'jan', 'ocak', 'oca'], ['february', 'feb', 'subat', 'sub'], ['march', 'mar', 'mart'], ['april', 'apr', 'nisan', 'nis'],
    ['may', 'mayis'], ['june', 'jun', 'haziran', 'haz'], ['july', 'jul', 'temmuz', 'tem'], ['august', 'aug', 'agustos', 'agu'],
    ['september', 'sep', 'sept', 'eylul', 'eyl'], ['october', 'oct', 'ekim', 'eki'], ['november', 'nov', 'kasim', 'kas'], ['december', 'dec', 'aralik', 'ara'],
].forEach((names, month) => names.forEach((n) => {
    MONTHS[n] = month;
}));

// parseDateRange reads a date or a Boards range "A -> B" from an Excel date, an Excel serial
// number, ISO (2026-11-16), day-first numbers (16.11.2026, 16/11/2026) or month names in
// English or Turkish (November 16, 2026 / 16 Kasım 2026; the year may be missing, as in Boards'
// own export for the current year).
export function parseDateRange(cell: Cell, now = new Date()): DateRange | null {
    if (typeof cell === 'string' && cell.includes('->')) {
        const [a, b] = cell.split('->');
        const from = parseDate(a.trim(), now);
        const to = parseDate(b.trim(), now);
        return from === null ? null : {from, ...(to === null ? {} : {to})};
    }
    const from = parseDate(cell, now);
    return from === null ? null : {from};
}

function parseDate(cell: Cell, now: Date): number | null {
    if (cell instanceof Date) {
        return Number.isNaN(cell.getTime()) ? null : noonUTC(cell.getUTCFullYear(), cell.getUTCMonth(), cell.getUTCDate());
    }
    if (typeof cell === 'number') {
        if (cell < 20000 || cell > 80000) { // Excel serial days: 1954 … 2119
            return null;
        }
        const d = new Date(Math.round((cell - 25569) * 86400000));
        return noonUTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const s = text(cell);
    let m = (/^(\d{4})-(\d{1,2})-(\d{1,2})/).exec(s);
    if (m) {
        return valid(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    m = (/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/).exec(s);
    if (m) {
        let [day, month] = [Number(m[1]), Number(m[2])];
        if (month > 12 && day <= 12) { // month/day, as typed in the US
            [day, month] = [month, day];
        }
        const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        return valid(year, month - 1, day);
    }
    const words = norm(s).split(' ');
    const monthWord = words.find((w) => w in MONTHS);
    if (monthWord === undefined) {
        return null;
    }
    const numbers = words.filter((w) => (/^\d+$/).test(w)).map(Number);
    const day = numbers.find((n) => n >= 1 && n <= 31);
    const year = numbers.find((n) => n >= 1900) ?? now.getFullYear();
    return day === undefined ? null : valid(year, MONTHS[monthWord], day);
}

function valid(y: number, m: number, d: number): number | null {
    const t = noonUTC(y, m, d);
    const back = new Date(t);
    return back.getUTCMonth() === m && back.getUTCDate() === d ? t : null;
}
