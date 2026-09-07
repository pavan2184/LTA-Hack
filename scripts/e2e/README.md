# Production HTTP E2E

Run `npm run build` followed by `npm run test:e2e` with the existing ignored
`.env.local` for the assigned RailPlan development project. Coordinate with other
database tests and local servers first: this suite creates committed fixtures,
uses the planning-source lock and starts one production server at
`http://127.0.0.1:3101`. It refuses an occupied port, a different project, an
existing publication on the selected night, or active approved user intake.

The journey uses three real Supabase password sessions and normal application
HTTP endpoints. SQL is limited to provisioning temporary confirmed identities,
profiles and organisations, preflight checks, and exact cleanup. All submissions,
private draft edits, approvals, solves, publication, notifications and exports
travel through production handlers and their authorization/RLS boundaries.

`provider-preload.mjs` is confined to the test child process. It requires an
explicit harness marker and exact loopback start arguments. The application has
no test route, test mode or provider URL override. Anthropic returns a controlled
schema-valid partial proposal; Telegram returns a definite first failure and a
matching success on explicit retry. Unknown external fetches fail closed. Only
the configured Supabase `/auth/v1/` origin/path may reach the network from the
child. Real provider credentials in the parent are replaced with inert values in
the child; no real Anthropic or Telegram request is sent. Hosted Data API private
schema exposure is checked separately through a nonmutating authenticated RPC (read_current_planning_source).

The suite proves HTTP integration, not actual model extraction quality, provider
delivery, visual rendering, screen-reader behavior or a fresh hosted-project
bootstrap. Those are separate verification boundaries. It uses the existing
seeded fabricated planning facts and never resets or reseeds the hosted database.
The baseline saved version becomes stale after approval; the final version uses
the new exact immutable request revisions and workforce demand.

The server stops before cleanup even when an assertion fails. Cleanup selects
exact newly provisioned UUIDs, locks affected tables, temporarily disables and
restores all 13 immutable-history guards in one transaction, checks the guards,
and removes fixture users/organisations. Source revision advances monotonically;
it is never reset to an older value. No transcript or credentials are written to
disk. A mode-0600 temporary recovery manifest contains only user/organisation
UUIDs. It is deleted on successful cleanup and retained with its path in the error
if cleanup fails or the process is forcibly terminated. The original test error
and cleanup failure are both retained. Stop other writers before recovering exact
IDs with the same cleanup helper; never delete by broad email prefix or reset the
database.

The default `npm test` excludes this suite. Provider isolation checks can run
alone without starting a server or touching the database:

```sh
npx vitest run --config vitest.e2e.config.ts scripts/e2e/provider-policy.test.ts
```
