# PS1 native solver handoff

The owner authorized server-side infrastructure on 2026-09-19. `/ps1` now calls a
same-origin native CP-SAT API, using up to 16 CPU workers by default and a validated
heuristic incumbent. The prior browser-only restriction is superseded; the
organiser explicitly permits a service behind a thin UI.

Start with [PS1_NATIVE_DEPLOYMENT.md](PS1_NATIVE_DEPLOYMENT.md) for Compute Engine,
Python installation, process supervision, nginx, HTTPS and deployment smoke checks.
The algorithm comparison here provisioned no cloud resources or credentials.
A separate engineer's temporary GCE experiment is recorded in PROJECT_STATUS;
it did not establish a durable app deployment. The initial
runtime is Node plus Python on a VM; a Cloud Functions adapter is not implemented.

The 60-second main comparison has 39/39 locally feasible schedules for both
CP-SAT and SCIP, with equal scores on every case. CP-SAT proves 37 full-model
optima and SCIP 38. Deploy the integrated CP-SAT service and keep SCIP as an
independent challenger; there is no unique measured score winner. The service's
current default is **60 seconds per scenario**, targeting **32 vCPUs / 64 GiB
RAM**. Public A/B/C scores of 25.2/30/25.2 all have full-model proofs.
[Recorded v2 comparison](../scripts/ps1/benchmark/cloud-results.json) and
[reproduction commands](../scripts/ps1/benchmark/README.md) include hardware,
seeds, budgets, statuses, bounds, errors and CSV validation. Earlier five-second
CP-SAT evidence remains in `native-results.json` as a separate experiment.

## 60-second comparison and cloud worker sweep

The native comparison is pinned to measured snapshot `d1e0a8f`. A subsequent
ECLO-construction merge improves the hybrid's capacity-pressure C score to
1105.5, with the other 38 baseline/extended scores unchanged. Native models and
the checker are unchanged; the paired native timing and repeat cohorts were
not rerun after that merge. Both sets of evidence are linked in the research.

The extended research compares native CP-SAT with and without heuristic hints,
its built-in LNS-only mode, an independently formulated SCIP MIP, and extended
TypeScript repair. See [research and final measurements](PS1_NATIVE_SOLVER_RESEARCH.md).
All current results use scoring v2; initial pre-reconciliation v1 screening was
discarded as decision evidence. No measured results are from the target cloud VM.

```sh
# Use the runtime setup in PS1_NATIVE_DEPLOYMENT.md first.
.venv-cpsat/bin/python scripts/ps1/benchmark/test_cp_sat.py
.venv-cpsat/bin/python scripts/ps1/benchmark/test_scip.py

# Full 39-case native comparison, sequential jobs, 60s search each.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-main --variants cpsat-warm,scip-warm,hybrid-extended
# Target-host worker scaling; four C cases × three settings × three seeds.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-workers --datasets public,05-capacity-pressure,11-priority-contention,12-mixed-240 --scenarios C --variants cpsat-warm --workers 8,16,32 --seeds 1,2,3
# Cold and LNS-only challengers.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-ablation --datasets public,05-capacity-pressure,11-priority-contention,12-mixed-240 --scenarios C --variants cpsat-cold,cpsat-lns
# Include the earlier unresolved heuristic holdouts.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-holdout --datasets public --holdouts 24 --scenarios B --variants cpsat-warm
# Arbitrary uploaded-instance directory to official CSVs, separate auxiliary report.
npm run ps1:solve:native -- --python .venv-cpsat/bin/python --input packages/ps1/data/public --output output/native-public --workers 16 --seconds 60
```

Use fresh output directories. Identical benchmark runs can resume with `--resume`;
source, inputs, runtime and CPU configuration must still match. The worker sweep
has a worst-case 36 minutes of solver search; proofs can stop earlier. The public
API does not expose these benchmarking controls. Start at 16 workers, then choose
8/16/32 using validated scores, end-to-end latency, bounds and memory on the VM.

The API's 60-second search budget has a 75-second child wall guard, a 90-second
client timeout and a 100-second proxy timeout. Three sequential A/B/C solves can
therefore take about three minutes of search plus overhead. It currently returns
completed scenario responses; it does not stream every improving incumbent.
Retain one admitted solve per Node process until aggregate concurrency is tested.

Scoring v2 fixes per-activity lateness against the contract planned date; the old
terminal-only gate could reward delaying work. `results.json` is explicitly
superseded history. The public CSVs and validation artifacts are regenerated with
the native service. The four generated Next type-signature blockers are fixed;
current verification results are in [PROJECT_STATUS.md](PROJECT_STATUS.md).

Keep complete workload, hard pins, physical capacity cuts, predecessor order,
legal sharing, weekly/workfront rules and scenario policies. Every native result
passes CSV round-trip, local score and pin validation, followed by browser-side
checking. Replans release automatic successor retention pins where dependencies
are affected, and preserve explicit planner pins. Apply/Discard/Undo and export
gating remain unchanged.

The checker is local, not the organiser's reference validator. Physical-night
alignment across separate possessions is not encoded by the published fields.
An OPTIMAL label covers the full local model only; UNKNOWN never proves
infeasibility. Preserve exactly three CSVs per scenario, nine across A/B/C.
