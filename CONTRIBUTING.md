# Contributing

Thanks for helping! Issues and pull requests are welcome — please name the plugin in the title.

## Working on a plugin

Each plugin is self-contained under `plugins/<name>/`. From that folder:

```bash
go test -race ./server/...                         # if the plugin has a server part
cd webapp && npm ci && npm run lint && npm run check-types && npm test
cd .. && make dist                                 # → dist/dev.patika.<name>-<version>.tar.gz
cd e2e && npm ci && npx playwright install chrome
MM_VERSION=11.7.11 ./scripts/start-server.sh && npx playwright test
```

Each plugin's e2e server uses its own port, so several can run side by side. The plugin's own
`CONTRIBUTING.md` lists any rules specific to it.

### Rules that apply to every plugin

- **One build for React 17, 18 and 19**: the plugin uses the server's React at runtime. Keep Babel
  on the classic JSX runtime and use only APIs available since React 16.8 (no `useId`,
  `useSyncExternalStore`, `defaultProps` on function components, `findDOMNode`…).
- **Guard `initialize`** with the per-instance flag (and reset it in `uninitialize`): Mattermost can
  call it twice when a plugin is re-enabled while loading, which would register everything twice.
- **App bar icons** must not wrap anything in `<span>` — Mattermost styles those as white discs.

## Releasing a plugin

1. Add a `## [X.Y.Z] — YYYY-MM-DD` section to `plugins/<name>/CHANGELOG.md` and merge to `main`.
2. Wait for CI to pass, then tag and push:
   ```bash
   git tag -a <name>/vX.Y.Z -m "<name> vX.Y.Z" && git push origin <name>/vX.Y.Z
   ```
3. The release workflow tests and builds that plugin and publishes a GitHub Release titled
   "<Plugin Name> vX.Y.Z" with the tarball and `SHA256SUMS`, using the CHANGELOG section as
   notes. Don't create releases in the GitHub UI — the workflow would then fail.

The plugin version comes from the tag (`make dist` reads `<name>/v*` tags only), so plain builds
between releases are versioned `X.Y.Z+<commit>`.

## Upgrading a server

Upload the new tarball once (`mmctl --local plugin add --force <file>`) — don't follow it with a
disable/enable, which reloads the plugin several times in open browsers.
