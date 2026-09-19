# Project Context for Claude

## What this repo is for

RailPlan is our entry for **NebulaX Hackathon 2026, Problem Statement 1 —
Railway Track Access Optimisation**. The authoritative requirements live in
[`docs/PS1_OFFICIAL_SPEC.md`](docs/PS1_OFFICIAL_SPEC.md), restated from the
organiser's repository
([aochinwen/NebulaX-Hackathon-ProblemStatement](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement),
commit `966c976`). **Read it before touching anything PS1.** When it disagrees
with another doc about PS1 rules, scoring, output format or deliverables, it
wins.

In one line: schedule 100% of the activities across a dual-line network without
breaching any hard safety or capacity rule, for three scenarios (A/B/C) with
different rigidity, minimising a penalty score — and let a judge upload a hidden
instance into the hosted app and watch it solve.

The four deliverables, their status and the unresolved conflicts with the
participant PDF pack are in that spec's
[Deliverables](docs/PS1_OFFICIAL_SPEC.md#1-deliverables--what-we-must-hand-over)
section. Do not resolve those conflicts unilaterally — they need the organiser.

## Documentation-first workflow

Before coding:

1. Read `docs/PS1_OFFICIAL_SPEC.md` — what we are judged on.
2. Understand the product goal.
3. Read the architecture.
4. Check existing patterns.
5. Make a plan.
6. Only then implement.

## My Preferred Stack

Backend:

- FastAPI
- Pydantic
- MongoDB or PostgreSQL/Supabase
- Docker Compose
- Redis where useful

Frontend:

- Next.js
- TypeScript
- Tailwind
- shadcn/Radix where useful

Testing:

- pytest for backend
- frontend tests where appropriate
- integration tests for core flows

## My Usual Project Risks

- Docker path/import mistakes
- Port conflicts
- Weak env handling
- Missing test coverage
- Messy data models
- Overbuilding too early
- AI-generated code changing too many files
- LLM features without safety boundaries

## Claude Workflow

- Use project-level agents in `.claude/agents/` for focused planning, review, debugging, and documentation work.
- Use hooks in `.claude/hooks/` to protect sensitive files and keep formatting consistent.
- Update `docs/PROJECT_STATUS.md` at the end of meaningful implementation sessions.
