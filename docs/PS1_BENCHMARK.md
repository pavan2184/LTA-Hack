# PS1 solver benchmark

This benchmark exercises the same `solveInstance()` entry point used by the
browser worker, with its normal optimisation budget and each scenario solved
independently. It covers the official
public input plus every dataset listed in the synthetic manifest: **13 inputs,
553 activities, 1,225 requested access units, 39 A/B/C outcomes**.

It is a **local checker benchmark**, not the organiser's reference validator or
an optimality certificate. The synthetic inputs largely retain the published
topology and parameters; they are not representative samples of hidden inputs.
Cross-possession physical-night alignment remains undecidable from the official
CSV schema. Node runtime does not establish browser responsiveness or download
success.

## Run it

From the repository root, after installing dependencies:

```sh
node --import tsx scripts/ps1/benchmark.ts --runs 3 \
  --output output/ps1-benchmark/baseline.json \
  --markdown output/ps1-benchmark/baseline.md
```

Capture that baseline **before changing the engine**. After the change:

```sh
node --import tsx scripts/ps1/benchmark.ts --runs 3 \
  --compare output/ps1-benchmark/baseline.json \
  --output output/ps1-benchmark/current.json \
  --markdown output/ps1-benchmark/comparison.md
```

The command defaults to one run, accepts 1–20, and never writes official public
results or changes fixtures. JSON and Markdown outputs are optional. The JSON
records input and source SHA-256 digests, export digests, score components,
individual solve durations, candidate counts and failures. Reports are local
artifacts under ignored `output/`; keep the baseline when comparing later work.
Use `--help` for the complete CLI.

Each outcome must:

- Return `FEASIBLE`, pass local checking, and contain no rejected pins.
- Independently deliver at least the requested access yield for every activity,
  without replacing missing activities with unexpected IDs.
- Export exactly the three official filenames and literal published headers.
- Parse those CSVs back, retain its scenario, include all contract results, pass
  local checking again, and serialize to identical CSV bytes and objective.
- Produce identical export bytes across repeated runs.

The process exits nonzero for any failed outcome. With `--compare`, it also
rejects missing scenarios, changed input bytes, lost feasibility or higher
objective cost against a previously passing outcome. Scores are compared only
within the same input and scenario. Runtime is reported rather than gated,
because hardware, JIT warm-up and concurrent machine work affect it. Solve
durations exclude parsing, file I/O, serialization and the benchmark's external
checker calls; they include the solver's own candidate checks. Quantiles use
nearest rank, and three runs are a smoke measurement, not a latency study.

## Baseline captured on 2026-09-19

Baseline source: `b6e661e4f0056cdde622ed97679c8950c3ef452e`, captured before engine
edits in an isolated source snapshot. Engine/IO/type source digest:
`54de45a376b1c0495423a5f4d96f5766b9a9f08613b269aac0510249aa0600f2`.
Runtime: Node v22.22.0, macOS arm64, Apple M3 Pro; three solves per scenario.
All **117 measured solves** delivered complete workloads and passed local
checking plus CSV serialization/reparse, with deterministic exports.

| Input | A cost | B cost | C cost |
| --- | ---: | ---: | ---: |
| Public | 25.2 | 44 | 39.2 |
| Small demo | 0 | 0 | 0 |
| Co-sharing | 0 | 84 | 84 |
| Live interchange | 0 | 49 | 49 |
| Dependency chains | 0 | 0 | 0 |
| Capacity pressure | 2184 | 293 | 1123 |
| Mixed 120 | 0 | 378 | 308 |
| Long spans | 0 | 133 | 133 |
| Workfront limits | 0 | 0 | 0 |
| Separated ECLO windows | 3640 | 40 | 3640 |
| Horizon boundary | 0 | 0 | 0 |
| Priority contention | 1768.2 | 483 | 340.4 |
| Mixed 240 | 0 | 826 | 665 |

These figures are observed costs, not known optima. A zero-cost A plan is a
useful candidate for B/C only after its results are relabelled and independently
checked under the target scenario. The separated ECLO case tests the different
B and C continuity rules; B's disjoint windows cannot simply be reused in C.

## Measured candidate-search improvement

The updated solver passed **117/117 measured solves** (three per scenario), with
complete workloads, local conformance and unchanged exports across repeats.
**13 of 39 outcomes improved; none regressed.** Every input SHA-256 matched its
baseline. All A costs and all unlisted B/C costs remained unchanged.

| Input | Policy | Before | After |
| --- | --- | ---: | ---: |
| Public | C | 39.2 | 25.2 |
| Co-sharing | B / C | 84 / 84 | 0 / 0 |
| Live interchange | B / C | 49 / 49 | 0 / 0 |
| Capacity pressure | C | 1123 | 1108.3 |
| Mixed 120 | B / C | 378 / 308 | 0 / 0 |
| Long spans | B / C | 133 / 133 | 0 / 0 |
| Separated ECLO windows | C | 3640 | 1840 |
| Mixed 240 | B / C | 826 / 665 | 0 / 0 |

The after-run source digest is
`e01922468d24288e5ae35ec6b8561741b3d7bcc0aa10396e6f096704912452e9`.
Median solve times on the recorded machine are below; these small samples were
collected during development, without isolating other machine work, and should
not be presented as a speedup claim.

| Input / policy | Before median ms | After median ms |
| --- | ---: | ---: |
| Public A | 241.25 | 287.96 |
| Public B | 268.95 | 310.95 |
| Public C | 219.40 | 305.38 |
| Mixed 240 A | 746.47 | 161.77 |
| Mixed 240 B | 704.01 | 288.12 |
| Mixed 240 C | 696.78 | 284.82 |

The browser worker and public-results CLI additionally pass earlier feasible
scenario submissions as candidates. This benchmark intentionally does not:
standalone calls make the before/after comparison use the same options and test
the engine's own construction improvements. Browser upload, review and actual
download verification remain separate release checks.

The CLI itself was checked with targeted ESLint, TypeScript and whitespace
checks. Invalid run counts and overlapping output/baseline paths were rejected;
a deliberately lowered baseline score and altered input digest produced exit
code 1 with the expected regression and input-change findings. These checks used
temporary copies and did not alter the fixtures or recorded baseline.
