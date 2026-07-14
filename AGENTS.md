# AI Coding Instructions

Before writing code, always read:

1. docs/PROJECT_BRIEF.md
2. docs/ARCHITECTURE.md
3. docs/DATA_MODEL.md
4. docs/API_CONTRACT.md
5. docs/TESTING.md
6. docs/DECISIONS.md
7. docs/PROJECT_STATUS.md

## Working Rules

- At the start of work in any project, check for a root `progress.md`. If it
  exists, read it before planning or editing.
- After meaningful work in any project, update the root `progress.md` when it
  exists. Record what changed, what verification ran, unresolved errors or
  skipped checks, known risks, and current local server URLs if servers are
  running.
- Do not start coding until the project brief, architecture, data model, API contract, and test plan exist.
- Prefer small, incremental changes over large rewrites.
- Never change protected files unless explicitly asked.
- Never invent environment variables. Check `.env.example`.
- Never remove tests to make a build pass.
- After every feature, update `docs/PROJECT_STATUS.md`.
- After every architectural decision, update `docs/DECISIONS.md`.
- For backend work, add tests.
- For auth, payments, legal, financial, health, or personal-data features, run a security review.
- For LLM features, consider prompt injection, data leakage, logging risk, and output unreliability.
- Use existing project patterns before adding new abstractions or dependencies.
- Keep changes scoped to the task unless the user explicitly asks for refactoring.
