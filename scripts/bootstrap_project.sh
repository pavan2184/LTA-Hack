#!/bin/bash

set -euo pipefail

echo "Bootstrapping project..."

mkdir -p docs
mkdir -p .claude/agents
mkdir -p .claude/hooks
mkdir -p .cursor/rules
mkdir -p .github/workflows
mkdir -p scripts

touch docs/PROJECT_BRIEF.md
touch docs/PROJECT_STATUS.md
touch docs/ARCHITECTURE.md
touch docs/DATA_MODEL.md
touch docs/API_CONTRACT.md
touch docs/TESTING.md
touch docs/DECISIONS.md
touch docs/SECURITY_REVIEW.md

if [ ! -f .env.example ]; then
  touch .env.example
fi

if [ ! -f .gitignore ]; then
  cat > .gitignore <<'EOF'
.env
.env.*
!.env.example
__pycache__/
.pytest_cache/
.mypy_cache/
.ruff_cache/
node_modules/
.next/
dist/
build/
.DS_Store
.claude/settings.local.json
EOF
fi

if command -v pre-commit >/dev/null 2>&1; then
  pre-commit install
  pre-commit install -t pre-push
fi

echo "Project bootstrap complete."
