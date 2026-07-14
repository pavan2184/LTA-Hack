# Project Starter System

Before building any serious project, run the following sequence.

## Phase 1: Product

Use the product-requirements-agent.

Output:

- docs/PROJECT_BRIEF.md
- MVP scope
- Non-MVP scope
- User journeys
- Success metrics
- Key risks

## Phase 2: Architecture

Use the architecture-agent.

Output:

- docs/ARCHITECTURE.md
- Recommended stack
- Folder structure
- Service boundaries
- API shape
- Deployment assumptions

## Phase 3: Data Model

Use the data-model-agent.

Output:

- docs/DATA_MODEL.md
- Entities
- Fields
- Relationships
- Validation rules
- Indexes
- Example payloads

## Phase 4: API Contract

Use the api-contract-agent.

Output:

- docs/API_CONTRACT.md
- Routes
- Request bodies
- Response bodies
- Error formats
- Auth requirements

## Phase 5: Testing

Use the testing-agent.

Output:

- docs/TESTING.md
- Unit tests
- Integration tests
- API tests
- Edge cases
- Regression tests

## Phase 6: Security

Use the security-agent.

Output:

- docs/SECURITY_REVIEW.md
- Threat model
- Auth risks
- Data risks
- LLM risks
- File upload risks
- Secrets risks

## Phase 7: Coding

Only start coding after Phases 1-6 are complete.

After every major feature:

- Run tests.
- Run the code review agent.
- Update `docs/PROJECT_STATUS.md`.
- Update `docs/DECISIONS.md` if a new architectural choice was made.

## First Prompt For New Projects

```text
Read AGENTS.md, CLAUDE.md, and PROJECT_STARTER_SYSTEM.md.

I am starting a new project: [describe project].

Do not code yet.

First, run the project starter workflow:
1. Product requirements
2. Architecture
3. Data model
4. API contract
5. Testing plan
6. Security review

Create or update the files in docs/.
After that, ask me to confirm before implementation.
```
