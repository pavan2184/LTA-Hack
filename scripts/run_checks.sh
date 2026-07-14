#!/bin/bash

set -euo pipefail

echo "Running checks..."

if command -v pre-commit >/dev/null 2>&1 && [ -f .pre-commit-config.yaml ]; then
  pre-commit run --all-files
else
  echo "Skipping pre-commit: pre-commit is not installed or config is missing."
fi

if command -v ruff >/dev/null 2>&1; then
  ruff check .
  ruff format --check .
else
  echo "Skipping ruff: ruff is not installed."
fi

if [ -f package.json ]; then
  npm run lint --if-present
  npm run typecheck --if-present
fi

echo "Checks complete."
