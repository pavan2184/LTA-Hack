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
| 401 | unauthenticated |
| 403 | forbidden |
| 503 | auth_unavailable |
| 400 | malformed_request, invalid_request |
| 413 | payload_too_large |
| 429 | rate_limited (also Retry-After header) |
| 500 | engine_error |

Authentication precedes input processing: the Supabase Auth server verifies the
cookie identity, then the trusted profile must be `planner`. User-supplied role,
organisation and proxy headers cannot grant access or select a quota identity.
Missing configuration or unavailable authorization storage returns typed 503.

The body is read as a stream with a hard 64 KiB actual-byte limit, including
chunked requests or dishonest Content-Length. The shared Postgres token bucket
permits a burst of 12 and refills 12/minute, keyed by verified user ID. Quota
failure is closed; it never falls back to an in-memory/IP-based allowance.

## Workspace authentication

`/login` posts email/password through a Next.js Server Action to Supabase
`signInWithPassword`. No signup/invitation, role selection or default account is
created by the app. Generic errors avoid account enumeration. Sign out is a
Server Action; Next.js validates Server Action origins. Session refresh uses the
proxy cookie adapter. `/` redirects anonymous users to login, contractors to
`/contractor`, and shows unassigned accounts an access-pending screen. Only a
verified planner receives the existing planning dashboard.

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
yet. Issues #6–#21 define their ordered implementation and authorization gates.
