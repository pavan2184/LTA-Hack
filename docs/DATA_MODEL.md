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
and notification workflows are documented below; exports remain issue #15.

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
transcripts in audit. Planning facts include baseline maintenance requests and
active immutable intake approvals introduced in #9. All fact,
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

## Workforce results — issue #8

`WORKFORCE_CAPACITY` is a critical `ViolationRuleId`. Each quantified violation
includes contributing `requestIds`, exact half-open `window`, observed/required
text, remedy and `workforce: {teamId,roleId,demand,available,shortfall}`. Headcounts
are numbers; `shortfallMinutes` is the interval duration, not people. Separate
roles and distinct intervals remain separate violations. A missing or invalid
demand definition carries null role/counts and null window, with an explicit
input-completion remedy; unknown demand is never silently interpreted as zero.

`ValidationContext.extraWorkforceDemand` supplies complete per-request overrides
for synthetic scenarios. It is hashed with the solve context. The built-in
emergency set declares two technicians and one supervisor per scenario as a
fabricated assumption. Normal database demand remains normalized in the instance.
No migration or individual workforce records are introduced.

`PlanMetrics.workforceUtilisation` is demanded person-minutes / available
person-minutes × 100, rounded to one decimal. Availability is clipped to the
engineering window, team shifts and outages; demand includes actual overruns and
excludes clearance. It may exceed 100 for infeasible plans. A zero denominator
returns 0 by documented convention, with shortages shown separately. Unknown
request demand is excluded from the known numerator and prominently identified
as incomplete in the metric note and as a critical violation.

`PlanMetrics.workforceShortageIntervals` counts maximal constant team/role
segments with demand above supply. Its numerator is that count; denominator is
all assessed segments with positive demand. It is a count, not a percentage.
Adjacent segments merge only if contributors, demand and available headcount are
identical. Both fields retain the ordinary MetricValue shape and formulas.
`assessWorkforce` also exports the exact intervals, shortages and missing IDs for
subsequent visualizations. Crew utilisation remains a distinct metric.

Constraint version is `constraints-v3`, solver version
`railplan-greedy-repair-v3`, metric version `metrics-v4`, and emergency scenario
version `emergency-set-v2`; older immutable saved results retain their versions.

## Request submissions — issue #9

`RequestSubmission` is a separate shared contract from `MaintenanceRequest`.
`RequestFields` contains planningNight, title, description, workClass, blockIds,
durationMinutes, preferredStart, earliestStart, latestEnd, equipment units and
anonymous workforce role counts. Drafts may omit text/blocks/demand by supplying
empty values; selected references, numeric bounds and actual night windows must
already be valid. Submission requires title, description, blocks and workforce.

`RequestApproval` explicitly confirms teamId, priority, clearanceMinutes,
requiredSkills, dependencies, dependencyLagMinutes and safetyConfirmed. The safety
confirmation acknowledges this prototype's fabricated work-class/topology rules;
it is not an operational safety certification. Required skills must be covered by
the selected team. Dependencies must reference other active approved work or
operator baseline requests on the same night and cannot form cycles.

Private `request_submissions` stores organisation ownership, current version and
active approved version. `request_revisions` stores immutable fields, approval,
status, actor, prior status, action, reason and timestamp for every version. Both
have RLS reads scoped to the caller's organisation or a planner; direct writes
are denied and history has mutation/truncate guards. Actor UUIDs deliberately do
not cascade on Auth deletion. Draft/submitted/needs_info/approved/rejected/cancelled
are persisted statuses; scheduled is derived from current published placements.

Every mutation compares expectedVersion, atomically increments it and appends one
revision. `revise` starts a draft from approved/rejected/cancelled work. A previous
active approval survives revision drafts/rejection until replacement approval or
cancellation. The engine request carries optional `submissionRevision`; absence
identifies the existing operator-seeded baseline. Approved request demand joins
the same canonical workforce facts and saved-plan digest.

## Private extracted proposals — issue #10

`NullableRequestFields` contains all eleven contractor RequestFields keys, each
with its original type or null. `DraftConfidence` maps the same keys to a 0–1 model
estimate or null. `DraftProposal` adds `missingFields` and `DraftEvidence[]`.
Evidence records field, exact quote, server-computed start/end UTF-16 offsets and
an optional timestamp occurring literally inside that quote. Quotes are at most
256 characters; each proposal has at most 24, each extraction at most eight drafts
and unique retained excerpts at most 2,048 characters across the entire batch.
Complete transcript coverage is rejected even when split across excerpts.

`PrivateDraft` adds UUID, ownerId, organisationId, current version, private status,
created/updated timestamps, model and extractorVersion. SQL derives ownership from
the current trusted profile; contractor organisation is inferred, planners have
null organisation. `private_drafts` points at immutable
`private_draft_revisions`; no raw transcript or arbitrary provider-response column
exists. Both tables use owner-only RLS with no planner override and deny direct
authenticated writes. A narrowly granted function validates the minimized strict
snapshot before atomic batch persistence. Authenticity against discarded input is
verified at the server extraction boundary; SQL never receives raw source.

No engine MaintenanceRequest is created and no planning-source revision changes.
Source files, filenames, speaker identities and complete transcripts are not stored.
A separate private `ingestion_buckets` table is owner-keyed quota state, independent
of the planner-only assistant limiter.

## Reviewed proposals and shared source snapshots — issue #11

PrivateDraft status is private or submitted, with submittedRequestId and
manualFields. PrivateDraftDetail adds immutable revisions and current
validationErrors. A PrivateDraftRevision carries the partial field snapshot,
confidence, missing fields, evidence, manual fields, actor, action, prior/new
status, reason, timestamp and original model/extractor provenance. Existing initial
revisions retain their original data; newly nullable metadata is interpreted as
extract by the original owner, private status and no manual fields.

Private draft edits accept only nullable contractor fields. The server recomputes
manual fields, missing flags, evidence and confidence; callers cannot supply these
provenance fields. Empty required blocks/workforce remain incomplete; empty
equipment is an explicit known absence. Submission requires every field nonnull
and the complete structured contractor validation, but does not invent or grant
planner scheduling fields. Owner/version checks and unique links prevent duplicate
submission. Contractor organisation reassignment requires a new appropriately
owned proposal rather than silently sharing prior organisation material.

`private_drafts.submitted_request_id` links the owner view to its submitted request.
`request_proposal_sources` contains one immutable RequestProposalSource per request
and draft, including final fields/evidence/confidence/manual fields, submitted
revision/actor/time and complete retained revision history. The source table has
submission-scoped RLS and a mutation/truncate guard. It introduces no raw transcript
column. Private proposal rows remain owner-only even after the deliberate snapshot
is shared. A submitted request starts at revision 1 with action submit_proposal;
subsequent planner actions append ordinary request revisions.

## Durable Telegram outbox — issue #14

All five notification tables live in non-exposed `railplan_private`, with
planner-only SELECT RLS. Authenticated callers have no direct write grants;
narrow fixed-search-path functions recheck trusted planner identity and derive the
actor. No Telegram token is persisted in these tables.

- `notification_configurations`: one current nullable numeric chat ID per
  organisation, optimistic version and last actor/time.
- `notification_configuration_events`: immutable prior/new chat, version and
  authenticated actor/time for every configuration change.
- `notification_deliveries`: immutable organisation-scoped message, publication
  FK/night or test configuration version, unique deduplication key, creator/time.
- `notification_attempts`: immutable numbered claim, delivery FK, authenticated
  actor, saved destination at claim time and start timestamp; at most 20 attempts.
- `notification_results`: immutable one-result-per-attempt, Telegram message ID
  **or** allowlisted error code/ambiguity, bounded retry delay and result timestamp.

A publication INSERT trigger compares the new and superseded immutable plan
snapshots. It resolves `R-<submission UUID>` ownership through the protected request
submission and exact approved revision, and compares only that request's revision,
sector, assigned team and schedule state/times. Stable sorted messages include
removed work using previous provenance. Baseline operator-seeded requests have no
contractor ownership and are excluded. The outbox and publication commit together;
external delivery cannot execute in the trigger or roll publication back.

A per-delivery row lock serializes claims. Success in **any** attempt permanently
prevents another claim, including a late successful result from a previously
unknown attempt. Pending claims cannot be retried for 60 seconds; an abandoned
claim is derived as unknown, with no automatic resend. Explicit acknowledged
retries append a new claim. Attempt/result/configuration histories cannot be
updated, deleted or truncated, even through ordinary owner SQL. Delivery state is
a read-time projection of those histories, with superseded unsent work blocked.

The message is frozen at publication; the destination is selected from current
trusted configuration at each claim, allowing an explicit retry after correcting
a missing destination. Test delivery keys contain the configuration version, and
configuration reads expose only that version's test. Neither notification work nor
chat changes advance planning-source revision or alter a saved engine result.
