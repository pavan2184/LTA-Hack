# PS1 native solver selection

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

A subsequent [tighter-model and targeted-repair experiment](PS1_NATIVE_SEARCH_EXPERIMENTS.md)
uses eight new fixed stress inputs and an equal total-pipeline deadline. It is
recorded separately from the native-search-only cohorts below. Both cohorts
predate closure enforcement. Their performance-based recommendations are
superseded pending corrected comparisons.

Owner direction, 2026-09-19: **32 vCPUs, 64 GiB RAM, 60-second default search**.
Cloud computation is explicitly authorised; the earlier browser-only deployment
choice is superseded. The cloud engineer deploys. The engineer's concurrent native
API and corrected per-activity scorer were reconciled before the final benchmark.
`/ps1` now calls that native API; no actual cloud deployment is claimed here.
All four completed cohorts, configurations and row-level metrics are in
[cloud-results.json](../scripts/ps1/benchmark/cloud-results.json). The recorded
source SHA identifies the reconciled working tree; its pre-merge HEAD alone does
not identify the measured source.

**Measured snapshot: `d1e0a8f`.** That committed source matches the recorded hash.
A later shared-branch merge (`2957345`) improved TypeScript ECLO construction but
did not change either native model or the checker. A separate
[post-merge quality check](../scripts/ps1/benchmark/post-merge-hybrid-results.json)
passed the old checker on all 39 baseline and 39 extended-hybrid outcomes, changing capacity-pressure
C from 1118.8 to 1105.5 with the other 38 scores unchanged. The native timing and
repeated-seed cohorts below remain the original paired snapshot, not measurements
of that later heuristic revision. Rerun the complete comparison on the cloud host.

## Historical recommendation and measurements — superseded

The integrated engine is **native CP-SAT with a heuristic warm start** and a
60-second search cap. The historical recommendation used the measurements below;
its empirical quality and proof-speed rationale is withdrawn because the model
omitted mandatory closures. CP-SAT remains a suitable modelling candidate and
SCIP an implemented challenger, but corrected benchmarks are needed to rank them.
The provisional 16-worker choice still needs an 8/16/32-worker experiment on the
32-vCPU host. This document does not claim a deployed correction.

The complete main comparison uses 13 inputs × A/B/C, scoring v2, seed 1, eight
native workers and sequential jobs on the local M3 Pro. Lower scores are better.

| Method | Passed old checker | Lower old-model score than hybrid | Incomplete-model optima |
| --- | ---: | ---: | ---: |
| Hinted CP-SAT | 39/39 | 4 | 37 |
| Hinted SCIP MIP | 39/39 | 4 | 38 |
| Extended TypeScript hybrid | 39/39 | 0 | No solver proof |

| Case | Hybrid baseline | CP-SAT | SCIP | Improvement |
| --- | ---: | ---: | ---: | ---: |
| Capacity pressure B | 293 | 230 | 230 | 21.5% |
| Capacity pressure C | 1118.8 | 1090.8 | 1090.8 | 2.5% |
| Priority contention B | 483 | 279 | 279 | 42.2% |
| Priority contention C | 340.4 | 300.7 | 300.7 | 11.7% |

Both native engines tie the baseline on the other 35 cases; 27 of the 39 cases
already had zero scores. Public A/B/C were reported at 25.2/30/25.2 with proofs
from both engines, but those incomplete-model proofs do not certify PS1 optima.
There were no recorded native errors, old-checker rejections or selected-score
regressions. The omitted closure checks mean that is not a feasibility guarantee.

On capacity-pressure C, CP-SAT reaches 1090.8 after 0.735 seconds of search,
but finishes its 60-second cap with a 1061.1 lower bound. SCIP proves 1090.8 in
7.25 seconds of search (7.49 seconds including the native bridge). On priority-
contention C, CP-SAT reaches 300.7 after 1.641 seconds; both engines consume
their search cap, with lower bounds 252.4 for CP-SAT and 244.4144 for SCIP.
Those bounds do not promise attainable scores. SCIP does not expose time to
its best incumbent through this wrapper, so no corresponding claim is made.

Across all 39 native stages, median elapsed time is 0.489 seconds for CP-SAT and
0.283 seconds for SCIP; p95 is 60.417 and 7.585 seconds respectively. These
include payload preparation, Python startup, model construction and CSV checking,
but exclude the heuristic warm start. Many trivial cases and one difficult proof
strongly affect those aggregates; neither engine is uniformly faster. Peak child
process RSS was 508.4 MiB for CP-SAT and 853.9 MiB for SCIP. Neither figure is a
memory requirement or a measurement of the proposed cloud machine.

The earlier scoring-v2 five-second matrix in `native-results.json` already
achieved the same 39 CP-SAT scores. The longer seed-1 run mainly strengthened
bounds on the two difficult C cases. This comparison spans separate runs/model
revisions and is not a controlled latency experiment, but it is evidence against
assuming that spending all 60 seconds must improve a schedule. Treat 60 seconds
as a ceiling; a native proof ends search immediately.

The HTTP service is not identical to this offline harness: it has a cooperative
one-second warm start without earlier-scenario candidate reuse, a tighter child
deadline, and explicit runtime/output error responses. Its performance must be
measured on the deployment host before treating the table as production evidence.

### Ablations and perturbed holdouts

Cold CP-SAT and LNS-only CP-SAT were tested on public C, capacity-pressure C,
priority-contention C and mixed-240 C, with the same 60-second cap and eight
workers. Both returned the same native scores as the full hinted portfolio on
all four cases. Cold search proved three optima, including capacity-pressure C
in 46.76 seconds including the bridge; hinted CP-SAT did not prove that case
within its cap. Cold search also gave a stronger priority-contention bound,
258.3 versus 252.4. Hints can help find good schedules but can change the search
path adversely for a proof; they are not a guaranteed speedup.

LNS-only proved the public and zero-score mixed cases, but its lower bound
remained zero on both difficult cases. It offered no measured quality advantage
in the incomplete model. The full portfolio already includes neighbourhood
search, but its current quality relative to LNS-only needs a corrected comparison.

An additional 24 seeded workload/priority perturbations were evaluated in
Scenario B without filtering out heuristic failures. Sixteen were feasible and
CP-SAT proved all 16 optimal; ten improved over the heuristic and six tied.
The other eight were proved infeasible by the full encoded model, rather than
silently omitted. Public B was also rerun as a control and remained optimal at
30. These are perturbations of four repository fixtures, not independent real
operator instances; they exercise robustness but do not establish broad
generalisation or CP-SAT superiority over SCIP on holdouts, since SCIP was not
run in that cohort.

### Repeated seeds on the difficult cases

The main seed-1 results were supplemented with seeds 2 and 3, using the same
source, scoring, host, worker count and 60-second limit. The heuristic seed also
changes the warm start; these are repeated pipeline runs, not a controlled study
of native seed effects alone. Parallel search is not deterministic even when a
seed is held fixed.

| Case | CP-SAT scores, seeds 1 / 2 / 3 | SCIP scores, seeds 1 / 2 / 3 | Full-model proofs, CP-SAT / SCIP |
| --- | --- | --- | --- |
| Capacity pressure C | 1090.8 / 1090.8 / 1090.8 | 1090.8 / 1090.8 / 1090.8 | 1/3 / 3/3 |
| Priority contention C | 300.7 / 300.7 / 300.7 | 300.7 / 308.4 / 304.2 | 0/3 / 0/3 |

SCIP proves capacity-pressure C in 5.39–8.34 seconds including the bridge,
while CP-SAT proves it in only one run (49.96 seconds). CP-SAT returns the best
observed priority-contention score in all three runs; SCIP does so in one.
This small historical sample cannot support a current PS1 ranking because the
closure model was incomplete. The corrected priority-contention optimum remains
unknown.

## Candidates and research

The represented PS1 model assigns sparse weekly accesses, rather than one
continuous interval per job. It combines Boolean choices, integer workload,
strict predecessor weeks, shared possession packing, deadlines and per-line ECLO
windows. This is why CP-SAT is a strong starting candidate; it does not establish
that CP-SAT beats every alternative on unseen inputs.

| Candidate | Why it is relevant | Evidence in this repository |
| --- | --- | --- |
| Hinted full CP-SAT | Native parallel portfolio, strong logical/integer modelling, lower bounds and internal LNS | Implemented and benchmarked against the local checker |
| Cold full CP-SAT | Measures dependence on the heuristic starting schedule; can solve when heuristic construction fails | Same model, incumbent hints omitted |
| CP-SAT LNS-only | Tests whether concentrating on neighbourhood improvement helps at a fixed deadline | `use_lns_only=True`; experimental built-in mode, not custom ALNS |
| SCIP MIP | Independent branch-and-cut formulation with LP bounds | Implemented with SCIP 10.0.0 bundled in OR-Tools 9.15.6755 |
| Extended TypeScript hybrid | Tests whether more construction/window/destroy-repair trials are sufficient | Native Node execution, 2,500-neighbour ceiling and cooperative wall-time cap |
| IBM CP Optimizer | Scheduling-specific interval, cumulative and state-function reasoning | Researched; engine/licence and a suitable model port not available here |
| Hexaly | Native set/list and scheduling search is a credible alternative | Researched; separate model and licence required, not measured |
| Gurobi / HiGHS | Other MIP engines could improve on this SCIP formulation | Not measured; Gurobi needs a sufficient licence, HiGHS needs a real installed backend |

CP-SAT's default portfolio already combines different relaxations, first-solution
methods and neighbourhood search. Thus "CP-SAT versus ALNS" is not a clean split
between algorithm families. More workers change the mix, and fixed seeds do not
make its default parallel search deterministic. Test repeated runs on the target
host. [OR-Tools worker guidance](https://github.com/google/or-tools/blob/stable/ortools/sat/docs/troubleshooting.md#improving-performance-with-multiple-workers),
[versioned portfolio](https://github.com/google/or-tools/blob/v9.15/ortools/sat/cp_model_search.cc),
[parameter definitions](https://github.com/google/or-tools/blob/v9.15/ortools/sat/sat_parameters.proto).

SCIP is a real independent engine here. `SetNumThreads` routes multiworker solves
through the concurrent SCIP entry point in the pinned OR-Tools interface; requested
workers are a configuration, not evidence that every core stays busy throughout.
Its MIP explicitly linearises first/last access, exact possession counts and every
activity's own lateness. Results reflect the engine **and formulation**,
not a claim about every possible MIP model.
[OR-Tools SCIP implementation](https://github.com/google/or-tools/blob/v9.15/ortools/linear_solver/scip_interface.cc),
[SCIP capabilities/licensing](https://scipopt.org/).

IBM CP Optimizer's scheduling primitives and Hexaly's set/list modelling make
them credible future challengers. A literal translation of the weekly Boolean
model may underuse their strengths, so general vendor scheduling benchmarks are
not PS1 evidence. They have not been installed or benchmarked in this task.
[IBM scheduling building blocks](https://www.ibm.com/docs/en/icos/22.1.2?topic=optimizer-basic-building-blocks-scheduling-models),
[Hexaly collection modelling](https://www.hexaly.com/docs/last/mathematicaloperators/collectionvariables.html),
[Hexaly RCPSP example](https://www.hexaly.com/templates/resource-constrained-project-scheduling-problem-rcpsp).

Gurobi's restricted licence is not sufficient for this formulation's public
instance, which has 3,240 access/ECLO Boolean variables before auxiliaries.
An unrestricted licence would permit a separate test. HiGHS is open source, but
the `HIGHS` alias in this installed OR-Tools build reported `PDLP Solver`; that
must not be presented as a HiGHS MIP run.
[Gurobi licensing](https://www.gurobi.com/product/pricing-and-licensing),
[HiGHS](https://highs.dev/).

An optional `cpsat-base-lin0` experiment sets the base `linearization_level=0`.
It is deliberately excluded from the default comparison: the parallel portfolio
can override that setting for named LP workers. It is **not** an LP-free solver.

## Measurement protocol

1. Enforce complete workload and all represented hard constraints first. Every
   returned candidate is decoded into the official CSVs, parsed back, checked
   locally and required to match the native objective.
2. Keep raw native status/objective/bound and the selected pipeline result
   separately. Cold search has no hints, but its selected deployment result may
   still retain the external TypeScript fallback. Never count fallback as a
   native success or label UNKNOWN as infeasible.
3. Use the same 60-second native search cap. Report heuristic construction,
   prerequisite scenarios, model build, process startup and result validation
   separately. This is not a 60-second end-to-end guarantee. A solver may stop
   early after proving optimality; there is no reason to burn the remaining time.
4. Native CP-SAT traces record model-feasible candidate times, not independently
   CSV-validated response times. SCIP's Python interface does not expose the
   corresponding trace, so those fields are explicitly unavailable.
5. Run variants sequentially to avoid competing solver jobs. Local screening is
   Apple M3 Pro / 11 available CPUs / 18 GiB RAM / eight requested workers. It is
   not a Google Cloud benchmark. Initial v1 screening was superseded by scoring
   v2; both historical cohorts are now superseded by the closure correction.
6. Include heuristic failures in native comparisons. Synthetic and perturbed
   fixtures are engineering tests, not independently collected operational data.
7. Record input/source digests, seed, solver versions, settings, memory and
   status. Bounds from a frozen repair prove only that subproblem.

## Cloud acceptance experiment

First confirm closure regressions and regenerate or revalidate fixture
certificates under `ps1-closure-v1`. Then run a fresh complete 39-case
public/synthetic comparison with the selected native algorithm. Then run 8/16/32 workers with seeds 1/2/3 on public C, capacity-pressure
C, priority-contention C and mixed-240 C. Add seeded perturbation cases, including
those the heuristic cannot solve. The CLI preserves failures and refuses worker
counts exceeding the host's available CPUs.

Choose workers by valid score at the deadline, time to a target score, proof gap,
end-to-end latency and peak memory. Do not choose by CPU utilisation alone or by
an average percentage over zero-score instances. A 32-vCPU VM can execute one
large job or several bounded jobs; it cannot allocate 32 workers to each of three
simultaneous scenarios without oversubscribing the machine.

Keep the first validated feasible schedule available while improving it. Stop
immediately at zero (all penalties are nonnegative) or a full-model optimality
proof. Preserve the best schedule on timeout, cancellation or solver failure.
Use the existing upload limits and a bounded process/job queue when integrating
the server, and measure cancellation, stale-response protection and exports.
The native CLI is an additional reproducible export entry point. The integrated
API already isolates child processes, bounds admission and supports cancellation;
it returns completed scenario responses rather than streaming every incumbent.
Actual cloud deployment, throughput and end-to-end acceptance remain engineering
verification tasks.

The local checker is not the organiser's reference validator. The previously
missing closure constraints are mandatory; the absence of a physical-night field
does not justify omitting them. All numerical proof claims in this historical
report concern the incomplete pre-correction model. Fresh CSV validation and
benchmarks under `ps1-closure-v1` are required before claiming PS1 feasibility,
optimality or algorithm superiority.
