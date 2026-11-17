# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/PatikaDev/mattermost-plugins/security/advisories/new)
for this repository instead. We aim to acknowledge reports within 5 working days.

## Scope

The plugin runs only in the Mattermost web and desktop clients; it has no server-side component
and stores nothing. The file is read in the browser and never uploaded anywhere. Cards are
created through the Boards REST API with the user's own session, so Boards' permissions apply:
the user can only import into boards where they may add cards, and only see boards and people
they can already see.

## Supported versions

Security fixes are released for the latest minor version.
