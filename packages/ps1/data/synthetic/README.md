# Synthetic PS1 datasets

Six complete input instances for RailPlan's `/ps1` upload flow. These are
fabricated test workloads, not organiser data or predictions of hidden tests.
The official public instance remains in `../public/` and is still the input for
the hackathon's public-results deliverable.

| Folder | Contracts | Activities | Workload (accesses) | Dependency links | Purpose |
| --- | ---: | ---: | ---: | ---: | --- |
| `01-small-demo` | 4 | 6 | 12 | 1 | Quick demo with both lines, both bounds, all three access types and all three work natures |
| `02-co-sharing` | 8 | 16 | 32 | 0 | Two PC hosts and six C contractors; capacity 1 forces legal sharing and staggered possessions in A |
| `03-live-interchange` | 6 | 12 | 24 | 2 | Live closures across interchange lines and bounds, consist buffers, and non-live work |
| `04-dependency-chains` | 5 | 15 | 30 | 12 | Three five-stage chains crossing contracts, staggered starts, rows in reverse dependency order |
| `05-capacity-pressure` | 9 | 9 | 22 | 0 | Exclusive PM contention, priority tiers, delayed completion, extra capacity and ECLO trade-offs |
| `06-mixed-120` | 24 | 120 | 300 | 24 | Larger mixed workload, all priorities/natures/access types, both lines/bounds and staggered starts |

Total: **48 CSV files, 178 activities and 420 accesses of requested work** across
six independent instances. Each dataset is solved separately under A, B and C.
The folder numbers identify input datasets, not the three scheduling scenarios.

## Use in the web app

1. Start the app with `npm run dev` and open `/ps1` on the printed local URL.
2. Choose the hidden-instance/upload option and select **all eight CSVs from
   one folder**. Do not combine folders or select the ZIP, README or manifest.
3. Run the scheduler, inspect A/B/C and download the results.

Every folder contains exactly the published filenames, headers and column order:

```text
01_LINES.csv
02_STATIONS.csv
03_SECTORS.csv
04_LOCATION_SUPPLY.csv
05_BUFFER_LOCATION.csv
06_PARAMETERS.csv
07_PROJECT_DETAILS.csv
08_ACTIVITY_DETAILS.csv
```

## Provenance and construction

The network, buffer rules and parameters are copied byte-for-byte from the
vendored public instance: two lines, ten station rows per line, 18 tunnel sectors,
76 location rows, and 30 weeks beginning 2027-01-04. Source SHA-256 digests are in
`manifest.json`. The authoritative requirements are
[`docs/PS1_OFFICIAL_SPEC.md`](../../../../docs/PS1_OFFICIAL_SPEC.md).

Only project/activity demand is fabricated, plus two deliberate supply changes:
`02-co-sharing` sets all location capacities to 1; `05-capacity-pressure` sets
`SEC:ALP:S02_S03:EB` and its S02/S03 EB platforms to 1. Other supply stays as
published. The Live weekly cap stays 2 and other contracts stay at 3. Buffer
rules, ECLO yield, priorities and legal mixes are not weakened.

All activity endpoints are tunnel sectors. The engine expands these to the
platforms and tunnels occupied by the work. All IDs use a dataset prefix, all
awards are 2026-09-01, and all contractual completion dates are the end of week
30. Planned completion dates vary by test purpose. Descriptions name synthetic
work programmes and contain no real contractor or personal data.

The 120-activity case is deterministic. Contract index `i=0..23` and activity
index `j=0..4` set workload to `1 + (i + 3j) mod 4`, start week to
`1 + (2i + j) mod 8`, and activity priority to `1 + (i + j) mod 3`. Each
contract's fifth activity follows its first. Starts range from weeks 1–8 and
planned completion is week 26. This is a larger functional fixture, not a
production-scale performance benchmark.

## Verification and expected behaviour

Run from the repository root:

```sh
npx vitest run packages/ps1/src/io/datasets.test.ts
```

The tests load the actual files through the same pure loader used by `/ps1`,
solve all 18 dataset/scenario combinations with the default optimiser, serialize
and reparse all three output CSVs, and independently run the local checker.
They also check workload delivery, strict later-week dependencies, source
digests, legal endpoint expansion, four-way sharing and Live crossover coverage.
Every dataset currently produces a complete locally feasible result for A/B/C.

In `05-capacity-pressure`, eight PM contracts request two accesses each on one
sector with capacity 1 and a week-6 target. A must spread those possessions
across at least 16 weeks. A separate six-access renewal has a week-4 target:
B needs four ECLO nights to finish it on time. C's two-week ECLO window allows
only two ECLO nights for that activity, so it must finish after week 4.

Initial observed penalty scores, useful for comparison rather than optimality
claims or immutable test expectations:

| Dataset | A | B | C |
| --- | ---: | ---: | ---: |
| Small demo | 0 | 0 | 0 |
| Co-sharing | 0 | 84 | 84 |
| Live interchange | 0 | 49 | 49 |
| Dependency chains | 0 | 0 | 0 |
| Capacity pressure | 2184 | 293 | 1123 |
| Mixed 120 | 0 | 378 | 308 |

The B/C results in several cases spend extra capacity even though A finishes on
time. These datasets expose that heuristic quality gap; a feasible result does
not prove the score is optimal.

This is **local conformance**, not the organiser's reference validator. The
existing `cross_possession_night_alignment` limitation still applies: separate
possessions cannot be assigned a shared physical-night identity from the official
CSV fields alone. These fixtures do not establish operational railway safety.
The browser UI itself is not exercised by this Node test suite.
