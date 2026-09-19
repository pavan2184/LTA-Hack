# PS1 — Railway track access optimisation

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

The brief leaves several rules open to more than one reading. Rather than pick
by argument, each was pinned against the reference submission in
`data/sample-submission/`, which the brief states is feasible with zero hard
violations. Any interpretation that flags it is provably stricter than the
validator the judges run.

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
- **Buffers between separate possessions** are deliberately *not* enforced — see
  the long note in `validate.ts`. The submission format records a week and a
  per-location label, not a physical night, and the brief says different labels
  at one location-week are separate possessions on separate nights. Enforcing
  buffers across them rejects the reference in 118 places.

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
npm run ps1:solve          # writes data/results/{A,B,C}/ and SUMMARY.json
npx vitest run packages/ps1/
```

The web surface is at `/ps1` — public, no account, solves in the browser.

## Results on the public instance

| Scenario | Feasible | Overrun days | Excess nights | ECLO nights | Objective |
| --- | --- | --- | --- | --- | --- |
| A | yes | 21 | 0 | 0 | 25.2 |
| B | yes | 0 | 2 | 6 | 44 |
| C | yes | 21 | 2 | 0 | 39.2 |

Scenario A places all 192 access-nights of work with two contracts overrunning;
the reference submission overruns three. Every scenario schedules 100% of
activities, which is the mandatory gate before any quality metric counts.
