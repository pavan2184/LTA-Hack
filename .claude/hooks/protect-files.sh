#!/bin/bash

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

PROTECTED_EXACT_FILES=(
  ".env"
  ".env.local"
  ".env.development"
  ".env.production"
  ".env.test"
)

PROTECTED_PATTERNS=(
  ".git/"
  "node_modules/"
  "__pycache__/"
  "package-lock.json"
  "pnpm-lock.yaml"
  "poetry.lock"
  "supabase/migrations/"
  "alembic/versions/"
  "golden_outputs/"
  "base_templates/"
)

for pattern in "${PROTECTED_EXACT_FILES[@]}"; do
  if [[ "$FILE_PATH" == "$pattern" || "$FILE_PATH" == */"$pattern" ]]; then
    echo "Blocked: $FILE_PATH matches protected file '$pattern'" >&2
    exit 2
  fi
done

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "Blocked: $FILE_PATH matches protected pattern '$pattern'" >&2
    exit 2
  fi
done

exit 0
