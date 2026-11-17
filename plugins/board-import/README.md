# Board Import

Import cards into a [Boards](https://github.com/mattermost/mattermost-plugin-boards) board from an
**Excel (.xlsx) or CSV file**: one card per row, with statuses, people, dates and the other
columns filled in. Boards can export a board to CSV but can't import one; with this plugin, a
board's own CSV export imports back as it is.

## Use it

- **In a board:** click **Import** in the board's toolbar, next to **New**. It's shown to people
  who may add cards to that board.
- **In Channels:** the **Import cards into a board** button in the app bar on the right asks
  which board to use.

Then choose the file. The dialog matches the file's columns to the board's properties by name.
You can change any of them, or choose *Don't import*, and a preview shows the first rows as
they'll appear. Click **Import N cards**.

| Board property | What the cell may hold |
|---|---|
| Card name | the column called Name, Title, Görev, Başlık, Task… (otherwise the first free column) |
| Select / multi-select | the option's name, emoji optional ("Idea" finds "Idea 💡"). Several values separated by `\|`, `,` or `;`. New values are added as options (can be turned off) |
| Person / people | a username (with or without `@`), email, full name, nickname or user ID |
| Date | an Excel date, `2026-11-20`, `20.11.2026`, `20/11/2026`, `20 Kasım 2026`, `November 20, 2026`, or a Boards range `A -> B` |
| Checkbox | `true`, `yes`, `evet`, `x`, `✓`, `1` |
| Text, number, link, email, phone | as is |

Created/updated time and by, and file properties are filled in by Boards and can't be imported.

- **Rows already on the board** (same card name) are skipped by default, so importing a file
  twice doesn't make duplicates.
- **Rows without a name** are skipped.
- **Cells that can't be used**, such as an unknown person or a word in a date column, are left
  empty and listed before you import.
- **No notifications:** people set as assignee aren't sent a message for every imported row.

**Files:** `.xlsx` (the first sheet; the first row holds the column names) and `.csv`. In CSV
files, commas, semicolons or tabs all work as separators: Excel in Turkish saves with `;`. UTF-8
and Windows-1254 (Turkish) are read. Old `.xls` files need to be saved as `.xlsx` or CSV first.

## Requirements

Mattermost 10.11 or later with the Boards plugin (tested on Mattermost 11.7 with Boards 9.2 and
12.0 with Boards 10.0). No server part: the import runs in the browser, through the person's own
session, so Boards' usual permissions apply.

## Development

```bash
make dist      # build the tarball into dist/
make test      # web app unit tests
cd e2e && npm ci && MM_VERSION=12.0.0 ./scripts/start-server.sh && npx playwright test
```

The test spreadsheets in `e2e/fixtures` are written by `make_fixtures.py` (needs `openpyxl`).
