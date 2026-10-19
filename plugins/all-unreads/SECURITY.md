# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/PatikaDev/mattermost-plugins/security/advisories/new)
for this repository instead. We aim to acknowledge reports within 5 working days.

## Scope

The plugin runs only in the Mattermost web and desktop clients; it has no server-side component
and stores nothing. It reads unread counts from the client's own state, loads posts through the
standard Mattermost REST API with the user's session (so it can only see what the user can see),
and marks channels read with the standard `mark_read` endpoint.

## Supported versions

Security fixes are released for the latest minor version.
