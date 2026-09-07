# Teammate Handoff

Last updated: 2026-09-07 · RailPlan v0.4.0

## Run the application without Docker

Use Node.js 22 and npm. From a fresh clone:

```bash
npm ci
# Configure .env.local and provision a confirmed role as described below.
npm run dev
```

The app runs directly in Node at http://localhost:3000. Hosted Supabase Auth and
PostgreSQL configuration are required for the protected role workspaces. The optional assistant uses
`ANTHROPIC_API_KEY` or a local Anthropic auth profile; absent credentials use
engine templates. Do not commit credentials. Database scripts load the Git-ignored `.env.local` file; exported shell/CI
values take precedence.

## Hosted database baseline (issue #4)

RailPlan Dev is the dedicated Free-plan project in pavan2184's Org, Singapore:
https://supabase.com/dashboard/project/ufcdynfjfzbjvglsdaqp

No Docker is used. Create `.env.local` (Git-ignored, owner-only permissions) and
set the existing `DATABASE_URL` to the project's connection URI, percent-encoding
the password. Never commit credentials. Database scripts and Vitest load this
file automatically; exported environment values take precedence. Use Node 22.9+
for `--env-file-if-exists` support.

The verified endpoint uses transaction pooling on port 6543. Port 5432 times out
on this Mac's current network. `connect()` disables prepared statements and uses
Supabase's public CA with certificate and hostname validation. The CA is vendored
in `config/supabase-ca.crt` from the official dashboard download, expires in 2031,
and is not a secret. Rotate it when Supabase changes its CA.

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run db:verify
npm run test:db
```

`db:migrate` applies checked-in SQL in filename order inside a transaction and
records checksums in the unexposed `railplan_private.migrations` table. Repeating
it is a no-op; editing an applied migration fails. Add a new migration for changes.
The clean, newly created hosted database replaces the old local reset gate.
There is deliberately no command that resets the hosted project's managed schemas.

`db:seed` bootstraps RailPlan demo planning facts only when no workflow records
exist, using an explicit DATABASE_URL. It writes and reads back facts in the same
transaction and verifies parity before commit. It refuses existing plans, intake,
private drafts or notification history and never uses CASCADE. After initial
bootstrap, use `npm run db:seed -- --verify-only` for a rolled-back rehearsal;
all19 fact-table hashes plus source revision/generation must remain unchanged.
Run either mode only in a coordinated dedicated development test window.
`db:verify` never skips unavailable, unseeded or mismatched data. Ordinary tests
explicitly skip only when the database probe cannot connect.

Troubleshooting:

- Port 5432 timeout: use the dashboard's transaction pooler URI (6543).
- Certificate failure: use the official CA; do not disable TLS verification.
- Missing relation/night: apply migrations, then seed the dedicated project.
- Changed digest: inspect the named section; do not bypass the assertion.
- Edited migration: restore its original content and add a new migration.
- Loader stalls on transaction pooling: preserve its repeatable-read transaction;
  it binds the multi-query read to one backend and prevents mixed snapshots.

The Supabase connector remains authenticated to another account. Use the correct
browser account or the project-specific database connection; do not modify
GrowMe Hackathon, LearnGraph, or NRI_Land.

## Code map and tour

`packages/core/src` owns domain facts, types, validator, solver, metrics,
alternatives and explanations. `src/store/useRailPlanStore.ts` orchestrates the
three-step planner flow. `src/components` renders computed results.
`src/app/api` contains authenticated request, ingestion, saved-plan, notification
and assistant routes; docs/API_CONTRACT.md lists their boundaries. `src/lib/db` and `scripts/db`
implement database read-back and seed verification.

Load requests, inspect conflicts, apply repairs, generate a plan, inspect metric
formulas, pin work, try alternatives, trigger a disruption and replan. Inputs
are fabricated; outputs are calculated. No output certifies railway safety.

## Verification and next work

Run npm test, npm run lint, npm run typecheck and npm run build. Database
integration is an additional required gate, not replaced by ordinary test skips.
Read `PROJECT_STATUS.md` for actual results and unresolved failures.

Follow issues #4–#21 in numeric order. #4–#16 are implemented locally; current
release checks and remaining scope are recorded in PROJECT_STATUS.md.

## Identity setup and operator provisioning (issue #5)

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the
same dedicated project in `.env.local`. These are public client values; never
substitute service-role/secret credentials. Keep email confirmation enabled.
An operator must create/confirm the intended Auth account using the Supabase
console or the account owner's normal signup flow before assigning a role.
The app does not send invitations or auto-promote new accounts.

After checking the user's confirmed Auth UUID, run:

```bash
npm run db:provision-user -- USER_UUID planner
npm run db:provision-user -- USER_UUID contractor ORGANISATION_UUID
```

Create the contractor organisation through authorized SQL first. This script is
privileged operator tooling, not an HTTP route; it uses the private DATABASE_URL,
checks that the Auth user has a confirmed email, and never creates accounts or
handles passwords. Role changes take effect at the next server authorization
check. Sign in at `/login`. Unassigned users see access pending. Contractors see their organisation-only intake/private proposals and published
slots. Planners land at `/plans`, with `/requests` review and an explicitly
fabricated `/sandbox` for exploratory conflict repair.

No default/demo online identities are seeded. Automated database tests use
random, rollback-only records without login credentials; any live sign-in UAT
uses temporary randomized accounts and deletes them after the check.

### Optional local-only demo identities

Issue #5 also provides `npm run db:seed-auth-local` for an already-running local
Supabase-compatible database. It refuses hosted/non-loopback URLs and production
mode before connecting, does not start Docker, and is not part of the hosted
workflow. Both demo passwords are random and written only to ignored
`.railplan-local-demo.json` with owner-only permissions. Existing credentials or
account emails cause refusal, not replacement. The hosted refusal is verified;
actual local account creation is not exercised in this no-Docker environment.

## Release verification (#17)

Use `npm ci`, `npm test`, `npm run test:db`, `npm run lint`, `npm run typecheck`
and `npm run build`. Then run `npm run test:e2e` separately: it starts a loopback
production server with controlled Anthropic/Telegram responses, uses real hosted
Auth and database application routes, and removes exact temporary fixtures. Read
`scripts/e2e/README.md` for preflight/cleanup boundaries. Do not run it alongside
other database tests or a shared production checkout build. Live external provider
success and a freshly recreated Supabase/Auth project are not claimed.

Do not publish the geographic snapshot until its conflicting source reuse notices
are resolved. No real Telegram recipients or model credentials are needed for the
controlled-provider suite. A public deployment has not been performed.
