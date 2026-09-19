# Stronger CP-SAT formulation and targeted repair

These experiments answer whether the current native pipeline can deliver lower
PS1 penalties within a practical response deadline. They do not change the
production solver, scoring or official outputs. The local checker is not the
organiser's reference validator; all proofs apply to the encoded local model.

## Methods and reproducibility

`npm run ps1:benchmark:stress` compares three pipelines:

- **Full:** the existing CP-SAT formulation and parallel portfolio.
- **Tight:** the same exact objective and packing equations, with additional
  mathematically implied workload, ECLO, span-length and capacity inequalities.
- **Targeted:** initial full search, up to four repairs around late dependency
  chains, spatial blockers, congested locations and a seeded subset, then a full
  restart using the remaining time. Frozen activities remain constrained, and
  only a better CSV-checked candidate replaces the incumbent.

All use eight requested workers on the same Apple M3 Pro host: 11 available CPUs,
18 GiB RAM, Node 22.22.0, Python 3.9.6 and OR-Tools 9.15.6755. No timing jobs overlap
with tests, builds or other solver jobs in this experiment. This is not a
32-vCPU Google Cloud measurement.

The new budget is **60 seconds for the whole pipeline**, including a one-second
cooperative heuristic warm start, payloads, imports, model construction, search,
repair selection and checking. Each child reserves two seconds from its stage
for overhead and has an explicit wall guard. Synchronous orchestration can
overrun slightly; actual overrun is recorded. The production service and earlier
benchmark instead allow 60 seconds of native search plus overhead: their timings
must not be merged with these rows.

Variant order rotates by case and seed. Each pipeline independently constructs
its warm start, so time-limited initial candidates can differ. Record the initial
score as well as the final score. Repair bounds are conditional and never enter
the accumulated full-model bound. Every error stays in the results.

Measured solver-source SHA-256 for the final 60-second cohorts:
`e69b57b7493f2f2a670389278e7cd4fa127b52f0c0ebf4a387a5f482fd28f2a0`.
The source hash covers the harness, native models, bridge and checker. The initial
HEAD reported by the harness is the base of an uncommitted worktree, so the hash,
not that HEAD alone, identifies these new experiments. Input hashes, host,
configuration, stage scopes and traces are retained in the result artifact.

## Stress inputs and split

The immutable `ps1-stress-v1` generator fixes four development and four holdout
cases before solver runs. The families use 60, 72, 96 and 120 activities with
shared hubs, strict/cross-contract dependencies, varied priorities and Live
interchange coupling. They reuse the public topology. Constant supply is derived
from the peak possession count of an independently constructed full schedule;
tightened due dates create objective pressure.

The resulting A/C certificates pass exact CSV round-trip and local validation.
They establish local feasibility and are saved separately for audit, **never
supplied to search as hints**. Scenario B is deliberately not certified, and any
B run must retain failures. No instance was rejected based on solver performance.

These are related synthetic families, not independent railway operating data or
the judges' hidden inputs. All four holdouts ultimately proved easy enough for
full CP-SAT to solve in under eight seconds. They add coverage, but cannot
establish superiority on difficult hidden cases.

## Reserved cases: 60 seconds, seed 1

All three methods returned the same final score on all seven cases. Every
returned schedule passed the local CSV checker; all 21 pipelines finished within
the deadline without a recorded error. Lower penalties are better; scores across
different instances are not directly comparable.

| Scenario C instance | Heuristic warm start | Full CP-SAT | Tight formulation | Targeted repair |
| --- | ---: | ---: | ---: | ---: |
| Public | 25.2 | 25.2 | 25.2 | 25.2 |
| Capacity pressure | 1105.5 | 1090.8 | 1090.8 | 1090.8 |
| Priority contention | 340.4 | 300.7 | 300.7 | 300.7 |
| Holdout shared hubs, 60 activities | 10831.0 | 9525.9 | 9525.9 | 9525.9 |
| Holdout chain bottlenecks, 72 activities | 18531.1 | 17573.3 | 17573.3 | 17573.3 |
| Holdout Live interchange, 96 activities | 36900.4 | 34095.4 | 34095.4 | 34095.4 |
| Holdout mixed spans, 120 activities | 43848.7 | 41106.1 | 41106.1 | 41106.1 |

Full and targeted pipelines each proved 5/7 optima; tightening proved 6/7.
All three proved every holdout optimum, improving its initial heuristic score.

For capacity pressure, tightening proved 1090.8 in **1.32 seconds** end to end.
Full search returned the same score in 58.45 seconds with a 1062.3 bound;
targeted repair returned it in 58.37 seconds with a 1056.7 full-model bound.
This is a proof-time improvement, not a lower objective or necessarily a faster
first usable schedule. The incumbent traces distinguish those questions.

For priority contention, every method returned **300.7** after approximately
58.4 seconds. Full search's bound was **255.6**, tightening's **248.9**, and
targeted repair's **242.2**. The optimum remains unknown. The older, separate
cold-search cohort reached a stronger bound of 258.3; these new results do not
erase it or show that its bound is attainable.

## Short-budget development calibration

Before the holdout evaluation, 21 ten-second runs covered the three controls and
four development cases. The initial 750-ms startup allowance caused five child
timeouts across four pipelines. Every pipeline retained a valid incumbent.
Those runs remain recorded, not filtered. The final protocol reserves two
seconds per stage and skips stages shorter than 2.5 seconds; it was frozen before
optimising the reserved cases.

Targeted repair beat the full pipeline on the capacity-pressure row where full
search timed out, tied four cases, and lost two: Live-96 (56067.3 versus 55377.3)
and mixed-120 (57737.6 versus 53741.7). It established no new best objective.
Tightening proved capacity pressure quickly, while the full pipeline's timeout
retained its worse heuristic score. The calibrated run is distinct from
the final protocol and cannot be presented as a clean win rate for that protocol.

## Deployment decision

Keep the current full CP-SAT portfolio as the production default. Retain tightening
as an opt-in challenger: it can dramatically shorten one proof, but does not
improve the measured final scores and does not uniformly improve bounds or time.
Targeted repair currently adds complexity without a demonstrated quality gain.

The cloud engineer can reproduce the comparisons using the commands in the
[benchmark README](../scripts/ps1/benchmark/README.md#stress-experiments-with-one-total-deadline),
then compare 8/16/32 workers on the actual 32-vCPU / 64-GiB host. Preserve the
same total budget and repeat seeds before changing the deployed formulation.
The eight new cases and existing difficult controls are included in that handoff.
