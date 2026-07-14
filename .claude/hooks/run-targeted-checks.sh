#!/bin/bash

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

case "$FILE_PATH" in
  *.py)
    if command -v python >/dev/null 2>&1; then
      python -m py_compile "$FILE_PATH"
    fi
    ;;
  *.json)
    if command -v jq >/dev/null 2>&1; then
      jq empty "$FILE_PATH"
    fi
    ;;
  *.yml|*.yaml)
    if command -v python >/dev/null 2>&1; then
      python - <<'PY' "$FILE_PATH"
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit(0)

yaml.safe_load(Path(sys.argv[1]).read_text())
PY
    fi
    ;;
esac

exit 0
