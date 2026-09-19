# Project Status

Last updated: 2026-09-19. Application version: `0.4.0`.
Source baseline: PR #47 rebased onto `6780ac4`, including submission assets from
PR #49, solver readiness from PR #48 and the workstation redesign from PR #46.
This is the current snapshot. Dated implementation and verification logs live in
[PROJECT_STATUS_HISTORY.md](PROJECT_STATUS_HISTORY.md); do not treat their old
next steps, test counts or local server URLs as current instructions.

## Implemented

- **Public PS1 judge path:** `/ps1` accepts the published or uploaded eight-file
  instance without login or database access and sends one policy at a time to a
  bounded same-origin native CP-SAT service. Uploaded data is not persisted. The
  schedule-first workstation opens on contract/activity work,
  with linked occupancy, attention, explanations, metrics and reviewed changes.
  Pins and applied capacity cuts survive re-runs; proposals require Apply and
  support Undo. Official export is exactly three CSVs per scenario, nine total.
- **Solver:** a checked TypeScript hybrid supplies a warm start to the native
  weekly OR-Tools CP-SAT portfolio. Candidate reuse, nominal-supply alternatives,
  adaptive repair and independent two-week ECLO windows remain available to the
  heuristic. Complete workload and all encoded hard constraints remain mandatory.
  Public objectives are **A 25.2 / B 30 / C 25.2**, as recorded in
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
  `npm run ps1:benchmark` runs the hybrid/native comparison;
  `npm run ps1:benchmark:regression` checks public/synthetic quality and determinism.

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
| PR #47 native GCE run, 2026-09-19 | `n2-highcpu-32` run exited 0; 38 native cases optimal, 8 feasible, 3 unknown and 2 checker/model mismatch errors; VM terminated and artifacts retained in GCS | One-off benchmark, not a durable app deployment; 32/32/8 holdout remained unresolved |
| PR #47/current-main integration, 2026-09-19 | 1,021 tests passed with 79 database skips; 101 targeted tests, 12 Python tests, typecheck, lint and production build passed; heuristic regression passed 39/39 outcomes | Build needed a 4 GiB Node heap; database/E2E, browser and hosted-release checks were not rerun |

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
PR #47's native service was exercised on a temporary 32-vCPU Google Compute Engine
VM, which was terminated after the benchmark; it is not a durable judge deployment.
Deploy the merged Node/Python runtime using [PS1_NATIVE_DEPLOYMENT.md](PS1_NATIVE_DEPLOYMENT.md)
and confirm the intended commit before recording/submitting the release.

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
- CP-SAT benchmarking (#20) is complete and the native solver is now the primary
  same-origin execution path. A durable judge deployment and hosted parity check
  remain outstanding.
- Named-worker evaluation (#21) is complete with a recommended no-go; acceptance
  awaits the owner's decision. No named-worker implementation is authorized.
- Contractor acknowledgements from PR #27 remain excluded under the recorded
  scope decision; this cleanup did not query its current remote PR status.
- Geographic-data redistribution permission remains unresolved. Prototype outputs
  are not operational safety approval. See [SECURITY_REVIEW.md](SECURITY_REVIEW.md)
  and [DECISIONS.md](DECISIONS.md) for the boundaries and accepted decisions.

## Context maintenance — 2026-09-19

Archived the complete previous status log, replaced the root handoff with an
orientation index, refreshed teammate setup/release guidance and corrected stale
roadmap/submission pointers. Historical evidence remains available; old server
URLs and account observations are not current environment guarantees.

Verification: archive preservation, changed-document local paths/anchors,
documented npm scripts, tracked public scores, deployment configuration and
`git diff --check`. Application tests/build were not rerun for documentation-only
changes. No server was started and no existing local server was verified here.
For setup use [TEAM_HANDOFF.md](TEAM_HANDOFF.md); keep future status updates concise
and put detailed chronological evidence in the history file.

## PR #47 integration — 2026-09-19

Resolved the native-solver PR against the PR #48 solver-readiness work and PR #49
submission assets. The merged TypeScript heuristic now enforces Scenario C ECLO
windows across every affected line, including Live interchange closures, while
the same-origin CP-SAT service remains the production solve path. Native result
generation is all-or-nothing and writes the exact nine-file ZIP.

Fresh checks: 1,021 tests passed with 79 database-dependent skips; 101 focused
PS1/API/UI tests and 12 Python CP-SAT tests passed; typecheck, lint and the
production build passed. The one-run deterministic regression benchmark passed
39/39 public/synthetic outcomes with public A 25.2 / B 30 / C 25.2. The first
isolated-worktree build could not follow dependencies outside the Turbopack root;
the first local-dependency build exhausted Node's default 2 GiB heap, and the
same build passed with a 4 GiB heap. Database, controlled HTTP E2E, hosted-release
and browser upload/download checks were not rerun. The first GitHub run exceeded
the default five-second timeout in the full-workstation mocked solve test (5.2
seconds, with no assertion failure); that integration test now has an explicit
10-second budget matching the existing two-solve test.
