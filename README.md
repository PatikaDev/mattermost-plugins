# Patika Mattermost plugins

Small, focused plugins that bring the Slack features our team missed to Mattermost — built and
used by [Patika](https://patika.dev) on Mattermost Team Edition, and free for anyone to use.

| Plugin | What it does | Releases |
|---|---|---|
| [**Quick Create**](plugins/quick-create) | ⊕ button in the message box: polls with any number of options, todos, reminders (repeating, snooze), Slack-style **Also send to channel** for thread replies, and per-channel **shortcut buttons** such as a request form. | [quick-create](https://github.com/PatikaDev/mattermost-plugins/releases?q=quick-create&expanded=true) |
| [**Scheduled Messages**](plugins/scheduled-messages) | Write now, send later — with attachments, in channels, DMs and threads. Works on Team Edition. | [scheduled-messages](https://github.com/PatikaDev/mattermost-plugins/releases?q=scheduled-messages&expanded=true) |
| [**Screen Recorder**](plugins/screen-recorder) | Record your screen (and optional microphone narration) and post it as a video, in the web and desktop apps. | [screen-recorder](https://github.com/PatikaDev/mattermost-plugins/releases?q=screen-recorder&expanded=true) |
| [**Reaction Notifications**](plugins/reaction-notifications) | A grouped DM when someone reacts to your message — Mattermost doesn't notify on reactions by itself. | [reaction-notifications](https://github.com/PatikaDev/mattermost-plugins/releases?q=reaction-notifications&expanded=true) |
| [**All Unreads**](plugins/all-unreads) | One panel with every unread message across your channels, with **Mark all as read** — like Slack's All Unreads. | [all-unreads](https://github.com/PatikaDev/mattermost-plugins/releases?q=all-unreads&expanded=true) |

Every plugin:

- runs on Mattermost **10.11 and later**, with one build tested on **11.7 and 12.0** (React 18
  and 19);
- installs on its own — pick only the ones you want;
- is released here as `<plugin-id>-<version>.tar.gz` with a `SHA256SUMS` file.

## Install a plugin

1. Open the plugin's **Releases** link above and download `dev.patika.<plugin>-<version>.tar.gz`.
2. **System Console → Plugins → Plugin Management → Upload Plugin**, choose the file, then
   **Enable** (plugin uploads must be allowed: `PluginSettings.EnableUploads`).

Or with `mmctl`:

```bash
mmctl plugin add dev.patika.<plugin>-<version>.tar.gz
mmctl plugin enable dev.patika.<plugin>
```

To upgrade, upload the newer file (`mmctl plugin add --force …`); the plugin's data is kept.

## Repository layout

```
plugins/<name>/        one folder per plugin — its own manifest, server (Go, if any),
                       webapp (TypeScript/React), end-to-end tests, README and CHANGELOG
.github/workflows/     one CI for all plugins, one release workflow
```

CI tests only the plugins a change touches (changes outside `plugins/` test all of them):
lint, type checks and unit tests, then end-to-end tests against real Mattermost 11.7 and 12.0
servers. See [CONTRIBUTING.md](CONTRIBUTING.md) for development and releases.

These plugins used to live in separate repositories (`PatikaDev/mattermost-plugin-<name>`);
their full history and release tags (now `<name>/vX.Y.Z`) were moved here.

## License

[Apache License 2.0](LICENSE). Built on the
[Mattermost plugin starter template](https://github.com/mattermost/mattermost-plugin-starter-template)
— see [NOTICE](NOTICE).
