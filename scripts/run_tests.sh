#!/bin/bash

set -euo pipefail

echo "Running tests..."

if [ -d tests ]; then
  if command -v pytest >/dev/null 2>&1; then
    pytest
  else
    python -m pytest
  fi
else
  echo "No tests directory found."
fi

if [ -f package.json ]; then
  npm test --if-present
fi

echo "Tests complete."
