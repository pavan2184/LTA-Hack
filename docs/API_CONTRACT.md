# API Contract

Last updated: 2026-09-07 · RailPlan v0.4.0

## POST /api/assistant

Node runtime, 30-second deployment ceiling. `src/lib/http/schemas.ts` owns the Zod
request schema; `src/lib/http/errors.ts` owns the typed error envelope.

| Field | Contract |
| --- | --- |
| question | Trimmed nonempty string, at most 2,000 characters |
| strategy | balanced, max-completion, min-risk, min-changes, emergency-buffer; defaults balanced |
| view | submitted or planned; defaults submitted |
| locked | Array of placements; capped at number of plannable IDs, defaults empty |
| disruptionId | Known scenario ID or null |
| history | At most six user-only turns, each nonempty and at most 2,000 characters |

Pins require a known request ID, integer start 0–240, end 0–480, a team ID of
1–32 characters and optional boolean `locked`. Schema bounds are not a promise
that a pin is feasible; the validator checks the resulting plan. The array
cap does not enforce uniqueness of pin IDs yet.

The browser supplies plan parameters, never authoritative engine output. The
server computes its own plan and fact set. Submitted-view handling currently
reviews literal submitted placements; it does not replay browser repairs.

Success: `{ answer, mode: "model" | "engine", notice: string | null,
rejected: string[], model: string | null }`, with `x-request-id` response header.
The model call has a 12-second timeout and one retry. Missing credentials,
refusal, truncation, empty output, grounding failure or provider failure returns
an engine answer with a notice. The numeric guard does not establish semantic
truth of every sentence.

Errors: `{ error: { code, message, requestId } }`.

| HTTP | Codes |
| --- | --- |
| 400 | malformed_request, invalid_request |
| 413 | payload_too_large |
| 429 | rate_limited (also Retry-After header) |
| 500 | engine_error |

Current limits: the 64 KiB body check only checks declared Content-Length; a
streamed/underdeclared body is not bounded before JSON parsing. The provisional
in-memory limiter allows a burst of 12 and refills 12/minute, keyed by untrusted
proxy headers. There is no authentication yet. These are documented security
limitations, not release-ready controls; issue #5 adds identity and shared limits.

## Client orchestration

`src/store/useRailPlanStore.ts` owns the requested-plan, conflict-review and
optimized-schedule workflow. It invokes the engine rather than selecting saved
schedule variants. Repairs change submitted placements and revalidate. Strategy
changes, pins, alternatives and replanning recalculate results and metrics.
`railplan-preferences` stores `strategy` and exact `locked` placements.

## Database tooling (not public HTTP endpoints)

`loadPlanningInstance(sql, planningNight)` returns canonical `PlanningInstance` or
throws for an unavailable database, missing schema/night or query error.
`npm run db:verify` fails on unavailable, unseeded or mismatched content.
`npm run test:db` requires this verification before integration tests. Ordinary
`npm test` explicitly skips database tests only if the connectivity probe fails;
a reachable database with missing tables or wrong data fails.

There are no request, plan, publication, ingestion, notification or export routes
yet. Issues #5–#21 define their ordered implementation and authorization gates.
