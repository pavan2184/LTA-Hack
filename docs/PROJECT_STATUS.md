# Project Status

## Closure conformance correction — 2026-09-19

The owner's GCP public Scenario A output was rejected with 15 organiser-validator
closure violations. The corrected local checker now reproduces all 15 exact
messages and still accepts the unchanged organiser sample. Native CP-SAT/SCIP
models now represent real co-sharing groups and their transitive connectivity;
the bridge preserves chosen occupancy groups. Live buffers cross both lines,
and Consist buffers preserve the observed platform boundary. Earlier public
scores and benchmark proofs below are historical results of an incomplete model.
See [correction and evidence](PS1_CLOSURE_CORRECTION.md).

Fresh native public A/B/C results are **32.2 / 30 / 26.1**, each with complete
workloads, zero local hard violations and a matching full-local-model bound.
The regenerated export contains exactly nine CSVs. Verification passed:
**1,146 application tests** across 131 files (79 database-dependent tests
skipped), **67 native Python tests**, lint, typecheck and the webpack production
build. The exact 15-message regression and unchanged organiser sample both pass.
The first GitHub CI run hit only the five-second test-harness timeout in the
full-public disruption regression (5.24 seconds on that runner). Its timeout is
now 30 seconds; the fixture, assertions and solver search budgets are unchanged.
No organiser-validator attempts or GCP redeployment have been performed here.
The cloud engineer must deploy the corrected release before another hosted run.

Last updated: 2026-09-19. Application version: `0.4.0`.
The earlier native comparisons identify their historical snapshots (`d1e0a8f`
and stress source `e69b57b7…`). They predate the closure correction and do not
rank the corrected model. Dated implementation and verification logs live in
[PROJECT_STATUS_HISTORY.md](PROJECT_STATUS_HISTORY.md); do not treat their old
next steps, test counts or local server URLs as current instructions.

## Implemented

- **Native search experiments:** `ps1:benchmark:stress` compares full CP-SAT,
  redundant valid inequalities and targeted native repair under one end-to-end
  deadline. Eight fixed 60–120-activity stress inputs retain their original
  development/holdout seeds. Their old A/C witness candidates are quarantined
  after failing the corrected closure checks; they are not current feasibility
  certificates. The service retains its 60-second search default.

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
  Corrected public objectives are **A 32.2 / B 30 / C 26.1**, as recorded in
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

- **Algorithm Lab companion:** publicly available at
  <https://railplan-theta.vercel.app/algorithm-lab>, linked from the homepage
  and scheduler. A Python Vercel Function runs the same bounded OR-Tools model.
  The educational
  service covers six fictional jobs, nine accesses and eight weeks. Its page
  explains modelling, constraint propagation/search and proof/checking in three
  interactive steps. Capacity, one closed week and predecessor controls drive
  real solves; all 54 settings were independently cross-checked. The
  [new asset pack](../assets/submission/algorithm-lab-2026-09-19/README.md) contains
  five gallery/cover images, actual local captures, copy and a narration script.
  This does not replace or change the full-instance native PS1 service. The
  companion is rebased onto PR #47, with current solver descriptions and a
  dedicated Python CI job. The published Vercel scheduler retains the earlier
  browser runtime; publication does not certify a full native PS1 deployment.

## Latest recorded verification

The closure correction supersedes the solver-validity claims in the historical
rows below. Fresh public native solves use `ps1-closure-v1`, the default
60-second search cap and 11 available workers on the local M3 Pro. These runs
were concurrent with other verification; their timings are not a controlled
benchmark or a prediction for the target GCP instance. The
[native smoke record](../scripts/ps1/benchmark/closure-smoke-results.json) also
checks Live interchange A/B/C and records unresolved five-second cold searches
for Mixed 120 A and Mixed 240 C. All 16 old stress witnesses are quarantined;
the original dataset bytes remain unchanged. No browser, database, hosted GCP
or reference-validator checks were run for this correction.

The following documentation and implementation records predate the correction.

The README now explains the CP-SAT choice with equations for full workload,
precedence/ECLO windows, local possession packing, scoring-v2 objectives and the
full-model bound gap. The notation was checked against the native model and
local scorer; the example and selection claims were checked against stored
benchmark evidence. This documentation change adds no new solver or cloud run.

The [benchmark assurance record](PS1_BENCHMARK_ASSURANCE.md) now maps solver
selection claims to their artifacts and documents experiment controls, scoring
corrections, contrary findings and unresolved validation/deployment limits.
Documentation verification checked the native cohort totals, linked files and
anchors, and whitespace; no new solver, application or cloud run was performed.

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
| Final search-experiment integration with `b8bcdd3` | 95 focused benchmark, public-landing and workbench tests passed; lint, typecheck and webpack build passed. The measured native solver source hash remains unchanged | Full 1,111-test/Python/public-native checks are recorded in the preceding-source row below; first restricted build could not fetch existing Google Fonts, and the network-enabled retry passed. No new browser, database or cloud checks |
| Native search experiments, `3179fe0` solver source | 33 final-protocol runs valid, 19 full-model proofs, no errors/overruns; every paired final score ties. Tightening proves capacity pressure in 1.28–1.39s across three seeds and raises the best priority-contention bound to 261.0; 1,111 TS tests passed, 79 database-dependent tests skipped, 45 Python tests, lint, typecheck and webpack build passed. Fresh native public A/B/C remain 25.2/30/25.2, all OPTIMAL, exactly nine CSVs | Local M3 Pro/eight workers; production defaults unchanged. Calibration failures and a wholly excluded source-interference batch are retained. No target-cloud, database, browser or hosted-release checks rerun |
| Algorithm Lab Vercel publication, 2026-09-19 | 31 Python tests; 1,079 application tests passed (79 DB skips); lint/typecheck; Vercel production build; 14 public browser scenarios with no JS errors; live objective 5 → 19, nine accesses retained | Published release `ff05848` preserves browser PS1 baseline `e4ae8c6`; separate from current-main native PS1 runtime. See [release record](ALGORITHM_LAB_VERCEL_RELEASE.md) |
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

Algorithm Lab is public on Vercel at
<https://railplan-theta.vercel.app/algorithm-lab>. Deployment
`dpl_59NhKKk9Nt8AftwbcBQHd7tHUJqM` publishes release source `ff05848`, based on
`e4ae8c6` plus the isolated companion/navigation changes. The public homepage
explains the three steps and `/ps1` links to the lab in a new tab. The browser
scheduler still solves the published instance (A 25.2 / B 44 / C 25.2); this is
separate from current-main native scores. See the [release evidence](ALGORITHM_LAB_VERCEL_RELEASE.md).

The original Cloud Run deployment remains prepared but unverified. Existing asset
captions accurately describe their local capture provenance; new public captures
are in ignored `output/algorithm-lab-vercel`. Do not claim Google Cloud hosting
for this Vercel lab. The standalone local service remains at <http://127.0.0.1:8088>.

Use [PS1_SUBMISSION_CHECKLIST.md](PS1_SUBMISSION_CHECKLIST.md) as the actionable
release/submission checklist. The existing nine-domain judge URL is
https://railplan-nine.vercel.app/ps1; the separately verified Vercel publication
for this task is https://railplan-theta.vercel.app/ps1. `vercel.json` disables Git deployments;
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
