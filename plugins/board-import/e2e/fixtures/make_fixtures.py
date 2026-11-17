"""Writes the test spreadsheets: todos.xlsx (real Excel cells, including dates) and todos.csv
(semicolon-separated, as Excel saves CSV in Turkish locales). Run: python3 make_fixtures.py
(needs openpyxl). The files are committed, so tests don't need Python."""
import csv
import datetime
import os

from openpyxl import Workbook

HERE = os.path.dirname(os.path.abspath(__file__))
HEADERS = ["Görev", "Status", "Channel", "Assignee", "Due Date", "Link", "Açıklama", "Ignored column"]
ROWS = [
    ["Blog yazısı #1", "Draft", "Blog|LinkedIn", "member", datetime.date(2026, 11, 20), "https://patika.dev/blog", "İlk taslak", "x"],
    ["Bülten", "Idea", "Email, Twitter", "@admin", datetime.date(2026, 12, 1), "", "Kasım bülteni", "x"],
    ["Podcast bölümü", "Archived", "Podcast", "nobody-here", "not a date", "", "", "x"],
    ["", "Draft", "", "", None, "", "no name: skipped", "x"],
]


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "Todos"
    ws.append(HEADERS)
    for row in ROWS:
        ws.append(row)
    for cell in ws["E"][1:]:
        if isinstance(cell.value, datetime.date):
            cell.number_format = "DD.MM.YYYY"
    wb.save(os.path.join(HERE, "todos.xlsx"))

    with open(os.path.join(HERE, "todos.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(HEADERS)
        for row in ROWS:
            w.writerow([v.strftime("%d.%m.%Y") if isinstance(v, datetime.date) else ("" if v is None else v) for v in row])


if __name__ == "__main__":
    main()
