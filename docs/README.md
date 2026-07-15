# RailPlan Documentation Index

Last updated: 2026-07-15

## Source-of-Truth Rule

The documents are split into three categories so current behaviour is never confused with future intent:

- **Current product truth:** what the repository implements today.
- **Accepted decisions:** choices that currently govern implementation.
- **Proposals and research:** options that require an explicit decision before implementation.

When documents disagree, use this precedence order:

1. `PROJECT_STATUS.md` for the current release and known limitations.
2. `CURRENT_IMPLEMENTATION_AUDIT.md` for exact code behaviour.
3. `DECISIONS.md` for accepted architecture and unresolved proposals.
4. The brief, architecture, data model, client contract, testing plan, and security review for their respective domains.
5. Mathematical and research documents for proposed future work.

The code and automated tests remain the final executable truth. Any mismatch between code and documentation is a defect to record in `PROJECT_STATUS.md`.

## Required Reading Before Changes

Read these in order before writing application code:

1. [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) — users, scope, product journeys, and success criteria.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — current system structure and boundaries.
3. [`DATA_MODEL.md`](DATA_MODEL.md) — current entities, relationships, validation, and persistence.
4. [`API_CONTRACT.md`](API_CONTRACT.md) — current client action contract and future service boundary.
5. [`TESTING.md`](TESTING.md) — present coverage, release gates, and known gaps.
6. [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) — present threat model and future security gates.
7. [`DECISIONS.md`](DECISIONS.md) — accepted choices and proposals awaiting a decision.
8. [`PROJECT_STATUS.md`](PROJECT_STATUS.md) — current release, verification, risks, and next work.

For a precise implementation handoff, also read [`CURRENT_IMPLEMENTATION_AUDIT.md`](CURRENT_IMPLEMENTATION_AUDIT.md).

## Current Product Documentation

| Document | Purpose |
| --- | --- |
| [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) | Defines the hackathon problem, users, MVP, non-MVP scope, and product truth. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Describes the frontend-only Next.js architecture and runtime data flow. |
| [`DATA_MODEL.md`](DATA_MODEL.md) | Records the implemented TypeScript entities and persistence behaviour. |
| [`API_CONTRACT.md`](API_CONTRACT.md) | Records the implemented Zustand action contract; no network API exists. |
| [`TESTING.md`](TESTING.md) | Records current automated coverage, UAT requirements, and verification history. |
| [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) | Records the security posture of the simulated frontend. |
| [`DECISIONS.md`](DECISIONS.md) | Separates accepted decisions from unapproved future proposals. |
| [`PROJECT_STATUS.md`](PROJECT_STATUS.md) | Summarises current capability, limitations, verification, and next tasks. |
| [`CURRENT_IMPLEMENTATION_AUDIT.md`](CURRENT_IMPLEMENTATION_AUDIT.md) | Provides the detailed file, state, behaviour, calculation, and known-gap audit. |
| [`TEAM_HANDOFF.md`](TEAM_HANDOFF.md) | Gives teammates the quick start, demo flow, code map, collaboration rules, and next milestone. |

## Proposed Future Direction

| Document | Status | Purpose |
| --- | --- | --- |
| [`DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md`](DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md) | Proposed | Mathematical constraints, solver choices, graph mapping, KPI formulas, result contract, and implementation phases. |
| [`RAIL_SCHEDULING_RESEARCH.md`](RAIL_SCHEDULING_RESEARCH.md) | Research | Annotated papers, paper-to-feature mapping, and suggested experiments. |

These documents do not authorise a backend, external API, new dependency, or solver. The accepted architecture remains frontend-only until `DECISIONS.md` records a replacement decision.

## Current Terminology

- **Original plan:** the preconfigured fixture containing six declared conflict records.
- **Optimised strategy:** one of five preconfigured schedule fixtures; it is not currently solver-generated.
- **Conflict-free:** currently means only that the fixture reports `activeConflicts: 0` and passes the same-sector overlap test. It is not a valid feasibility claim: every strategy still contains the known `M-004`/`M-011` thermal-unit overlap, and other rules are not independently validated.
- **Replan:** select a preconfigured disruption response after a fixed delay.
- **Alternative:** a preconfigured slot attached to a job; alternatives are not currently revalidated after application.
- **Robustness:** a preconfigured fixture field retained in the data model but no longer presented as a release headline; the proposed mathematical definition is not implemented.
- **Network map:** a fixed schematic of demo station codes, not a geographic or operational track-block model.

## Documentation Update Matrix

| Change | Documents that must be updated |
| --- | --- |
| Product goal, users, journey, MVP, or success metric | `PROJECT_BRIEF.md`, `PROJECT_STATUS.md` |
| Architecture, service, state boundary, or dependency | `ARCHITECTURE.md`, `DECISIONS.md`, `PROJECT_STATUS.md` |
| Entity, field, validation, persistence, or migration | `DATA_MODEL.md`, `TESTING.md`, `PROJECT_STATUS.md` |
| Client action or network route | `API_CONTRACT.md`, `TESTING.md`, `PROJECT_STATUS.md` |
| Constraint, solver, objective, KPI, or map calculation | `DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md`, relevant core docs, `DECISIONS.md` if accepted |
| Automated test, UAT step, or release gate | `TESTING.md`, `PROJECT_STATUS.md` |
| Auth, operational data, external API, upload, LLM, or backend | `SECURITY_REVIEW.md`, `ARCHITECTURE.md`, `DECISIONS.md` |
| Meaningful implementation or documentation session | `PROJECT_STATUS.md` and root `progress.md` when it exists |

## Documentation Quality Checklist

- State whether a capability is implemented, simulated, proposed, or researched.
- Link every future proposal to the accepted decision it would replace.
- Document formulas, units, denominators, versions, and data sources for KPIs.
- Record skipped verification and known false-positive/false-negative risks.
- Do not claim operational validity from fixture metadata.
- Keep external research separate from LTA-specific operational rules.
- Update “Last updated” dates when a document materially changes.
