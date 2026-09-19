# PS1 benchmark assurance record

> **Superseded evidence — closure conformance correction.** The pre-correction
> benchmark scores, feasibility counts, proofs and algorithm rankings below are
> historical results from an incomplete closure model. They are not valid PS1
> ranking or conformance evidence. A public A export passed our old checker but
> received 15 closure violations. The corrected regression reproduces all 15
> reported messages and accepts the published sample with zero closure violations.
> Consist buffers extend sectors; Live buffers also include outer platforms and
> expand across the interchange before mirroring. The correction is identified as
> `ps1-closure-v1`. Corrected public exports are recorded in
> [current project status](PROJECT_STATUS.md); algorithm comparisons still
> need fresh runs. No deployed fix or reference-validator parity is claimed.

Recorded 2026-09-19. This is an evidence index for reviewers and the cloud
engineer, not a new benchmark or a reference-validator certification.

The original solver selection was traceable to versioned measurements, but its
checker and models omitted mandatory closures. CSV round-trips, objective parity
and passing tests did not catch that shared omission. The measurements remain
inspectable history; their PS1 feasibility and ranking conclusions are withdrawn. The [README comparison](../README.md#ps1-native-solver-benchmark-and-selection)
contains the numerical tables; this record explains how to audit them.

## Historical measurements — incomplete closure model

The [stored comparison](../scripts/ps1/benchmark/cloud-results.json) uses scoring
`ps1-objective-v2`, source snapshot `d1e0a8f` and source SHA-256
`a10cbe7bb8bbd252c27726aa8b222d67b20abcec785829496c61970d1ca1768e`.
The recorded pre-merge HEAD alone does not identify that measured working tree;
the artifact's provenance explains the reconciliation to the committed snapshot.
Hardware was Apple M3 Pro, 11 available CPUs, 18 GiB RAM, eight requested native
workers and a 60-second search cap. These are local measurements.

| Experiment | Coverage | Question answered |
| --- | --- | --- |
| Main comparison | Public input plus 12 synthetic inputs, A/B/C: 39 cases each for warm CP-SAT, SCIP and extended hybrid, with heuristic baselines | Does the native engine improve on the heuristic, and does SCIP challenge the choice? |
| Search-mode ablation | Cold CP-SAT and LNS-only on four shared C cases, seed 1 | Does removing hints or restricting search to LNS improve scores or proofs? |
| Repeated runs | Two difficult C cases, CP-SAT and SCIP, seeds 1/2/3; seed 1 reused from the main cohort | Is the best observed score consistently recovered? |
| Perturbed holdouts | 24 seeded B perturbations plus public B control, CP-SAT only | What happens beyond the original fixtures, including construction failures? |

Together these cohorts contain **119 native runs: 100 OPTIMAL, 11 FEASIBLE and
eight INFEASIBLE**. All 111 returned native schedules passed the then-incomplete local checker.
The eight infeasible outcomes remain in the denominator. This is not 119
independent datasets: cases recur across variants and seeds.

## Controls and their evidence

| Control | What we did | Inspectable evidence |
| --- | --- | --- |
| Requirements before optimisation | Require every activity's workload in full; hard constraints are never exchanged for a lower penalty | [Official specification](PS1_OFFICIAL_SPEC.md), [local checker](../packages/ps1/src/engine/validate.ts) |
| Check the exported answer | Decode native solutions into the official CSVs, reparse them, run local checks and require agreement with the native objective | [Native bridge tests](../scripts/ps1/benchmark/native.test.ts), [testing plan](TESTING.md) |
| Identify the experiment | Record source/input digests, formula version, solver version, host, workers, seeds and limits | [Row-level results](../scripts/ps1/benchmark/cloud-results.json), [benchmark harness](../scripts/ps1/benchmark/cloud.ts) |
| Keep comparisons comparable | Use the same four C inputs and native limits for warm/cold/LNS/SCIP; label the smaller sample separately from the 39-case matrix | [README ablation table](../README.md#cp-sat-vs-lns-only-cold-search-scip-and-hybrid) |
| Expose fallback use | Keep native status/objective separate from the selected heuristic fallback; a fallback does not turn UNKNOWN or ERROR into a native success | [Selection tests](../scripts/ps1/native-selection.test.ts), [harness](../scripts/ps1/benchmark/cloud.ts) |
| Preserve failure evidence | Retain infeasibility, errors and heuristic construction failures instead of filtering them out | [Holdout results](../scripts/ps1/benchmark/cloud-results.json), [measurement protocol](PS1_NATIVE_SOLVER_RESEARCH.md#measurement-protocol) |
| Separate score from proof | Report objective, lower bound and status; frozen-repair bounds apply only to their subproblem | [Research report](PS1_NATIVE_SOLVER_RESEARCH.md), [CP-SAT tests](../scripts/ps1/benchmark/test_cp_sat.py), [SCIP tests](../scripts/ps1/benchmark/test_scip.py) |
| Separate search time from response time | Record model/process/check overhead; the 60-second search cap is not an end-to-end latency promise | [Benchmark timing definitions](../scripts/ps1/benchmark/README.md#60-second-cloud-comparison) |
| Check stability | Repeat the two hard C cases; disclose that changing the seed also changes the heuristic start and that parallel search is nondeterministic | [Repeated-run evidence](PS1_NATIVE_SOLVER_RESEARCH.md#repeated-seeds-on-the-difficult-cases) |

## Findings that challenged our initial assumptions

- **The scoring correction mattered.** Earlier terminal-only lateness scoring
  was replaced by per-activity scoring. Old v1 results remain explicitly
  superseded. The later closure defect also supersedes the v2 ranking. See the [scoring test plan](TESTING.md#native-ps1-service-and-scorer-v2--2026-09-19).
- **CP-SAT did not beat SCIP everywhere.** SCIP tied all 39 main scores and
  proved one more optimum. CP-SAT recovered the best priority-contention C
  score in all three seeds; SCIP did so in one. Those observations concern the
  incomplete model and no longer support a valid PS1 solver ranking.
- **Hints were not always faster.** Cold CP-SAT proved capacity-pressure C
  optimal within its cap when the seed-1 warm run did not. Warm starts supply
  useful incumbents but can change the proof search adversely.
- **LNS-only was not better on the tested subset.** It tied all four scores
  but left both hard-case lower bounds at zero. The full CP-SAT portfolio
  already includes LNS; choosing it does not discard neighbourhood search.
- **More time did not automatically lower scores.** The earlier five-second
  v2 matrix reached the same 39 native scores. Different source runs prevent
  treating this as a controlled speed comparison.
- **Later code is not silently covered by earlier timings.** A subsequent
  heuristic update improved capacity-pressure C from 1118.8 to 1105.5 in a
  [separate quality check](../scripts/ps1/benchmark/post-merge-hybrid-results.json).
  The original native timings remain attached to their original snapshot.

## Limits and remaining verification

The local checker is not the organiser's reference validator. Its previous
omission of mandatory closure checks invalidates the recorded conformance and
optimality claims for PS1; lack of a physical-night field is not a waiver of those
rules. The correction uses `ps1-closure-v1`, separate from the objective
version, and needs fresh exported-schedule checks and benchmarks. Synthetic
fixtures and perturbations are not independent operator data or the judges' hidden
instances.
Twenty-seven main cases already have zero scores, so aggregate medians and win
counts need that context. The two repeated cases do not establish statistical
significance. SCIP and LNS-only were not tested on the perturbed holdouts.

The 32-vCPU / 64-GiB deployment needs its own 8/16/32-worker comparison, repeated
seeds, API latency and cancellation checks. The separately recorded temporary
GCE run included two checker/model mismatch errors and three UNKNOWN outcomes;
those remain separate from the clean local cohort, not evidence of deployment
readiness. See [project status](PROJECT_STATUS.md) and the
[cloud acceptance experiment](PS1_NATIVE_SOLVER_RESEARCH.md#cloud-acceptance-experiment).
Hosted upload, nine-CSV export and reference-validator checks remain distinct
acceptance gates in the [submission checklist](PS1_SUBMISSION_CHECKLIST.md).

Application test counts certify only their recorded revision and scope.
[PR #51](https://github.com/pavan2184/LTA-Hack/pull/51) added documentation and was
merged at the owner's request before its remaining CI checks completed; the
merge itself is not evidence that those checks passed.

## Reproduce and extend the record

Use the [benchmark commands](../scripts/ps1/benchmark/README.md#60-second-cloud-comparison)
from the measured snapshot only to audit the historical experiment. For corrected
comparisons, record a new revision, source digest and `ps1-closure-v1` model
identifier, and revalidate or regenerate every schedule certificate. Retain the generated per-run
schedule witnesses as well as the summary. The tracked comparison is a trimmed
metrics artifact, not a complete archive of every schedule witness. Repetition
does not guarantee identical parallel-search results.

For each new experiment record: the hypothesis, source and input digests, scorer
and solver versions, hardware and worker count, seeds and budgets, every outcome
including errors, native and selected scores, proof scope and bounds, search and
end-to-end times, validation result, artifact location, conclusion and unresolved
checks. Set the cases and budgets before comparing results; explain any reruns
or exclusions. Keep a new cohort separate until its comparability is established.
