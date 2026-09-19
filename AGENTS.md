# AI Coding Instructions

Before writing code, always read:

1. docs/PS1_OFFICIAL_SPEC.md — what the judges score us on
2. docs/PROJECT_BRIEF.md
3. docs/ARCHITECTURE.md
4. docs/DATA_MODEL.md
5. docs/API_CONTRACT.md
6. docs/TESTING.md
7. docs/DECISIONS.md
8. docs/PROJECT_STATUS.md

## PS1 non-negotiables

`docs/PS1_OFFICIAL_SPEC.md` is authoritative for PS1 rules, scoring, output
schema and deliverables. When it disagrees with any other doc about PS1, it
wins. Specifically, never change code in a way that breaks these:

- Every activity in `08_ACTIVITY_DETAILS.csv` is scheduled in full. Dropping or
  truncating work to relieve congestion fails the mandatory gate.
- Hard rules are never traded for a better score: buffers, `Live`
  opposite-bound mirroring and interchange crossover, location capacity, legal
  mixes, weekly allocation and workfront caps.
- Output is exactly three CSVs per scenario with the published columns, one
  scenario per `RESULTS.csv`, nine files across A/B/C.
- `/ps1` must keep accepting an uploaded hidden eight-file instance and solving
  it entirely in the browser. That path is deliverable 2 — treat it as the
  highest-risk surface in the repo.
- Our local checker is not the reference validator. Do not label it as one.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
