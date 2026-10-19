// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Which channels are unread, computed exactly like Mattermost's own sidebar
// (mattermost-redux calculateUnreadCount): with collapsed reply threads on, only root posts
// count; muted channels only count when you were mentioned.

export type Channel = {
    id: string;
    name: string;
    display_name: string;
    type: string; // O, P, D, G
    team_id: string;
    delete_at: number;
    last_post_at: number;
};

export type Member = {
    channel_id: string;
    msg_count: number;
    msg_count_root?: number;
    mention_count: number;
    mention_count_root?: number;
    last_viewed_at: number;
    notify_props?: {mark_unread?: string};
};

export type MessageCount = {total: number; root: number};

export type UnreadChannel = {
    channel: Channel;
    lastViewedAt: number;
    messages: number;
    mentions: number;
};

// "Collapsed reply threads" as Mattermost resolves it from the server setting and the user's
// display preference.
export function collapsedThreadsOn(serverSetting: string | undefined, userPreference: string | undefined): boolean {
    switch (serverSetting) {
    case 'always_on':
        return true;
    case 'default_on':
        return userPreference ? userPreference === 'on' : true;
    case 'default_off':
        return userPreference === 'on';
    default:
        return false; // 'disabled' or unknown
    }
}

export function computeUnreads(input: {
    channels: Record<string, Channel>;
    members: Record<string, Member>;
    counts: Record<string, MessageCount>;
    teamId: string;
    collapsedThreads: boolean;
    currentChannelId?: string; // the channel you're viewing counts as read, as in the sidebar
}): UnreadChannel[] {
    const out: UnreadChannel[] = [];
    for (const member of Object.values(input.members)) {
        if (member.channel_id === input.currentChannelId) {
            continue;
        }
        const channel = input.channels[member.channel_id];
        const count = input.counts[member.channel_id];
        if (!channel || !count || channel.delete_at) {
            continue;
        }
        const crossTeam = channel.type === 'D' || channel.type === 'G';
        if (!crossTeam && channel.team_id !== input.teamId) {
            continue;
        }
        const messages = input.collapsedThreads ? count.root - (member.msg_count_root ?? 0) : count.total - member.msg_count;
        const mentions = input.collapsedThreads ? member.mention_count_root ?? 0 : member.mention_count;
        const muted = member.notify_props?.mark_unread === 'mention';
        if (mentions > 0 || (!muted && messages > 0)) {
            out.push({channel, lastViewedAt: member.last_viewed_at, messages: Math.max(messages, mentions, 0), mentions});
        }
    }

    // Mentions first, then the most recently active.
    return out.sort((a, b) => (Number(b.mentions > 0) - Number(a.mentions > 0)) || (b.channel.last_post_at - a.channel.last_post_at));
}

// A key that changes whenever a channel gets new messages or is read, so its messages are
// reloaded only then.
export function unreadKey(u: UnreadChannel): string {
    return `${u.lastViewedAt}:${u.messages}:${u.mentions}:${u.channel.last_post_at}`;
}

export type Post = {
    id: string;
    user_id: string;
    channel_id: string;
    root_id: string;
    message: string;
    type: string;
    create_at: number;
    delete_at: number;
    file_ids?: string[];
    props?: Record<string, unknown>;
};

// The unread posts among a channel's latest posts, oldest first: newer than last viewed, not
// yours, not system messages; replies are left out when collapsed threads are on (they belong
// to the Threads view, as in the sidebar).
export function unreadPosts(posts: Post[], lastViewedAt: number, me: string, collapsedThreads: boolean): Post[] {
    return posts.
        filter((p) => p.create_at > lastViewedAt && p.user_id !== me && !p.delete_at && !p.type?.startsWith('system_') && !(collapsedThreads && p.root_id)).
        sort((a, b) => a.create_at - b.create_at);
}
