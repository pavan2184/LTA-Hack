# Ordered GitHub issues implementation plan

**Goal:** Resolve GitHub issues #4–#21 in numeric order, satisfying each dependency before starting its consumers.

**Architecture:** Retain the shared TypeScript validator as the authority. Establish local Postgres parity, then add identity, durable plans, anonymous workforce constraints, request review, and product integrations on that foundation. Keep fabricated data and non-operational labels throughout.

**Spec:** https://github.com/pavan2184/LTA-Hack/issues (issue bodies and acceptance criteria, retrieved 2026-09-07).

## Execution gates

- [x] #4: Verify local reset/seed/load, diagnose mismatches by section, test available/unavailable database behavior, synchronize v0.4 contracts and versions. Files: `scripts/db/`, `src/lib/db/`, `src/test/instance.test.ts`, `supabase/config.toml`, package manifests, required project documents. Verify with database commands, tests, lint, typecheck, build.
- [x] #5: Supabase sessions, planner/contractor authorization, RLS matrix and shared token bucket; security review.
- [x] #6: Immutable saved plan versions, audited decisions, current-source publication gate.
- [x] #7: Anonymous workforce types, schema, loading, seeds and canonical digests.
- [x] #8: Workforce capacity validator, solver enforcement and calculated metrics.
- [x] #9: Validated contractor submission lifecycle and immutable approved revisions.
- [x] #10: Private transcript proposals with exact evidence and bounded model access.
- [x] #11: Planner review, approval and source revision invalidation.
- [x] #12: Accessible workforce demand/capacity visualization from engine data.
- [x] #13: Validated, attributed local geographic snapshot, separate from safety topology. Publication remains blocked by conflicting source licence notices.
- [x] #14: Publication notification outbox, scoped Telegram delivery and explicit retry status. Live provider success unverified without configured/authorized destination.
- [x] #15: Authorized saved-plan JSON/CSV exports with formula neutralization.
- [ ] #16: Complete role journeys and accessible adjustable dashboard.
- [ ] #17: Release security, accessibility, responsive and end-to-end verification.
- [ ] #18: Consented audio capture/transcription through the existing review boundary.
- [ ] #19: Explicit provider imports with least privilege and provenance.
- [ ] #20: Reproducible CP-SAT benchmark; retain production heuristic pending evidence.
- [ ] #21: Document crew-identity go/no-go; no named-worker implementation before the dedicated decision.

Each implementation gets tests for its behavior, a project-status update, and a security review where the issue touches identity, personal data, LLMs or external delivery. Unmet prerequisites remain explicit; do not claim or close an issue whose acceptance checks have not run successfully.

## #4 findings before changes

- Clean working tree on `main`; working branch `codex/ordered-issues`.
- No root `progress.md` existed.
- Docker was stopped. Starting it restored an unrelated `NRI_Land` stack using ports 54321/54322/54324.
- The existing database tests then failed with missing `planning_nights`, proving they reached the unrelated database. RailPlan needs dedicated local ports; do not stop or reset the other project's containers.
- Global CLI 2.31.4 is outdated and unpinned. Pin a project CLI for reproducible clone setup.
- SQL orders work-class enum pairs by enum declaration order, whereas TypeScript orders them lexically. Verify/fix the constraint via a migration and real inserts.
- The test connection is not closed after a successful suite; add bounded teardown. Add a strict database command that fails instead of skipping when required infrastructure is absent.

## Owner correction — 2026-09-07

No Docker. The local-Supabase reset requirement is superseded. Select a dedicated
hosted Supabase or native PostgreSQL target and verify the equivalent migration,
seed and read-back flow before advancing beyond #4. Image downloads stopped after
disk exhaustion; no unrelated database may be reset or seeded.

## Verification checkpoint

186 tests passed; 3 database integration tests explicitly skipped. Lint, typecheck,
production build and diff whitespace checks passed. The strict db:verify command
failed as expected with no database. #4 is incomplete pending a dedicated
Docker-free database target and real migration/seed/parity verification. #5–#21
remain untouched in order. No issue has been closed or deployment performed.

## Hosted baseline completed

Project ufcdynfjfzbjvglsdaqp (RailPlan Dev, pavan2184's Org, Singapore) is healthy.
Both migrations applied on a fresh hosted database; replay is idempotent.
Seed and database digest match fnv1a:fef0c4904e890f43 for 22 requests. Full suite:
191 passed, no skips; lint/typecheck/build passed. Review required detection of
deleted applied migrations; fixed with three regression tests. Follow-up suite
17 passed with live database parity and migration replay; re-review clean.
#4 is complete under the owner's no-Docker direction. #5 is next.

## Hosted authentication completed

#5: 220 tests pass without skips, including live rollback RLS/quota checks.
Lint/typecheck/build pass; independent review clean after the Auth outage fix.
Real production login/session/workspace/logout HTTP journeys pass for temporary
planner, contractor and unassigned users. Anonymous and role API gates pass.
Browser login/error rendering passes; exact-ID hosted fixture cleanup completed.
Optional local Auth seed refuses hosted targets and remains unrun without local
Auth, consistent with the no-Docker direction. #6 is next.

## #6 implementation design

Keep immutable plan facts/results, normalized placements and deferrals in the
private schema, with planner-only RLS reads. Narrow private write functions derive
audit actors from verified claims. Separate append-only publication links preserve
the original run while identifying supersession. A conservative global source
revision is locked before fact changes and publishing, so shared resource and
request changes invalidate old drafts without racing publication. The API computes
and independently validates from a consistent hosted snapshot; client plan output
is never accepted. Stale rejection is a committed audit result before HTTP 409.

A dedicated planner `/plans` journey generates saved versions, lists recent
versions by night, reopens placements/deferrals/calculations/provenance, records a
review decision and publishes. Existing local disruption scenarios remain
exploratory until the broader product integration in #16. No contractor whole-plan
read is enabled before scoped contractor publication work exists.

Verification: unit schema/digest/pin tests, real rollback persistence/RLS/source/
publication tests, typed route failures, component behavior, build, independent
security review, and hosted migration replay. Verify generated -> reload -> review
-> publish, stale rejection, supersession and immutable history before completion.

## #6 completed

245 tests passed, zero skips; lint/typecheck/build passed. Required DB tests26
plus isolated concurrency1 passed. Migration replay and 22-request parity passed.
Independent reviews resolved publication concurrency, UI stale state and Next.js
Host/Origin normalization. Production browser save/reload/review/stale rejection/
publish/supersede/logout passed; committed audits independently matched actions.
Exact-ID UAT cleanup restored all six history guards. Preview server stopped.
#7 is next.

## #7 implementation design

Add anonymous configurable roles, per-night/team/role availability windows and
per-request role headcounts to the canonical PlanningInstance. Supply windows
are half-open, non-overlapping per team/role/night, and bounded by the actual
night. Zero supply is explicit; demand counts are positive integers. Demand
references a known request and role. Parent night changes must preserve window
bounds. Team.capacity continues to count concurrent crews; role supply is
explicit fabricated data, independent of that crew count.

New fact tables follow planner-only RLS and the existing source revision lock.
Literal/DB parity and both instance and saved-plan digests include workforce
content. Old snapshots remain unchanged; a workforce-only edit must reject
publication of an older draft with an audit. Model/schema/storage work completes
here; hard solver enforcement remains the following issue #8. No personal
worker records, names, qualifications, leave or individual location are added.

Verification includes invalid reference/count/window/overlap database probes,
schema validation, digest ordering/content tests, default engine regressions,
saved plan stale/snapshot checks, migration replay, seed parity, and independent
security review before applying the migration.

## #7 completed

Canonical hosted/literal parity `fnv1a:8c4a9050cfea5e8b`, 22 requests, two roles,
22 availability windows and 44 demand rows. 259 tests pass without skips;
required DB33 plus isolated concurrency3 pass, including both night-resize/supply
insert orderings. Lint/typecheck/build, migration replay and independent review
pass. All test fixtures cleaned; no UI change or local preview. #8 is next.

## #8 implementation design

Use one core workforce assessment over half-open request demand and absolute
availability windows. Missing supply is zero; missing demand definitions are
unknown and fail closed. Emergency scenarios carry explicit fabricated demand.
The shared validator emits critical WORKFORCE_CAPACITY evidence with exact
team/role/interval, headcount demand/supply/shortfall and contributing requests.
Every candidate, pin, repair, alternative and final result uses that validator.
Computed workforce utilisation and shortage interval count remain MetricValue
objects with arithmetic provenance; exact intervals live in the shared assessment.
Crew capacity stays separate. Workforce-only infeasible mandatory work cannot
publish even when the plan is fresh. A pending disruption computes separate
impact metrics before replanning, preserving original run provenance.

Verify boundaries, piecewise supply, multiple roles, capacity shortage moves,
unsatisfiable work, pins/repair/alternative/disruption recomputation, server
publication refusal, dashboard figures/formulas, grounded assistant evidence,
full suite/build, independent review, and production browser workflow.

## #8 completed

Full284 without skips, DB34 and isolated concurrency3 pass; lint/typecheck/build
and independent review pass. Scoped fixes resolved emergency/unknown alternatives
and disruption-metric refresh. Production browser login/evidence/fx/generate/
disruption/view-switch/replan/logout and1280/1440/1920 overflow checks passed,
no console warnings/errors. Last copy changes verified by targeted UI tests and
fresh build. Temporary planner removed; no UAT plans created; preview stopped.
#9 is next.

## #9 implementation design

Keep contractor request proposals in private scoped submissions with immutable
revision snapshots and actor/reason history. Contractor draft edits, submit,
needs-info responses, cancellation and proposed replacement use optimistic
versions. Planner approval confirms team, priority, clearance, skills,
dependencies and configured safety assumptions. Only active approved revisions
join trusted baseline facts in the canonical loader, with stable request IDs and
exact revision provenance. Proposed amendments preserve prior approval until
replacement/cancellation. Approval changes stale saved plans through the shared
source lock. Published-plan placement determines scheduled status.

Build contractor and planner request workspaces with bounded fields, visible
validation failures, immutable history and explicit approval controls. Verify
role and organisation isolation, invalid inputs, lifecycle/version races,
dependency integrity, source staleness, exact saved revisions, full gates and
production browser submission/approval/revision/cancellation before proceeding.

## #9 completed

Full306 tests without skips, DB40/concurrency3, lint/typecheck/build, migration
replay and independent reviews pass. Production browser save/submit/approve/
generate/publish/revision/reload/history/cancel/logout passes. Exact published
revision and immutable original approval verified independently in SQL. Three
desktop widths have no overflow; browser logs clean. All temporary actors/request/
plan removed with7 history guards restored; final baseline parity unchanged.
Preview stopped. #10 is next.

## #10 implementation design

Add a separate owner-private proposal boundary for pasted or UTF-8 text capped
at64KB. An explicit extraction-and-save action explains that only verified excerpts
and draft fields are retained. Full transcripts live only in the bounded request
and model call. Model output has a strict partial-field schema, confidence marked
as an estimate, missing-field flags and exact-span evidence. Unsupported fields
stay unset; fabricated evidence rejects the result. No model-provided role,
priority, approval, schedule or safety authority is accepted.

Use the existing Anthropic provider configuration with bounded time/retries and
a shared authenticated quota for either app role. Missing credentials return a
safe typed unavailable response; the manual intake remains usable. Persist only
validated private proposal revisions with actor-derived ownership and no source
revision change. GET exposes only the caller's private drafts, including for
planners. Editing/submitting these drafts into the human queue belongs to #11.

Verify byte/encoding/empty/error cases, malicious model output/injection, exact
quotes, unsupported fields, owner isolation, transcript absence in persistence
and logs, and deliberate save behavior. Review schema before hosted migration,
then run live gates, UI tests and production browser checks.

## #10 completed

Full328 zero skips, DB43/concurrency3, lint/typecheck/build, migration replay and
independent reviews pass. Production browser owner-private controlled drafts,
evidence/missing fields, missing-key503/input preservation and manual intake pass.
No live-provider success is claimed without the model key. Responsive widths
pass; logs clean. Two temporary owners/drafts removed,8 guards enabled, parity
unchanged, preview stopped. #11 is next.

## #11 implementation design

Extend private proposals with owner-only edits and one explicit, atomic submission
into the existing request lifecycle. Nullable fields retain missing-information
state. Human changes lose model confidence/current evidence attribution while
original evidence remains in immutable history. Private edits and submission append
actor/state/reason records; expected versions prevent overwrites and duplicate
submissions. Contractor organisation comes from the trusted profile; planner-owned
proposals require an explicit valid organisation selection.

Submission deliberately shares the final proposal, evidence and revision history
with the chosen organisation and planners, via an immutable source snapshot scoped
to the request. Other private material remains owner-only. The unified review UI
shows source/evidence, missing data, history and validation beside manual requests.
Existing planner-only approval confirms complete engine and safety fields, adds
one active immutable revision to canonical facts and stales prior plans. Preserve
source invalidation for approval/replacement/cancellation and add rejection-reversal
invalidation. No transcript survives into source history.

Verify owner/org boundaries, nullable editing, confidence attribution, immutable
history, version conflicts, single atomic submission, field completion, planner
roles, exact engine revision and stale saved plans. Run the full gates and a real
two-role browser edit → submit → review → approve journey using controlled private
proposals, without claiming live model extraction.

## #12 implementation design

Render role headcounts above the Gantt from the shared workforce assessment, with
one team/role selection so other teams cannot mask a shortage. Preserve every
slot and actual event boundary, signed remaining capacity, textual shortage
markers, accessible numeric details and contributor buttons selecting the same
request in the timeline/inspector. Unknown demand remains explicit.

Share the displayed disruption-input assembly with the validator; emergency work
and overrun placements appear exactly once before and after replanning. Handle
loading, empty, infeasible, no-shortage and pending replan states. This chart is
in the existing exploratory dashboard; saved workflow integration stays #16.
Verify independent hand-calculated slot/event values, filters and keyboard
selection, every strategy/pin/alternative/repair/disruption transition, full gates,
independent review and production browser flow. No DB migration is needed.

## #12 completed

368 tests without skips, DB49/concurrency3, lint/typecheck/build, independent
review and production browser verification pass. Filter reset during loading
reproduced in component and real-store regressions, then fixed. Emergency
contributor selection now opens exact read-only details. Browser confirms counts,
shared selection, filter retention, no duplicated emergency demand, honest
infeasibility, clearing and three desktop widths. Accounts cleaned, baseline
parity unchanged and preview stopped. No migration required. #13 is next.

## #13 implementation design

Create a strict versioned snapshot of fifteen representative station points from
the official March2026 LTA Train Station polygon archive. Keep source hash,
reviewed feature mapping, transform version, source/date/attribution and both
conflicting licence notices. Offline verification rejects missing/unknown/duplicate
station references and malformed/out-of-range coordinates, with optional exact
regeneration from the local archive. Licence clearance remains a publication check.

Render a local SVG below the primary Gantt, with geographic aspect, station/block
identity, selected request, clearly fabricated depot-block midpoint, nearby demo
work and scenario-affected blocks. Provide equivalent text/keyboard selection and
conspicuous geography-versus-safety distinction. Source/schema/transform agent and
map UI agent own separate files; parent owns store integration, invariance and
shared-selection tests, docs, full gates and browser UAT. No DB migration.

#13 verification:405 tests,DB49+3,lint/typecheck/build,exact source reproduction,
independent code/security review and production selection/emergency/label/responsive
checks pass. No runtime map API dependency; no feasibility change. Temporary users
removed, parity unchanged, preview stopped. Licence clearance is unconfirmed and
public redistribution/deployment remains blocked; technical dependencies allow #14.

## #14 implementation design

Publication creates a durable, immutable outbox in the same transaction as the
published version. Compare immutable old/new saved request placements, ownership
and revision facts; notify only affected contractor organisations, including
removed/deferred work. Unowned fabricated baseline requests have no recipient.
Each message contains exact version/night/request/time/sector and the prototype
disclaimer, with no unrelated organisation data or private transcript evidence.

Only verified planners configure numeric chat IDs or explicitly test/retry.
Versioned configuration guards lost updates; saving a destination does not send.
Append-only attempt claims/results make sent success permanent; concurrent claims
serialize, abandoned claims become visibly unknown, and ambiguous retries require
explicit duplicate-risk acknowledgement. Superseded unsent schedules are not sent.
Initial bounded dispatch happens after publication commits (8 workers,16-second
start budget; each provider call at most8 seconds). Remaining pending rows stay
visible for explicit retry, without a hidden scheduler. Provider failures never
roll back publication. Upstream credentials/descriptions/URLs are never logged
or returned. Message text is deterministic plain text,1–4096 UTF-16 units without
silent truncation; oversize payloads fail visibly without sending.

Backend agent owns migration/service/routes/shared contract/DB tests. Frontend
agent owns destination settings, scoped message/history and retry UI with tests.
Parent owns bounded server-only transport, adversarial transport tests, security
review and full verification. No real Telegram message is authorized during agent
verification; no bot token/destination is configured. Controlled-provider success
and real missing-credential behavior are separate evidence. Live delivery remains
unverified until the owner supplies credentials and authorizes a recipient.

#14 verification:474 zero skips,DB56+4,lint/typecheck/build,independent reviews,
production planner configure/publish/failure/retry and contractor own-slot/scope
checks pass. New corrective migration fixed runtime SQL alias collision; UI late
retry guard fixed reproduced stale-config race. Temporary data removed,13 guards
enabled,parity/replay pass,server stopped. No live Telegram calls. #15 next.

## #15 implementation design

Export the selected persisted plan through a planner-authorized GET route with
strict UUID and json/csv format validation. Immutable plan data supplies placements,
deferrals, calculations, generation timestamp and full provenance. Separate current
source/publication observations identify stale and superseded versions without
re-solving or substituting live facts. Mark every artifact non-operational, and
keep infeasible/unvalidated/draft states prominent.

Use stable deterministic JSON and documented CSV record/column ordering. Escape
all string cells, preserving quotes, commas, newlines and Unicode; neutralize
formula prefixes including leading control/whitespace variants. Use safe UUID
attachment filenames, UTF-8 content types and private no-store/nosniff headers.
Contractors cannot download global plans. JSON/CSV buttons fetch only the selected
saved ID, retain its view on failure and abort obsolete requests when switching
versions. Backend agent owns serialization/route/DB tests; parent owns download UI,
security/docs and integration verification. No migration or publication is required.

#15 verified:505 zero skips,DB59+4,lint/typecheck/build,reviews pass. Actual Chrome
JSON/CSV files match saved version; superseded assessment and responsive widths pass.
Fixtures removed,13 guards enabled,parity/replay pass,preview stopped. Read-only
source revision function required the reviewed immutable migration above. #16 next.
