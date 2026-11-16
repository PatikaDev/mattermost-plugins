# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/PatikaDev/mattermost-plugins/security/advisories/new)
for this repository instead. We aim to acknowledge reports within 5 working days.

## Scope

The plugin reads which users are connected to a call (user and call IDs only) from the Calls
plugin's tables, and sets or clears those users' custom status. It only ever clears a status it
set itself. Its one HTTP endpoint, `POST /api/v1/meet/joined`, needs a logged-in user and only
marks *that* user, after checking the post is an open Google Meet meeting in a channel they can
read. The plugin's key-value store holds, per user, the status it set and the last meeting they
joined.

## Supported versions

Security fixes are released for the latest minor version.
