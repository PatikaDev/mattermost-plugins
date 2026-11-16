# Call Status

Shows when someone is on a call, the way Slack shows a 🎧 next to people in a huddle.

While a person is in a **Mattermost call** their custom status becomes **🎧 In a call**; while
they're in a **Google Meet** started from Mattermost it becomes **📹 In a Google Meet**. The
status is Mattermost's own custom status, so the icon appears everywhere a name does — next to
their messages, in the direct-message list, on their profile — in the web, desktop **and mobile**
apps, and it goes away when the call ends.

It is only an indicator: nobody joins anything by clicking it.

## How it knows

| Source | Detected when | Status goes away |
|---|---|---|
| Mattermost Calls | the person is connected to a call (checked every 10 seconds, from any device) | when they leave the call |
| Google Meet started with the [Google Meet plugin](https://github.com/mattermost/mattermost-plugin-google-meet) | they start the meeting, or click its link in the meeting message (web and desktop apps) | when the Google Meet plugin marks the meeting ended, or after 2 hours |

A call wins over a meeting. Google doesn't tell Mattermost who is in a Meet, so a Meet joined
from a link elsewhere (a calendar invite, a link pasted in a message, the phone app) isn't
detected. For scheduled meetings, the
[Google Calendar plugin](https://github.com/mattermost/mattermost-plugin-google-calendar) can set
**📅 In a meeting**: each person connects their calendar and turns on *Set custom status
automatically* in its settings.

## Rules

- **Your own status always wins.** If you've set a status ("On vacation", or the calendar's "In a
  meeting"), the plugin leaves it alone; the call status appears only once yours is gone.
- **You can clear it.** If you clear or change the call status during a call, it stays the way you
  left it until that call ends.
- When the plugin is turned off, every status it set is cleared.

## Requirements

- Mattermost 10.11 or later (one build, tested on 11.7 and 12.0).
- The Calls plugin (bundled with Mattermost) for calls; the Google Meet plugin for meetings.
  Either can be missing: that source is simply skipped.
- Custom statuses on (**System Console → Site Configuration → Users and Teams → Enable Custom
  Statuses**, on by default).

## How it works

The server reads the Calls plugin's `calls` and `calls_sessions` tables (in the Mattermost
database) every 10 seconds and sets or clears custom statuses through the plugin API. The web app
only reports clicks on `meet.google.com` links inside messages to
`POST /plugins/dev.patika.call-status/api/v1/meet/joined`; the server checks that the post is an
open Google Meet meeting the person can see. Nothing is sent outside your server.

## Development

```bash
make dist                          # build the tarball into dist/
make test                          # Go + web app unit tests
cd e2e && npm ci && MM_VERSION=12.0.0 ./scripts/start-server.sh && npx playwright test
```

The end-to-end tests fake calls by writing the Calls plugin's rows into the test database, since
a real WebRTC call doesn't run in CI.
