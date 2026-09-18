# Decisions

## 2026-09-18 — PS1 is an exception-first linked workspace

Status: **Accepted.** Replace the solved page's stacked report sections and
duplicate inspectors with a persistent command bar, non-ranked policy cards,
attention queue, one-focus location-week grid, single entity-aware inspector,
review shelf and proof drawer. Keep Scenario C as the fresh-instance default,
while retaining the chosen scenario during same-instance replans.

Mobile is intentionally a triage and approval surface, not a compressed matrix
editor. Low-glare mode is optional and session-only. All selections and answers
must link to engine identities, and all capacity displays must use the disruption
engine's shared authority. Proposed changes cannot replace the applied plan or
unlock export until separately validated and applied.

This is a presentation and browser-state decision. It changes no solver/scoring
rule, official CSV schema, worker protocol, HTTP API, database, authentication
flow, dependency or environment variable. Auxiliary handover and planning-log
exports remain outside the official nine-file ZIP.

## 2026-09-18 — PS1 uses honest local conformance and a browser worker optimiser

Status: **Accepted.** Keep the public PS1 path account-free and solve hidden
instances in a Web Worker. Use deterministic multi-start construction plus bounded
reconstruction rather than a server solver. Require independent validation of
every candidate and block export for incomplete or invalid outcomes.

The submission schema has no global physical-night ID across separate possessions,
so cross-possession buffer alignment is not locally decidable. The product names
that boundary instead of inventing a rule that rejects the published reference.
All represented closure expansion, Live mirroring/interchange, occupancy,
allocation and result invariants remain hard checks. RailPlan contributes its
master-detail, reviewed-change and grounded-explanation patterns, not its database
or minute-resolution domain model.

## 2026-09-17 — Named crew rostering: recommended no-go, pending the owner's decision

Status: **Proposed — awaiting Pavan's decision as data controller.** This is the
one decision in this log an engineer cannot take alone: it authorises collecting
personal data about real workers, and that authorisation belongs to the
controller. The evaluation issue #21 asks for is complete and is in
`docs/EVALUATION_NAMED_CREW_ROSTERING.md`.

**Recommendation: no-go. Solve the safety-relevant needs with finer-grained
anonymous roles instead.**

The production model is anonymous by construction — counts of people per role,
team and interval, never identities. Named rostering was evaluated against four
operational needs. Two are safety-relevant (qualification matching, rest and
fatigue compliance) and two are efficiency gains (travel feasibility,
reassignment continuity).

Both safety-relevant needs are reachable without personal data. A role named
`technician_hv_certified` carries the same planning power as knowing which named
individual holds the certificate, and none of the risk. Rest can be modelled as
reduced availability in the window after a heavy shift. That leaves only
efficiency gains to justify introducing identity, location and absence data — and
they do not.

Three risks are specific to RailPlan rather than generic to rostering:

- **A published plan would become a movement record.** RailPlan publishes plans
  to contractors and through Telegram. Named placements turn an operational
  document into a per-person timetable of where an identified worker will be, at
  night, at a known trackside location. That is a physical-safety concern before
  it is a privacy one.
- **Absence is inferable even when leave reasons are deliberately not stored.** A
  weekly gap in one person's availability discloses what the omitted field was
  meant to protect.
- **Support and logging paths leak first.** Every error envelope, export and log
  line was designed when workforce data was counts. Issue #21 names logs in its
  acceptance criteria for this reason.

**What would overturn this.** One fact, and it is not an engineering judgement:
whether any LTA or regulatory obligation requires *per-person auditable* rest and
qualification records rather than plan-level assurance. If it does, anonymous
roles cannot satisfy a regulator and the recommendation inverts. Three further
questions for the owner are listed in the evaluation.

**Enforced in the meantime.** `src/test/workforce-anonymity.test.ts` fails if
personal identifiers reach any workforce table, so the expansion cannot happen
quietly through an unrelated migration. It was mutation-tested against an
injected named-worker table to confirm it catches the case rather than passing
vacuously. It is a tripwire for the obvious shape of the mistake, not a privacy
control in itself.

No named-worker table, API, seed, UI or log has been added. The aggregate
role-capacity model remains the production default.

## 2026-09-17 — No CP-SAT solver service; the TypeScript heuristic stands

Status: Accepted. Resolves the `Real optimisation solver` proposal below, which
was `Proposed` pending exactly this evidence, and confirms the 2026-08-02
rejection of a CP-SAT backend on measurement rather than on estimate.

Issue #20 asked whether an OR-Tools service earns its place. On this evidence it
does not, and the reason is latency rather than quality.

**What was measured.** Seven fixtures covering the classes the issue names —
seeded, infeasible, two disruptions, locked pins, larger and adversarial —
comparing the production `max-completion` heuristic against a CP-SAT reference on
an Apple M2 (8 cores, 8 GiB), Node v24.2.0, Python 3.12.8, OR-Tools 9.15.6755,
10-second solve limit, random seed 0, one search worker. `validate()` stayed the
only constraint authority: Python modelled no rule, and every reported plan was
re-validated before any number was taken from it. Raw output is in
`scripts/benchmark/results-2026-09-17.json`; `npm run benchmark:cpsat` reproduces
it.

| Fixture | Heuristic | CP-SAT |
| --- | --- | --- |
| baseline-feasible | 17 placed, 88.2%, 735 move, 22 ms | 19, 95.3%, 1320 move, 6.0 s |
| shortened-window-disruption | 15, 84.7%, 720 move, 14 ms | 18, 92.9%, 1080 move, 2.3 s |
| team-unavailable-disruption | 17, 88.2%, 735 move, 24 ms | 18, 90.6%, 1395 move, 4.0 s |
| locked-planner-pins | 17, 88.2%, 735 move, 22 ms | 19, 95.3%, 1350 move, 3.5 s |
| adversarial-tight-windows | 16, 84.7%, 480 move, 11 ms | 17, 90.6%, 480 move, 2.2 s |
| larger-cloned-night (33) | 19, 74.6%, 1230 move, 33 ms | 20, 76.9%, 1065 move, 75.2 s |
| mandatory-blocks-closed | INFEASIBLE, 4/5 mandatory, 49 ms | INFEASIBLE, proved, 0.3 s |

**CP-SAT is better at the thing it was asked to do.** It placed one to three more
jobs on every feasible fixture, worth +2.3 to +8.2 points of priority-weighted
completion, and it proves optimality instead of asserting it. Both methods agreed
the closed-block fixture is infeasible. Every CP-SAT plan passed the validator
with zero critical violations and placed all five mandatory requests. Both were
deterministic across repeat runs.

**It costs 157 to 2278 times the runtime.** 11-33 ms against 2.2-75.2 seconds.
That is the decisive number. RailPlan's core interaction is moving a pin and
watching the numbers move; a 20 ms recompute is direct manipulation, a 6-second
one is a progress bar, and a 75-second one is a batch job. The product would
become a different kind of tool, and two extra placements do not buy that back.

**The movement cost is real but not uniform.** Movement from requested times rose
50-90% on the four 22-request feasible fixtures, was identical on the adversarial
one, and *fell* 13% on the larger one. So "CP-SAT moves more work" is not a law;
on this evidence it is what happens when extra capacity exists to exploit.
`max-completion` declares its own objective 4 as "Movement from requested times is
not penalised" and ranks candidates by `start` alone, so the CP-SAT objective —
priority-weighted completion, then count, then earlier start — is a faithful
encoding of that strategy rather than a mismatched proxy. The movement figures
are a real consequence of placing more work under a strategy that does not price
movement, not an artifact of the comparison. Emergency capacity was identical for
both methods on every fixture.

**Timing is load-sensitive in a way the answers are not.** On an idle machine the
baseline fixture ran in 6121, 5680 and 5556 ms across three runs — about 10%
spread, with an identical plan and objective each time. Under concurrent load the
same fixture took 50.0 s, roughly 8× worse, and the larger fixture crossed from
`OPTIMAL` at 75 s to a solver timeout at 96 s. The answer never changed; only the
time did. A planner's experience of the tool would therefore depend on what else
the box was doing.

Rejected for now, with the operational failure modes a service would add:

- **A network hop and a deploy on the critical path.** Planning is currently a
  pure function in the browser. A service makes every solve a request that can
  time out, queue behind another tenant, or fail while a planner is mid-edit.
- **Version skew between two languages.** The benchmark catches this with an
  instance-digest handshake that fails fast, but that is harness scaffolding. In
  production the same risk becomes a service answering confidently about
  yesterday's constraints, and the handshake would have to be built, tested and
  kept honest for real.
- **Wall-clock sensitivity becomes a product surface.** The 8× load-dependent
  variance above is tolerable in an offline benchmark and not in an interaction
  budget. Saved plans carry digests and are expected to reproduce; a solve whose
  duration depends on neighbouring load makes that a promise about infrastructure
  rather than about the engine.
- **Worse infeasibility reporting.** The heuristic names the mandatory work it
  could not place. CP-SAT returns `INFEASIBLE` and nothing else. The 2026-08-02
  decision to report status honestly and name the blocked work would regress.
- **A 190 MB Python dependency** and its supply chain, added to a stack that is
  currently one language.

**What would reopen this.** Any of: an offline or overnight batch planning mode
where 75 seconds is free; instances routinely larger than the seeded night, where
the quality gap widens faster than the runtime does; a strategy that prices
movement explicitly, where the two can be compared without this decision's main
caveat; or evidence from real LTA instances rather than a fabricated one.

**Limits of this evidence.** One fabricated night, one machine, and one of five
strategies — the one whose objectives the CP-SAT model encodes most exactly.
`balanced` and `min-risk` both penalise movement in `candidateCost` and were not
benchmarked; under those the comparison could move in either direction. The
larger fixture is a synthetic clone set, not a real larger night. These numbers
do not support a general claim about exact optimisation for rail maintenance
planning, only about this engine, these instances and this interaction budget.

## 2026-09-15 — Approved upstream reconciliation

Pavan approved all recommended merge choices: retain the current shared design and
server-preview Night overview; integrate grouped requested-time conflicts and
recommended repairs there; retain the single sandbox with compatibility redirects;
exclude open PR #27; preserve local work in checkpoint 18c32d3 and backup refs; then
verify and push the reconciled branch to main. Deployment is not an explicit step
of this merge, although repository integrations may deploy on push.
Upstream's duplicate client revision editor and focused sandbox components are not
adopted. Behavioural coverage is adapted to the approved entrypoints.

## 2026-09-15 — Keep the single sandbox dashboard

Pavan selected the single dashboard instead of upstream's six-page sandbox.
Retain the approved queue/timeline/inspector layout and adapt the upstream session
boundary around it. Identity is server-confirmed and memory-only. On first entry
or a planner change, clear demo state (including unowned persisted pins) and remount
the dashboard. Same-planner renders retain state. Session epochs invalidate pending
load/solve/repair completions after reset or identity change. This deliberately
trades cross-reload demo-pin retention for preventing cross-account reuse; saved
planning and private database records are unaffected.

## 2026-09-15 — Reconcile saved revision provenance without replacing the UI

Adopt merged upstream `basedOnPlanId` and its source-lock validation, retaining the
local `expectedBasis` preview guard. Preview saves infer lineage automatically;
explicit conflicting bases are rejected. The base ID is immutable saved metadata,
not a solver input; historical digests remain unchanged. Both saved-preview and
coordination Apply paths use the same check. No migration, permission expansion,
second revision editor or visual redesign is needed for this backend checkpoint.
Remaining conflict-repair UI integration is a separate reconciliation step.

## 2026-09-15 — Reviewed forward-only occurrence transfer

Carry-forward means a configured night strictly later than the active source, not
necessarily after today. This preserves historical workflows; backward rescheduling
needs a separate future workflow. Preparation never approves or retires work.
Explicit review binds exact current publication and source generation, while ordinary
validation enforces target references and source-retirement dependency safety.

Retain seeded rows and old plans. A private active mapping is the loader authority
after transfer; its null active fields represent cancellation, not permission to
fall back to the old seed. Retain last submission identity so latest cancelled work
can be restored normally, but old retired duplicates cannot. Ordinary revision is
not a cross-night bypass. Source-first locking serializes approval/publication;
metadata keeps item-only locking. Normal intake approval and informational
coordination organisation approval are intentionally separate concepts.

## 2026-09-15 — Durable deferred identity and publication corrections

Keep accountable deferred work separate from immutable solver runs. Use approved
submission UUID identity and explicit carry-forward links; baseline identity includes
its engineering night. Titles never establish identity. Record draft deferral only
on explicit planner action, or atomically at publication via a private INSERT
trigger. Append same-night corrections and count distinct effective nights; a late
historical record cannot reverse a current published placement.

Keep terminal lifecycle separate from scheduled projection. Current publication
does not establish physical completion, and removing a placement reopens unresolved
work. Informational owner/due-date/priority/threshold edits never stale planning
facts. A two-night threshold is configurable planning policy, not a safety rule.
Use SQL-level contractor allowlists and retain actor UUIDs after account deletion.

## 2026-09-15 — Coordination evidence and integration verification

Implement the approved coordination design with revision-bound informational
confirmation, immutable full-plan impact and source-before-case lock ordering.
Reuse normal generation/publication rather than introducing another scheduling
authority. Keep approval notes planner-only and contractor changes scoped through
exact saved request revisions. Case closure leaves unresolved statuses visible.

Verify races with committed isolated future-night fixtures and observed distinct
waiting database sessions. Reuse the production HTTP provider-isolation harness;
coordination itself has no provider call. Cleanup restores 17 immutable guards
transactionally and never resets the source revision. Existing saved snapshots
remain immutable but may become stale after test source changes. No new schema,
deployment or live provider configuration is required by the verification task.

## 2026-09-15 — Sandbox drag proposals, not unchecked placement edits

Horizontal drag snaps to the existing planning interval and proposes a pin to the
normal solver. Require explicit Apply after showing validation and other-placement
changes; a solver reflow may move other jobs. Reject critical/infeasible results.
Keep one guarded Undo, existing keyboard/inspector alternatives, and no duration
or track reassignment. Touch retains the inspector to avoid stealing page scroll.
The shared saved-plan timeline receives no move callback. No solver, API or
database changes are part of this feature.

## 2026-09-15 — Planner manual request creation

Night overview links to `/requests?request=new` with planningNight, plan and
planRequest context. Reuse the existing intake editor and lifecycle rather than
introducing a second form or adding unreviewed work directly to a saved plan.
Planners choose an existing contractor organisation; saved drafts are shared
with that organisation, not private transcript drafts. Organisation is immutable
after creation. Existing draft/needs-info editing and submission permissions now
have planner UI controls; approval remains a separate audited action.

Add one narrow private `create_planner_request(uuid,jsonb)` function with trusted
profile authorization, empty search path, no anonymous/public execution, the
existing source lock and field validator. Keep contractor mutation SQL unchanged.
The application also rejects contractor organisation overrides and missing
planner organisations. No new tables, RLS broadening, solver or publication changes.

## 2026-09-15 — Reuse planner presentation in sandbox

Use the existing planner queue and block timeline with a demo-only input adapter,
and share the request/time header. CSS overrides on the old sandbox components
did not meet the approved visual parity requirement. Keep saved-plan fetching,
permissions and persistence outside the shared presentation; sandbox URL context
remains a return address, not a source of planning inputs. Preserve timed conflict
overlays and forced scenario inputs when adapting the demo to the shared chart.

### 2026-09-15 — A workflow guide at Home

Replace the authenticated root's immediate workspace redirect with a concise,
role-aware six-stage guide. Keep direct workspace/login destinations intact and
add Home to shared navigation. Describe all stages to both roles, but render
planner-only action links only for planners. Existing page introductions are
retained; missing descriptions are added without changing workflow behaviour.

### 2026-09-15 — One visual system with separate saved and demo state

Status: Accepted by the owner through the site-wide implementation plan.

Promote the approved neutral-white/blue design into global tokens and shared
navigation, rather than adding further `/plans`-only overrides. This supersedes
the historical warm-paper palette choice, while retaining IBM Plex, MRT identity
and distinct validation/conflict colours. Use linked history, settings and private
draft views; retain small contextual review/pinning dialogs and quick version
switching. Keep sandbox inputs separate even when carrying a saved-plan return
address through its navigation. Preserve existing solver capabilities and scoped
contractor access without adding imports, publication or database migrations.

Native selection history contains identifiers only. Unsaved traversal is cancelled
before history changes where the Navigation API supports it. The older-browser
popstate fallback restores the current URL/router entry and replaces forward history.
Authenticated login return paths are allowlisted and role-checked, never arbitrary
URLs. Deployment is a separate release action after implementation verification.

Last updated: 2026-09-07

## Log

### 2026-09-14 — Connected night workspace with immutable preview basis

Implement the owner's approved RailPlan UI as the actual planner landing workspace,
not a parallel mock dashboard. Keep the warm paper/blue-selection/MRT-identity
design and existing fonts; ignore the reference image's rendering artefacts and
illustrative schedule inconsistencies. Show actual metrics and every saved block;
deferred work never appears as a scheduled bar. Hatched clearance occupies track
after work, and overlapping occupations receive separate lanes.

Keep preview analysis read-only and server-authoritative. Reuse the existing
heuristic and validator against immutable saved facts; do not accept client result
payloads or change solver rules. An optional expected basis guards the explicit
save against source, engine or parameter changes. Guard metadata is not a solver
parameter and must never change historical digest compatibility. No schema change.

Separate requested-time movement from saved-version changes. Current publication
lookup is independent of the paginated history, and pending intake counts do not
rely on the 100-row review list. Publication stays immutable and retains the existing
notification dispatch behavior; the UI distinguishes publication from delivery and
an uncertain response from a confirmed refresh. No deployment is included.

## Historical upstream decisions (superseded where noted above)

Last updated: 2026-09-15

## Log

### 2026-09-15 — Count clashes, not rule findings; show unplaced work with the conflicts

Status: Accepted by the owner ("start on P2") and implemented.

The validator reports every rule a collision breaks, so two jobs sharing a block,
a crew and a supervisor produce three findings for one problem. The as-submitted
demo night showed 30 conflicts for roughly ten distinct clashes, and the
planner-time-saved tile multiplied that inflated count by an assumed 12 minutes.
Add `groupConflicts` to the core engine: findings that name the same request set
over overlapping minutes form one group, headlined by the largest shortfall,
with the other rules listed beneath. Untimed findings group by request set alone.
The validator and its findings are unchanged; grouping is a presentation of them
that keeps the raw count as the denominator of the new `conflictsMetric`.

Use groups everywhere a planner counts problems: the sandbox conflict panel,
toolbar and baseline, the overview tiles, and the saved-plan revision editor.
Recommended resolutions run against the group's headline finding; its members
share requests and minutes, so the same move clears them together. Selecting any
member still opens its group, preserving the store's selection contract.

Remove the planner-time-saved tile from the overview. The metric function stays
in the core package for a future measured baseline; nothing on screen multiplies
an assumption. Put "Work without a slot" beneath the conflicts on the sandbox
Conflicts page after a solve and above the saved-plan panels, each row opening
the request in the inspector, so "no conflicts" is never read without the
deferred work beside it.

### 2026-09-15 — Join conflict review to saved planning; demote the sandbox

Status: Accepted by the owner ("start on P1, join the halves") and implemented.

The adoption review found the planner's real work (see a clash, weigh
alternatives, commit a choice) existed only in the sandbox over fabricated
requests, while the saved path generated an immutable plan the planner could not
touch. Rebuild the saved-plan revision editor in the sandbox's shape, computed
from the approved snapshot: a request queue with deferred/pinned/moved states, the
requested-time conflicts with the engine's recommended resolution, an inspector
with the counterfactual explanation and validated alternatives, work without a
slot as its own list, then the diff against the saved version and one save.

Reuse the core engine unchanged: `recommendResolution` runs against the requested
plan built from the saved facts, `explainPlacement` and `findAlternatives` against
the proposal. Every planner choice is a pin; the night is re-solved around the
pins in the browser and recomputed on the server through the existing
`basedOnPlanId` contract. No new routes, schema or solver behaviour. The sandbox
components stay bound to their store and demo data rather than being refactored
under deadline; the new editor duplicates their shape, not their code.

Remove "Demo sandbox" from primary planner navigation. The route remains and is
reached from a "Try with demo data" link on the schedule page, so the approved
path is the default and the demo is an explicit detour.

### 2026-09-14 — Split the local sandbox by planning task

Status: Accepted by the owner and implemented.

Expose Overview, Requests, Conflicts, Schedule, Resources and Scenarios as six
planner-only App Router pages under one `/sandbox` layout. Keep authorization,
the fabricated-data warning and all workflow controls in shared chrome so direct
links cannot bypass the sandbox boundary and every page can generate, repair,
inspect provenance, replan or reset. Horizontal header scrolling is the narrow
screen behavior; the document itself must not overflow.

Keep plan and disruption state in the existing client store across navigation.
Promote page controls that must survive navigation—filters, workforce selection
and assistant conversation/draft/pending state—to a transient store slice, but do
not add them to persisted preferences. Reset and reload clear that slice; the
existing persistence promise remains exactly objective strategy plus locked
placements. Reuse the existing bounded panel-layout preference record for focused
request and resource panels, leaving saved-plan presentation behavior unchanged.
Key transient state to the server-confirmed planner identity: clear it before the
workspace is revealed to a different planner and invalidate any assistant reply
that completes after reset or an identity transition. Give every route a focused
component entry rather than shipping the legacy all-panel composition to each
subpage.


### 2026-09-07 — Workforce is a hard aggregate constraint (#8)

Status: Accepted within the ordered issue scope.

Enforce role headcounts independently of concurrent crew capacity. Segment
half-open work and absolute supply by assigned team/role, preserving each
contributor or supply change in explainable findings. Share that assessment with
person-minute and shortage metrics so the displayed arithmetic matches validation.
Clip supply to shifts, outages and engineering bounds; count overrun as work and
exclude clearance. Missing supply is zero; missing demand is unknown and blocks
feasibility, including synthetic jobs. Emergency fixtures declare their own
fabricated role counts, never an operational staffing rule inferred from crews.

Keep automatic repairs inside planner locks and reject newly introduced conflicts.
Include interval/team/role/headcount in workforce conflict identity so findings
cannot collapse across resource or time boundaries. Bump engine and metric
versions; old immutable plan snapshots remain historical and cannot pass a
current-version publication gate. No named-worker features or database schema
changes are part of this decision.

### 2026-09-07 — Issue #7 separate crew capacity from anonymous people supply

Keep Team.capacity as the crew-concurrency rule. Model configurable workforce
roles, absolute people availability windows and per-request role/count demand in
three independent PlanningInstance arrays. Explicit fabricated defaults preserve
existing callers without collecting named-worker data or deriving headcount from
crew capacity. Workforce enforcement is the next ordered issue, #8.

Availability windows use half-open intervals and cannot overlap for a given
night/team/role. This prevents ambiguous double-counting; adjacent windows replace
the declared count, and zero can record unavailability. Use a GiST exclusion
constraint plus night-bound checks on both availability writes and parent-night
resizes. Existing global source-revision serialization protects those checks
against concurrent writes and makes workforce-only changes stale saved drafts.

Canonicalization only orders facts and hashes full content. Validate workforce
references/counts/windows explicitly at loader and write-schema boundaries so
synthetic engine callers remain free to alter request pools and windows for tests.
Demand remains normalized beside requests, avoiding a breaking MaintenanceRequest
change. Later emergency/disruption demand handling must use the same role model.


### 2026-09-07 — Issue #6 immutable server-generated plans

Persist full canonical input facts and parameters, SHA-256 provenance and exact
computed output. Use a dedicated saved-plan workspace while preserving the local
exploratory dashboard until #16. The server is the only generation authority;
clients cannot submit placements or metrics as generated results. Private tables
and narrow authenticated write functions avoid exposing a writable snapshot RPC
through Supabase's Data API. Contractor reads are denied until scoped delivery.

Use one conservative source revision for all planning facts, including topology,
resources and request children. Statement triggers lock and advance it before
mutation; no-op planner updates also stale drafts. This trades extra regeneration
for complete coverage until approved intake and finer source revisions exist.
Create/publish transactions use repeatable read plus a separately updated lock
generation. A row lock alone was rejected: overlapping repeatable-read first
publications can retain a snapshot without the prior publication. Updating the
generation forces serialization failure and a bounded full-transaction retry.

Store publication supersession separately, with immutable content and append-only
authenticated audit. Return stale rejection inside the transaction and raise HTTP
409 after commit so its audit survives. Revalidate against current facts and
current engine versions before publishing. Retain actor UUIDs when Auth accounts
are deleted; account deletion must not erase historical audit.


### 2026-09-07 — Issue #5 trusted profiles and application RLS

Use official Supabase SSR email/password sessions and verify users server-side.
Assign roles only through operator-controlled profiles, with no role selected
from user metadata or signup input. A verified identity enters a transaction with
`SET LOCAL ROLE authenticated` and minimal JWT claims, so the owner DB connection
cannot silently bypass application RLS. Planner-only action guards are shared for
future solve/approve/publish/resource routes; runtime policy tests for later
issue tables wait for those tables to exist.

Use a private atomic DB token bucket for assistant cost control. The narrow
security-definer function is necessary to prevent users granting themselves
quota; it accepts no identity or rate input and rechecks the planner profile.
There are no default online accounts or automatic role promotions.


### 2026-09-07 — Hosted RailPlan Dev baseline

Status: Accepted by the owner choosing and creating the online project.

Use project ufcdynfjfzbjvglsdaqp in pavan2184's Org, Singapore. The clean hosted
project replaces the local Docker reset baseline. Connect via Supavisor on 6543
because 5432 is unreachable from this network; validate the official CA and
hostname and disable prepared statements. Load each PlanningInstance inside a
repeatable-read transaction: this both fixes pooled multi-query reads stalling
and prevents mixed input snapshots. Apply migrations transactionally with a
private checksum ledger; do not reset managed hosted schemas.

### 2026-09-07 — Ordered delivery and no Docker

Status: Accepted by the owner's task and follow-up instruction.

Implement GitHub issues #4–#21 in numeric order. Each prerequisite must pass its
acceptance checks before dependent feature work. The owner's no-Docker direction
supersedes #4's local Supabase CLI reset requirement. The owner selected a new
hosted Supabase project; document the equivalent migration,
seed, read-back and failure checks. Do not reuse unrelated projects or databases.

### 2026-09-07 — Document the existing v0.4 package and database boundary

Status: Accepted; records the architecture already implemented.

The shared core package owns instance data, canonicalization, world derivation
and all scheduling logic. Postgres stores inputs; dashboard outputs remain
computed in memory. Explicit database verification fails on unavailable or
mismatched data. Optional test-suite skips never substitute for that gate.

Historical v0.1 decisions below are superseded where the 2026-08-02 engine
replacement or v0.4 database boundary changed them.


### 2026-08-02 — Replace the fixtures with a real engine

Status: Accepted. Supersedes the v0.1.0 decision to "preserve the existing
fixture-based state architecture".

The earlier decision protected a demo that could not survive scrutiny: six
conflicts typed by hand, five hand-authored schedules, KPIs stored as literals,
and an `optimise()` that waited 1.05 seconds before swapping one object for
another. Two clicks of the same button produced an identical plan in an identical
time. That is not a scheduling tool; it is a slideshow with a cursor.

Accepted:

- Delete all five `*Schedule.ts` files and the hand-typed conflict list. No
  schedule fixture remains in the repository.
- Model sectors as atomic track blocks. String comparison cannot see that
  `NS10-NS12` and `NS11-NS13` share `NS11-NS12`.
- Model crews and equipment as capacities rather than names. One calibrated
  thermal imaging unit is a constraint; "Thermal imaging unit" is a label.
- Make `validate()` the single authority on feasibility, and require the solver
  to submit its own output to it before returning.
- Express the five strategies as objective profiles over one solver.
- Give every metric a formula, numerator and denominator, exposed in the UI.
- Enter planner pins as hard constraints before the solve, not as an overlay
  afterwards, so a decision moves the plan and the numbers with it.
- Report solver status honestly, including `INFEASIBLE`, and name the mandatory
  work that could not be placed rather than showing a status code.

Rejected, with reasons:

- **A CP-SAT backend.** 22 requests solve in tens of milliseconds in the browser.
  A solver service would add a deploy, a network hop and a live failure mode to
  buy optimality bounds we cannot yet demonstrate a need for. Benchmark first.
- **A Web Worker.** Same reasoning: at 20-70 ms there is no stall to remove, and
  a worker adds bundling failure modes to a demo.
- **Letting the model decide anything.** The assistant reads engine output and is
  blocked structurally from introducing a figure the engine did not produce.

### 2026-08-02 — Design register: operational, not product-marketing

Status: Accepted. Revised the same day after the first palette read as dull.

Colour comes from the domain rather than from a UI kit. The three corridor
colours are the **actual Singapore MRT line colours** — North-South red,
East-West green, Circle orange. A planner already reads the network in those
colours, so they carry meaning before anyone learns a legend, and they are the
one thing a generic dashboard palette could never have produced.

- Corridor colour is IDENTITY: a solid chip on the group band, a tinted gutter
  and lane behind each block row, and a 3px cap on the leading edge of every
  clean bar. Twelve rows read as three corridors without a legend.
- Status is a separate family and never borrows a line colour's job: red for a
  broken rule, amber for deferred, green for clear, blue for anything the
  planner touched. Nothing else on the page is allowed to be coloured.
- Warm paper ground under cool near-black ink. The slight temperature
  disagreement is what stops a light UI reading as flat grey card soup.
- Borders rather than shadows; 2-4px radii; tabular lining numerals throughout.
- State is carried by a left rule, a stripe pattern and text as well as colour,
  so it survives greyscale and colour-vision deficiency.
- Copy states numbers and consequences. No dot-separated microcopy chains, no
  triadic marketing constructions, no claims the engine cannot support.

### 2026-08-02 — Typeface: IBM Plex Sans and IBM Plex Mono

Status: Accepted.

Rejected **Inter** and **Geist**. Both are excellent and both are now the
default of every AI-generated dashboard, which is precisely the look this
project is trying not to have.

Plex earns the slot on merit rather than novelty: it was drawn for interfaces
where misreading a character has consequences, so 1/l/I and 0/O are
unmistakable at 11px, and it ships true tabular figures. Its typewriter
inheritance gives it visible engineering character where Inter is deliberately
characterless. Plex Mono is the matching companion, used for request ids, block
ids, clock times and the input digest — anything compared down a column.

Loaded through `next/font/google`, so it is self-hosted at build time and there
is no runtime request to a font CDN. The cost is a network dependency during
`next build`; Next caches the files under `.next/cache` after the first fetch.

### 2026-07-15 — Planner-first exception and release hierarchy

Status: Accepted

- Make exceptions, critical-work coverage, declared conflicts, and engineering-window load the four primary signals.
- Use one primary action per state: resolve conflicts, review a recommendation, or replan affected work.
- Rename technical/demo language to planner decisions: Submitted versus Recommended, Planning objective, Needs action, and Ready for review.
- Replace the decorative robustness radar with a concise release-readiness checklist and an explicit simulated/not-independently-validated note.
- Keep the request queue focused on work needing attention by default and move the small network schematic into the selected-request inspector.
- Remove the non-functional export control rather than presenting a success toast for an artefact that does not exist.
- Preserve the existing fixture-based state architecture and clearly label zero conflicts as declared fixture metadata.

### 2026-07-15 — Separate current truth from proposed optimisation

Status: Accepted

- Keep v0.1.0 documented as a frontend-only, fixture-based simulation.
- Use `docs/README.md` and `docs/CURRENT_IMPLEMENTATION_AUDIT.md` to distinguish implemented behaviour from roadmap and research.
- Treat `docs/DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md` and `docs/RAIL_SCHEDULING_RESEARCH.md` as proposals/evidence, not proof that a solver, validator, calculated KPI layer, or map integration exists.
- Do not change the accepted no-backend/no-external-API architecture without a later explicit decision.

### 2026-07-15 — Deterministic frontend simulation

Status: Accepted

- Use immutable preconfigured schedule variants and timed client transitions rather than a solver or API.
- This guarantees repeatable presentation behaviour; it does not claim operational feasibility.

### 2026-07-15 — Zustand as the single demo-state owner

Status: Accepted

- Centralise view, strategy, selection, locks, approvals, disruptions, overrides, and loading phases in one store.
- Persist only strategy and locked IDs to minimise hydration and privacy risk.

### 2026-07-15 — Custom CSS-grid timeline

Status: Accepted

- Use a fixed 00:00–04:00 grid with absolute job placements instead of a scheduling library.
- This keeps the visual dense, responsive, and fully controlled at the cost of general calendar support.

### 2026-07-15 — Tests and UAT as release gates

Status: Accepted

- Vitest/Testing Library cover domain transitions; browser UAT at three laptop widths covers the scripted demo and page overflow.

### 2026-07-15 — Progressive disclosure for dashboard density

Status: Accepted

- Lead with the plan title and decision controls, then show four essential KPIs rather than five equal-weight cards.
- Keep network and conflict details available on selection while using compact summaries in the default view.
- Use the three-column workspace only at extra-wide widths; details move below the timeline on normal laptops.

## Proposals Awaiting Decision

### Deterministic P0 validation layer

Status: Implemented and superseded by the 2026-08-02 decision (historical proposal)

- Add atomic track blocks, a pure TypeScript constraint validator, and calculated KPIs while retaining the frontend-only architecture.
- Independently validate all current fixtures, locks, alternatives, and disruption responses.
- Implemented in the shared TypeScript engine; further work follows numbered GitHub issues.

### Real optimisation solver

Status: Resolved by the 2026-09-17 decision above — benchmarked and rejected for now

- Benchmark a deterministic frontend heuristic against CP-SAT and, if useful, MILP.
- A FastAPI/OR-Tools service is a strong future option but would replace the accepted frontend-only boundary.
- Approval would require updates to architecture, API, data, testing, security, deployment, and operational status documentation before code changes.
- The CP-SAT half was benchmarked on 2026-09-17 across seven fixtures: better plans, 157-2278x the runtime, rejected on latency. MILP was not benchmarked and remains open.

### Public rail geography and historical statistics

Status: Proposed

- Use an attributed, versioned public station/rail geometry snapshot for presentation while keeping operational block/safety data separate.
- Add historical planned/actual data only after provenance, data-quality, privacy, and security requirements are approved.
- Public station coordinates must not be treated as authoritative operational topology.

### 2026-09-07 — Recompute disruption impact without rewriting a solver run

Cache a separate impact assessment for the active view, recomputed whenever
submitted work is repaired or the view changes. A plannedDisruptionId records
which scenario a generated result already includes, avoiding double application
on return to that view. Workforce figures label the unsolved preview explicitly;
solver provenance continues to describe the original generation.

### 2026-09-07 — Immutable intake revisions separate from baseline engine facts

Status: Accepted for issue #9.

Each request mutation appends a version snapshot with its actor/state/reason;
current and active-approved pointers are the only mutable intake state. Contractor
organisation is derived from the verified trusted profile. Dedicated SQL validators
and narrow private actor-derived functions enforce references and transitions even
when HTTP is bypassed. Only active approved revisions enter the loader, retaining
stable IDs and exact revision provenance; operator-seeded baseline facts continue
to round-trip unchanged when no contractor work is active.

Approved replacement drafts keep the previous approved version active until a
planner approves the replacement. Cancellation removes the active version but
never rewrites a published artifact; scheduled status reflects the actual current
publication revision. Approval and cancellation serialize with generation and
publication and invalidate prior source attestations. Active prerequisite deletion
or cross-night replacement is blocked until dependent approvals are revised.

Use explicit structured blocks and derive sector labels. Drafts may have empty
text/blocks/demand while supplied references and intervals remain valid. Approval
requires explicit safety confirmation of existing fabricated constraints, skills,
team, clearance, priority and dependencies. No model-generated work becomes an
engine input in this issue; #10/#11 extend this boundary with proposal evidence.

### 2026-09-07 — Private evidence-only transcript proposals

Status: Accepted for issue #10.

Use raw text/plain UTF-8 so the 64 KiB limit applies to source bytes rather than
JSON escaping or multipart overhead. Extraction explicitly includes saving only
validated partial drafts and bounded exact excerpts; raw source is discarded and
never sent to SQL. Keep private ownership narrower than organisation ownership,
with no planner override until an owner explicitly submits in #11. Private draft
revision storage remains inert with respect to request approval and planning.

Use the existing Anthropic SDK and documented ANTHROPIC_API_KEY with current
`claude-sonnet-5`, structured outputs, 12-second timeout, zero retries and SDK
logging disabled. Model output is untrusted despite constrained JSON. Exact quotes
are necessary but insufficient support: conservative field-specific checks keep
unsupported facts null. Confidence remains explicitly a model estimate. No tools,
internal scheduling fields, automated submission or source mutation are exposed.
Missing/refused/timed-out provider paths return safe typed errors while manual
intake remains available.

Verified official provider references:
[model IDs](https://platform.claude.com/docs/en/models/overview) and
[structured output contract](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

### 2026-09-07 — Share an immutable proposal snapshot only on explicit submission

Status: Accepted for issue #11.

Keep private owner edits separate from the organisation-scoped submitted request.
Editing appends a private revision; changed values become manual with null model
confidence and no current model quote. Original evidence remains in immutable
history. New nullable audit columns allow historical extraction rows to retain
unchanged contents, with read-time original-owner defaults.

Explicit submission atomically creates a submitted request, appends the private
submit revision and freezes a source snapshot visible to its organisation and
planners. The UI must explain that fields, retained evidence and revision history
will be shared. Private storage itself never gains a planner read override.
Contractors cannot select an organisation or silently submit a previous
organisation's draft after reassignment. Planner-owned drafts require deliberate
organisation selection. A private draft may submit once, guarded by its current
version and unique database links, and retains at most 100 immutable revisions.

Approval remains a separate authenticated planner action requiring every engine
field and safety confirmation. Private drafts and explicit submission do not
change planning facts. Conservatively invalidate source attestations for every
cancellation and rejected-to-draft reversal, even without an active approval,
alongside existing approval and replacement invalidation. Every successful change
keeps the authenticated actor, prior/new state, revision and reason.

### 2026-09-07 — Project workforce assessment instead of recomputing chart staffing

Status: Accepted for issue #12.

Use exact core assessment intervals for available, demanded and signed remaining
headcount. Preserve every event boundary between regular slots; averaging could
hide a short shortage. Filter one team and role at a time so surplus elsewhere
cannot mask a shortage. Accessible interval values and contributor controls expose
the same information as the visual chart. Unknown demand remains explicit.

Share pending disruption-input assembly between validation and the visualization.
A solved scenario already contains its forced placements and must not receive a
second emergency insertion or overrun. This is presentation/orchestration only;
no solver version, feasibility rules or persisted planning facts change.

### 2026-09-07 — Keep public geography outside the planning instance

Status: Accepted for #13 implementation; source reuse confirmation remains open.

The official March2026 Train Station ZIP contains symbolic station polygons in
SVY21 despite its catalogue describing points. Derive representative centroids
and convert to WGS84; record the exact archive hash, feature indices, reviewed
station/attachment allowlist and transform version. Store only the fifteen
coordinate facts needed for this prototype, not source polygons or internal XML.
Straight connections identify the existing fabricated blocks and do not assert
actual track alignment. The demo depot marker is the midpoint of its configured
block, never a claimed public depot location.

The DataMall Singapore Open Data Licence v1.0 page grants dataset reuse with
conspicuous source acknowledgement and a latest-licence link. The ZIP’s legacy
XML additionally says “The data is for internal use only”. Record both notices
with licence status conflicting; the dates do not establish supersession. Do not
claim unqualified open licensing. Publication clearance for this source remains
unconfirmed; attribution alone does not settle it.

Primary references: [catalogue](https://datamall.lta.gov.sg/content/datamall/en/static-data.html),
[archive](https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/TrainStation_Mar2026.zip),
[dataset licence](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html),
[site terms](https://datamall.lta.gov.sg/content/datamall/en/term-of-use.html).

Coordinates, display projection and source metadata stay outside core facts,
hashes, solver and validator imports. Map selection uses the same request/block
IDs as the Gantt/inspector. Nearby means same/adjacent demo blocks, not a new
geographic safety distance. No live map/tile/API calls are made by the renderer.

## 2026-09-07 — Issue #14 durable publication notification boundary

Create the contractor-scoped outbox atomically with publication, then dispatch
outside that transaction. Delivery failure must never undo a published plan.
Use immutable payloads and append-only attempts, serialized claims, permanent
success deduplication and explicit retry. Network/server/timeout uncertainty is
visible as ambiguous; a planner must acknowledge duplicate risk before retrying.
Telegram has no client idempotency key for sendMessage, so exactly-once external
delivery cannot be promised across a crash after send and before recording success.

The destination comes only from planner-managed, versioned organisation settings
at claim time; it is retained in attempt history. Contractor inputs cannot choose
recipients. Saved configuration sends nothing. Limit each deterministic scoped
plain-text message to4096 UTF-16 units, fail oversized messages visibly, disable
link previews and never include private intake evidence. Fixed HTTPS Telegram
requests have no redirects, no retries, bounded response size and8-second deadline.
Initial publication dispatch has8 workers and16-second start budget; large batches
may remain pending for explicit retry. Unsent superseded schedules are blocked.

[Telegram's official sendMessage contract](https://core.telegram.org/bots/api#sendmessage)
and [response parameters](https://core.telegram.org/bots/api#responseparameters)
were checked on2026-09-07. No provider credentials or authorized destination exist
for live verification. Tests use controlled transports; no real message is sent.

## 2026-09-07 — Issue #15 saved exports and freshness observations

Export immutable persisted facts, parameters, placements and calculated results;
never rebuild from browser state or re-run the solver. Keep current source revision
and publication state in a separate assessment so stale/superseded warnings cannot
rewrite what was originally solved. Use saved generation time rather than a new
export timestamp, allowing repeatable bytes when the assessment is unchanged.
A narrow planner-authorized SQL function reads the source revision without taking
the mutation lock or incrementing its generation. Existing applied migrations stay
immutable; this read surface requires a new reviewed migration.

JSON is the exact machine-readable representation. CSV has stable record/column
ordering and neutralizes spreadsheet formula/control prefixes before escaping all
cells. The extra prefix intentionally changes displayed cell text; it does not
change stored data. CSV consumers differ and may strip escaping during re-save, so
no universal safe round-trip claim is made. See [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection).
Downloads are planner-only, private/no-store attachments. Switching the selected
saved version aborts an outstanding download; an error preserves the plan view.

### 2026-09-07 — Issue #16 persisted planning is the planner landing workspace

Make saved planning the default and share role-scoped navigation with intake and
review. Preserve the complete existing interactive conflict-repair tool at a
clearly labeled demo sandbox route. Its local edits cannot masquerade as approved
requests, saved versions or publications. Saved visual review uses the immutable
export snapshot and explicit world/context, with independent persisted feasibility
and calculations. Workforce interval projection may derive from those saved
inputs; it is not a new validation authority. No schema/provider change is needed.

Use a versioned, bounded local preference record for presentation only. Panel
collapse preserves child state; pointer and keyboard controls expose the same
size bounds. Gantt remains primary and narrower screens stack secondary panels.

### 2026-09-07 — Issue #17 release verification boundaries

Run the complete collaborative journey through a production Next server and real
hosted Supabase sessions. SQL provisions only isolated test identities and removes
their exact artifacts afterward. Controlled Anthropic and Telegram responses live
in a guarded child-process preload, never an application test endpoint or deployed
provider override. This verifies integration, failure and retry behavior without
sending real messages or claiming model quality. Private-schema exposure is also
checked against the hosted Data API.

Preserve the existing hosted project. Seed verification performs actual writes and
parity readback inside a rolled-back transaction, then compares every seeded table
and source revision/generation. Both seed modes refuse existing workflow records;
normal bootstrap verifies parity before commit and no longer uses CASCADE. This is
a rollback rehearsal on the migrated database, not a claim that a fresh hosted Auth
project was recreated. History guards must remain enabled after fixture cleanup.

Upgrade Next and affected compatible dependencies to resolve the observed audit
findings. The assistant requires same-origin JSON before quota use and logs only
bounded allowlisted usage metadata; provider exceptions and model output stay out
of logs. Accessibility checks distinguish component assertions, rendered keyboard
and zoom behavior, and actual screen-reader observations. Public deployment remains
subject to the separately documented geographic-source licence conflict.

## 2026-09-09 — Protected Vercel prototype deployment

At the owner's explicit request, deploy the current verified application before
continuing remaining issues. Use Pavan's verified Vercel account, Node24.x and
Singapore functions, with the existing hosted RailPlan Dev transaction pooler.
Keep TLS verification and the app's session/RLS/Origin checks unchanged. Vercel
account protection stays enabled; this is not source-licence clearance or a claim
of operational readiness. Optional provider credentials remain absent.

Commit an explicit Next.js preset and `npm ci` so creation through the CLI cannot
leave the deployment on the generic framework preset. Exclude local environment
and agent scratch files from source uploads. Database credentials go through
stdin into Vercel's production secret store, never CLI arguments or Git.

## 2026-09-09 — Direct teammate access to RailPlan URLs

The owner subsequently requested that teammates access the deployment URL without
logging into the owner's Vercel account. Disable Vercel Authentication for the
RailPlan project only. The application login and server-enforced planner/contractor
roles remain the access boundary. Verified anonymously on both production aliases:
login200, private API401, workspace307 to the app login. This supersedes the earlier
choice to retain Vercel Authentication; it does not clear the geographic-source
licence issue or change the prototype's non-operational status.

## 2026-09-09 — Connect validated repair to immutable saved planning

Implement the first recommendation from the NebulaX research using the current
engine and approved saved facts. Use exact pins, original requested-conflict
evidence and a complete placement/deferral diff. Choosing an alternative can move
other unpinned work during re-solve; expose those changes before a separate save.
Do not mutate an approved request or existing saved version to represent a choice.

Reuse POST /api/plans with optional basedOnPlanId, checked under the existing
source/publication lock. Keep the parent in immutable JSON parameters and its
digest, avoiding a migration. Reject stale/superseded bases; block local previews
from mismatched browser engine versions. Saving creates a draft; publication
remains explicit and independently guarded. This does not introduce a new solver,
operator rule set, named-worker model or change the remaining release gates.

## 2026-09-09 — Make the next planner action visible

Organize existing functionality into prepare the night, review/adjust, and publish/
notify. Resume the latest returned version, with explicit draft/publication status;
keep history and technical records accessible through native disclosure. Preserve
existing routes, data contracts, solver behavior and immutable publication checks.

Separate manual requests from optional meeting-note extraction visually while
keeping both mounted. Protect local request navigation and plan review notes from
silent edit loss; keep delivery settings outside the selected-plan mount boundary.
This is a usability improvement, not proof of intuitive use: validate first-time
completion with representative users before making usability or time-saving claims.
