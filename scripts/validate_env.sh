#!/bin/bash

set -euo pipefail

if [ ! -f .env.example ]; then
  echo "Missing .env.example" >&2
  exit 1
fi

if [ -f .env ]; then
  echo "Checking .env against .env.example..."

  missing=0
  while IFS= read -r line; do
    case "$line" in
      ""|\#*) continue ;;
    esac

    key="${line%%=*}"
    if ! grep -q "^${key}=" .env; then
      echo "Missing env var: ${key}" >&2
      missing=1
    fi
  done < .env.example

  if [ "$missing" -ne 0 ]; then
    exit 1
  fi
else
  echo "No .env file found; only .env.example exists."
fi

echo "Environment validation complete."
