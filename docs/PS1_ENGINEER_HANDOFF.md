# PS1 optimisation handoff

The owner has selected **native cloud computation on 32 vCPUs / 64 GiB RAM with
a 60-second default solver-search budget per scenario**. This supersedes the
browser-only restriction in earlier revisions. This branch supplies native
solver comparisons and a CLI integration entry point; it does not provision
resources or claim that `/ps1` is already connected to a deployed native API.

Read [native research and measurements](PS1_NATIVE_SOLVER_RESEARCH.md) before
choosing the final worker count. The cloud engineer owns deployment and target
hardware measurements. Local Apple M3 Pro results are algorithm screening only.

## What changed

- `packages/ps1/src/engine/schedule.ts` and `search.ts`: scenario-candidate reuse,
  nominal-capacity starts, legal per-line ECLO windows and adaptive group repair.
- `src/workers/ps1.worker.ts`: pass earlier scenario results as candidates;
  revalidate under the target scenario, pins and disruptions before accepting.
- `validate.ts`: physical capacity cuts cannot be bought back using B/C elasticity.
- `disruption.ts`: release automatically retained downstream accesses when a cut
  delays their predecessor, then reconstruct and validate the dependency chain.
- `scripts/ps1/benchmark/`: paired legacy/hybrid runs, seeded perturbations and
  native CP-SAT full/repair comparisons, with CSV round-trip score agreement.
- `packages/ps1/data/results/`: refreshed public results, A **25.2**, B **30**,
  C **25.2**. Lower scores are better.

All 39 public/synthetic browser cases remain locally feasible: 14 improve and
25 tie. The 24 perturbation instances produce 32 improvements, 32 ties and eight
cases unresolved by both heuristics. Full evidence, input digests, timing caveats
and native results are in [the benchmark README](../scripts/ps1/benchmark/README.md)
and [recorded results](../scripts/ps1/benchmark/results.json).

## Reproduce on the cloud instance

Use a checkout of this PR, the repository's Node tooling, and a Python version
supported by the pinned OR-Tools release. No cloud-specific environment variables
or credentials are needed for these local benchmark commands.

```sh
npm ci
python3 -m venv .venv-cpsat
.venv-cpsat/bin/python -m pip install -r scripts/benchmark/requirements.txt
.venv-cpsat/bin/python scripts/ps1/benchmark/test_cp_sat.py
.venv-cpsat/bin/python scripts/ps1/benchmark/test_scip.py

# Native scheduling; fresh output directory, 60s search per scenario, 16workers.
npm run ps1:solve:native -- --python .venv-cpsat/bin/python --input packages/ps1/data/public --output output/native-public --seconds 60 --workers 16

# Complete 39-case native coverage and target-host worker scaling.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-coverage --variants cpsat-warm
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-workers --datasets public,05-capacity-pressure,11-priority-contention,12-mixed-240 --scenarios C --variants cpsat-warm --workers 8,16,32 --seeds 1,2,3

# Independent SCIP and CP-SAT cold/LNS-only challengers.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-challengers --datasets public,05-capacity-pressure,11-priority-contention,12-mixed-240 --scenarios C --variants cpsat-cold,cpsat-lns,scip-warm,hybrid-extended

# Include cases unresolved by heuristic construction.
npm run ps1:benchmark:cloud -- --python .venv-cpsat/bin/python --output output/cloud-holdout --datasets public --holdouts 24 --scenarios B --variants cpsat-warm
```

Use a distinct output directory for each trial: the comparison writes result
summaries and witnesses. These are Git-ignored under `output/`. Record machine,
CPU count, solver version, seed, search limit and total process time. Native
CP-SAT now accepts workers, seed and profile. The cloud CLI defaults to 16workers,
seed1 and 60seconds; the historical single-witness benchmark remains backwards
compatible with its one-worker default. Search seconds exclude Python startup,
model construction and CSV validation. Use `--workers 8` on the local development
machine. See the benchmark README for resume and timing semantics.

In the earlier one-second native screening, full CP-SAT improved
capacity-pressure B **293→230**, capacity-pressure C **1118.8→1112.7** and
priority-contention B **483→279**. Four larger full-model runs returned UNKNOWN.
Always retain the validated heuristic incumbent when CP-SAT times out, fails or
returns a worse candidate. Compare against that incumbent, not an empty schedule.

## Native service integration

The native CLI constructs a quick TypeScript fallback, attempts native CP-SAT,
independently validates the returned CSVs and exports the better actual schedule.
It attempts native search even if heuristic construction fails. Score0 returns
immediately because every penalty is nonnegative. Its report distinguishes a
native failure/UNKNOWN from an unresolved or validated final result.

The engineer should wrap this orchestration in a bounded job worker, not run the
synchronous process bridge directly in a shared Next.js HTTP handler. Accept the
same validated eight-file instance, enforce upload bounds, carry pins/disruptions
and request identity, and preserve cancellation/stale-result handling in `/ps1`.
Keep validated interim results available and recheck every final candidate before
export. The current UI still invokes its browser worker until this integration
lands; no native endpoint or streaming progress channel is claimed here.

Start with one active solve at 16workers while measuring 8/16/32. For an A/B/C
request, three serial 60second searches can exceed three minutes including
overhead. Options to test are the active scenario first, or three concurrent
eight-worker scenario jobs (24workers total) after a quick shared heuristic seed.
Do not launch three 32worker jobs on one 32-vCPU VM. Admission control belongs
around the whole request queue, including retries and cancelled jobs.

Run the cloud worker sweep on an otherwise idle VM and choose by validated score,
time to target score, gap, end-to-end latency and peak memory. Stop the VM when it
is no longer needed; a completed solver process does not stop compute billing.

## Build and verification handoff

Before the handoff, the full suite passed 944 tests with 79 database-dependent
skips; 196 PS1/package/UI tests and eight native model checks passed. A later
stale-upload candidate guard passed all 31 targeted scheduling/search tests.
Lint passed. Browser Chromium checks covered public solving, hidden eight-file
upload, legal ECLO windows and exact nine-file ZIP export at desktop/mobile sizes.
These browser observations predate reconciliation with the newer main-branch UI;
post-reconciliation verification passed **213 PS1 engine/dataset/UI tests in
20 files**, lint and diff whitespace checks. Typecheck still reports the four
generated errors below. Browser and full-application checks were not repeated
after reconciliation.

Production build is not green. The development environment blocked Turbopack's
helper port; `npm run build -- --webpack` compiled, then generated type checks
rejected four existing, untouched entry-point signatures:

- `src/app/api/requests/route.ts`: `GET(request?: Request)`.
- `src/app/page.tsx`, `src/app/plans/page.tsx`, `src/app/sandbox/page.tsx`:
  defaulted first props arguments produce a union with `undefined`.

Resolve those signatures and their direct-call tests, then rerun typecheck and
production build on the deployment host. Standalone typecheck passed before the
build generated those additional checks; it now reports the same errors. The
79 skipped DB checks need the separately configured test database if that
release surface is being verified. This PR changes no database or auth flow.

## Boundaries to preserve

The hosted hidden eight-file upload and official CSV contract remain required.
Native server execution is now explicitly authorised by the owner; do not carry
forward the earlier browser-only restriction. Preserve hard constraints and
review/export semantics during migration. No WASM runtime is needed. IBM CP
Optimizer, Hexaly and Gurobi remain unmeasured options, not benchmark winners.

The local checker is not the organiser's reference validator. Cross-possession
physical-night alignment remains undecidable from the published fields. Native
OPTIMAL means optimal for the encoded local model; a repair bound applies to
its frozen subproblem. Never drop work or accept hard violations for a lower score.
Keep exactly three official CSVs per scenario, nine files across A/B/C.
