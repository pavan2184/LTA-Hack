# Project Status

Last updated: 2026-09-19. Application version: `0.4.0`.
Source baseline: `e4ae8c6` (README/assets, PR #49), including solver readiness
`7847292` (PR #48) and the workstation redesign merged through PR #46.
This is the current snapshot. Dated implementation and verification logs live in
[PROJECT_STATUS_HISTORY.md](PROJECT_STATUS_HISTORY.md); do not treat their old
next steps, test counts or local server URLs as current instructions.

## Implemented

- **Public PS1 judge path:** `/ps1` accepts the published or uploaded eight-file
  instance and solves A/B/C entirely in the browser, without login, database or
  server APIs. The schedule-first workstation opens on contract/activity work,
  with linked occupancy, attention, explanations, metrics and reviewed changes.
  Pins and applied capacity cuts survive re-runs; proposals require Apply and
  support Undo. Official export is exactly three CSVs per scenario, nine total.
- **Solver:** deterministic checked candidate reuse, nominal-supply alternatives
  for B/C and independent two-week ECLO windows per affected line in C. Complete
  workload and all encoded hard constraints remain mandatory. Public objectives
  are **A 25.2 / B 44 / C 25.2**, as recorded in
  [tracked results](../packages/ps1/data/results/SUMMARY.json).
  The local checker is not the organiser's reference validator.
- **Authenticated workspace:** intake/review, anonymous workforce capacity,
  immutable saved plans, revision previews, publication, scoped contractor slots,
  JSON/CSV exports, coordination, deferred-work backlog and reviewed carry-forward
  are implemented. The fabricated sandbox remains separate from saved planning.
  Hosted Supabase setup is required only for these protected workflows.
- **Submission materials:** the README, versioned
  [Devpost asset pack](../assets/submission/devpost-2026-09-19/README.md),
  [demo script](../assets/submission/DEMO_SCRIPT.md) and
  [PS1 write-up](../assets/submission/PS1_WRITEUP.md) are prepared.
  `npm run ps1:solve` generates the public results and exact nine-CSV ZIP;
  `npm run ps1:benchmark` checks public/synthetic quality and determinism.

## Latest recorded verification

These are prior run results, not checks rerun by this documentation cleanup.

| Scope | Evidence | Limit |
| --- | --- | --- |
| PR #48 application checks, 2026-09-19 | 962 tests passed, 79 database tests skipped; typecheck, lint and production build passed | Database skips do not satisfy the required database gate |
| Solver comparison | 117/117 measured outcomes passed; 13 of 39 dataset/scenario outcomes improved, none regressed | Prepared public/synthetic data, not undisclosed judging instances |
| Browser upload/export | All 12 synthetic instances, 36 scenarios and 108 downloaded CSVs checked; production public and Mixed 240 downloads rechecked | Local production preview, not hosted-release parity |
| Interaction checks | Upload recovery/replacement, review/export gating, Apply/Undo, retained cuts and desktop/mobile checks passed | Native screen-reader speech remains unverified |
| Authenticated release, 2026-09-17 | 821 tests including hosted DB checks, 13 concurrency checks and 6 controlled HTTP E2E checks; parity/cleanup verified | Historical release; controlled providers do not establish live delivery |
| PR #49 documentation/assets | Paths/anchors, npm commands, file sizes, image dimensions, checksums and whitespace checked | No application behavior changed |

See the [solver benchmark](PS1_BENCHMARK.md),
[dated status evidence](PROJECT_STATUS_HISTORY.md) and
[authenticated release report](RELEASE_VERIFICATION_2026-09-17.md) for details.

## Deployment and submission gates

Use [PS1_SUBMISSION_CHECKLIST.md](PS1_SUBMISSION_CHECKLIST.md) as the actionable
release/submission checklist. The canonical judge URL is
https://railplan-nine.vercel.app/ps1. `vercel.json` disables Git deployments;
a merge or push does not establish deployment freshness.

The last recorded hosted check on 2026-09-19 saw the earlier interface and C 39.2.
At that check the CLI account lacked access to the existing team's Vercel project.
This cleanup did not recheck deployment or account access. Confirm the intended
commit on the existing `railplan` project before recording/submitting the release.

This checkout has GitHub `origin` and a configured GitLab remote at
`git@gitlab.com-personal:Ducksss/lta-hack.git` (observed 2026-09-19). Remote
configuration alone does not establish a current, judge-accessible GitLab mirror.
Earlier notes saying no GitLab repository exists are superseded by this limited
observation. Verify its contents, access and submission URL separately.

No completed video/YouTube publication, portal receipt or physical sign-in is
recorded here. The official PS1 specification governs technical deliverables;
participant-pack conflicts still require organiser confirmation. Reference-validator
access, unseen-instance performance and actual screen-reader speech remain unverified.

## Remaining product decisions and limits

- Release gate #17 has remaining manual/accessibility and real-provider evidence
  requirements. Planner usability/time-saving claims need a human study; the
  [pilot protocol](PLANNER_USABILITY_PILOT.md) is prepared, not conducted.
- Audio intake (#18) and external source imports (#19) remain deferred pending
  consent/retention and provider/scope decisions. The old numbered issue plan is
  historical sequencing, not an instruction to restart completed work.
- CP-SAT benchmarking (#20) is complete; the TypeScript heuristic remains the
  production choice. CP-SAT is an offline comparison, not a pending service build.
- Named-worker evaluation (#21) is complete with a recommended no-go; acceptance
  awaits the owner's decision. No named-worker implementation is authorized.
- Contractor acknowledgements from PR #27 remain excluded under the recorded
  scope decision; this cleanup did not query its current remote PR status.
- Geographic-data redistribution permission remains unresolved. Prototype outputs
  are not operational safety approval. See [SECURITY_REVIEW.md](SECURITY_REVIEW.md)
  and [DECISIONS.md](DECISIONS.md) for the boundaries and accepted decisions.

## Repository context and artifact cleanup — 2026-09-19

Current status and handoff are concise; complete previous status snapshots remain
in the history file. Removed the unused project starter guide/bootstrap, obsolete
`.env` validation script and mismatched FastAPI Cursor rule. Historical plans
moved unchanged into [docs/archive](archive/README.md). The submission index now
points to the current versioned pack, demo and write-up; superseded campaign copy
is recoverable from Git history. Design evidence, current submission media,
complete synthetic fixtures, application code and runtime configuration remain.

Verification: archived-plan content preservation, removed-path reference checks,
active-document local paths/anchors, npm commands, current asset checksums and
`git diff --check`. Application tests/build were not rerun for this documentation
and unused-tooling cleanup. No server was started or verified. Use
[TEAM_HANDOFF.md](TEAM_HANDOFF.md) for setup; keep future status updates concise
and put detailed chronological evidence in the history file.
