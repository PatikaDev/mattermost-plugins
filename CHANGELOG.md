# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-10-19

### Added
- **All unreads** panel opened from an app bar icon that shows the number of unread channels
  (highlighted when you were mentioned).
- Unread messages grouped by channel — sender, time and text rendered like in Mattermost —
  mentions first, then most recently active; up to 5 messages per channel with a link for more.
- **Open** (jumps to the first unread message), **Mark as read** per channel and **Mark all as
  read** with confirmation, using Mattermost's own `mark_read` endpoint.
- Unread threads summary with a shortcut to the Threads view (collapsed reply threads on).
- Live updates as messages arrive or channels are read elsewhere; counts follow the sidebar's
  rules (root posts with collapsed threads, muted channels only on mentions).
- One build for Mattermost 10.11+, verified on 11.7 and 12.0.
