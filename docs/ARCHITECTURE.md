# Architecture

## PS1 hybrid optimisation — 2026-09-19

The browser worker reuses validated earlier-scenario incumbents, then combines
nominal-capacity construction, ranked legal ECLO windows and seeded adaptive
destroy/repair. Unaffected accesses and operator pins remain fixed during repair;
sharing groups and night assignments are rebuilt and every candidate is checked.
A worse exploratory candidate never replaces the best validated result. The
default shared neighbour budget is 256. Native PS1 CP-SAT full/repair models live
under `scripts/ps1/benchmark/` and do not enter the browser bundle or any HTTP API.
See that directory's README for benchmark results and limitations.

## PS1 schedule-first planning workstation — 2026-09-19

The browser client retains all three `ScenarioRun` outcomes, including
`INFEASIBLE` and `INVALID_INSTANCE`, so one failed policy never erases usable
results from the other two. A monotonically increasing operation epoch prevents
an older solve/replan from replacing newer state. Fresh instances open Scenario C;
same-instance replans preserve the operator's active policy.

The public route owns a scoped workstation shell: compact teal application
chrome, a grouped command ribbon, compact policy selection with expandable
comparison, and a dominant planning canvas. `WorkSchedule` is the initial view.
It groups activities by contract, draws actual sparse weekly accesses, marks
planned starts and completion targets, and provides search, hierarchy controls,
scale selection and a bottom horizon navigator. It does not convert
`access_night` into a physical timestamp or fill gaps between accesses.

The solved UI is one linked master-detail system. `WorkspaceSelection` is the
shared activity or location-week identity used by the work schedule, attention
queue, occupancy ARIA grid, inspector and deterministic Q&A. Selection opens
contextual details; attention and the inspector can be closed to recover canvas
width. `buildAttentionItems()` is a pure projection of
engine facts and orders blockers, priority risk, rejected constraints, disruption
pressure, scenario levers and recent changes before routine work. The timeline
uses `buildTimeline(..., disruptions)` and the shared `capacityAt()` function, so
nominal and effective capacity cannot drift from the disruption engine.

Location occupancy is the complementary spatial/capacity view. Its grid has one
page tab stop with an active
descendant, arrow/Home/End navigation, 28px standard cells and fixed-row
virtualization above 200 rows. Below `lg`, the explicit product boundary remains
triage and review through Attention, Selected, Review and Proof views; the dense
desktop matrix is not presented as a mobile editor. Inspector instances use
unique IDs so mounted responsive representations cannot collide in their label,
tab or controlled-panel relationships. Low-glare mode is session-only and scoped
to PS1. [DESIGN.md](../DESIGN.md) records the visual direction and runtime token
ownership; [UX-CONTRACT.md](../UX-CONTRACT.md) records observable behavior.

Instance provenance is explicit when starting a solve: a supplied public-file
override is public, while files chosen through the upload path stay labelled as
an uploaded instance. File-reading operations use the same epoch boundary as
solving, so a late upload cannot replace newer input. Re-running, pinning and
clearing pins retain each scenario's applied disruption set rather than
silently returning to nominal supply.

Applied and proposed state stay separate. Pins and urgent-maintenance replans
produce a `PlanDiff` review shelf; export remains blocked until Apply or Discard.
Apply creates an in-memory revision and Undo restores its snapshot. Proof exposes
local-conformance limits, worker diagnostics and the immutable official manifest.
The copyable handover and planning log are auxiliary artifacts and are never added
to the official ZIP. No HTTP route, database, authentication or environment
variable changed.

## Public PS1 optimiser workspace — 2026-09-18

`/ps1` remains an unauthenticated, database-free client boundary. Exact CSV
parsing and instance validation happen before a hidden instance enters the pure
`@railplan/ps1` engine. A module Web Worker runs deterministic multi-start
construction and bounded reconstruction search; every candidate is independently
checked by `validate()` and only a complete feasible result is downloadable.

The official format cannot identify one physical night across separate contract
possessions. The validator therefore reports `local` conformance and the named
`cross_possession_night_alignment` undecidable rule. It does enforce every
represented identity, workload, occupancy, result, capacity, mix, allocation,
workfront, predecessor and ECLO invariant. Closure expansion remains one shared
function for validation, solving, explanation and the schematic network.

Client state separates the applied schedule from a proposed pin or disruption.
A proposal carries a computed diff and must be applied explicitly. Applied
snapshots support single-step undo and append to a memory-only session log. The
log exports separately and never enters the official nine-file ZIP.

## Reconciled composition — 2026-09-15

The current Night overview remains the queue/timeline/inspector workspace.
Requested-time conflict review calls the existing planner-only analysis endpoint.
Findings are grouped without dropping underlying rules. Current pins override
requested placements and cannot be moved by a recommendation. A selected finding
is recomputed on the server; its recommended pin goes through a full independent
solve/validation before opening the existing change-review dialog. Explicit draft
generation retains the exact preview basis and parent lineage. No client-side
revision editor, solver change, or new migration is introduced by this merge.

The sandbox remains one server-gated dashboard. Former requests/conflicts/schedule/
resources/scenarios routes redirect to its named sections, keeping only safe
night/plan/request return context. They never import saved planning data.
The page owns the only navigation/session boundary. Actor changes and reset clear
transient assistant/filter state and invalidate pending results; persistence remains
limited to strategy and exact pins, with unowned pins cleared on first entry.
Separate history, notifications and private-draft pages retain their unsaved guards.
Historical upstream compositions below are superseded by this section.

## Reviewed carry-forward — 2026-09-15

Preparation creates a linked ordinary intake draft atomically through the existing
planner-create validation path. The draft is not planning input. Original fields
and dependencies remain immutable review metadata; incompatible target references
must still be resolved by ordinary approval validation. Source retirement rejects
active inbound dependencies and requires an exact current publication/version
confirmation. A review acknowledgement does not bypass either guard.

All intake mutation entrypoints now acquire source → work item → linked submissions
(sorted UUID) locks. One explicit active-occurrence mapping suppresses retired
seeded requests and their workforce demand without deleting operator rows or old
saved facts. Mapping changes invalidate source revision; preparation and backlog
metadata do not. Previously retired submissions cannot reactivate duplicate work.
The latest cancelled occurrence can be explicitly revised/submitted/approved on the
same night; moving it across nights requires reviewed carry-forward.

Planner-only preparation uses trusted catalogue choices and a retry-stable command.
It retains the saved draft link when refresh fails. Contractor request/detail DTOs
contain only scoped linkage, not original fields, publication confirmation or the
planner-only active night. Coordination organisation responses stay informational.

## Deferred-work persistence — 2026-09-15

The private backlog records durable intake UUID identity (including reserved
carry-forward links) or night-qualified operator request identity. Draft generation
is inert. Explicit historical recording verifies an exact saved deferral; an INSERT
trigger records publication outcomes in the same transaction as publication/outbox.
Replacement publications append corrections. Current same-night publication takes
precedence over later historical recording. Counts derive distinct effective nights.

Planner metadata and explicit lifecycle commands use optimistic item versions and
append audit events without changing planning-source revision or lock generation.
Source recording/publication preserve source-before-item lock order. Scheduled is a
read projection of current published placements; linked intake must still have the
exact active approved revision. Completion/cancellation remain explicit lifecycle
state and survive later publications. Task 3 must add the operator-seeded retirement
guard when implementing approved carry-forward; its current source identity remains
active until that workflow exists.

Contractor DTOs are built from an explicit SQL allowlist. Raw private tables remain
planner-only under RLS; contractor results omit source plan links, owner/actor IDs,
versions and planner history. Configured-night and trusted-owner catalogues are
bounded. No backlog feature sends messages or changes solver feasibility.

## Versioned coordination — 2026-09-15

Planner coordination proposals reuse immutable saved facts and the ordinary
server analysis/solver. Full-plan change derivation includes every changed
placement or deferral, resolving contractor ownership from the saved submission
UUID and exact approved revision. Only an explicit Apply generates and links a
new saved draft. Apply locks source before case, re-solves current facts, compares
reviewed result/impact digests, and stores the plan/application atomically.
Publication remains a separate feasibility/source check. Organisation confirmation
is informational and never a publication permission or solver constraint.

Case mutations use expectedVersion; confirmation targets an exact revision.
Revision appends new proposal/participant snapshots with pending confirmations,
preserving previous events and applied-plan links. Same-input creation and exact
Apply retries are idempotent. Contractor reads use a narrow organisation-scoped
projection; global proposals, planner notes and other organisations never enter
their DTOs. Planner-only table RLS remains enabled in the non-exposed schema.

The planner workspace links exact cases from validated saved-plan alternatives;
its owner/deadline, lifecycle notes and proposal edits use the shared unsaved guard.
Historical applied-plan summaries show viewedRevision, independently of the latest
proposal. Contractor ordinary request pages carry the exact case through login
and reload; private draft pages omit coordination context. A missing scoped case
reports the read error without falling back to another case. The separate HTTP
fixture harness now removes coordination FKs before
planning runs and verifies all 17 history guards after exact cleanup.

## Sandbox timeline dragging — 2026-09-15

Shared timeline pointer/keyboard handlers emit proposals only when the sandbox
supplies an optional callback. All linked bars show the same snapped time offset;
saved timelines remain selection-only. Sandbox previews use the existing solver
with the proposed pin and current disruption inputs. Explicit Apply swaps the
complete validated result, so all metrics/panels and assistant pin replay remain
consistent. Preview and single-step Undo are memory-only and guarded against
changes to the current result, view, strategy, pins or disruption. Applying uses
the existing browser-local pin persistence; Undo restores the previous pins.
Only generated drafts are draggable; pinned and scenario-forced work stays fixed.

Planner manual intake: Night overview's Add request opens the existing request
workspace at `request=new`, retaining night/version/queue selection for the return
link. The intake editor requires an organisation for planner creation; the server
checks the trusted profile and invokes the narrow private planner-create function.
Contractor creation still derives its organisation from its profile. Both produce
audited draft revisions; only later approval contributes planning inputs.

## Shared sandbox presentation — 2026-09-15

Sandbox now renders `PlannerQueue` and `PlannerTimeline`, the same presentational
components as Night overview, through `SandboxPlannerPanel`. That adapter reads
only literal demo facts and `visiblePlanningInputs`, including forced emergency
placements, changed handback and closed blocks. It never loads a saved plan from
the URL. Optional timeline conflict overlays do not alter saved-plan rendering.
`PlannerRequestHeader` shares request identity and time presentation; saved analysis
remains server-scoped while sandbox inspection and slot actions use the demo store.
Sandbox-specific filters, repairs, scenarios and adjustable panels remain available.

## Shared website shell and navigation — 2026-09-15

The authenticated root `/` is now a role-aware workflow guide, reachable through
Home and the RailPlan brand. It explains preparation, submission, review,
scheduling, publication and tracking without exposing planner actions to contractors.
Existing post-login workspace destinations and direct links remain unchanged.
Home carries only supported night/version/request context into its action links.
Each working page opens with a brief description of its purpose.

All workspaces use the shared role-aware navigation and global white/blue theme,
including body-level dialog portals. `/plans/history` and `/settings/notifications`
are dedicated planner-only views; private drafts have separate `/requests/drafts`
and `/contractor/drafts` routes. Request and draft detail IDs are URL-addressable
and read through existing scoped APIs, independently of bounded list results.
Submitted proposals link to their exact request; saved approved work links back
to intake; only planners get links to whole published plans.

Navigation carries night/version/engine-selection context (using `planRequest`
beside intake's own `request` ID). Sandbox query context is only a return address:
its solver still consumes the separate fabricated store. Compact workforce/map
panels retain their mounted state, with queue/inspector size controls preserved.
Unsaved UI state stays in React memory, never URLs or local storage. Cancelable
Navigation API traversal events protect edited forms and previews before native
history changes; capture-phase click/pop guards support other browsers. The older
popstate fallback restores the current entry, replacing the forward branch on
cancellation. Cross-document exits retain the native beforeunload warning.

Login accepts an allowlisted local return destination, filters it to navigation
identifiers, and resolves the authenticated role on the server before redirecting.
Every new page retains its own role gate; proxy coverage includes nested contractor
and settings paths. No schema, solver, RLS or public API changes are involved.

## Connected planner workspace — 2026-09-14

`/plans` now composes an exception-first night overview with request queue,
clearance-aware block timeline and persistent desktop inspector. Narrow screens
use accessible queue/inspector dialogs. Workforce, geography and calculated-metric
views share the selected request. The exact saved export remains the display
snapshot; its labels and facts are never replaced with current intake data.

`plans/overview.ts` reads batched summaries, configured nights, exact pending count
and the independent current publication in an authenticated repeatable-read
transaction. `plans/analysis.ts` uses saved facts with the existing core engine for
inspection, unsaved pin/objective previews and five-objective comparison. These
read-only operations use the source observation function, not its mutation lock.
Optional generation guards bind a preview to source, engine and normalized input
digest; only a fresh server solve can create an immutable saved version.

Client state explicitly separates saved snapshots from unsaved previews. Async
operations carry abort/epoch guards; failed post-mutation reloads retain the exact
saved ID and a recovery action instead of showing an old version as new. Navigation
requires discarding an unsaved preview. History and comparisons use cursor-paged
summaries and exact saved exports. Publication retains its existing commit/outbox/
bounded-dispatch semantics, with a review dialog and separate delivery results.

Last updated: 2026-09-07

## Shape

A server-gated Next.js App Router workspace over a pure TypeScript planning engine, plus
dynamic routes for the assistant and durable plan versions. Postgres planning-facts migrations and a
seed/loader exist; saved planning consumes immutable database snapshots. Supabase email/password authentication gates planner and contractor workspaces; no live feed
yet. The owner requires database development without Docker.

```
packages/core/src/domain/     network topology, crews, assets, work-class rules   (facts)
packages/core/src/data/       22 requests, emergency scenarios, disruptions       (inputs)
packages/core/src/engine/     intervals, validate, solve, metrics,                (computation)
                alternatives, explain, strategies, hash
src/store/      Zustand: view state + solver invocation             (orchestration)
src/components/ dashboard                                           (presentation)
src/lib/assistant/ fact set, grounding guard, templates             (language layer)
src/app/api/assistant/ Claude call, server-side                     (model boundary)
```

The dependency arrow points one way. `domain` knows nothing about `engine`;
`engine` knows nothing about `components`; `components` never compute a planning
result, they render one.

## The central rule

**`validate()` is the only authority on whether a plan is feasible.**

The solver calls it while building. It calls it again on the finished plan, from
scratch, before returning. The alternatives generator calls it on every candidate.
The explanation engine calls it on counterfactuals. The tests call it on solver
output as a property. Nothing anywhere is allowed to assert that a plan is
acceptable without going through it.

This is what makes the difference between a tool that shows a schedule and a tool
whose schedule means something. A solver that only trusts its own incremental
checks will eventually ship a plan that violates a rule it stopped looking at.

## Why atomic blocks

A request arrives labelled `NS10-NS12`. Another arrives labelled `NS11-NS13`.
Compared as strings they are unrelated; on the ground they share `NS11-NS12`.

So a sector label is display only. `expandSector` turns it into block ids at
module load, and every rule, the solver, the timeline and the corridor map all
work on those ids. The timeline draws one row per block rather than per request
for the same reason: a chart keyed on the requested sector would hide precisely
the collision the tool exists to find.

## Why capacities, not names

v0.1.0 modelled equipment as a string. Two jobs both listing "Thermal imaging
unit" looked like a coincidence. Modelled as a count — one calibrated unit — it
is a constraint the validator finds without a human noticing.

The same dataset shows why this matters more than crew headcount: Power Systems
has two crews, so `TEAM_CAPACITY` is satisfied for M-004 and M-011 running
together. They still cannot both run, because there is one thermal imaging unit
and one SS-4 isolation. Three rules, one answer, none of them typed in.

## Strategies are objectives, not schedules

A strategy is three deterministic levers over one solver: the order requests are
considered in, how candidate start times are ranked, and how much separation or
reserve the profile insists on. Profiles remain objective parameters. Two profiles running the same
constraints differ only by those numbers, which is what makes the comparison
meaningful rather than decorative.

## Planner decisions re-enter the solve

Pinning a placement is not an overlay. It becomes a hard constraint and the night
is solved around it. This is the difference between an interface that lets a
planner move a bar and one where moving the bar means something: the KPIs, the
violations and the rest of the schedule all move with the decision, or the tool
reports that the decision cannot be honoured.

## Disruptions change inputs

Each scenario translates into solver inputs — a mandatory emergency job pinned to
its window, a crew marked unavailable, a job stretched by its overrun, an earlier
handback deadline. Then the ordinary solver runs. Nothing is precomputed, which
is why a scenario is allowed to come back infeasible.

## The model boundary

The assistant is a presentation layer over solver output and is constrained
structurally rather than by instruction alone:

1. The browser sends the question and the parameters identifying the plan — never
   the plan. The server re-solves and builds its own fact set, so nothing the
   client sends can become a fact the model repeats.
2. The fact set is serialised into the prompt *and* reused as the allow-list for
   the grounding check, so the two cannot drift.
3. Any answer containing a numeric token absent from that fact set is discarded.
4. On rejection, refusal, missing credentials or network failure, templates over
   the same engine output answer instead, and the interface says which happened.

The assistant can rephrase, summarise and prioritise. It cannot introduce a
quantity, and it never decides feasibility.

## Determinism

Same inputs, same plan. Guaranteed by fixed request ordering with `id` as final
tie-break, integer minutes throughout, candidate starts generated in a fixed
order, and a repair loop that re-solves from scratch rather than mutating in
place — so the result is a function of its inputs and not of the order repairs
happened in. `inputHash` makes it checkable, and a test asserts it.

## Performance

22 requests solve in 20-70 ms, so solving runs inline. A Web Worker would add
failure modes without removing a visible stall. The progress strip shows three
real phases rather than a fake timer. That trade changes if the dataset grows.

## Deployment

Any Node host that can build Next.js. `/`, `/contractor`, `/login` and `/api/assistant` need a server. Without `ANTHROPIC_API_KEY` the assistant degrades to templates and the
rest of the application is unaffected.

## Database boundary (v0.4.0)

`PlanningInstance` is the serializable contract shared by literals and the
Postgres loader. Canonical ordering and section-level digest comparison detect
source drift. `PlanningWorld` derives the lookups carried through engine context.
The core package cannot import web, React or Next code; ESLint enforces this.
`supabase/migrations` stores schema history, `scripts/db/seed.ts` writes demo
facts, and `scripts/db/verify.ts` is the required non-skipping parity gate.
The hosted RailPlan Dev project passes migration, seed and literal/database parity
verification. The loader uses a repeatable-read transaction for a consistent
snapshot and transaction-pooler compatibility. The dedicated `/plans` workflow persists server-generated versions and audits; the demo sandbox remains explicitly local exploration.

## Identity boundary — issue #5

`@supabase/ssr` maintains cookies through the Next.js proxy and server clients.
Pages and the assistant verify the current user with `auth.getUser()`, then load
an operator-assigned profile. Signup metadata is never authorization input.
Missing configuration fails closed; unassigned accounts see access pending.
Contractors receive a separate workspace with structured intake in #9. The planner's
existing deterministic UI remains client-side behind the server page boundary.

All application SQL goes through `withAuthenticatedTransaction`: it sets the
transaction-local authenticated role and minimal claims derived from the verified
user, reads the trusted profile under RLS, and closes its connection. The owner
connection used by maintenance scripts is never the application authorization
context. Plan generation, decisions, publication and request intake use this
transaction boundary. Future resource routes must retain the same verified-role
checks and transaction boundary.

Assistant limits use a locked per-user token bucket in the private schema, shared
across application instances. A narrowly granted private definer function checks
the current planner profile, chooses the caller from `auth.uid()`, and fixes the
rate and clock server-side. Clients cannot mutate the bucket directly.

## Versioned planning boundary — issue #6

`src/lib/plans` accepts bounded generation parameters, loads canonical database
facts, solves against a derived world and independently validates before saving.
Transactions begin at repeatable read before the profile lookup. Every planning
fact mutation advances a conservative global source revision under a shared row
lock. Generation and publication update a separate lock generation on that row;
this forces overlapping repeatable-read callers to retry from BEGIN instead of
publishing from an old MVCC snapshot. Three total attempts bound retries.

Runs contain immutable facts, parameters and computed output. Placements and
deferrals are normalized. Separate append-only publication rows link superseded
versions without editing their content. Stale publication returns a value inside
the transaction, commits the rejection audit, then throws the typed HTTP error.
Publication revalidates saved placements against current facts and requires
matching full-input SHA-256, current engine versions and all mandatory work.

Tables and narrowly granted write functions are in the non-exposed
`railplan_private` schema. Authenticated SQL reads use planner RLS. Write functions
recheck trusted planner profiles and derive actors from auth.uid(). Never add this
schema to Supabase's exposed Data API schemas. Contractor reads remain denied
until a later scoped delivery contract exists.

## Workforce fact boundary — issue #7

Anonymous staffing data crosses the same PlanningInstance/seed/loader/canonical
hash boundary as topology and equipment. Role and demand catalogs remain plain
serializable facts. The database loader and workforce write-payload schema call
`assertWorkforceInstance` for references, counts, actual night bounds and duplicate/
overlapping data. Existing pure engine callers continue to accept the instance
with defaults; canonical sorting does not itself reject exploratory request/window
changes. No workforce solver rule or metric is introduced before #8.

PostgreSQL `btree_gist` supports the availability exclusion constraint. Shared
source-revision statement triggers serialize supply mutations and parent-night
window changes. The row checks run after that serialization and validate both
sides of the relationship, including concurrent READ COMMITTED writers. Workforce
facts are planner-only under RLS and every change invalidates old draft provenance.

## Anonymous workforce enforcement — issue #8

`engine/workforce.ts` segments work and absolute availability at every endpoint,
per assigned team and role. It merges only segments with identical contributors,
demand and supply. The validator reports each overloaded segment independently;
crew capacity remains a separate rule. No worker identities or qualifications are
inferred from these aggregate counts.

The same assessment feeds person-minute utilisation and shortage interval metrics.
Supply is intersected with the team's shift, engineering window and any outage;
overrun extends demand, while block-clearance time does not. Missing supply is
zero. Missing or malformed demand is unknown and blocks feasibility. Extra jobs
carry explicit `ValidationContext.extraWorkforceDemand` definitions; built-in
emergency scenarios declare fabricated counts rather than inheriting a staffing
standard. Emergency insertability is revalidated with those counts.

Candidates, pinned final plans, repair and alternatives use the shared validator.
Automatic repair preserves locks and rejects moves that introduce a new conflict;
workforce conflict identity includes its team, role, counts and interval. The
solver resolves mandatory custom requests from its actual input pool, so a
staffing-blocked emergency is reported infeasible even when absent from literals.

## Structured request intake — issue #9

`src/lib/requests` keeps contractor proposals separate from engine inputs. Private
submission rows point at an append-only revision/event stream. Every edit and
transition advances an optimistic version, records the authenticated actor and
preserves the prior snapshot. A narrow private mutation function derives the
organisation from the trusted profile, checks the lifecycle and revalidates JSON
against actual database references. HTTP uses the same authenticated SQL role,
bounded JSON, same-origin rules and explicit planner approval permission as plans.

Contractors receive only selection metadata through a scoped catalogue function.
They cannot read global maintenance facts, team choices, supply or whole plans.
Planner-only catalogue fields include teams/skills and approved dependency choices.
Only active approved immutable revisions are appended by `loadPlanningInstance`
to operator-seeded baseline facts. Stable `R-<submission UUID>` IDs and exact
`submissionRevision` values enter saved facts and their digests. An approved
revision is never materialized into mutable public maintenance request tables.

Approval and active cancellation advance the shared planning-source revision under
the existing generation/publication lock. Revising approved work leaves the old
approved revision active until replacement approval; cancelling removes it.
Active prerequisites cannot be cancelled or moved to another night until their
approved dependents are revised. Scheduled status is a scoped query of the current
publication's actual placement and exact revision, including when a newer draft
exists. Intake status never asserts solver feasibility. The richer evidence and
AI proposal review queue remains issue #11 after transcript proposals in #10.

Baseline DELETE/id/night changes also check inbound approved intake dependencies
through a private trigger. The assembled loader fails closed on missing or
cross-night dependencies and unknown request block/team/equipment references,
including after trusted maintenance operations that bypass ordinary row changes.

## Private transcript proposals — issue #10

`src/lib/ingestions` reads authenticated same-origin raw UTF-8 text with a streamed
64 KiB byte bound. The owner explicitly requests extraction and saving of excerpts.
A separate owner-keyed database quota permits a burst of three and refills one
attempt per minute. Model work runs outside database transactions. Missing
`ANTHROPIC_API_KEY` returns a typed unavailable response; manual intake remains
independent. No new credential names or fallback identity providers are introduced.

Claude Sonnet 5 receives a fixed system instruction, selection-only catalogue and
one JSON-encoded untrusted transcript message. It has no tools or planner fields.
Structured JSON output is independently checked with strict Zod schemas. The SDK
has a 12-second timeout, no retries and logging explicitly off. Exceptions are
mapped to safe codes without logging source, output or upstream error objects.

Every evidence quote must match an exact source substring. The server computes
UTF-16 offsets and checks any quoted timestamp. Field support is conservative:
verbatim title/description, exact known references, labelled durations/windows and
explicit count-plus-resource references. Unsupported or inconsistent facts become
null with missing-field flags; confidence is only a model estimate. Invented
quotes reject the whole batch. Excerpts are bounded and aggregate coverage cannot
reconstruct the full source. The complete transcript never enters SQL or logs.

Private draft pointers and immutable initial revisions contain only validated
partial fields, estimated confidence, missing flags, retained excerpts, timestamps
and extractor/model provenance. Reads require the exact authenticated owner,
including for planners; organisation membership does not grant access. This store
has no submission, approval or planning-source side effect. Issue #11 adds the
explicit owner editing/submission journey over this private proposal boundary.

## Explicit proposal sharing and review — issue #11

Owner-private proposals can be edited with expectedVersion and a reason. Nullable
fields remain unknown until the owner supplies them; blank text normalizes to
null. Changed fields become manual, lose current model confidence and supporting
quotes, and retain their original extraction evidence in immutable history.
Existing extraction revisions are never rewritten: nullable audit metadata reads
with original-owner/extract/private fallbacks for the pre-review records.

Explicit submission is one transaction: verify current owner/version, validate all
contractor fields, derive the contractor organisation (or require a planner's
explicit known-organisation choice), append a private submit revision, create one
submitted RequestSubmission and store an immutable source snapshot. A changed
contractor organisation cannot silently inherit an old organisation's draft for
sharing. Submission shares retained fields, evidence and revision history with the
selected organisation and planners; other private material remains owner-only.

`request_proposal_sources` is readable through submission RLS, not through broader
private-draft access. Request detail reads include the immutable source snapshot;
list reads omit the heavy bundle. The ordinary submitted-request review lifecycle
then owns needs_info/rejection/approval and subsequent manual changes. Evidence
remains explicitly original proposal evidence if later request fields change.
Only complete approved request revisions cross the existing engine boundary.

Private edits/submission only advance lock generation for coherent catalogue
checks; they do not alter planning input provenance. Every cancellation and
rejected-to-draft reversal now increments the planning source, alongside approval
and approved replacement, exactly once per successful transition. Private history
is capped at 100 revisions to bound the deliberately shared snapshot.

## Workforce visualization

The chart projects `assessWorkforce` intervals, the same assessment used by the
validator and metrics. It retains slot and non-slot event boundaries, shows signed
remaining headcount, and separates teams and roles. Components do not derive
new demand or supply rules. Missing demand stays unknown. A shared
`visiblePlanningInputs` adapter assembles pending disruption placements for both
impact validation and the chart, preventing duplicate emergency work or overruns.
The existing request selection synchronizes contributor buttons with the Gantt
and inspector. The demo sandbox remains an exploratory literal snapshot; saved review receives its own persisted world.

## Geographic context

`data/geography/` contains a versioned presentational station-point snapshot.
`src/lib/geography/` validates its source metadata and exact known station set.
Offline scripts transform a reviewed local archive; the renderer imports JSON
and makes no map-service request. Core instances, hashes and feasibility never
import geography. Connections reference existing fabricated block IDs; geography
does not supply track alignment, operational possession/isolation or safety data.

## Issue #16 role journeys and saved visual review

Authenticated `/` routes planners to `/plans` and contractors to `/contractor`.
Shared navigation exposes request review, saved planning and the explicitly
fabricated `/sandbox` only to planners; every route retains server-side role checks.
SavedPlanReview reads the existing planner-only JSON export endpoint and constructs
a world from immutable facts for its Gantt, workforce and local geographic views.
It never substitutes the sandbox store or regenerates feasibility. Publication
status/source freshness are separate observations; publication still revalidates
on the server. Saved IDs key visual selection and pending requests are cancelled
on changes. Layout preferences are browser-local presentation data only.

## Historical upstream sandbox route composition (superseded)

The fabricated planner sandbox is split into six App Router pages: `/sandbox`,
`/sandbox/requests`, `/sandbox/conflicts`, `/sandbox/schedule`,
`/sandbox/resources` and `/sandbox/scenarios`. A single server layout checks the
planner role, renders the shared workspace navigation and warning, and mounts one
client `DashboardShell`. The shell owns the introduction/load gate, RailPlan page
navigation, three-step workflow, solver controls and provenance, scenario outcome,
reset, progress and footer. Route children provide only the focused content area.
This keeps deep links authorized and useful before loading without duplicating the
workspace boundary on every page. Each route imports its own focused component,
so requests, conflicts, schedule, resources and scenario UI are not all forced
through one monolithic client entry point.

Solver results, selection, repairs, pins, objective and disruption remain in the
existing Zustand store, so client navigation does not reconstruct a plan. Request
and conflict filters, workforce filter/interval selection, and assistant
conversation/draft/pending state are transient fields in that same in-memory
store. Reset clears them and the persistence partial deliberately excludes them;
only objective strategy and exact locked placements survive a reload. The shared
layout keys that transient slice to the server-confirmed planner identity, hides
the client workspace during an identity transition, and invalidates any assistant
reply still in flight when reset or an actor change clears the conversation.

`PlanningPanels` retains the existing `railplan-demo-layout` preference store and
adds focused request and resource compositions. The default composition used by
saved-plan review is unchanged. Queue/inspector width controls and
workforce/geography height controls therefore share the existing bounded browser
preference record across the new pages.

## Issue #17 release harness and log boundary

The application has no test-mode provider endpoint or alternate authorization
path. A separate test child starts the normal production server on127.0.0.1:3101.
A guarded Node preload intercepts only fixed provider hosts with controlled
responses, allows configured Supabase Auth traffic, and rejects other external
fetches. The parent uses real cookies and application HTTP for domain changes.
Temporary identity bootstrap and exact cleanup are privileged fixture tooling,
not application APIs. Default tests exclude this committed-fixture suite.

Assistant API calls apply the shared Origin/Host JSON mutation guard before quota
and retain deterministic fallback. Application logging never serializes prompt,
provider exception, ungrounded token or arbitrary usage metadata; only fixed
events, counts and bounded numeric usage cross the log boundary.

## Historical upstream saved conflict editor — 2026-09-09 (superseded)

`PlanRevisionEditor` keeps unsaved pins separate from the immutable saved visual
review. `previewRevision` uses the existing solver/validator and explicit saved
facts; requested-time conflicts use `buildSubmittedPlan`. Alternatives hold other
placements fixed while being assessed; choosing one pins it and re-solves the night,
so the full before/after list is shown. There is no new scheduler or database schema.

Local solver/constraint versions must match the snapshot before preview. Source
freshness is an observation until save; the server checks the referenced base and
recomputes in the existing serialized source transaction. Save failure retains
choices; success opens the new draft. Publication and workspace navigation are
unavailable during revision, keeping unsaved proposals distinct from saved results.

## Historical upstream guided presentation — 2026-09-09 (superseded)

Saved planning resumes the latest version returned by the existing list endpoint.
Preparation, schedule review and publication/delivery form a linear page with a
keyboard-focus handoff to publication. Night setup collapses after a current draft
is loaded. The saved review reports its observed stale state to the workspace,
which opens fresh-draft controls and disables publication; the server remains
authoritative. Native details disclose version history,
metrics and technical records; stale, superseded and infeasible snapshot details
open automatically. No backend lifecycle, validation or authorization is changed.

Request intake and meeting-note extraction use mutually exclusive visible panels
that remain mounted, preserving edits and submitted-request queue reconciliation.
The submitted-proposal link returns to the request view without selecting over an
unrelated manual draft. Dirty request forms block their own open/new/refresh actions
until saved, completed or discarded. Review notes block plan version changes until
recorded/discarded. Notification settings remain mounted outside plan selection.
These guards cover workspace controls, not cross-page or browser navigation.
