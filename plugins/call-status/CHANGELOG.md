# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- **In a Google Meet** shows Google Meet's logo once an admin adds it as the `:google-meet:` custom
  emoji (the image is in `assets/google-meet.png`); without it the status keeps 📹. Statuses set
  with 📹, including by 1.0.0, are still cleared when their meeting ends.

## [1.0.0] — 2026-11-16

### Added
- **🎧 In a call** as the custom status while someone is in a Mattermost call, from any device.
- **📹 In a Google Meet** while someone is in a Google Meet started from Mattermost: set when they
  start it or click its link in the meeting message, cleared when the meeting ends (or after
  2 hours).
- A status someone set themselves is never replaced, and a call status they clear stays cleared
  until the call ends. Turning the plugin off clears every status it set.
