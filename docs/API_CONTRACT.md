# API Contract

## PS1 search options — 2026-09-19

`ScheduleOptions` now accepts `initialCandidates` (always revalidated for the
target scenario, pins and disruptions), `searchMode: "hybrid" | "legacy"`,
`optimizationBudget.seed` and optional cooperative `maxTimeMs`. The default
neighbour budget is 256 shared by shift, window and adaptive repair trials,
with an explicit maximum of 2,500. The 24 initial construction starts and extra
nominal-capacity starts are counted separately from that neighbour budget.
Construction options include `nominalCapacity`, per-line `ecloWindows` start
weeks and `activityOrder`. The worker protocol and official CSV schemas are
unchanged. `INFEASIBLE` means search exhaustion, not a mathematical proof.

## Public PS1 client interfaces — 2026-09-18

No HTTP route or environment variable was added. `solveInstance(instance,
options)` returns a `SolveOutcome`; options carry scenario, hard pins, capacity
disruptions and a bounded deterministic optimisation budget. The default runs 24
construction starts and by default 256 reconstruction neighbours inside
`horizon_weeks`. An infeasible result may include a diagnostic partial submission,
but the UI cannot export it.

The worker message contains only the parsed instance and local solve options. It
emits per-scenario progress followed by three outcomes, or a sanitized error. CSV
uploads are limited to 5 MB per file and approximately 50,000 total records.
Official CSV headers, column order and the A/B/C nine-file ZIP contract are
unchanged. `PS1_PLANNING_LOG.json` is a separate optional artifact.

## Requested-time conflict review — 2026-09-15

The existing planner-only `POST /api/plans/:id/analysis` additionally accepts:

- `{ operation: "conflicts", strategy, locked? }`: grouped requested-time findings,
  with current pins applied, plus observed source freshness. This is not the saved
  schedule's remaining validation result.
- `{ operation: "repair", strategy, locked?, violationId }`: recomputes the finding
  and recommendation from exact saved facts and returns the existing `preview`
  response with parameters and basis. It accepts no proposed result or resolution.
  Missing/unrepairable findings, stale/superseded/engine-mismatched bases and
  infeasible full-plan repairs fail closed. Nothing is saved or published.

Existing workload bounds, strict parameter validation and role gates apply.

## Reviewed carry-forward — 2026-09-15

`POST /api/deferred-work/:id/actions` accepts the strict planner-only action
`prepare-carry-forward` with `expectedVersion`, configured `targetNight`, UUID
`idempotencyKey`, and `organisationId` only when explicit seeded ownership is
needed. Success is `{requestId}` for an ordinary draft, not an approval. A target
must be strictly later than the currently active source night; historical dates
are supported. Client owner/actor fields and unrecognised keys are rejected.

Scoped request detail may add `carryForward: {workItemId,sourceNight,targetNight}`.
Only planners receive `requiresReview`, `expectedWorkVersion`, original fields and
dependencies, and exact `{planId,submissionRevision}` publication (null revision for
seeded work). Contractor backlog DTOs do not include `activeNight`; planner detail
uses it to offer only later carry-forward/proposed targets.

Initial target approval additionally requires `carryForward` with the displayed
`expectedWorkVersion`, `dependenciesReviewed:true` and, when applicable, the exact
publication object explicitly confirmed by the planner. Context on non-approval
actions is invalid. Normal safety/skills/windows/dependencies remain mandatory,
and active inbound dependencies prevent source retirement. Stale source/item/
publication is a conflict. A same-submission night change is rejected with guidance
to use reviewed carry-forward. Latest cancelled same-night restoration uses normal
intake review; retired earlier work cannot reactivate through direct SQL retries.

## Deferred work — 2026-09-15

All routes use verified identity/trusted profiles and no-store responses. Mutations
require same-origin, strict bounded JSON with the shared 64 KiB stream limit.

| Route | Input | Success |
| --- | --- | --- |
| GET /api/deferred-work | Optional ownerId, planningNight, state, overdue, repeated, missingDue, cursor, limit 1–50 | `{items,nextCursor,today,nights,owners?}` |
| POST /api/deferred-work | `{planId,requestId,reason,idempotencyKey}` | 201 `{workItem}` |
| GET /api/deferred-work/:id | Exact work UUID | `{workItem}` |
| POST /api/deferred-work/:id/actions | Strict command plus expectedVersion | `{workItem}` |

Filters use `true|false` strings and state `open|scheduled|completed|cancelled`.
Night matches source, proposed, occurrence or linked-submission night. Results sort
by descending UUID; cursor is the last returned UUID. Query length is at most 2048
characters; duplicate and unknown keys are rejected. Catalogue returns at most 100
configured nights and 100 trusted planner owners; owner filter/catalogue is planner
only. `today` is the database-observed SGT calendar date.

Planner commands: `update` accepts at least one of ownerId (UUID|null), dueDate
(ISO date|null), priority or repeatThreshold (1–100). `propose-night` requires a
configured planningNight and note. `complete`, `cancel`, `reopen` and `escalate`
require note. All notes/reasons are trimmed, nonempty and bounded to 1000 characters.
Metadata priority/deadline/threshold is tracking policy, not a solver constraint.

Planner detail includes saved source-plan link, owner, version and latest 100 audit
events plus historyTruncated and linked submissions. Contractor SQL DTOs omit those
fields and contain own work state, dates, priority, counts and flags only. Operator
items and foreign organisations return not_found. No caller-supplied identity,
organisation, result, count or state is accepted. Reusing a record key/body returns
the same durable item; changed reuse or stale versions returns conflict 409 with
reload guidance. invalid_request400, forbidden403, not_found404 and sanitized
engine_error500 use the shared error/code/message/requestId envelope.

## Coordination — 2026-09-15

All routes verify the Supabase identity and trusted profile. Mutations retain
same-origin JSON, strict schemas and the 64 KiB streamed limit. Responses are
no-store; errors include code/message/requestId without database exceptions.

| Route | Input | Success |
| --- | --- | --- |
| GET /api/coordination | Optional planningNight, state=open\|closed, ownerId, overdue=true\|false, pending=true\|false, appliedPlanId, cursor, limit=1–50 | `{cases,nextCursor,owners?}` |
| POST /api/coordination | `{sourcePlanId,selectedRequestIds,idempotencyKey,parameters:{planningNight,strategy,locked},deadline?}` | 201 `{case}` |
| GET /api/coordination/:id | Exact case UUID | `{case}` with planner/contractor scope |
| POST /api/coordination/:id/actions | Strict command with expectedVersion | `{case,appliedPlanId?}` |

Owner/appliedPlanId filters and creation are planner-only. Owners contains at most
100 trusted planner `{id,isCurrentUser}` options, never invented display names.
Cases order by descending UUID, with the last UUID as cursor. Contractor lists
and guessed exact IDs enforce organisation scope; an unrelated case is 404.

Commands all require expectedVersion: `apply` requires revision/idempotencyKey;
`approve` requires revision/organisationId/confirmedAt/note; `request-changes`
requires revision/note and derives organisation from the contractor profile;
`revise` requires a fresh same-night sourcePlanId and parameters; `assign` requires
ownerId; `deadline` accepts timestamp|null; `escalate`, `close`, `reopen`, `withdraw`
require a note. Notes are bounded to 1000 characters. Actor, participant and
computed-output fields are never accepted. Approve is a planner-recorded external
confirmation, separate from intake approval. Confirmation may remain pending or
changes-requested when Apply or publication succeeds.

`currentRevision` is latest; `viewedRevision` identifies returned evidence.
appliedPlanId filtering projects the linked historical revision and its statuses.
Contractors receive own changes/status/time and own change-request note only;
their deferral prose is reduced to “Deferred” to exclude other request details.
Planner proposals include source provenance, parameters, validated result,
request-revision map, digests, stale/state and exact applied-plan links.

Identical creation key/body returns the existing case. Exact Apply key/revision/
original expectedVersion/actor replays the linked plan even after later revisions;
changed replay parameters conflict. Concurrent differing Apply keys cannot create
two plans for one revision. Revision resets only new confirmation snapshots.
Typed domain failures: invalid_request400, forbidden403, not_found404,
conflict/stale_plan/invalid_plan409; shared identity failures401/403/503 and
sanitized internal500 remain. Stale Apply requires a fresh saved source and
reviewed proposal. Apply never publishes or sends provider messages itself.

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
After authentication, Origin must match the actual request scheme/Host/port and
Content-Type must be application/json before assistant quota or model work.
Non-browser clients may omit Origin; opaque/cross-origin values are denied.
Logs contain fixed events, counts and bounded numeric usage only; SDK debug logging
is disabled, and provider errors/questions/model tokens are never serialized.

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
`/contractor`, and shows unassigned accounts an access-pending screen. Verified planners land at `/plans`; `/requests` and `/sandbox` remain planner-only.

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

Structured intake, ingestion, notification and saved-export routes are documented below.

## Durable plans — issue #6

### Connected night workspace — 2026-09-14

`GET /api/plans/overview?planningNight=YYYY-MM-DD&cursor=…` returns
`{overview: PlannerOverview}`. Both query fields are optional; the default is the
latest configured night. The response includes configured night windows, the
current source revision, an exact count of current submitted revisions for the
selected night, the current publication independently of pagination, 20 version
summaries and an opaque `nextCursor` (or null). It never loads all historical
facts or request revision histories. Cursor ordering preserves database timestamp
precision and UUID ties. Unknown, duplicate, oversized or cross-night query/cursor
fields are rejected.

`POST /api/plans/:id/analysis` accepts a strict discriminated request:

- `{operation: "inspect", requestId, strategy?, locked?}`: without parameters,
  inspect the exact saved placements; supplied parameters inspect a server-solved
  preview. Returns the explanation, blockers and validated alternative slots.
- `{operation: "preview", strategy, locked?}`: independently validated server
  result using that saved version's facts and supplied or saved pins.
- `{operation: "compare-objectives", locked?}`: five previews from identical
  saved facts and pins, one per objective.

Analysis responses are direct `PlanAnalysis` objects, not `{plan}` envelopes.
Each preview carries `result`, `parameters`, `basis`, `stale` and
`currentSourceRevision`. The basis contains plan ID, source revision, current
solver/constraint versions and the SHA-256 digest of the preview facts and
normalized parameters. Inspection without parameters retains historical result
versions. Currentness remains a separate observation, not a rewrite of saved facts.

`POST /api/plans` additionally accepts optional `expectedBasis`. Guarded generation
re-solves current facts and refuses a different night, source, engine or parameter
digest with 409 `stale_plan`. The guard is never persisted in parameters or included
in their digest. Optional `basedOnPlanId` accepts a UUID for upstream revision
callers; preview saves infer it from `expectedBasis.planId`. If both are supplied
they must agree. Under the source lock, the base must match the night, current
source and engine versions, not be superseded, and retain valid saved/current-fact
digests. The base ID is persisted in parameters and exported as lineage, but does
not alter the solver input digest. Existing callers remain compatible. Analysis has the same planner
authentication, RLS, same-origin JSON, 64 KiB body and bounded synchronous workload
as generation. It never calls the source mutation lock, stores a run, advances a
revision/generation, publishes or sends messages. No migration is required.

`GET /api/requests?planningNight=YYYY-MM-DD` optionally filters the current revision
by night **before** the existing 100-record limit. Default all-night and contractor
organisation scope are unchanged. `/requests?planningNight=…` uses this filter.

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
| POST /api/plans | `{planningNight, strategy?, locked?, basedOnPlanId?}` | 201 `{plan: PlanVersion}` |
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

`basedOnPlanId` is an optional UUID identifying the saved version a planner reviewed.
Under the same source lock used for generation/publication, the server requires
its night, source revision, engine versions and input digests to match current
facts, and rejects superseded bases with `stale_plan` 409. A missing base returns
404. The server recomputes from current approved facts and the requested pins;
it never accepts client preview results. Successful revisions create a new draft,
retain the base ID in immutable parameters/JSON export, and leave the base untouched.
Callers omitting the field retain normal fresh-generation behavior.

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
generations stay distinct at `/sandbox`; #16 links role workspaces and saved visual review.

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
feasibility enforcement is described in #8 below.

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
| POST /api/requests | `{fields: RequestFields, organisationId?: UUID}` | 201 `{request}`; planners must choose an existing organisation; contractors must omit organisationId (derived server-side). Always creates a draft, never approval. |
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
request or added to planning inputs. Private editing/submission is explicit through the #11 routes below.

Errors have `{error:{code,message,requestId}}`. Input errors are
payload_too_large 413, invalid_encoding/empty_transcript/invalid_request 400;
model_refused/invalid_evidence/no_proposals 422; invalid_model_output 502;
model_timeout 504; model_unavailable/storage_unavailable 503. Existing identity
errors remain 401/403/503. Quota returns rate_limited 429 with Retry-After seconds.
Storage ambiguity asks the owner to reload private drafts before retrying.
A missing model key returns 503 and does not affect structured manual intake.
Provider timeout is 12 seconds with zero retries. No sensitive source, evidence,
provider output or upstream error body is included in logs or error responses.

## Owner draft editing, explicit submission and unified review — issue #11

| Route | Input | Success |
| --- | --- | --- |
| GET /api/ingestions/drafts/:id | UUID | `{draft: PrivateDraftDetail}` owned detail/history |
| PATCH /api/ingestions/drafts/:id | `{expectedVersion, fields: NullableRequestFields, reason}` | `{draft: PrivateDraftDetail}` |
| POST /api/ingestions/drafts/:id/submit | `{expectedVersion, reason, organisationId?}` | `{draft: PrivateDraftDetail, request: RequestSubmission}` |

All use verified identity, bounded strict same-origin JSON and no-store responses.
Reason is trimmed nonempty, at most 2,000 characters; expectedVersion is positive
and bounded to a PostgreSQL integer. Edit requests cannot contain evidence,
confidence, manualFields, lifecycle state or ownership. Unknown fields stay null;
blank title/description normalize to null. Validation rejects invalid supplied
references/counts/windows, and detail validationErrors names incomplete fields.

Only the exact owner may edit or submit private status. Contractor submit rejects
caller organisationId and derives the trusted profile organisation; if that differs
from the draft's original nonnull organisation, submission is forbidden. A planner
owner must select a known organisation from the planner-only catalogue's
organisations array. Submitting deliberately shares fields, retained evidence and
revision history. One expectedVersion check, unique link and transaction prevent
partial or duplicate submission. Later edits use the structured request workflow.

Review mutations use the existing request error envelope, including fieldErrors:
invalid_request 400, forbidden 403, not_found 404 for another owner's draft, and
conflict/invalid_transition 409. Private histories stop at 100 revisions with a
field-level error. Request detail includes proposalSource (or null for a manual
request); request lists may omit it. That snapshot remains immutable across later
needs_info edits, approval, rejection, cancellation or replacement. Existing
/api/requests/:id/actions supplies all planner decisions and rejects incomplete
approval. Rejected-to-draft reversal and every cancellation invalidate old plan
source attestations, in addition to approval and approved replacement.

## Telegram publication notifications — issue #14

All configuration, delivery and retry routes verify an assigned **planner** before
processing input. Contractors receive 403; no whole-plan or notification data is
exposed through these routes. Mutations require the shared same-origin JSON and
streamed 64 KiB bound. IDs are UUIDs; unknown fields are rejected. All responses
are `Cache-Control: no-store` and carry `x-request-id`.

| Route | Input | Success |
| --- | --- | --- |
| GET /api/notifications/configurations | None | `{configurations: NotificationConfiguration[], botConfigured: boolean}` |
| PUT /api/notifications/configurations/:organisationId | `{expectedVersion, chatId: string \| null}` | `{configuration}` |
| POST /api/notifications/configurations/:organisationId/test | `{expectedVersion}` | `{delivery: NotificationDelivery}` |
| GET /api/plans/:id/notifications | None | `{deliveries: NotificationDelivery[]}` |
| POST /api/notifications/:id/retry | `{acknowledgeDuplicateRisk?: boolean}` | `{delivery}` |

`expectedVersion` is a nonnegative PostgreSQL integer: zero means not configured.
A chat ID is a canonical nonzero signed integer string with at most 52 significant
bits; channel names, zero, fractional values and leading zeroes are rejected.
Null deliberately disables the destination. The token is the server-only
`TELEGRAM_BOT_TOKEN`; it is never a configuration field. The configuration response
includes organisation ID/name, saved chat/version, actor/time and `lastTest` for
**that configuration version** only. A test is deduplicated by organisation and
configuration version; retry its failed delivery explicitly rather than creating
repeated tests for the same version. The test uses a fixed prototype message.

Publication still returns `{plan}`, now with `notificationsWarning: string | null`.
An atomic database trigger queues one deterministic message per affected
organisation, comparing its owned approved request revisions/placements against
the previous publication for the same night. It includes added, changed, removed
and deferred work; unrelated organisations and the unowned operator-seeded baseline
receive no message. Messages include the exact version UUID, night, request IDs,
time/deferral/removal, sector and prototype disclaimer. Raw transcripts and private
proposal evidence are never included.

External sending starts **after publication commits**. Up to eight sends run at
once; no new send starts after the initial 16-second budget. Unstarted deliveries
remain pending for explicit action. This is a bounded initial delivery pass, not a
background scheduler. Each Telegram transport has an eight-second timeout and no
automatic retries. Messages over 4096 UTF-16 code units become failed
`invalid_message`; they are not silently truncated or split. Ordinary provider
failure is a 200 delivery response with `status: failed`. A notification storage
failure after publication returns the published plan plus a sanitized warning;
it cannot undo or misreport publication.

Delivery records expose `pending | sent | failed`, exact message text/deduplication
key, organisation/plan/night/kind, attempt count, Telegram message ID, creation,
last-attempt and sent timestamps, sanitized error code/message, `nextRetryAt`,
`ambiguous`, `inFlight`, and append-only attempt history. Each attempt records its
actor, trusted saved destination and start/result timestamps. Any recorded success
permanently prevents resend. An unfinished claim becomes visibly unknown after
60 seconds. Unknown/ambiguous outcomes require explicit duplicate-risk
acknowledgement before retry; the UI must ask the planner to check the destination.
Unsent notifications for superseded plans cannot be dispatched. New retry claims
use current saved configuration, never a caller-supplied recipient.

Errors use `{error:{code,message,requestId}}`: invalid_request 400, not_found 404,
conflict/duplicate_risk/delivery_in_progress/retry_later/attempt_limit/
configuration_changed/superseded_plan 409, storage_unavailable 503, plus shared
identity/body errors. The delivery's provider failure codes are missing_chat,
missing_credentials, invalid_chat, invalid_message, rejected, rate_limited,
unavailable and ambiguous. Provider descriptions, token-bearing URLs and raw
exceptions never enter responses, audit rows or logs. A rate-limited attempt
retains the bounded provider retry delay and rejects an early explicit retry.

## Saved plan export — issue #15

`GET /api/plans/:id/export?format=json|csv` returns a file for one durable saved
version. It authenticates the Supabase identity and trusted planner role before
reading the UUID or query. Contractors cannot export global plan contents and
receive 403. The UUID is normalized to lowercase; the query must contain exactly
one `format`, either `json` or `csv`, with no unknown parameters and at most 128
characters of encoded query. There is no implicit format or exploratory-store
export path.

Success headers:

- `Content-Disposition: attachment; filename="railplan-<lowercase UUID>.json"`
  (or `.csv`); no user text enters the filename.
- `Content-Type: application/json; charset=utf-8` or `text/csv; charset=utf-8`.
- `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and
  `x-request-id`. Error responses retain the private/no-store/no-sniff boundary.

Errors retain `{error:{code,message,requestId}}`: identity 401/403/503,
invalid_request 400, not_found 404, invalid_plan 409 for incomplete saved
references, and a sanitized engine_error 500 for unavailable export storage.
No database exception, private row or connection string is included in errors.

The version-1 JSON document begins with `exportVersion`, `notice` and `assessment`,
so non-operational, draft, stale, infeasible and superseded warnings precede the
large saved payload. Assessment includes `publicationState`, `sourceFreshness`,
`currentSourceRevision`, `engineVersionMatch`, `stale`, `publishedAt`,
`supersededBy`, `nonOperational: true` and warnings. Current source/engine/publication
state is a **separate observation**, not a rewrite or revalidation of saved results.
A current source revision does not certify railway feasibility or safety.

`provenance` contains the exact saved plan ID/night/input digest/source revision,
solver/constraint versions, strategy/status/independent result, `generatedAt`,
creator, `solveMs` and candidate count. Remaining sections are saved `parameters`,
`placements`, `deferrals`, every metric and objective, saved independent validation
and violations, and the complete saved planning `facts`. Placement/deferral labels
(title, sector, blocks, submission revision) come exclusively from those saved
facts. No solver, validator, current-fact loader or browser store is rerun.

CSV uses CRLF records, UTF-8 text and this stable column order:

`record_type,record_id,field,value,unit,request_id,title,sector,team_id,start_minute,end_minute,details_json`

Record types are metadata, parameters, placement, deferral, metric, objective,
validation and facts. Metadata begins with the prototype notice, then assessment
and provenance. Placement/deferral rows include saved labels and exact minutes or
reason; `details_json` retains the complete record. Every metric includes its
value/unit and full formula/numerator/denominator details. Objective vector order
and saved placement/deferral/violation array order are preserved; metric keys and
nested JSON object keys sort lexically. Full saved facts and parameters are JSON
cells. JSON top-level section order is fixed by the export builder. There is no
volatile `exportedAt`: unchanged saved content and unchanged state observations
produce the same bytes, including generation time from storage.

Every CSV cell is quoted; embedded quotes double, and commas/newlines/Unicode are
retained. String cells that expose `=`, `+`, `-`, `@` or their full-width variants
after leading whitespace, control characters or BOM receive a leading apostrophe.
Numeric negative values remain numeric text. CSV deliberately changes hazardous
string cells for spreadsheet use; **JSON is the exact machine-readable format**.
Spreadsheet import, save and reopen behavior varies and may remove escapes; this
is not a universal guarantee across every spreadsheet program or later edit.
