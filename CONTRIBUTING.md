# Contributing

Thanks for helping! Issues and pull requests are welcome.

## Before you open a pull request

```bash
go test -race ./server/...
cd webapp && npm ci && npm run lint && npm run check-types && npm test
cd .. && make dist
cd e2e && npm ci && MM_VERSION=11.7.11 ./scripts/start-server.sh && npx playwright test
```

CI runs the same checks plus `golangci-lint` on `./server/...`, and the end-to-end suite on
every supported Mattermost line.

## Server rules

- Business logic lives in `server/scheduled` behind small interfaces (`Store`, `Mattermost`,
  `Clock`) so it can be unit-tested with fakes; `server/` only wires it to Mattermost.
- Every path that posts must go through `Service.send`: it claims the message with a
  compare-and-set and re-validates permissions and attachments right before posting.
- Errors meant for the user are `UserError`s with plain-language messages; anything else is
  logged and shown as a generic error.

## Webapp compatibility rules

The plugin uses the **server's** React at runtime — React 17 on Mattermost 10.11, 18 on 11.x,
19 on 12.x — so one build has to work on all of them:

- Keep `@babel/preset-react` on the **classic** JSX runtime. The automatic runtime needs
  `window.ReactJSXRuntime`, which only Mattermost 12 provides.
- Use function components and hooks available since React 16.8. Avoid `defaultProps` on
  function components, string refs, legacy context, `findDOMNode`, `ReactDOM.render`,
  `useId` and `useSyncExternalStore`.
- Don't import `prop-types`, `react-bootstrap` or `react-router-dom`.
- The composer integration (`src/composer.ts`) relies on Mattermost's message-box markup; if
  you change it, run the E2E suite on both 11.x and 12.x.
