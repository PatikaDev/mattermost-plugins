# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.1] — 2026-10-15

### Fixed
- No more duplicate icons and buttons after an upgrade: when Mattermost starts the plugin twice
  in an open window (it can, if the plugin is re-enabled while its code is still loading), the
  second start is ignored. Previously the page needed a reload to clear the duplicates.

## [1.0.0] — 2026-10-07

### Added
- Clock button in every message box (channel and thread reply) with **In 1 hour**,
  **Tomorrow at 9:00**, **Next Monday at 9:00** and **Custom time…**, in the user's
  Mattermost time zone and clock format.
- Scheduled messages keep their attachments and are posted as the author, in the same
  channel or thread.
- **Scheduled messages** panel with **Send now**, **Change time** and **Delete**, kept in
  sync across tabs and devices.
- Permission re-check at send time; messages that can't be posted are marked failed and the
  *Scheduled Messages* bot DMs the author the reason and the text.
- Cluster-safe sender: each message is claimed atomically and posted at most once.
- One build for Mattermost 10.11+, verified on 11.7 and 12.0.
