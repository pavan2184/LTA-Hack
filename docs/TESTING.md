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

Future identity, persistence, request lifecycle, workforce and integration work
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
