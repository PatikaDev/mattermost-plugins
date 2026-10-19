# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/PatikaDev/mattermost-plugins/security/advisories/new)
for this repository instead. We aim to acknowledge reports within 5 working days.

## Scope

The plugin has a server component that posts on a user's behalf at the scheduled time. It
only ever posts for the user who scheduled the message, and re-checks at send time that the
user is active and still allowed to post in that channel or thread, and that every attachment
was uploaded by that user to that channel and not posted yet. The HTTP API only lets a user
see and change their own scheduled messages. Data stays on the Mattermost server (plugin
key-value store and file storage).

## Supported versions

Security fixes are released for the latest minor version.
