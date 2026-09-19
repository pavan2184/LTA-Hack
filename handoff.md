# RailPlan project handoff

Last updated: 19 September 2026. RailPlan `0.4.0`.

Start with [current status](docs/PROJECT_STATUS.md) for implementation, recorded
verification and remaining work. This file is an orientation index; setup belongs
in [the teammate handoff](docs/TEAM_HANDOFF.md), and detailed dated evidence belongs
in [status history](docs/PROJECT_STATUS_HISTORY.md).

## Product and boundaries

RailPlan has two separate planning surfaces:

- **Public PS1:** `/ps1` accepts eight CSVs and sends A/B/C to a bounded,
  same-origin native CP-SAT service without persisting uploads. It
  exports exactly nine official CSVs. The main view is the contract/activity work
  schedule, with linked location occupancy, explanations and reviewed changes.
  Current tracked public objectives are **25.2 / 30 / 25.2**. No login or database
  is required; refresh clears session work.
- **Authenticated RailPlan:** planners and contractors use intake/review, immutable
  saved plans, scoped publication, coordination and deferred-work carry-forward.
  Hosted Supabase supplies identity and persistence. The sandbox is fabricated
  exploration, separate from saved planning and the weekly PS1 model.

Full workload and hard constraints are mandatory. Local conformance is not the
organiser's reference-validator approval, and no output is an operational safety
instruction. [PS1_OFFICIAL_SPEC.md](docs/PS1_OFFICIAL_SPEC.md) is authoritative for
PS1 rules, scoring, output schema and deliverables.

## Start and verify

Use Node.js 22.13+ on the 22.x line, or 24.x, with npm; no Docker.

```bash
npm ci
python3 -m venv .venv-cpsat
.venv-cpsat/bin/pip install -r scripts/ps1/requirements.txt
npm run ps1:start
```

Open `http://localhost:3000/ps1`. This is the default startup URL, not a claim
that a server is currently running. For protected-workspace configuration,
database operations and role provisioning, follow
[TEAM_HANDOFF.md](docs/TEAM_HANDOFF.md).

Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` for
application changes. Protected-workflow releases also require the database and
controlled E2E gates described in [TESTING.md](docs/TESTING.md). Run shared
hosted-resource checks serially. PS1 solver changes additionally use the
[benchmark workflow](docs/PS1_BENCHMARK.md) and real browser upload/download checks.

## Release and next work

The recorded judge URL is https://railplan-nine.vercel.app/ps1, but it predates
the native service and is not evidence of the current release. Git deployments
are disabled; pushing to `main` does not publish a release. Deploy the combined
Node/Python runtime using [PS1_NATIVE_DEPLOYMENT.md](docs/PS1_NATIVE_DEPLOYMENT.md).
The [submission checklist](docs/PS1_SUBMISSION_CHECKLIST.md) owns deployment
verification, source handover, video and portal/sign-in actions. Current status
separates the last hosted observation from the checked-in implementation.

Use [docs/README.md](docs/README.md) for the contract/research index and follow the
required pre-coding reads in [AGENTS.md](AGENTS.md). Old numbered roadmap entries
and historical local URLs are not active work orders. Current status records
which decisions remain open.

The previous long handoff is retained in
[Git history at e4ae8c6](https://github.com/pavan2184/LTA-Hack/blob/e4ae8c6/handoff.md)
as a historical snapshot, including its superseded UI, scores and deployment claims.

## 20. Change log

| Date (Singapore) | Agent | Change and verification |
| --- | --- | --- |
| 2026-09-19 | Codex | Resolved PR #47 against current `main`, retaining the native CP-SAT judge path plus PR #48 candidate validation/ECLO-window regressions and PR #49 submission assets. Added all-or-nothing native result/ZIP generation and separate native/regression benchmark commands. Verification: 1,021 tests passed with 79 database-dependent skips; 101 targeted TypeScript/UI/API tests and 12 Python native tests passed; typecheck, lint and production build passed; one-run regression benchmark passed 39/39 outcomes at public A 25.2 / B 30 / C 25.2. The build required a 4 GiB Node heap after the default 2 GiB limit exhausted; the first isolated-worktree attempt also failed because Turbopack rejected external dependency symlinks. Database, controlled HTTP E2E, hosted deployment and browser upload/download checks were not rerun. |
