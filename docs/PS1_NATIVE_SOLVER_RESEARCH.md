# PS1 native solver selection

Owner direction, 2026-09-19: **32 vCPUs, 64 GiB RAM, 60-second default search**.
Cloud computation is explicitly authorised; the earlier browser-only deployment
choice is superseded. The cloud engineer deploys. This investigation concerns
algorithm choice and a runnable native handoff, not an already deployed service.

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
tied terminal activity's penalty. Results reflect the engine **and formulation**,
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
   not a Google Cloud benchmark. Brief unit/type checks overlapped initial
   screening, so treat local timing as indicative rather than a speedup claim.
6. Include heuristic failures in native comparisons. Synthetic and perturbed
   fixtures are engineering tests, not independently collected operational data.
7. Record input/source digests, seed, solver versions, settings, memory and
   status. Bounds from a frozen repair prove only that subproblem.

## Cloud acceptance experiment

First reproduce the complete 39 public/synthetic cases with the selected native
algorithm. Then run 8/16/32 workers with seeds 1/2/3 on public C, capacity-pressure
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
The native CLI is a reproducible integration starting point; HTTP streaming and
the current `/ps1` worker migration remain explicit engineering work.

The local checker is not the organiser's reference validator. Cross-possession
physical-night alignment is undecidable from the published fields. All proof
claims in this report apply only to the encoded local model.
