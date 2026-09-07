# Ordered GitHub issues implementation plan

**Goal:** Resolve GitHub issues #4–#21 in numeric order, satisfying each dependency before starting its consumers.

**Architecture:** Retain the shared TypeScript validator as the authority. Establish local Postgres parity, then add identity, durable plans, anonymous workforce constraints, request review, and product integrations on that foundation. Keep fabricated data and non-operational labels throughout.

**Spec:** https://github.com/pavan2184/LTA-Hack/issues (issue bodies and acceptance criteria, retrieved 2026-09-07).

## Execution gates

- [x] #4: Verify local reset/seed/load, diagnose mismatches by section, test available/unavailable database behavior, synchronize v0.4 contracts and versions. Files: `scripts/db/`, `src/lib/db/`, `src/test/instance.test.ts`, `supabase/config.toml`, package manifests, required project documents. Verify with database commands, tests, lint, typecheck, build.
- [x] #5: Supabase sessions, planner/contractor authorization, RLS matrix and shared token bucket; security review.
- [x] #6: Immutable saved plan versions, audited decisions, current-source publication gate.
- [x] #7: Anonymous workforce types, schema, loading, seeds and canonical digests.
- [ ] #8: Workforce capacity validator, solver enforcement and calculated metrics.
- [ ] #9: Validated contractor submission lifecycle and immutable approved revisions.
- [ ] #10: Private transcript proposals with exact evidence and bounded model access.
- [ ] #11: Planner review, approval and source revision invalidation.
- [ ] #12: Accessible workforce demand/capacity visualization from engine data.
- [ ] #13: Validated, attributed local geographic snapshot, separate from safety topology.
- [ ] #14: Publication notification outbox, scoped Telegram delivery and explicit retry status.
- [ ] #15: Authorized saved-plan JSON/CSV exports with formula neutralization.
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
