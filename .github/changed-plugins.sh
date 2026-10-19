#!/usr/bin/env bash
# Prints `plugins=<JSON array>` for $GITHUB_OUTPUT: the plugins a push or pull request touches.
# Changes outside plugins/ (CI, shared files) test every plugin, as does a new branch.
# Usage: changed-plugins.sh <base-sha>
set -euo pipefail
base="${1:-}"
all=$(find plugins -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
    selected="$all"
else
    files=$(git diff --name-only "$base" HEAD)
    if [ -z "$files" ]; then
        selected=""
    elif echo "$files" | grep -qv '^plugins/'; then
        selected="$all"
    else
        selected=$(echo "$files" | awk -F/ 'NF > 2 {print $2}' | sort -u)
    fi
fi
json=$(printf '%s\n' "$selected" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')
echo "plugins=$json"
