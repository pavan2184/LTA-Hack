#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ ! -x .venv-cpsat/bin/python3 ]]; then
  echo "Install the native runtime first: python3 -m venv .venv-cpsat && .venv-cpsat/bin/pip install -r scripts/ps1/requirements.txt" >&2
  exit 1
fi
export PATH="$PWD/.venv-cpsat/bin:$PATH"
python3 -c 'import ortools; assert ortools.__version__ == "9.15.6755", "Install the pinned PS1 requirements"'
exec node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
