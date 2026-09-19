# Testing Plan

## Native PS1 service and scorer v2 — 2026-09-19

Run `npx vitest run src/test/ps1-solve-api.test.ts src/lib/ps1/server-solver.test.ts`
plus the PS1 engine/UI suites and Python `test_cp_sat.py`. API tests exercise
cross-origin rejection, streamed body/model limits, cyclic inputs, pins/cuts,
concurrent admission and missing runtime. Native boundary tests cover CSV/score
agreement, provenance, unknown/no-incumbent, pins, process timeout/cancellation
and valid-incumbent retention. UI tests use the HTTP contract and preserve
review/apply/undo, cuts, uploads and export behavior.

Independent arithmetic regressions distinguish per-activity lateness from the
superseded terminal-only scoring bug. All new evidence uses ps1-objective-v2;
legacy results.json is historical and cannot support A/C quality or proof claims.
The native matrix records every full-model outcome and bound, including failures.
Browser QA must exercise real native requests, hidden upload, progress, native
status/proof, cancellation, and the nine-file ZIP. Local proof is not reference
validator certification. Verification results are in PROJECT_STATUS.md.

## PS1 hybrid and native benchmark verification — 2026-09-19

`search.test.ts` covers scenario reuse and target scoring, rejection of stale
candidates under disruptions/pins, legal C ECLO windows including Live line
coupling, seeded deterministic repair and public B improvement. Updated public
ceilings are A 25.2 / B 30 / C 25.2. The 12 synthetic dataset tests retain full
workload, dependencies and exact CSV round-trip checks. Offline Python tests
cover legal sharing, PM/PC exclusion, physical cuts, partial-week deadlines,
strict dependencies, terminal-activity penalties and frozen repairs. CP-SAT
solutions must match the independently decoded/round-tripped local score.

Run `npm run ps1:benchmark`, then use `scripts/ps1/benchmark/README.md` for the
seeded perturbation holdout and native full/repair comparison commands. Keep
unknown/failed runs in results, separate zero-score cases, and distinguish
solver search time from startup/model/validation time.

## PS1 candidate reuse and submission readiness — 2026-09-19

`optimization.test.ts` covers zero-cost feasible alternatives for mixed inputs,
rejection of deadline-breaking A schedules in B, immutable candidate inputs,
changed capacity cuts, exact operator pins through reconstruction, separated C
ECLO demand, independent line windows and Live interchange coupling. Exported
outputs are reparsed and checked under their own scenario.

Run `npm run ps1:benchmark:regression -- --output /tmp/ps1-baseline.json --runs 3` before
solver changes, then `npm run ps1:benchmark:regression -- --compare /tmp/ps1-baseline.json
--output /tmp/ps1-after.json --runs 3`. All 39 dataset/scenario outcomes must
deliver full workload, pass local checks, preserve CSV headers/identities and be
deterministic. Comparisons fail on score/feasibility regression or changed inputs;
runtime is recorded separately. See [PS1_BENCHMARK.md](PS1_BENCHMARK.md).

`npm run ps1:solve` regenerates public CSVs plus `output/PS1-public-results.zip`
with exactly nine official CSV entries. Inspect actual browser downloads and
recheck their extracted files. Node timings, dev-browser timings and hosted
results are distinct evidence; none establishes reference-validator parity.

## PS1 hardened conformance and operations workspace — 2026-09-18

Regression coverage now mutates the published reference to prove rejection of
forged RESULTS, duplicate activity-weeks, invalid/gapped access identity,
out-of-range nights, missing/extra/duplicate/orphan occupancy and cross-line Live
ECLO-window breaches. Loader cases cover exact headers, RFC-style quoting,
duplicate IDs, invalid references and predecessor cycles.

Every public-scenario optimiser outcome must validate after serialization and
remain deterministic. Score ceilings are A 25.2, B 30 and C 25.2. UI verification
covers mixed feasible/infeasible/invalid cards, Scenario C defaulting and retained
policy selection, the linked queue/timeline/inspector, one-focus grid navigation,
complete keyboard tabs, reviewed disruption changes, apply/undo, deterministic
Q&A links, download gating, exact ZIP contents and separate auxiliary exports.
Pure tests cover attention ordering, disruption-adjusted capacity, completion and
churn diffs, and handover content/ZIP exclusion.

Release gates remain typecheck, lint, the full test suite and production build.
Browser verification must cover `/` and direct `/ps1`, public solving and scores,
hotspot → cut → preview → apply → undo, proof/export, 390/768/1280/1440/1920px,
200% zoom and keyboard-only use. VoiceOver is a manual smoke check and must be
reported as skipped rather than implied when it is not run.

## Reconciled merge verification — 2026-09-15

The current sandbox tests cover one shared dashboard, section redirects, request/
conflict/workforce/assistant state, reset and cross-actor invalidation. The earlier
six-page assertions below describe upstream history, not the current navigation.
Saved revision tests exercise server conflict commands, every finding in a group,
inspector selection, stale repair disabling and full-plan preview/discard.
Unit and rollback DB tests cover independent validation, immutable inputs, scoped
authorization and stale rejection. Notification edits are protected on their
dedicated page; request navigation uses explicit-discard confirmation.

## Reviewed carry-forward verification — 2026-09-15

Task 3 review correction adds source revision3 → prepare target → same-night source
reapproval6 → old target conflict → fresh same-target draft → successful approval.
Assertions retain the original preparation byte-for-byte, original-key retry ID,
seeded-null dedupe and one active occurrence. The real-session double-preparation
race repeats after source reapproval and requires one new shared target identity.
Both tests reproduced the stale-ID failure before the additive SQL correction;
fix-specific outputs are appended to the Task 3 report:24/24 related DB tests in
47.65s,13/13 independent races in69.69s, lint/typecheck and22-request parity passed.
The controller owns the fresh full-suite gate after the review correction.

Real rollback coverage includes inert/duplicate draft preparation, explicit seeded
organisation, configured later-night bounds (including historical dates), target
window/dependency validation, active inbound retirement guards, exact/stale source
publication confirmation, immutable seed/snapshots, source revision invalidation,
contractor allowlists and direct-function/RLS denial. Normal mapped reapproval,
cancellation/latest restoration and original cancelled-source compatibility are
covered; direct same-submission cross-night approval and old retired duplicates
are rejected.

Four independent-session races exercise double preparation, two target approvals,
approval against publication, and publication retry. The new race helper counts
only its exact distinct backend PIDs waiting on the source lock. Committed fixtures
use dedicated Dev, isolated IDs/nights and exact cleanup with 21 history guards.
Run DB/concurrency/HTTP/browser work serially. Review preimages use `.snapshot`
suffixes so Vitest cannot discover old tests as executable verification inputs.

Fresh integrated `npm test`: 774/774 across 93 files (190.02s). Fresh lint,
typecheck and production build passed. Required DB rollback: 84/84 across 14 files
(94.46s), with baseline parity `fnv1a:8c4a9050cfea5e8b` / 22 requests. Final
concurrency: 13/13 (five files, 59.59s). Authenticated HTTP: 6/6 (two files, 62.65s).
Real browser verified exact published-source review, target approval/generation,
pending-coordination Apply/publication, scheduled backlog, failed-refresh recovery,
history/reload, keyboard focus and 390px mobile layout plus contractor scoping.
Fixture cleanup verified 21 guards and unchanged baseline parity. VoiceOver/full
manual accessibility and 1440/1920px sweeps were not rerun in Task 3. Detailed
outputs, screenshots and initial failures are in PROJECT_STATUS and Task 3 report.

## Deferred-work persistence verification — 2026-09-15

The new pure suite covers distinct-night corrections, SGT calendar-date overdue
boundaries, scheduled-but-unresolved state, missing data and bounded commands.
Rollback DB checks cover inert drafts, exact saved-deferral validation, replay
identity/conflicts, automatic publication and same-night correction/removal,
historical-record precedence, trusted assignment, lifecycle reasons, source-inert
metadata, bounded catalogues/cursors, linked UUID identity and actor retention.
Contractor tests invoke the granted SQL read function directly and verify its
allowlist, operator/foreign denial, raw-table RLS and immutable history guards.

Observed gates: 5 pure + 4 HTTP tests, 7 real rollback DB tests; the initial focused
publication/outbox bundle passed 29 tests before the two extra DB cases were added.
All 9 existing independent-session concurrency checks pass. Fixture cleanup now
includes the three new history guards and exact owned backlog foreign keys before
plan/request deletion; all 20 history guards are restored. Baseline read-back parity
remains fnv1a:8c4a9050cfea5e8b (22 requests). Typecheck and scoped lint pass.

Supabase security advisors was attempted but the connector denied project access.
Read-only SQL inspection instead verified new-table RLS, no direct authenticated
writes, fixed helper search paths and revoked anonymous/internal EXECUTE grants.
This is not a claim that hosted advisors passed. Carry-forward concurrency and
new backlog browser/production-HTTP journeys belong to their subsequent tasks.

Task 1 review fix regression extends complete publication omission with a fresh-key
historical record. RED observed open/count1 instead of open/count0; after additive
SQL correction, all 22 deferred/plans/outbox DB regressions pass and the new note
survives. Baseline parity and 20/20 enabled history guards were rechecked afterward.

## Coordination verification — 2026-09-15

`test:db` now includes the five rollback coordination cases. The required serial
gate first verifies the unchanged 22-request baseline, then runs 70 rollback/
integration checks, followed by independent-session concurrency tests.
The completed serial DB gate passed all 70 integration and 9 concurrency tests.
`scripts/db/coordination-concurrency.test.ts` observes distinct PostgreSQL backends
waiting on source/case locks before releasing them. Five cases cover revision
versus approval, double Apply with identical and different retry keys, workforce
fact mutation before Apply, and mutation waiting behind Apply. Assertions require
one linked plan, exact reviewed confirmation revision, zero stale application and
refusal to publish a draft whose source changes afterward.

The production HTTP suite adds an isolated two-organisation coordination journey:
complete full-plan changes, pending Apply, recorded approval, own-only list/detail,
guessed foreign UUID denial, planner-note exclusion, contractor change requests,
revision reset, historical applied-plan summaries, retry identity, close and
non-blocking publication. Its provider counters remain zero; the existing separate
controlled Anthropic/Telegram journey remains intact. The suite has five tests
including three provider-policy checks. Cleanup checks exact users, organisations,
requests, cases, plans and owned night are absent, with all 17 history guards on.

Regressions reproduced and fixed owner/deadline-only unsaved exits and omitted
contractor case URL context. Final affected UI/navigation coverage passes 62 tests
in eight files. Browser checks cover actual keyboard creation/Apply/confirmation,
Escape focus return, own/foreign contractor case reload, signed-out return context,
native unsaved-owner Back Cancel/Accept, revision reset, historical summary and
publication review, 1440px desktop and 390px mobile without horizontal overflow.
Browser console/page errors were empty. No screen-reader, genuine token-expiry
wait, live provider send or deployment is claimed by this coordination run.

Sandbox timeline drag regressions: real-store previews remain nonmutating, Apply
uses independently validated solver output, Undo restores exact result/pins and
stale actions cannot overwrite a changed strategy/disruption. Guards cover grid,
handback, pins and forced emergency work. Component tests exercise pointer snapping,
linked bars, Escape, keyboard proposals, Apply/Cancel and Undo. Existing saved-panel
tests retain selection-only behavior. Browser checks exercise a real pointer drag,
preview, Apply and Undo with runtime-console inspection.

Planner manual creation coverage (2026-09-15): request-intake tests exercise
`request=new`, linked-night defaults, organisation validation, unsaved organisation
protection and submit-to-exact-request selection. Saved-plan and return-path tests
cover Add request context and safe login restoration. Authenticated rollback SQL
tests cover planner attribution, shared organisation visibility, cross-org denial,
contractor override rejection, missing/unknown organisations, anonymous denial and
fixed function search path. The production HTTP journey also creates and submits
a planner request and checks the contractor boundary without approving that draft.

Shared sandbox component regressions exercise deferred/mandatory filtering through
the real planner queue, selection into the sandbox inspector, and emergency bars
appearing before replanning and disappearing after clear. Existing saved inspector
and timeline tests cover the other consumer of shared presentation. Browser checks
must compare the actual queue/timeline/inspector, not merely colours or headings.

Sandbox visual-alignment regression checks the generated draft's deferred count
and calculation disclosure, the “Generate draft schedule” action, and the absence
of publication controls. Browser checks cover four summary columns on desktop,
stacked mobile controls, white surfaces, timeline/header tab separation and
keyboard expansion of the workforce section.

Workforce disclosure regressions cover collapsed-by-default chart visibility,
keyboard activation, aria-expanded, retained team filters across close/reopen and
sandbox tab switches. Browser checks must additionally confirm that collapsed
context panels release their reserved height back to the timeline in both views.

## Request UX priority regressions — 2026-09-15

Clock input tests cover explicit next-day roundtrips, unknown versus midnight,
integer-minute save payloads and blocking cleared required fields. Inbox tests
cover role-specific action filtering, search/clear recovery and preservation of
the selected detail while hidden by filters. Status tests distinguish corrections
to a new revision from an older published slot and retain planner-only plan links.
Browser checks with an empty live inbox do not substitute for populated form or
contractor submission UAT; these remain separate from component coverage.

## Site-wide navigation regressions — 2026-09-15

After deployment, inspect computed body background and primary-button gradient in
the live browser. New headings alone do not prove the current stylesheet shipped:
the 2026-09-15 cached build served an old beige theme until a no-cache rebuild.

Home regressions cover planner/contractor action boundaries, access-pending users,
shared Home navigation and night/version/request handoffs with arbitrary query
content excluded. Desktop/mobile checks cover the six-step guide and draft link.

Coverage includes shared planner/contractor navigation, selected-night/version
retention through sandbox and history, exact request and private-draft deep links,
late selection responses, submission-to-intake and saved-plan-to-intake handoffs,
scoped published-plan links, empty/missing records, unsaved form/review/transcript/
notification state, pre-traversal Back cancellation, approved traversal without
duplicate prompts, older-browser popstate fallback and logout protection. Login tests verify
role-resolved destinations, failure-context retention and rejection of external,
encoded, malformed or non-workspace redirects. Proxy tests include new child routes.

Compact context panels retain workforce filters when switching to geography.
Existing engine-driven sandbox repair, pinning, emergency, disruption and staffing
regressions remain in the full suite. Browser release checks cover white/blue
computed colours, responsive overflow, direct route reload, link handoffs, keyboard
focus, dirty Back and both roles. Controlled-provider production HTTP E2E remains
separate from live provider delivery and visual/browser verification.

Last updated: 2026-09-07 · RailPlan v0.4.0

## Automated coverage

Connected workspace regressions (2026-09-14) cover queue search/counts, clearance
lanes, deferred exclusion, inspector selection races, preview/save separation,
dirty navigation, publication gating and same-night version comparisons. Migrated
saved journey/export/notification tests retain their original persistence and
delivery assertions. `planner-analysis.db.test.ts` is included in the required
database gate: rollback checks verify exact counts beyond 100 submissions, cursor
ties, a current publication older than the first page, unchanged source revision
and lock generation, planner RLS and guarded saves. Analysis route tests cover
strict bodies, origin/auth order and sanitized errors. Existing engine and
two-role production HTTP E2E suites remain unchanged.

Vitest runs pure engine tests in `packages/core/src/test` and application tests
in `src/test`. Coverage includes interval boundaries, topology and adjacency,
resource/window/safety/dependency rules, instance-driven validation, all five
strategies, independent final validation, calculated metric formulas, repairs,
alternatives, grounded assistant responses and HTTP validation/fallback behavior.
The dashboard suite exercises planner interactions against real engine output.

`sandbox-subpages.test.tsx` covers all six semantic header links, nested active
page state, the deep-link introduction gate, workflow availability, client-remount
retention for request/conflict/workforce interval/assistant state, actor-change
isolation, stale assistant-response invalidation, reset behavior and the exact
limited persistence payload. `sandbox-page-content.test.tsx` records the content
assignment for every focused route module. `planning-panels.test.tsx` verifies the focused
queue/inspector and workforce/geography compositions retain their adjustable
controls, including the rendered inspector column variable, while the existing
all-panel and saved-review behavior remains covered.
`workspace-navigation.test.tsx` applies the planner authorization assertion to the
shared sandbox layout.

`src/test/instance.test.ts` checks canonicalization, meaningful digest changes,
loaded database/literal parity and rollback-isolated drift detection. Database
checks explicitly skip with a warning only when Postgres is unreachable. A
reachable empty/wrong database fails. Connections close on success and failure.
The separate `db:verify` command always fails if the database is unavailable;
`test:db` makes this a required gate before running the integration suite.

## Verification commands

Follow `TEAM_HANDOFF.md` for database setup. The owner requires no Docker; use the dedicated hosted development project.
Tests load Git-ignored .env.local and run database checks when reachable.

```bash
npm ci
npm run db:migrate
npm run db:verify
npm run test:db
npm test
npm run lint
npm run typecheck
npm run build
```

For a dedicated empty development database, `npm run db:seed` bootstraps facts
and verifies their round trip before committing. It refuses existing workflow
records. On the configured migrated test database, `npm run db:seed -- --verify-only`
performs the same writes and readback, rolls back, then compares all19 fact-table
hashes and source revision/generation. Coordinate an exclusive test window; this
is not a destructive project reset. Invalid flags fail before connecting.

A deliberate change to equipment supply must produce an error naming
`equipment`. The integration probe changes it in a transaction and rolls back,
then verifies the original digest again. Connection refusal must produce visible
skips in the ordinary suite and nonzero exit from `db:verify`.

## Browser and release gates

Exercise load → conflict inspection → single/all repairs → generation → pin →
alternative → disruption/replan → assistant and formula inspection. Check console
and server errors, keyboard/focus/labels, non-color conflict indicators and page
overflow at 1280×800, 1440×900 and 1920×1080. An HTTP probe is not a substitute for
browser UAT. The split sandbox additionally checks semantic link navigation,
active-page styling, visible keyboard focus and no page overflow at 640, 1280,
1440 and 1920 CSS pixels. Record runs and skipped checks in `PROJECT_STATUS.md`.

Future request lifecycle, workforce and integration work
must add its route/RLS/constraint tests before issue #17's complete two-role
release suite. Current tests do not certify real railway operational safety.

## Issue #5 authorization checks

`auth.test.ts` tests the planner action matrix and actual streamed body limit.
`api.assistant.test.ts` checks typed anonymous/forbidden/unavailable responses,
planner fallback behavior, oversized actual bytes and the shared quota response.
External session/quota dependencies are mocked only in route unit tests.
`auth.db.test.ts` uses randomly identified, rollback-isolated auth/profile/org
fixtures against the real database. No stored passwords or access tokens are
needed. It exercises application SET ROLE/claims, planner reads/writes,
contractor and anonymous denial, forged metadata, organisation isolation,
unassigned profiles, token burst/refill and direct private-table denial.
`test:db` includes this suite after the required parity gate. Request submissions,
plan versions, approvals, notifications and audit policies are tested when their
own numbered issues introduce their tables, not by placeholder tests here.

`auth-session.test.ts` verifies server-confirmed identity, invalid/missing/
anonymous denial, fail-closed configuration and 503 classification for Auth
network/service failures. `auth-seed.test.ts` checks the local-only seed guard.

## Issue #6 persistence checks

`plans.test.ts` verifies bounded parameters, runtime night/team/duration rules and
full-input SHA-256 provenance. `api.plans.test.ts` covers typed auth/errors, strict
request shapes, origin/content-type, streamed bounds and route dispatch.
`saved-plans.test.tsx` covers the dedicated saved-plan UI with mocked HTTP.
`plans.db.test.ts` uses real authenticated RLS and rollback fixtures for exact
roundtrip, decisions, immutable publication/supersession, stale rejection audits,
all source fact groups, role denial, invalid pins and infeasible publication.

`npm run test:db` runs mandatory parity, rollback integration suites, then a
separate required concurrency suite using `vitest.concurrency.config.ts`.
`scripts/db/plan-concurrency.test.ts` is excluded from ordinary `npm test` because
committed fixtures must not overlap rollback/parity/role tests. It creates an
isolated future night, one cloned fabricated request and one temporary actor,
blocks both first-publication transactions on the source row, then verifies one
published and one superseded version after serialization retries.

True cross-session tests need committed fixtures. Their owner-only cleanup takes
ACCESS EXCLUSIVE locks with a five-second timeout, disables immutable triggers
inside one transaction, deletes exact fixture IDs and restores triggers before
commit. Failure rolls cleanup back and visibly fails the test. It never broadly
deletes plans or changes RLS. The global source revision advances during fixture
setup/cleanup, so existing unpublished demo versions become stale; actual source
facts and published snapshots remain unchanged. All temporary Auth/plan/night/
request fixtures are removed on success. This suite fails when DB is unavailable.

## Issue #7 workforce checks

`packages/core/src/test/workforce.test.ts` covers seeded defaults and unchanged
engine callers, canonical order, supply-only/demand-only digests, role/reference/
count/night/overlap validation and adjacent zero-supply windows.
`workforce-schemas.test.ts` verifies bounded strict payloads and trusted-instance
references. `workforce.db.test.ts` uses real authenticated rollback transactions
for full parity, invalid counts/unknown FKs, overlapping and adjacent windows,
parent-night resize protection, night filtering and contractor/anonymous denial.
The saved-plan tests additionally prove workforce-only changes stale old drafts
and leave their stored snapshots intact with rejected-publication audits.

`scripts/db/workforce-concurrency.test.ts` runs only in the required isolated
concurrency phase after all rollback files. Two READ COMMITTED transactions race
availability insertion against parent-night shrinkage, in both orderings. The
loser must reject rather than commit out-of-bounds availability. Exact future-night
and Auth-ID cleanup removes these fixtures; no plan-history trigger bypass is
needed. All `scripts/db/*-concurrency.test.ts` files are excluded from ordinary
`npm test` and run sequentially under `vitest.concurrency.config.ts` in `test:db`.

## Issue #8 workforce enforcement checks

`packages/core/src/test/workforce-engine.test.ts` exercises simultaneous demand
independent of crew capacity, touching endpoints, clearance exclusion, changing
availability, multiple roles, exact contributing requests and missing supply.
It verifies fail-closed missing/malformed demand, ambiguous supply rejection,
assigned-team/shift boundaries, all five strategies, impossible mandatory work,
locks, automatic repair, baseline and emergency alternatives, and explicit
emergency staffing. Hand-calculated metric expectations cover person-minute
numerators/denominators, shortage segments, outages, overruns and shortened
windows; scenario demand changes must alter the input hash.

A baseline repair regression targets a known solvable dependency conflict and
checks no new conflict is introduced. The former assumption that the first
baseline conflict always has a clean single move no longer holds when workforce
shortages are enforced. The ordinary core suite is independent of the database.

## Request intake verification — issue #9

`requests.test.ts` covers strict fields, incomplete drafts versus submission,
reference validation, capacities and impossible windows. `api.requests.test.ts`
covers authentication-before-body, field errors, forged fields, same-origin JSON,
streamed limits, optimistic versions and explicit approval confirmation.
`requests.db.test.ts` uses rollback-only temporary Auth/profile/organisation rows
under the real authenticated SQL role. It exercises direct function validation,
cross-organisation denial, append-only lifecycle history, immutable approval,
active-revision loader integration, retained approval during revision and removal
on cancellation. Hosted migrations must be reviewed before application. The
unit-only suites do not prove live RLS or database transitions; the DB gate must
run against the configured dedicated Docker-free RailPlan database.

The default suite runs test files sequentially because hosted rollback fixtures
share the global planning-source lock. Adding intake lifecycle tests exposed
5-second timeouts in otherwise-passing plan/workforce suites under concurrent
file execution; all 40 DB tests passed with file parallelism disabled. The
separate concurrency suite still creates actual overlapping transactions to test
serialization behavior. Assertions are unchanged.

The hosted intake lifecycle suite has a 20-second per-test I/O budget because its
rollback journeys contain many sequential authenticated round trips and full
instance reloads. An unchanged isolated run measured 2.2–6.3 seconds per lifecycle,
with two default-five-second timeouts observed during a slower full-suite run.
The limit is scoped to this integration suite; no retries are added, unit-test
limits remain unchanged, and database statements retain their ten-second timeout.

## Transcript extraction verification — issue #10

`ingestions.test.ts` checks exact evidence and offsets, missing facts, privileged
schema rejection, conservative labelled numeric/resource support (IDs and human
labels), unknown references/capacities, transcript nonretention, fatal UTF-8 and
actual byte limits. `ingestions-model.test.ts` exercises missing credentials,
fixed instructions/no tools, bounded time/retries, refusal/truncation/invalid output
and safe timeout/unavailability errors through a controlled SDK boundary.
`api.ingestions.test.ts` checks authentication-before-content, same-origin limits,
typed errors/quota headers and private response envelopes. These controlled model
responses do not claim live provider quality or prove universal semantic grounding.

`ingestions.db.test.ts` runs rollback-only hosted fixtures with a scoped 20-second
I/O budget. It checks exact-owner isolation against same-organisation contractors
and planners, strict rejection of extra raw-source properties and null evidence
field names, immutable snapshots, model/extractor provenance, quota isolation and
unchanged planning-source revision. It is included in the required test:db gate.
The three new live tests passed after the reviewed migration; all fixtures rolled
back. The model key is absent in this environment, so production unavailability
and manual fallback are verifiable; successful extraction uses controlled test
responses and must not be described as live-provider UAT.

## Proposal review verification — issue #11

`review-drafts.test.ts` checks nullable edit normalization, missing fields and
forged provenance rejection. `api.review-drafts.test.ts` checks authenticated
same-origin edit/submit boundaries, expected versions and detail envelopes.
`review-drafts.db.test.ts` exercises owner-only edits, original immutable evidence,
manual-field support clearing, incomplete submission refusal, one-time atomic
sharing, organisation scope and reassignment denial, and deliberate planner
organisation selection. It uses the scoped 20-second hosted I/O budget.

`review-integration.db.test.ts` owns the full private-edit → explicit-submit →
planner-approve → exact immutable engine revision → plan-source invalidation
journey. Both new DB files are included in the required test:db gate. Migration
syntax was verified in an intentionally rolled-back PostgreSQL transaction before
review/application. The focused four live proposal-review cases passed with all
fixtures rolled back. No provider key is needed to test this human review boundary.

## Issue #12 workforce visualization checks

`workforce-series.test.ts` independently calculates expected headcounts at each
slot and supply/placement event boundary, including non-aligned boundaries, gaps,
signed deficits and team/role isolation. `visible-planning-inputs.test.ts` exercises
real store strategy/pin/suggestion/repair and disruption transitions, proving
exactly one emergency insertion, one overrun and zero supply after withdrawal.
Component and dashboard integration checks cover accessible interval values,
filters, keyboard contributor selection, unknown demand and changed-plan state.
Production UAT checks shortage selection, generation, disruption/replan, shared
request selection, desktop overflow and console errors.

The loading regression crosses the visible non-idle store stage (a single async
React act can batch away that stage and miss an unmount). A nondefault team/role
must survive the solve. Emergency inspector tests exercise exact forced time and
headcounts before/after replanning, scenario clearing/replacement, and unchanged
baseline request controls.

## Issue #13 geographic context checks

`geography.test.ts` covers exact station identity/source selection, strict metadata,
unknown/duplicate/missing/out-of-range coordinates, weighted polygon centroids and
holes, projection control point, source-shape failures and local archive guards.
`npm run geo:verify` checks the bundled snapshot without network; add `-- --source
/path/to/TrainStation_Mar2026.zip` to reproduce it exactly from the reviewed archive.
The command explicitly does not resolve the conflicting source licence notice.

`geographic-map.test.tsx` uses fabricated fixture coordinates to test no runtime
fetch/image/tile dependency, geographic aspect, source acknowledgement, exact block
highlights, depot labels, keyboard selection, extra emergency work and unmapped
coordinates. `geographic-workspace.test.tsx` uses the real local snapshot and store
for map/timeline/inspector selection and disruption clearing. The isolation test
changes a map coordinate and confirms fresh engine facts, digest, placements and
validation remain unchanged. Production UAT verifies those connected views and
three desktop widths with clean browser logs.

## Issue #14 notification verification

`telegram.test.ts` uses controlled fetch to exercise fixed-host plain-text sends,
matching message/chat acknowledgements, token/chat/text rejection,1–4096 length,
provider rejections,429 retry delay, network/5xx/timeout ambiguity, stalled body
consumption and64KiB response bounds. No test contacts Telegram.

`notification-ui.test.tsx` and `notification-workspace.test.tsx` cover versioned
configuration without automatic sends, missing-bot feedback, separate explicit test,
sent/in-flight/superseded/retry-time guards, ambiguous retry acknowledgement,
stale async plan responses and publication success despite notification warnings.
Existing saved-plan regressions remain in `saved-plans.test.tsx`.

`notification-concurrency.test.ts` is part of the isolated committed-fixture gate.
It holds the exact delivery row, observes two independent claim calls waiting in
Postgres, releases the row, then asserts one attempt/provider call and permanent
known-success deduplication. The injected provider is controlled. Exact-organisation
cleanup restores all four notification history guards transactionally; no planning
facts are mutated. Required schema application and final gate results are recorded
in PROJECT_STATUS rather than interpreting absent-table failures as skips.

## Issue #15 export verification

Serializer fixtures cover validated/infeasible, deferred, Unicode, stale and
superseded artifacts. Assertions compare deterministic bytes and all saved metrics,
placements and provenance. CSV parsing checks quotes, delimiters, newlines and
formula prefixes including leading whitespace/control/BOM and full-width variants.
HTTP checks require verified planner access, strict UUID/format, safe attachment
headers and sanitized errors. Live DB checks compare stored rows and repeated
exports, preserve both source revision and lock generation, and mutate current
facts to prove only the freshness assessment changes while saved data remains exact.

`plan-exports-ui.test.tsx` verifies raw JSON/CSV download bytes, selected-version
filenames, recoverable authorization/network failures and cancellation of late
responses. Its real SavedPlansWorkspace integration proves a version change aborts
the old download. No solver or current-facts loader is part of export generation.

## Issue #16 integrated journey checks

`workspace-navigation.test.tsx` verifies role-scoped navigation, server route
redirects, unassigned-account messaging and the explicitly unsaved sandbox.
`auth-proxy.test.ts` invokes Next's installed route matcher to verify session
refresh on every workspace, including `/sandbox`, and static-asset exclusion.
Adjustable panel tests cover bounded persisted preferences, pointer/keyboard
controls and preserved child state. Saved review tests use owned request IDs and
immutable facts to check Gantt/workforce/map/inspector selection and request races.

Full production two-role UAT must create/submit/review/approve work through the
UI, generate/inspect/publish/download the saved plan, inspect separate notification
status and return to the contractor's scoped published slot. Verify the sandbox
regression journey and widths1280/1440/1920, then clean exact fixture accounts and
artifacts. Provider success, microphone consent and source rights remain separate
verification boundaries; #16 does not silently resolve those gates.

## Issue #17 release suites and evidence limits

Run the normal suite and `test:db` serially against the hosted test database, then
lint/typecheck/build. `npm run test:e2e` is separate and must not overlap other
DB suites: see `scripts/e2e/README.md`. It starts the built app, authenticates real
role sessions and exercises manual/transcript proposal→approval→workforce-aware
solve→publication→controlled Telegram failure/retry/success→persisted exports and
contractor scope. It verifies hosted private-schema exposure, stale errors, bounded
error envelopes, private evidence and exact cleanup. Controlled responses do not
verify live model extraction quality or a real Telegram recipient.

`api.assistant-security.test.ts` reproduces origin/content-type and logging leaks.
`accessibility.test.tsx` and notification regressions check dialog keyboard return,
scroll bounds, contrast arithmetic, live answers, stable retry focus, acknowledgement
reset and cooldowns. Actual browser zoom/reader evidence is recorded separately.
`npm audit` must be rerun after dependency changes; its result is point-in-time.

No Docker, destructive Supabase/Auth project reset, real provider send or public
deployment is part of this run. Historical clean bootstrap and current parity are
not described as a freshly recreated hosted project.

Hosted #17 rehearsal evidence (2026-09-07): `db:seed -- --verify-only` passed with
canonical digest `fnv1a:8c4a9050cfea5e8b`, all19 table hashes and source revision/
generation unchanged. The production E2E suite passed4 tests (one full journey,
three provider-boundary tests). The initial run exposed a harness cleanup SQL
fragment error; bound UUID arrays fixed it and exact recovery restored all13
history guards. Private-schema probing uses a nonmutating RPC with Content-Profile,
which returns406/PGRST106; REST root discovery instead requires a secret key and
is not evidence of schema exposure. No app authorization rule was relaxed.

## Saved revision regression coverage — 2026-09-09

`plan-revision.test.tsx` uses real approved snapshot facts and the shared engine to
check requested conflict evidence, exact alternative pins, impossible pin blocking,
unpin recovery, retained edits on failed save, browser engine mismatch and stale
version guards. The real workspace prevents publication/navigation during preview.
Plan schema/digest tests cover optional parent IDs. Hosted rollback tests cover
planner-only linked creation, immutable parent, exact publication/export pins and
stale/superseded rejection. The production HTTP journey chooses an alternative for
approved intake, compares its preview to the saved result and carries that revision
through publication, contractor scope and JSON export. Provider responses in this
suite are controlled and fixture artifacts are removed by exact IDs.

## Guided workflow checks — 2026-09-09

Check initial latest-version selection, collapsed history/technical records, keyboard
focus into publication, and recovery when refreshing into a newer version. Request
view switching must retain manual edits and transcript text, exclude hidden-panel
controls from browser focus, and reveal the shared queue after proposal submission.
Dirty request navigation must remain disabled until save/action/discard; unrecorded
review notes cannot carry into another plan. Unsaved destination edits must survive
night changes and version refresh. Browser checks verify native disclosure and focus;
jsdom role queries alone do not reliably model closed-details visibility.
