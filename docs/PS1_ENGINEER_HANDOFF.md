# PS1 native solver handoff

The owner authorized server-side infrastructure on 2026-09-19. `/ps1` now calls a
same-origin native CP-SAT API, using up to eight CPU workers and a validated
heuristic incumbent. The prior browser-only restriction is superseded; the
organiser explicitly permits a service behind a thin UI.

Start with [PS1_NATIVE_DEPLOYMENT.md](PS1_NATIVE_DEPLOYMENT.md) for Compute Engine,
Python installation, process supervision, nginx, HTTPS and deployment smoke checks.
No cloud resources or credentials were provisioned by this change. The initial
runtime is Node plus Python on a VM; a Cloud Functions adapter is not implemented.

The benchmark matrix has 39/39 locally feasible results, 37 full-model optima and
two unresolved bounds with eight workers and five-second search budgets. The
service's default budget is 20 seconds. Public A/B/C25.2/30/25.2 all have full-model
proofs. [Recorded v2 evidence](../scripts/ps1/benchmark/native-results.json) and
[reproduction commands](../scripts/ps1/benchmark/README.md) include hardware,
seeds, budgets, statuses, bounds, errors and CSV validation. This establishes the
strongest tested implementation here, not a universal scheduling winner.

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
