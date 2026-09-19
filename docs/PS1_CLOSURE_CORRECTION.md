# PS1 closure conformance correction — 2026-09-19

The owner reported **15 organiser-validator closure violations** for public
Scenario A produced on GCP. The activity/week pairs match the tracked output
from `70e58dd`. No organiser-validator quota was consumed during this correction.
The reported deployment has not been inspected or updated by this work.

## Failure and correction

The local validator deliberately skipped cross-possession closures, based on an
incorrect inference from the published sample. The native models likewise
enforced location capacity without closure exclusions. In addition, Live
interchange expansion crossed the central tunnel and platforms but omitted the
other line's exclusion buffer. A CP-SAT proof for that incomplete model did not
establish a valid PS1 result.

The corrected checker uses constraint version `ps1-closure-v1`; the penalty
formula remains `ps1-objective-v2`. It applies the following interpretation:

- Closure geometry follows each activity's nature, not just its access type.
  Non-Live C/C and PC/C pairs are buffer-free. Live C work still closes track,
  and a Consist C buffer can exclude a PM activity.
- Live crossover tunnels seed the full buffer on both lines and both bounds.
  Original worksite buffers are not expanded twice.
- Consist buffers add tunnel sectors while retaining the original occupied
  platforms. Live buffers also close the buffer platforms. The A025/A028 message
  locations distinguish these cases; their copied error locations are retained
  in the regression fixture.
- Actual shared `(week, location_id, co_share_group)` rows connect possession
  components transitively. Matching `b1` labels at unrelated locations do not
  connect anything. An incompatible external activity may not occupy another
  activity's closure unless it belongs to the same connected component.
- Legal mixes and capacity remain local to each location/week. A transitive
  component is not subject to a made-up global four-activity limit.
- The official README's PC/C buffer exemption applies to non-Live PC/C pairs.
  Live power isolation still applies: the reported A074 errors include C work.
- Separate incompatible buffered activities must also have disjoint buffers, following the
  explicit buffer non-overlap requirement.

The [official README](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS1/PS1_README.md)
sections 2.1 and 2.4 supply the compatibility, buffer and co-sharing rules.
The last two distinctions above are not uniquely established by the reported
15 errors and sample: neither includes a distinguishing non-Live PC/C case or
host buffer-only overlap. They follow the written requirements, with the Live
override supported by the rejection. This checker remains an independent local
implementation, not the organiser's reference validator.

## Regression evidence

The [preserved fixture](../packages/ps1/src/engine/fixtures/public-a-closure-regression.json)
contains the old source commit and CSV hashes, all access/occupancy rows in the
four affected weeks, and the expected messages. The corrected rule reproduces:

| Week | Closure origin | External activities | Count |
| --- | --- | --- | ---: |
| 9, 10 | A025 and A028 | Each other | 4 |
| 19 | A074 | A007, A017, A040, A056, A057, A059, A065 | 7 |
| 24 | A075 | A013, A023, A036, A042 | 4 |

The unchanged organiser sample has zero closure violations. Its week-21 chain
A074 → A004 → A025 demonstrates why direct pairwise sharing alone is inadequate.
Unit tests also cover fake label reuse, distinct weeks/groups, cross-line
buffer extents, non-Live PC/C compatibility, Live C protection, Consist C/PM
separation and buffer-only conflicts.

## Evidence boundary

Earlier public scores **25.2 / 30 / 25.2**, native bounds, CP-SAT/SCIP comparisons
and stress certificates were obtained with the incomplete closure model. They
are retained as historical evidence and cannot certify the corrected model or
its algorithm ranking. A repeated numerical score is not a substitute for a
fresh run with the corrected constraints and independent CSV checks.

Fresh verification, generated scores and deployment handoff are recorded in
[project status](PROJECT_STATUS.md). Reference-validator parity and the deployed
GCP release remain separate checks; local tests and Git publication do not
establish either.

The [final native smoke record](../scripts/ps1/benchmark/closure-smoke-results.json)
identifies the measured sources, inputs and local host. A five-second cold
CP-SAT check solves Live interchange A/B/C at zero with complete workloads and
no validation mismatches. Mixed 120 A and Mixed 240 C return UNKNOWN without a
candidate at that small cap; neither is an infeasibility proof. These checks
ran alongside unrelated verification, so their timings cannot rank algorithms
or predict the target GCP host. The full corrected comparison remains pending.
