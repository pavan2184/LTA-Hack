# PS1 — Railway track access optimisation

> **Superseded evidence — closure conformance correction.** The pre-correction
> benchmark scores, feasibility counts, proofs and algorithm rankings below are
> historical results from an incomplete closure model. They are not valid PS1
> ranking or conformance evidence. A public A export passed our old checker but
> received 15 closure violations. The corrected regression reproduces all 15
> reported messages and accepts the published sample with zero closure violations.
> Consist buffers extend sectors; Live buffers also include outer platforms and
> expand across the interchange before mirroring. The correction is identified as
> `ps1-closure-v1`. Corrected public exports are recorded in
> [current project status](../../docs/PROJECT_STATUS.md); algorithm comparisons still
> need fresh runs. No deployed fix or reference-validator parity is claimed.

NebulaX Problem Statement 1. Decides which contracted activities get the track,
in which weeks, across Line Alpha and Line Beta, then validates its own answer
and scores it.

This is a separate package from `@railplan/core` on purpose. RailPlan's engine
places work *inside one night at minute resolution*; PS1 assigns work *to weeks*
across a 30-week horizon, and its `access_night` is an accounting index within a
contract's weekly allowance rather than a time of day. Sharing a domain model
between the two would have meant bending both.

## Layout

| Path | What |
| --- | --- |
| `src/types/ps1.ts` | Domain types, penalty weights, yields |
| `src/io/load.ts` | The eight instance CSVs into a typed instance |
| `src/io/submission.ts` | The three submission CSVs back in |
| `src/io/write.ts` | Submission out, in the published column order |
| `src/engine/network.ts` | Location ids, span expansion, closures and buffers |
| `src/engine/validate.ts` | The ten hard rules and the soft scores |
| `src/engine/schedule.ts` | The scheduler |
| `data/public/` | The published instance |
| `data/sample-submission/` | The organisers' reference answer |
| `data/results/` | Our pre-computed output per scenario |

## How the ambiguities were settled

The published feasible submission in `data/sample-submission/` is a useful
compatibility regression, not a complete specification of the reference
validator. Rejecting it can reveal incorrect geometry, access-type handling or
sharing groups; it does not justify omitting a mandatory rule. Earlier reasoning
that any sample-rejecting rule was necessarily stricter than the official checker
was incorrect.

- **Span expansion.** An activity books every tunnel sector between its endpoints
  and every platform it passes. Verified by reproducing the reference's occupancy
  rows exactly, for all 54 activities.
- **What `supply_capacity` limits.** Possessions, not activities. Counting
  activities makes the reference exceed capacity by 105; counting distinct
  `co_share_group` labels gives exactly zero excess. This is what "co-sharing
  increases capacity" means mechanically.
- **Whether buffers consume capacity.** They do not. A model where a buffered
  location draws down a slot rejects the reference in 60 location-weeks.
- **Completion dates.** The Sunday of a contract's last scheduled week. All
  fourteen of the reference's `simulated_completion_date` values match, and none
  match the Monday.
- **Closures and buffers.** The `ps1-closure-v1` correction derives closures
  from every activity's nature of work and resolves sharing through transitive
  components of `(week, location_id, co_share_group)`. Both activities must be
  non-Live for the C/C or PC/C buffer exemption to apply. Live protection applies
  to every access type, including C; a Consist C activity can exclude PM work.
  Consist buffers extend sectors without adding their outer platforms; Live
  buffers include those platforms. Live interchange work seeds the other line's
  tunnel before buffer expansion and opposite-bound mirroring. Buffer-only
  overlaps between incompatible buffered activities remain prohibited. The
  reported failures and sample do not independently identify every distinction
  in these rules, so the explicit specification remains necessary. In particular,
  their exact match does not justify restricting closure origins to PC/PM.

## Working with a schedule

- **`engine/explain.ts`** answers "why is this job here?" by counterfactual: put
  the activity back in each earlier week with the rest held still, and record
  what stops it. It says so plainly when nothing did, rather than inventing a
  blocker.
- **`engine/metrics.ts`** gives every figure its numerator, denominator and
  formula, and decomposes the banded overrun into rows that sum to the score.
- **`engine/categories.ts`** groups the eleven rule tags into six things a
  controller can act on, each with the lever that resolves it.
- **`engine/timeline.ts`** turns a submission into locations-by-weeks, counting
  possessions rather than placements so co-sharing does not read as overload.
- **Pins** are entered as hard constraints *before* the solve, never as an
  overlay: `scheduleInstance(instance, { scenario, pins })`. A pin that would
  break a rule comes back in `rejectedPins` with the reason, and a pin before an
  activity's planned start is refused outright.

- **`engine/disruption.ts`** cuts a location's nightly quota mid-horizon,
  reports what that displaces, and re-plans around it. The replan works by
  pinning every surviving access, so untouched work is not merely likely to stay
  put — it is held. Displacement is chosen cheapest-first by contract tier,
  following the brief's own cost ordering.

## Running it

```sh
python3 -m venv .venv-cpsat
.venv-cpsat/bin/pip install -r scripts/ps1/requirements.txt
PATH="$PWD/.venv-cpsat/bin:$PATH" npm run ps1:solve # writes native results
npx vitest run packages/ps1/
```

The web surface is at `/ps1` — public, no account, with native CP-SAT on the server.
The pure TypeScript scheduler supplies warm starts; the client rechecks results.
See [deployment](../../docs/PS1_NATIVE_DEPLOYMENT.md).

Twelve additional [synthetic input datasets](data/synthetic/README.md) cover demos,
co-sharing, Live interchange closures, dependencies, capacity pressure and a
120-activity workload, plus long spans, workfront limits, separated ECLO windows,
horizon boundaries, priority contention and a 240-activity workload.
Each folder contains the eight CSVs accepted by `/ps1`.
Run `npx vitest run packages/ps1/src/io/datasets.test.ts` to verify all A/B/C
outcomes. The official public instance and public-result files stay separate.

## Corrected public results

The regenerated [public summary](data/results/SUMMARY.json), using
`ps1-closure-v1`, records:

| Scenario | Objective | Local hard violations | Full local-model status | Matching lower bound |
| --- | ---: | ---: | --- | ---: |
| A | 32.2 | 0 | OPTIMAL | 32.2 |
| B | 30 | 0 | OPTIMAL | 30 |
| C | 26.1 | 0 | OPTIMAL | 26.1 |

All activities receive their full workload. These are local conformance and
model-optimality results, not reference-validator certification or a GCP timing
benchmark. The regeneration used 11 requested workers while tests also ran; no
fair algorithm-performance comparison or deployed fix is claimed.

## Historical public results — closure model incomplete

| Scenario | Passed old checker | Overrun days | Excess nights | ECLO nights | Historical objective |
| --- | --- | --- | --- | --- | --- |
| A | yes | 21 | 0 | 0 | 25.2 |
| B | yes | 0 | 0 | 6 | 30 |
| C | yes | 21 | 0 | 0 | 25.2 |

These historical outputs scheduled the full workload; A contained 192 accesses
and two overrunning contracts, versus three in the sample. Full delivery alone
does not establish feasibility: the public A export violated mandatory closures.
These figures therefore cannot establish an improvement over the sample.

All three reported proofs used scorer `ps1-objective-v2` but omitted required
closure constraints. They do not certify PS1 optimality. The regenerated public
outputs above supersede them; algorithm comparisons still need fresh runs.
