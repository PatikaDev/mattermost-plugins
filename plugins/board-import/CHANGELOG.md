# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-17

### Added
- Import cards into a Boards board from an Excel (.xlsx) or CSV file: an **Import** button in the
  board's toolbar, and **Import cards into a board** in the Channels app bar.
- Columns are matched to the board's properties by name and can be changed; a preview shows the
  first rows and lists cells that can't be used.
- Select values, people, dates, checkboxes and numbers are converted from what people type and
  from what Boards' own CSV export writes, so an exported board imports back as it is.
- New select values can be added as options; rows already on the board are skipped by default.
