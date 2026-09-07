# Data Model

Last updated: 2026-09-07 · RailPlan v0.4.0

## Planning inputs

`packages/core/src/domain/instance.ts` defines `PlanningInstance`, one serializable
night of facts: `planningNight`, integer-minute `window` (start/end/slot), stations,
atomic blocks, bidirectional adjacency edges, conflict zones, teams, equipment,
work-class incompatibilities, maintenance requests, anonymous workforce roles,
availability/demand and travel parameters.

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

The baseline migration defines 16 planning-fact tables; issue #7 adds three
workforce fact tables, all with RLS enabled. Issue #5 grants authenticated planners read/write policies;
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
| Workforce | workforce_roles, workforce_availability, request_workforce_demand |

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
`railplan-preferences`. The local dashboard
keeps exploratory generations and disruptions in session state. Dedicated saved
plans and their decisions/publications/audits are durable. Request-submission
and notification workflows remain later issue work.

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

## Immutable versions — issue #6

The shared `PlanVersion` contract lives in `packages/core/src/types/plans.ts`.
It carries planning night, source revision (decimal string), SHA-256 input digest,
strategy, solver/constraint versions, status, objectives, calculated metrics,
independent validation, normalized placements/deferrals, creator and creation time.
Publication state and timestamp are derived from immutable publication records.

Private tables: `planning_source` (global revision and independent lock generation),
`planning_runs` (canonical facts, parameters and result without duplicated plan),
`plan_placements`, `plan_deferrals`, `planner_decisions`, `plan_publications` and
`plan_audit_events`. Placement/deferral positions preserve exact engine order.
Published versions have no edit/delete route; database grants and immutable
UPDATE/DELETE/TRUNCATE triggers protect all generated versions and audit history.
Publications link to the version they supersede, leaving its snapshot intact.

Actor UUIDs deliberately have no cascading Auth foreign key: deleting an account
must not erase the historical creator/audit identity. Audit stores only actor,
action, plan ID, optional related ID and server timestamp. Decision reason is
bounded to 1,000 characters. There are no raw request bodies, credentials or
transcripts in audit. Planning facts currently mean the baseline maintenance
requests; approved intake becomes the source when #11 implements it. All fact,
child, resource and topology mutations conservatively stale all nights.

## Anonymous workforce — issue #7

`@railplan/core/types/workforce` defines `WorkforceRole {id,name}`,
`WorkforceAvailability {planningNight,teamId,roleId,startMinute,endMinute,count}`
and `WorkforceDemand {requestId,roleId,count}`. `PlanningInstance` carries the
three arrays as `workforceRoles`, `workforceAvailability` and `workforceDemand`.
Demand is normalized beside requests, preserving existing MaintenanceRequest
callers. Roles are configurable identifiers, not individual qualifications.

Availability is an absolute count of people during the half-open interval
`[startMinute,endMinute)`, not an additive supply event. Same-night/team/role
windows cannot overlap; adjacent windows may replace the count. Zero is explicit
unavailability; an absent window means no declared supply. Supply permits integer
counts 0–10,000, demand requires 1–10,000, and each request/role pair is unique.
Team.capacity continues to count concurrent crews. People counts are independent.

Database foreign keys reject unknown teams, roles, requests and planning nights.
A GiST exclusion constraint prevents overlapping supply even across concurrent
transactions. A trigger checks availability against its actual night window and
also rejects a parent-night resize that would strand existing availability.
The source revision trigger serializes both writes before these checks; all three
workforce tables participate in saved-plan invalidation and use planner-only RLS.
No named workers, personal leave, worker qualifications or personal locations exist.

Canonicalization sorts roles by ID, supply by night/team/role/start/end and demand
by request/role. Every field contributes to instance and saved-plan input digests.
The loader filters supply and demand to the selected night and explicitly validates
references, counts, bounds and ambiguity. Canonicalization itself does not enforce
references, allowing existing synthetic engine callers to alter request pools or
windows for exploratory tests. Source-validating boundaries use
`assertWorkforceInstance` explicitly.

The fabricated default has two roles, 22 availability rows and 44 demand rows.
Supply is an explicit per-team input fixture, never Team.capacity multiplied by a
constant. Each baseline job declares two technicians and one supervisor as a demo
assumption, not an operational staffing standard. Issue #7 carries these facts;
workforce feasibility, emergency/disruption demand handling and metrics follow #8.
