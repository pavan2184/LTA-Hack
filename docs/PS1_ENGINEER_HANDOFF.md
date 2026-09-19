# PS1 optimisation handoff

This branch adds a browser-local hybrid optimiser and an offline native CP-SAT
benchmark. It does not deploy a service or provision Google Cloud resources.
The engineer with the Google Cloud instance can reproduce native benchmarks
there without making the hosted app depend on that instance.

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
npm run ps1:benchmark
node --import tsx scripts/ps1/benchmark/holdout.ts output/ps1-holdout 24

python3 -m venv .venv-cpsat
.venv-cpsat/bin/python -m pip install -r scripts/benchmark/requirements.txt
.venv-cpsat/bin/python scripts/ps1/benchmark/test_cp_sat.py
node --import tsx scripts/ps1/benchmark/compare-cpsat.ts .venv-cpsat/bin/python output/ps1-benchmark 5

# One case, full model or repair of the last-finishing 20 activities:
npm run ps1:benchmark:cpsat -- .venv-cpsat/bin/python output/ps1-benchmark/public-B-hybrid-1.json 30 full
npm run ps1:benchmark:cpsat -- .venv-cpsat/bin/python output/ps1-benchmark/public-B-hybrid-1.json 5 repair
```

Use a distinct output directory for each trial: the comparison writes result
summaries and witnesses. These are Git-ignored under `output/`. Record machine,
CPU count, solver version, seed, search limit and total process time. Native
CP-SAT currently uses one worker and seed 1; its seconds argument limits solver
search, not Python startup or model construction. The TypeScript runner accepts
an optional cooperative wall-time budget and repeated seeds; see its README.

At one second of native search on the development machine, full CP-SAT improved
capacity-pressure B **293→230**, capacity-pressure C **1118.8→1112.7** and
priority-contention B **483→279**. Four larger full-model runs returned UNKNOWN.
Always retain the validated heuristic incumbent when CP-SAT times out, fails or
returns a worse candidate. Compare against that incumbent, not an empty schedule.

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

The authoritative [PS1 specification](PS1_OFFICIAL_SPEC.md) requires the hidden
eight-file upload to keep solving entirely in the browser. Native Python is an
offline comparator here, not an API connected to `/ps1`. A cloud benchmark is not
authorisation to send uploaded hidden instances to a server or replace this path.
A browser WASM integration would need its own measured startup, memory,
cancellation, cross-origin-header and browser-compatibility checks. No WASM
runtime dependency was added; IBM CP Optimizer and Hexaly remain untested options.

The local checker is not the organiser's reference validator. Cross-possession
physical-night alignment remains undecidable from the published fields. Native
OPTIMAL means optimal for the encoded local model; a repair bound applies to
its frozen subproblem. Never drop work or accept hard violations for a lower score.
Keep exactly three official CSVs per scenario, nine files across A/B/C.
