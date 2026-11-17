// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom';

import {addOptions, cardTitles, createCard, getBoard, listBoards, teamUsers} from '../api';
import {buildPlan, describe, guessMapping, importable, SKIP, TITLE} from '../convert';
import type {Board, Mapping, User} from '../convert';
import {readTable} from '../table';
import type {Table} from '../table';

type Props = {
    teamId: string;
    boardId?: string; // opened from a board's toolbar; otherwise the user picks one
    onClose: () => void;
};

type Result = {created: number; failed: Array<{row: number; error: string}>};

const PREVIEW_ROWS = 5;
const MAX_WARNINGS_SHOWN = 8;
const PARALLEL = 3;

export default function ImportDialog({teamId, boardId, onClose}: Props) {
    const [boards, setBoards] = useState<Board[] | null>(null);
    const [board, setBoard] = useState<Board | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [titles, setTitles] = useState<string[]>([]);
    const [table, setTable] = useState<Table | null>(null);
    const [fileName, setFileName] = useState('');
    const [mapping, setMapping] = useState<Mapping>([]);
    const [addMissingOptions, setAddMissingOptions] = useState(true);
    const [skipExisting, setSkipExisting] = useState(true);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<{done: number; total: number} | null>(null);
    const [result, setResult] = useState<Result | null>(null);
    const [error, setError] = useState('');
    const boardRequest = useRef(0);
    const [loadingBoard, setLoadingBoard] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !progress) {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, progress]);

    // The board (and everything needed to convert rows for it). Only the latest choice counts,
    // in case someone switches boards while one is still loading.
    const chooseBoard = async (id: string) => {
        const request = ++boardRequest.current;
        setError('');
        setBoard(null);
        setLoadingBoard(Boolean(id));
        if (!id) {
            return;
        }
        try {
            const b = await getBoard(id);
            const [t, u] = await Promise.all([cardTitles(id), teamUsers(b.teamId || teamId)]);
            if (request === boardRequest.current) {
                setTitles(t);
                setUsers(u);
                setBoard(b);
            }
        } catch (e) {
            if (request === boardRequest.current) {
                setError((e as Error).message);
            }
        } finally {
            if (request === boardRequest.current) {
                setLoadingBoard(false);
            }
        }
    };

    useEffect(() => {
        if (boardId) {
            chooseBoard(boardId);
        } else {
            listBoards(teamId).then(setBoards, (e: Error) => setError(e.message));
        }
    }, [boardId, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

    const chooseFile = async (file: File | undefined) => {
        setError('');
        setTable(null);
        setResult(null);
        if (!file) {
            return;
        }
        setBusy(true);
        try {
            const t = await readTable(file);
            if (t.rows.length === 0) {
                throw new Error('The file has no rows under its header row.');
            }
            setTable(t);
            setFileName(file.name);
        } catch (e) {
            setError(`Couldn't read ${file.name}: ${(e as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    // Columns are matched once both the board and the file are there, whichever comes last.
    useEffect(() => {
        setMapping(board && table ? guessMapping(table.headers, board.cardProperties) : []);
    }, [board, table]);

    const plan = useMemo(() => (
        board && table ? buildPlan(table, mapping, board, users, {addMissingOptions, skipExisting, existingTitles: titles}) : null
    ), [board, table, mapping, users, addMissingOptions, skipExisting, titles]);

    const hasTitle = mapping.includes(TITLE);
    const canImport = Boolean(board && plan && hasTitle && plan.cards.length > 0 && !busy && !result);

    const runImport = async () => {
        if (!board || !plan) {
            return;
        }
        setBusy(true);
        setError('');
        const failed: Result['failed'] = [];
        let created = 0;
        try {
            await addOptions(board, plan.newOptions);
            setProgress({done: 0, total: plan.cards.length});
            const queue = [...plan.cards];
            const worker = async () => {
                for (let card = queue.shift(); card; card = queue.shift()) {
                    try {
                        await createCard(board.id, card); // eslint-disable-line no-await-in-loop
                        created++;
                    } catch (e) {
                        failed.push({row: card.row, error: (e as Error).message});
                    }
                    setProgress({done: created + failed.length, total: plan.cards.length});
                }
            };
            await Promise.all(Array.from({length: PARALLEL}, worker));
            setResult({created, failed: failed.sort((a, b) => a.row - b.row)});
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
            setProgress(null);
        }
    };

    const props = board?.cardProperties.filter(importable) || [];
    const mappedProps = mapping.map((target) => props.find((p) => p.id === target)).filter(Boolean);
    const newOptionCount = plan ? Object.values(plan.newOptions).reduce((n, list) => n + list.length, 0) : 0;

    return ReactDOM.createPortal((
        <div
            className='bi-overlay'
            onMouseDown={(e) => e.target === e.currentTarget && !progress && onClose()}
        >
            <div
                className='bi-dialog'
                role='dialog'
                aria-modal='true'
                aria-labelledby='bi-dialog-title'
            >
                <h2 id='bi-dialog-title'>{'Import cards'}</h2>
                <p className='bi-sub'>{'Add a card for each row of an Excel (.xlsx) or CSV file. A file exported from Boards imports back as it is.'}</p>

                <div className='bi-body'>
                    {!boardId && (
                        <label className='bi-field'>
                            <span className='bi-field__label'>{'Board'}</span>
                            <select
                                aria-label='Board'
                                value={board?.id || ''}
                                onChange={(e) => chooseBoard(e.target.value)}
                                disabled={busy || Boolean(result)}
                            >
                                <option value=''>{boards ? 'Choose a board…' : 'Loading boards…'}</option>
                                {(boards || []).map((b) => (
                                    <option
                                        key={b.id}
                                        value={b.id}
                                    >
                                        {`${b.icon ? b.icon + ' ' : ''}${b.title || 'Untitled board'}`}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {boardId && board && <p className='bi-hint'>{`Into: ${board.icon ? board.icon + ' ' : ''}${board.title}`}</p>}
                    {loadingBoard && <p className='bi-hint'>{'Loading the board…'}</p>}

                    <label className='bi-field'>
                        <span className='bi-field__label'>{'File'}</span>
                        <input
                            type='file'
                            aria-label='File'
                            accept='.xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                            onChange={(e) => chooseFile(e.target.files?.[0])}
                            disabled={busy || Boolean(result)}
                        />
                        <span className='bi-hint'>{'The first row must hold the column names. Only the first sheet of an Excel file is read.'}</span>
                    </label>

                    {board && table && !result && (
                        <>
                            <div>
                                <div className='bi-section'>{`Columns in ${fileName}`}</div>
                                <table className='bi-table'>
                                    <thead>
                                        <tr>
                                            <th>{'Column'}</th>
                                            <th>{'Example'}</th>
                                            <th>{'Goes into'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {table.headers.map((h, col) => (
                                            <tr key={`${h}-${col}`}>
                                                <td>{h}</td>
                                                <td className='bi-hint'>{example(table, col)}</td>
                                                <td>
                                                    <select
                                                        aria-label={`Column ${h}`}
                                                        value={mapping[col] || SKIP}
                                                        onChange={(e) => {
                                                            const next = [...mapping];

                                                            // A target takes one column: free it elsewhere.
                                                            next.forEach((t, i) => {
                                                                if (t === e.target.value && t !== SKIP) {
                                                                    next[i] = SKIP;
                                                                }
                                                            });
                                                            next[col] = e.target.value;
                                                            setMapping(next);
                                                        }}
                                                    >
                                                        <option value={SKIP}>{'Don\'t import'}</option>
                                                        <option value={TITLE}>{'Card name'}</option>
                                                        {props.map((p) => (
                                                            <option
                                                                key={p.id}
                                                                value={p.id}
                                                            >
                                                                {`${p.name} (${typeLabel(p.type)})`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {!hasTitle && <p className='bi-error'>{'Choose which column holds the card name.'}</p>}
                            </div>

                            <label className='bi-check'>
                                <input
                                    type='checkbox'
                                    checked={addMissingOptions}
                                    onChange={(e) => setAddMissingOptions(e.target.checked)}
                                />
                                {'Add values that aren\'t options yet (for example a new status) to the board'}
                            </label>
                            <label className='bi-check'>
                                <input
                                    type='checkbox'
                                    checked={skipExisting}
                                    onChange={(e) => setSkipExisting(e.target.checked)}
                                />
                                {'Skip rows whose card name is already on the board'}
                            </label>

                            {plan && hasTitle && (
                                <div>
                                    <div className='bi-section'>{summary(plan, newOptionCount)}</div>
                                    {plan.cards.length > 0 && (
                                        <div className='bi-preview'>
                                            <table className='bi-table'>
                                                <thead>
                                                    <tr>
                                                        <th>{'Card name'}</th>
                                                        {mappedProps.map((p) => <th key={p!.id}>{p!.name}</th>)}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {plan.cards.slice(0, PREVIEW_ROWS).map((c) => (
                                                        <tr key={c.row}>
                                                            <td title={c.title}>{c.title}</td>
                                                            {mappedProps.map((p) => {
                                                                const shown = describe(p!, c.properties[p!.id], plan, users);
                                                                return (
                                                                    <td
                                                                        key={p!.id}
                                                                        title={shown}
                                                                    >
                                                                        {shown}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    {plan.warnings.length > 0 && (
                                        <ul className='bi-warnings'>
                                            {plan.warnings.slice(0, MAX_WARNINGS_SHOWN).map((w, i) => (
                                                <li key={i}>{`Row ${w.row}, ${w.column}: ${w.message}`}</li> // eslint-disable-line react/no-array-index-key
                                            ))}
                                            {plan.warnings.length > MAX_WARNINGS_SHOWN && <li>{`…and ${plan.warnings.length - MAX_WARNINGS_SHOWN} more`}</li>}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {progress && (
                        <div aria-label='Import progress'>
                            <p className='bi-hint'>{`Adding cards… ${progress.done} of ${progress.total}`}</p>
                            <div className='bi-progress'><div style={{width: `${(100 * progress.done) / Math.max(progress.total, 1)}%`}}/></div>
                        </div>
                    )}

                    {result && (
                        <div role='status'>
                            <p className='bi-section'>{`Added ${result.created} card${result.created === 1 ? '' : 's'} to ${board?.title}.`}</p>
                            {result.failed.length > 0 && (
                                <ul className='bi-warnings'>
                                    {result.failed.slice(0, MAX_WARNINGS_SHOWN).map((f) => <li key={f.row}>{`Row ${f.row} wasn't added: ${f.error}`}</li>)}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {error && <p className='bi-error'>{error}</p>}
                <div className='bi-actions'>
                    {result ? (
                        <button
                            type='button'
                            className='btn btn-primary'
                            onClick={onClose}
                        >
                            {'Done'}
                        </button>
                    ) : (
                        <>
                            <button
                                type='button'
                                className='btn btn-tertiary'
                                onClick={onClose}
                                disabled={Boolean(progress)}
                            >
                                {'Cancel'}
                            </button>
                            <button
                                type='button'
                                className='btn btn-primary'
                                onClick={runImport}
                                disabled={!canImport}
                            >
                                {plan && plan.cards.length > 0 ? `Import ${plan.cards.length} card${plan.cards.length === 1 ? '' : 's'}` : 'Import'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    ), document.body);
}

function example(table: Table, col: number): string {
    const cell = table.rows.find((r) => r[col] !== null && r[col] !== '')?.[col];
    if (cell === undefined || cell === null) {
        return '';
    }
    const s = cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell);
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

const TYPE_LABELS: Record<string, string> = {
    text: 'text',
    number: 'number',
    select: 'select',
    multiSelect: 'multi-select',
    date: 'date',
    person: 'person',
    multiPerson: 'people',
    checkbox: 'checkbox',
    url: 'link',
    email: 'email',
    phone: 'phone',
};
const typeLabel = (t: string) => TYPE_LABELS[t] || t;

function summary(plan: NonNullable<ReturnType<typeof buildPlan>>, newOptions: number): string {
    const parts = [`${plan.cards.length} card${plan.cards.length === 1 ? '' : 's'} to add`];
    if (plan.existing.length) {
        parts.push(`${plan.existing.length} already on the board (skipped)`);
    }
    if (plan.withoutName.length) {
        parts.push(`${plan.withoutName.length} without a name (skipped)`);
    }
    if (newOptions) {
        parts.push(`${newOptions} new option${newOptions === 1 ? '' : 's'}`);
    }
    return parts.join(' · ');
}
