// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useState} from 'react';

import {avatarUrl, markRead} from '../api';
import {postsCache, usePostsCache} from '../posts_cache';
import {channelTitle, currentTeamName, navigate, openPath, useSnapshot, uses24h} from '../state';
import {unreadKey, type Post, type UnreadChannel} from '../unreads';

const SHOWN_PER_CHANNEL = 5;

function when(ts: number, use24h: boolean): string {
    const d = new Date(ts);
    const today = new Date().toDateString() === d.toDateString();
    const time = new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit', hourCycle: use24h ? 'h23' : 'h12'}).format(d);
    return today ? time : `${new Intl.DateTimeFormat(undefined, {weekday: 'short', day: 'numeric', month: 'short'}).format(d)} ${time}`;
}

function displayName(userId: string): string {
    const u = postsCache.user(userId);
    if (!u) {
        return 'Someone';
    }
    const full = [u.first_name, u.last_name].filter(Boolean).join(' ');
    return full || u.nickname || u.username;
}

// The message as Mattermost renders it (mentions, emoji, links, formatting) when the host
// exposes its renderer to plugins, plain text otherwise.
function MessageText({post}: {post: Post}) {
    if (!post.message && post.file_ids?.length) {
        return <div className='au-text au-muted'>{'📎 Attachment'}</div>;
    }
    const utils = window.PostUtils;
    if (utils?.formatText && utils.messageHtmlToComponent) {
        try {
            return <div className='au-text'>{utils.messageHtmlToComponent(utils.formatText(post.message, {atMentions: true, mentionHighlight: true}))}</div>;
        } catch {
            // Fall through to plain text.
        }
    }
    return <div className='au-text au-text--plain'>{post.message}</div>;
}

function Message({post, use24h}: {post: Post; use24h: boolean}) {
    const user = postsCache.user(post.user_id);
    return (
        <li className='au-message'>
            <img
                className='au-avatar'
                src={avatarUrl(user || {id: post.user_id})}
                alt=''
            />
            <div className='au-message__body'>
                <div className='au-message__meta'>
                    <strong>{displayName(post.user_id)}</strong>
                    <span className='au-muted'>{when(post.create_at, use24h)}</span>
                </div>
                <MessageText post={post}/>
            </div>
        </li>
    );
}

function ChannelGroup({unread, use24h, busy, onMarkRead}: {unread: UnreadChannel; use24h: boolean; busy: boolean; onMarkRead: () => void}) {
    const entry = postsCache.get(unread.channel.id);
    const posts = entry?.posts || [];
    const shown = posts.slice(-SHOWN_PER_CHANNEL);
    const more = Math.max(unread.messages, posts.length) - shown.length;
    const prefix = unread.channel.type === 'O' || unread.channel.type === 'P' ? '~' : '';
    const open = () => navigate(openPath(unread.channel, posts[0]?.id));

    return (
        <section
            className='au-group'
            aria-label={`${prefix}${channelTitle(unread.channel)}`}
        >
            <header className='au-group__header'>
                <button
                    type='button'
                    className='au-group__title'
                    onClick={open}
                >
                    {prefix}{channelTitle(unread.channel)}
                </button>
                {unread.mentions > 0 && <span className='au-pill au-pill--mention'>{`@${unread.mentions}`}</span>}
                <span className='au-pill'>{`${unread.messages} new`}</span>
                <span className='au-group__actions'>
                    <button
                        type='button'
                        className='btn btn-sm btn-tertiary'
                        onClick={open}
                    >
                        {'Open'}
                    </button>
                    <button
                        type='button'
                        className='btn btn-sm btn-tertiary'
                        disabled={busy}
                        onClick={onMarkRead}
                    >
                        {'Mark as read'}
                    </button>
                </span>
            </header>
            {entry?.error && <div className='au-error'>{entry.error}</div>}
            {entry?.loading && !posts.length && <div className='au-muted au-loading'>{'Loading…'}</div>}
            {shown.length > 0 && (
                <ul className='au-messages'>
                    {shown.map((p) => (
                        <Message
                            key={p.id}
                            post={p}
                            use24h={use24h}
                        />
                    ))}
                </ul>
            )}
            {more > 0 && (
                <button
                    type='button'
                    className='au-more'
                    onClick={open}
                >
                    {`+${more} more — open channel`}
                </button>
            )}
        </section>
    );
}

export default function Panel() {
    const {unreads, unreadThreads, threadMentions} = useSnapshot();
    usePostsCache();
    const use24h = uses24h();

    // Channels marked read here disappear right away; they come back if they get new messages
    // before Mattermost's own update arrives.
    const [hidden, setHidden] = useState<Record<string, string>>({});
    const visible = unreads.filter((u) => hidden[u.channel.id] !== unreadKey(u));
    const [confirmAll, setConfirmAll] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const keys = visible.map(unreadKey).join('|');
    useEffect(() => {
        postsCache.sync(visible);
    }, [keys]); // eslint-disable-line react-hooks/exhaustive-deps

    const mark = async (list: UnreadChannel[]) => {
        setBusy(true);
        setError('');
        try {
            const ids = list.map((u) => u.channel.id);
            for (let i = 0; i < ids.length; i += 200) {
                await markRead(ids.slice(i, i + 200)); // eslint-disable-line no-await-in-loop
            }
            const next = {...hidden};
            for (const u of list) {
                next[u.channel.id] = unreadKey(u);
            }
            setHidden(next);
            setConfirmAll(false);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const total = visible.reduce((n, u) => n + u.messages, 0);

    return (
        <div className='au-panel'>
            <div className='au-summary'>
                {visible.length > 0 ? (
                    <span>{`${total} unread ${total === 1 ? 'message' : 'messages'} in ${visible.length} ${visible.length === 1 ? 'channel' : 'channels'}`}</span>
                ) : (
                    <span className='au-muted'>{'No unread channels'}</span>
                )}
                {visible.length > 0 && !confirmAll && (
                    <button
                        type='button'
                        className='btn btn-sm btn-primary'
                        disabled={busy}
                        onClick={() => setConfirmAll(true)}
                    >
                        {'Mark all as read'}
                    </button>
                )}
            </div>
            {confirmAll && (
                <div
                    className='au-confirm'
                    role='alertdialog'
                    aria-label='Mark all as read'
                >
                    <span>{`Mark all ${visible.length} channels as read?`}</span>
                    <button
                        type='button'
                        className='btn btn-sm btn-primary'
                        disabled={busy}
                        onClick={() => mark(visible)}
                    >
                        {busy ? 'Marking…' : 'Mark as read'}
                    </button>
                    <button
                        type='button'
                        className='btn btn-sm btn-tertiary'
                        onClick={() => setConfirmAll(false)}
                    >
                        {'Cancel'}
                    </button>
                </div>
            )}
            {error && <div className='au-error'>{error}</div>}
            {unreadThreads > 0 && (
                <button
                    type='button'
                    className='au-threads'
                    onClick={() => navigate(`/${currentTeamName()}/threads`)}
                >
                    <span>{`🧵 ${unreadThreads} unread ${unreadThreads === 1 ? 'thread' : 'threads'}`}</span>
                    {threadMentions > 0 && <span className='au-pill au-pill--mention'>{`@${threadMentions}`}</span>}
                    <span className='au-muted'>{'Open Threads →'}</span>
                </button>
            )}
            {visible.length === 0 && unreadThreads === 0 && (
                <div className='au-empty'>
                    <div className='au-empty__emoji'>{'🎉'}</div>
                    <div>{"You're all caught up"}</div>
                </div>
            )}
            {visible.map((u) => (
                <ChannelGroup
                    key={u.channel.id}
                    unread={u}
                    use24h={use24h}
                    busy={busy}
                    onMarkRead={() => mark([u])}
                />
            ))}
        </div>
    );
}
