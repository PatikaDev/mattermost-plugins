#!/usr/bin/env bash
# Prints a plugin's CHANGELOG.md section for a version (without its heading), for the GitHub
# Release. Usage: .github/release-notes.sh plugins/<name>/CHANGELOG.md 1.2.0
# Exits non-zero if the section is missing or empty.
set -euo pipefail
changelog="$1"
version="${2#v}"
notes=$(awk -v v="$version" '
    $0 ~ "^## \\[" v "\\]" { found = 1; next }
    found && /^## \[/ { exit }
    found { print }
' "$changelog" | sed -e '/./,$!d')
if [ -z "${notes//[[:space:]]/}" ]; then
    echo "$changelog has no section for $version — add '## [$version] — YYYY-MM-DD' before tagging." >&2
    exit 1
fi
printf '%s\n' "$notes"
