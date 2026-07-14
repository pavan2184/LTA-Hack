# Project Context for Claude

This repo uses a documentation-first workflow.

Before coding:

1. Understand the product goal.
2. Read the architecture.
3. Check existing patterns.
4. Make a plan.
5. Only then implement.

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
