# Testing Plan

Last updated: 2026-09-07 · RailPlan v0.4.0

## Automated coverage

Vitest runs pure engine tests in `packages/core/src/test` and application tests
in `src/test`. Coverage includes interval boundaries, topology and adjacency,
resource/window/safety/dependency rules, instance-driven validation, all five
strategies, independent final validation, calculated metric formulas, repairs,
alternatives, grounded assistant responses and HTTP validation/fallback behavior.
The dashboard suite exercises planner interactions against real engine output.

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
npm run db:seed
npm run db:verify
npm run test:db
npm test
npm run lint
npm run typecheck
npm run build
```

A deliberate change to equipment supply must produce an error naming
`equipment`. The integration probe changes it in a transaction and rolls back,
then verifies the original digest again. Connection refusal must produce visible
skips in the ordinary suite and nonzero exit from `db:verify`.

## Browser and release gates

Exercise load → conflict inspection → single/all repairs → generation → pin →
alternative → disruption/replan → assistant and formula inspection. Check console
and server errors, keyboard/focus/labels, non-color conflict indicators and page
overflow at 1280×800, 1440×900 and 1920×1080. An HTTP probe is not a substitute for
browser UAT. Record runs and skipped checks in `PROJECT_STATUS.md`.

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
