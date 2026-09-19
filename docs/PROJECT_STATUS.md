# Project Status

Last updated: 2026-09-19. Application version: `0.4.0`.
Source baseline: `3179fe0` integrates the native search experiments with current
main, including the merged native PS1 service, workstation and Algorithm Lab.
The original native engine comparison remains the separately identified
`d1e0a8f` snapshot; the new stress comparison uses source hash `e69b57b7…`.
This is the current snapshot. Dated implementation and verification logs live in
[PROJECT_STATUS_HISTORY.md](PROJECT_STATUS_HISTORY.md); do not treat their old
next steps, test counts or local server URLs as current instructions.

## Implemented

- **Native search experiments:** `ps1:benchmark:stress` compares full CP-SAT,
  redundant valid inequalities and targeted native repair under one end-to-end
  deadline. Eight fixed 60–120-activity stress inputs have checked A/C feasibility
  certificates withheld from search, with separate development/holdout seeds.
  The service still uses its existing formulation and 60-second search default.

- **Public PS1 judge path:** `/ps1` accepts the published or uploaded eight-file
  instance without login or database access and sends one policy at a time to a
  bounded same-origin native CP-SAT service. Uploaded data is not persisted. The
  schedule-first workstation opens on contract/activity work,
  with linked occupancy, attention, explanations, metrics and reviewed changes.
  Pins and applied capacity cuts survive re-runs; proposals require Apply and
  support Undo. Official export is exactly three CSVs per scenario, nine total.
- **Solver:** a checked TypeScript hybrid supplies a warm start to the native
  weekly OR-Tools CP-SAT portfolio, with a 60-second search cap and up to 16
  available workers by default. The target is 32 vCPUs / 64 GiB RAM; the worker
  default remains provisional pending target-host measurements. Candidate reuse,
  nominal-supply alternatives, adaptive repair and independent two-week ECLO
  windows remain available to the heuristic. Complete workload and all encoded
  hard constraints remain mandatory.
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
  `npm run ps1:benchmark` compares heuristic construction/search;
  `npm run ps1:benchmark:cloud` compares native engines and search profiles;
  `npm run ps1:benchmark:regression` checks public/synthetic quality and determinism.

- **Algorithm Lab companion:** a standalone Python OR-Tools CP-SAT educational
  service covers six fictional jobs, nine accesses and eight weeks. Its page
  explains modelling, constraint propagation/search and proof/checking in three
  interactive steps. Capacity, one closed week and predecessor controls drive
  real solves; all 54 settings were independently cross-checked. The
  [new asset pack](../assets/submission/algorithm-lab-2026-09-19/README.md) contains
  five gallery/cover images, actual local captures, copy and a narration script.
  This does not replace or change the full-instance native PS1 service. The
  companion is rebased onto PR #47, with current solver descriptions and a
  dedicated Python CI job.

## Latest recorded verification

An earlier README-only update added the four-case warm/cold/LNS-only CP-SAT
comparison alongside SCIP and both TypeScript hybrid modes, with explicit
scores, bounds, proof counts and selection rationale. Figures were checked
against the tracked benchmark JSON; historical scoring-v1 and unmeasured
candidates remain separate. Documentation links and whitespace were checked.
No new solver runs, application tests or cloud measurements were performed for
that earlier documentation update. The new stress runs are recorded separately.

The Algorithm Lab row records this companion feature. The combined-merge rows
and subsequent evidence retain their earlier scope.
The native comparison is the `d1e0a8f` snapshot (source `a10cbe7b…`, scoring v2).
The incoming TypeScript ECLO constructor changes can alter its heuristic baseline
and warm starts; do not relabel the stored comparison as a rerun of the new tree.

| Scope | Evidence | Limit |
| --- | --- | --- |
| Native search experiments, `3179fe0` solver source | 33 final-protocol runs valid, 19 full-model proofs, no errors/overruns; every paired final score ties. Tightening proves capacity pressure in 1.28–1.39s across three seeds and raises the best priority-contention bound to 261.0; 1,111 TS tests passed, 79 database-dependent tests skipped, 45 Python tests, lint, typecheck and webpack build passed. Fresh native public A/B/C remain 25.2/30/25.2, all OPTIMAL, exactly nine CSVs | Local M3 Pro/eight workers; production defaults unchanged. Calibration failures and a wholly excluded source-interference batch are retained. No target-cloud, database, browser or hosted-release checks rerun |
| Algorithm Lab, 2026-09-19 | 21 backend tests; all 54 settings checked against independent exact dynamic programming; 14 browser scenarios; lint, typecheck, Gunicorn config, ShellCheck and strict UI audit passed | Local Python service; no public Cloud Run revision verified; see [verification](ALGORITHM_LAB_VERIFICATION.md) |
| Final combined merge, 2026-09-19 | 1,079 tests passed across 113 files, 79 database-dependent tests skipped; lint, typecheck and webpack production build passed; real native API-function/CLI public smokes retained A 25.2 / B 30 / C 25.2, all OPTIMAL, default 60s and exactly nine CLI CSVs | Database/browser/hosted-release/cloud-scaling checks not rerun; non-failing React act/Vite warnings remain |
| Post-merge heuristic check, 2026-09-19 | All 39 hybrid baselines and 39 extended-hybrid outcomes locally valid; capacity-pressure C improves 1118.8 → 1105.5 in both, other 38 scores unchanged | Fresh heuristic-only comparison; native models/checker unchanged, original native timing cohorts not rerun |
| Local 60-second native comparison, `d1e0a8f` snapshot | 119 native runs: 100 OPTIMAL, 11 FEASIBLE, eight INFEASIBLE; all 111 returned schedules locally checked; main CP-SAT/SCIP matrix ties on all 39 scores | M3 Pro/eight workers, not target-cloud performance; recorded before incoming heuristic changes |
| Native comparison verification before `d1e0a8f` | 1,071 tests passed, 79 database-dependent skipped; 40 Python tests, lint, typecheck, webpack production build and native public API-function/CLI smokes passed | These counts do not certify the later `2957345` reconciliation; no new browser, hosted-release or cloud scaling run |
| PR #48 application checks, 2026-09-19 | 962 tests passed, 79 database tests skipped; typecheck, lint and production build passed | Database skips do not satisfy the required database gate |
| Solver comparison | 117/117 measured outcomes passed; 13 of 39 dataset/scenario outcomes improved, none regressed | Prepared public/synthetic data, not undisclosed judging instances |
| Browser upload/export | All 12 synthetic instances, 36 scenarios and 108 downloaded CSVs checked; production public and Mixed 240 downloads rechecked | Local production preview, not hosted-release parity |
| Interaction checks | Upload recovery/replacement, review/export gating, Apply/Undo, retained cuts and desktop/mobile checks passed | Native screen-reader speech remains unverified |
| Authenticated release, 2026-09-17 | 821 tests including hosted DB checks, 13 concurrency checks and 6 controlled HTTP E2E checks; parity/cleanup verified | Historical release; controlled providers do not establish live delivery |
| PR #49 documentation/assets | Paths/anchors, npm commands, file sizes, image dimensions, checksums and whitespace checked | No application behavior changed |
| PR #47 native GCE run, 2026-09-19 | `n2-highcpu-32` run exited 0; 38 native cases optimal, 8 feasible, 3 unknown and 2 checker/model mismatch errors; VM terminated and artifacts retained in GCS | One-off benchmark, not a durable app deployment; 32/32/8 holdout remained unresolved |
| PR #47/current-main integration, 2026-09-19 | 1,021 tests passed with 79 database skips; 101 targeted tests, 12 Python tests, typecheck, lint and production build passed; heuristic regression passed 39/39 outcomes | Build needed a 4 GiB Node heap; database/E2E, browser and hosted-release checks were not rerun |

See [native research and measurements](PS1_NATIVE_SOLVER_RESEARCH.md),
the [solver benchmark](PS1_BENCHMARK.md),
[dated status evidence](PROJECT_STATUS_HISTORY.md) and
[authenticated release report](RELEASE_VERIFICATION_2026-09-17.md) for details.

## Deployment and submission gates

Algorithm Lab is running locally at <http://127.0.0.1:8088>. Its isolated Cloud
Run deployment script is prepared, but no `gcloud` account/project is configured
here. The user must identify the intended Google Cloud project and authenticated
deployment context before publication. Asset captions currently say local
preview; do not claim a Google Cloud-hosted lab until the public URL is verified.

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

## Native benchmark reconciliation — 2026-09-19

Preserved the concise current-status/history split from `2957345` and archived
`d1e0a8f`'s detailed native comparison and verification record in
[PROJECT_STATUS_HISTORY.md](PROJECT_STATUS_HISTORY.md). Native CP-SAT with a
validated heuristic remains the practical default; SCIP is an independently
implemented challenger. The local comparison found identical main-matrix scores,
with stronger CP-SAT score consistency and stronger SCIP proof completion on the
selected repeated cases. This is snapshot-specific evidence, not a universal
solver ranking.

The incoming update improves Scenario C ECLO construction in the TypeScript
heuristic; the native formulations and scoring-v2 checker remain unchanged.
A fresh 78-outcome heuristic check passed: capacity-pressure C is now 1105.5
for both baseline and extended search; the other 38 scores are unchanged.
Fresh combined verification passed 1,079 tests (79 database-dependent skips),
lint, typecheck and the webpack production build. Real native service-function
and CLI smokes retained public A/B/C 25.2/30/25.2 and full-model proofs; the CLI
exported exactly nine official CSVs. The unchanged Python models already passed
40 tests in the benchmark snapshot. Earlier counts remain separately scoped above.
No new deployment or target-VM benchmark is claimed by this reconciliation.

The engineer amended the shared merge as `e3638a4` to give the full-workstation
mocked solve test a 10-second CI budget after a 5.2-second run exceeded its old
five-second limit without an assertion failure. That adjustment and its handoff
notes are preserved; application and native solver code are unchanged from the
1,079-test verification above.
The affected workbench suite was rerun after that adjustment: 21/21 tests passed.
