#!/bin/bash

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

case "$FILE_PATH" in
  *.py)
    if command -v ruff >/dev/null 2>&1; then
      ruff format "$FILE_PATH"
      ruff check "$FILE_PATH" --fix
    fi
    ;;
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.css|*.yml|*.yaml)
    if command -v npx >/dev/null 2>&1; then
      npx prettier --write "$FILE_PATH"
    fi
    ;;
esac

exit 0
