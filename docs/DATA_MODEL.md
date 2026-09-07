# Data Model

Last updated: 2026-09-07 · RailPlan v0.4.0

## Planning inputs

`packages/core/src/domain/instance.ts` defines `PlanningInstance`, one serializable
night of facts: `planningNight`, integer-minute `window` (start/end/slot), stations,
atomic blocks, bidirectional adjacency edges, conflict zones, teams, equipment,
work-class incompatibilities, maintenance requests and travel parameters.

`canonicalise()` orders sets consistently but preserves request block order.
`instanceDigest()` hashes canonical content, including topology and resources.
`assertInstancesMatch()` verifies sections and digests and names changed sections
without printing data. Array order alone is not drift. Digests identify content;
they are not cryptographic signatures or authorization tokens.

`MaintenanceRequest` includes ID, labels/description, work class, ordered block
IDs, duration/clearance, priority, assigned team, required skills, equipment unit
demand, preferred/earliest/latest integer times, dependencies and minimum lag.
`mandatory` derives from critical priority. Sector labels are presentation only.

`PlanningWorld` derives lookups, adjacency and compatibility from an instance.
`ValidationContext.world` carries it into validation, solving, metrics,
alternatives, explanations and repairs; omitted worlds use the literal instance.

## Database tables

The baseline migration defines 16 tables, all with RLS enabled. Issue #5 grants authenticated planners read/write policies;
contractors and anonymous callers cannot access these global facts. The owner-only
maintenance seed and parity loader bypass RLS. Application SQL must use the
authenticated transaction helper.

| Area | Tables |
| --- | --- |
| Topology | stations, track_blocks, block_adjacency |
| Isolation | conflict_zones, conflict_zone_blocks, conflict_zone_work_classes |
| Resources | teams, team_skills, equipment_types, work_class_incompatibility |
| Night | planning_nights |
| Requests | maintenance_requests, request_blocks, request_required_skills, request_equipment, request_dependencies |

Foreign keys preserve references. Checks constrain positive capacities/durations,
nonnegative buffers, valid windows, block ordering and non-self dependencies.
Critical `mandatory` is a generated column. Work-class pairs use lexical C
collation, matching TypeScript rather than PostgreSQL enum declaration order.
The validator handles feasibility and
longer dependency cycles. Database checks are not a replacement for it.

`loadPlanningInstance(sql, night)` reconstructs the shared contract. `db:seed`
writes literals transactionally and checks the loaded content. It replaces demo
facts and is intended only for a disposable RailPlan development database.

## Computed outputs

Placements carry request/team IDs and start/end minutes. Validation returns typed
rule violations with participants, evidence, remedy and exact interval. Solver
results carry placements, deferred work and reasons, status, objective vector,
input hash, versions, timing, independently recomputed violations and metrics.
Calculated metrics expose formula, numerator and denominator; they are not saved
constants. Pins enter the solve as hard constraints.

## Persistence and time

The default fabricated planning night is defined in `data/requests.ts`; integer
minutes are relative to that night. Intervals are half-open. Multi-night work,
individual rosters and timezone conversion are not implemented.

The browser persists `strategy` and exact `locked` placements under
`railplan-preferences`. Generated plans, decisions and disruptions are session
state. Identity tables exist; there are no plan-version, request-submission, workforce,
notification or audit tables yet. Issues #6 onward introduce those contracts.

## Identity — issue #5

`UserRole` is shared as `planner | contractor`. `profiles.id` references
`auth.users.id`; profiles hold the trusted role and contractor organisation ID.
Contractors require an organisation; planners cannot carry one. Profiles are
operator-provisioned, with no user insert/update privileges or metadata trigger.
Users read their own profile. `contractor_organisations` holds an ID, name and
creation timestamp; contractors read their own organisation and planners read
all organisations. Anonymous access is denied. Organisation management remains
operator tooling until its own product workflow is added.

`railplan_private.assistant_buckets` stores at most 12 tokens per auth user and
an update timestamp. One token refills every five seconds; deletion of an auth
user removes their bucket and profile. No prompts, tokens, passwords or email
addresses are stored in application tables.
