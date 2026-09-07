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
| 404 | not_found |
| 409 | stale_plan, invalid_plan |

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

Structured intake routes are documented below. Ingestion, notification and export routes remain gated by their numbered issues.

## Durable plans — issue #6

All routes verify the Supabase identity and trusted planner role before processing
input. Contractors receive 403 without plan data. Shared Zod contracts live in
`src/lib/plans/schemas.ts`; shared output types live in `@railplan/core/types/plans`.
POST requests require `application/json`, compare Origin to the actual Host
authority and Next-derived request scheme (including the port), and enforce
the streamed 64 KiB body limit. A proxy must preserve Host; untrusted
`x-forwarded-host` is not an origin allow-list. Malformed/opaque origins fail
closed. Non-browser clients may omit Origin. Unknown
properties are rejected, including caller-supplied results/creator/status.

| Route | Request | Success |
| --- | --- | --- |
| POST /api/plans | `{planningNight, strategy?, locked?}` | 201 `{plan: PlanVersion}` |
| GET /api/plans?planningNight=YYYY-MM-DD | Valid planning night | 200 `{plans: PlanVersion[]}`, latest 20 |
| GET /api/plans/:id | UUID | 200 `{plan: PlanVersion}` |
| POST /api/plans/:id/publish | `{}` | 200 `{plan: PlanVersion}` |
| POST /api/plans/:id/decisions | `{kind: "note" \| "accept" \| "reject", reason}` | 201 `{decision: PlannerDecision}` |

Dates must be valid ISO dates within 2000–2100. Strategy is one of the same five
engine IDs and defaults to balanced. Pins default to empty and are capped at 100;
IDs/team IDs are bounded to 64 characters, start minutes 0–1440 and ends 1–2880.
Runtime checks enforce the selected night's unique request IDs, assigned teams,
exact duration and actual request/night window. Synchronous generation is limited
to 100 requests, a 1,440-minute window and slots of at least five minutes.

The server loads a consistent database snapshot, computes and independently
validates the output, then stores it. `PlanVersion.validation` contains
`independentlyValidated` and the exact violations; `objectives` is the engine's
label/value/unit array, and `metrics` retains every formula/numerator/denominator.
It includes placements, deferrals and provenance plus `publishState` (draft,
published or superseded), `publishedAt` and `supersededBy`. Successful reads are
private application data with `Cache-Control: no-store`.

A missing night/version returns not_found 404. Stale drafts return stale_plan 409
and keep an authenticated rejection audit. Publication revalidates saved data,
requires current source, matching engine versions and all mandatory work, and
returns invalid_plan 409 otherwise. Repeating publication of an already published
or superseded version is idempotent and returns its existing state. Decisions are
append-only review records, not an intake approval lifecycle or edits to a plan.
`/plans` provides save/list/reload/decision/publish UI; local exploratory dashboard
generations are distinct and broader workflow integration remains #16.

## Workforce input schemas — issue #7

`src/lib/http/workforce-schemas.ts` exports strict reusable role, availability and
demand schemas plus `workforceInputSchema(trustedInstance)` for a bounded selected-
night replacement payload `{availability, demand}`. Each array is capped at 1,000
rows. IDs are trimmed 1–64 characters; role names 1–120. Supply counts are integer
0–10,000, demand counts 1–10,000. Start minutes are 0–1,440 and ends 1–2,880, with
end strictly after start; the trusted instance further restricts both to the actual
night. Unknown properties, including named-person fields, are rejected.

Instance-aware validation rejects unknown request/team/role IDs, cross-night
supply, duplicate request/role demands and overlapping same-team/role supply.
A writer must load the trusted role/team/request catalogs; client catalogs cannot
be used as reference authority. These are schemas for subsequent write workflows,
not new HTTP management or request-intake routes. Plan generation continues to
accept parameters only and reads workforce inputs from the database. Workforce
feasibility enforcement follows #8.

## Workforce enforcement — issue #8

Saved plan generation and publication use constraints-v3 and the shared
WORKFORCE_CAPACITY rule. Explicit demand is required for every placed request;
missing supply is zero and missing demand is unknown, never assumed zero. A
fresh run with unstaffed mandatory work is INFEASIBLE and cannot publish.
Workforce metrics retain the existing MetricValue shape; violations optionally
carry structured team/role/demand/available/shortfall evidence. Null headcounts
mean an unknown demand definition. No workforce write API is introduced here.

## Structured intake — issue #9

All intake routes verify the Supabase identity and assigned profile. Contractor
reads/writes are restricted to their organisation; planner decisions additionally
use `requireAction(..., "approve")`. Every mutation uses same-origin JSON and the
streamed 64 KiB limit. All objects are strict: caller identity, organisation,
status, approval result or saved-plan output are never accepted as fields.

| Route | Input | Success |
| --- | --- | --- |
| GET /api/requests/catalogue | None | `{catalogue: RequestCatalogue}` |
| GET /api/requests | None | `{requests: RequestSubmission[]}`, latest 100 scoped records |
| POST /api/requests | `{fields: RequestFields}` | 201 `{request}`; contractor organisation derived server-side |
| GET /api/requests/:id | UUID | `{request}` including immutable revisions and status history |
| PATCH /api/requests/:id | `{expectedVersion, fields}` | `{request}`; draft or needs_info only |
| POST /api/requests/:id/actions | `{expectedVersion, action, reason, approval?}` | `{request}` |

Actions: submit (draft/needs_info), revise (approved/rejected/cancelled), cancel
(any non-cancelled state), needs_info/approve/reject (planner, submitted only).
Approval requires the complete `RequestApproval` object. Reason is required for
cancel/needs_info/approve/reject, at most 2,000 characters. Other actions reject
approval fields. Draft title/description/blocks/workforce may be empty; submit
requires all four. IDs are at most 64 characters, title 160, description 4,000,
arrays at most 100, integer workforce counts 1–10,000, integer equipment units
1–10,000 further limited to actual capacity. Duration is 1–1,440 minutes; times
must fit the selected database night's window and preferred work must fit its
permitted interval. Duplicate references are rejected. Sector display derives
from selected atomic blocks.

Responses are `Cache-Control: no-store` with x-request-id. Errors add
`error.fieldErrors: Record<string,string>` to the shared code/message/requestId
shape. Field names are e.g. title, equipment.0.units, workforce.0.count or
approval.teamId. Invalid fields return invalid_request 400; stale expectedVersion
returns conflict 409; unavailable actions return invalid_transition 409; foreign
organisation UUIDs return not_found 404. Anonymous/unassigned/planner-action
failures return 401/403; auth unavailability returns 503 without processing input.
Catalogue teams and dependency options are returned to planners only. `scheduled`
contains only the scoped request's current published planId, revision and times.

## Transcript extraction — issue #10

| Route | Input | Success |
| --- | --- | --- |
| POST /api/ingestions/transcript | Raw `text/plain` UTF-8 transcript, at most 65,536 actual bytes | 201 `{drafts: PrivateDraft[]}` |
| GET /api/ingestions/drafts | None | `{drafts: PrivateDraft[]}`, latest 100 owned drafts |

Both routes authenticate an assigned profile first and return no-store responses
with x-request-id. POST checks the same Origin/Host rule as other mutations before
reading input. `text/plain` accepts optional UTF-8 charset, rejects other encodings,
uses a fatal decoder and rejects empty/whitespace-only text and NUL bytes. `.txt`
uploads use the same raw body after client-side UTF-8 checks; the server checks
actual bytes again, including dishonest Content-Length or streamed input.

The POST explicitly requests extraction **and saving private drafts with excerpts**.
Unknown proposal fields stay null; `missingFields` identifies them. Confidence is a
per-field model estimate, not a safety or accuracy guarantee. `DraftEvidence`
contains `{field, quote, start, end, timestamp}` with exact source offsets computed
by the server. Internal priority, team, role/owner, approval and schedule fields
are absent from the accepted output schema. No transcript is submitted as a
request or added to planning inputs. Private editing/submission follows #11.

Errors have `{error:{code,message,requestId}}`. Input errors are
payload_too_large 413, invalid_encoding/empty_transcript/invalid_request 400;
model_refused/invalid_evidence/no_proposals 422; invalid_model_output 502;
model_timeout 504; model_unavailable/storage_unavailable 503. Existing identity
errors remain 401/403/503. Quota returns rate_limited 429 with Retry-After seconds.
Storage ambiguity asks the owner to reload private drafts before retrying.
A missing model key returns 503 and does not affect structured manual intake.
Provider timeout is 12 seconds with zero retries. No sensitive source, evidence,
provider output or upstream error body is included in logs or error responses.
