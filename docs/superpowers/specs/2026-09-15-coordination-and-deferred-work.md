# Coordination and deferred-work design

Status: approved by Pavan; implementation authorised in the current checkout,
preserving existing uncommitted work. No deployment authorised for this feature.

## Outcome and confirmed decisions

Build priority one (conflict coordination) and priority three (accountable deferred
work) into saved planning and contractor workspaces, using the current white/blue
design. Keep the fabricated sandbox separate.

Organisation confirmation is informational, not a prerequisite to applying a
validated proposal or publishing a plan. A planner records confirmation received
outside RailPlan using **Mark organisation approved**. Display **Pending
organisation approval** until that action succeeds. This is not safety approval,
request-intake approval, or a notification-delivery status.

Existing validation, mandatory-work, source-freshness and publication checks remain
mandatory. No automatic publication, provider messages, production deployment,
named-worker data, or safety-rule changes are included.

## Approach and alternatives

Recommended: two incremental workstreams sharing request identity and append-only
audit conventions, with separate coordination and backlog records. This preserves
immutable planning runs while making human decisions durable.

Rejected alternative: add approval and deferral flags directly to a planning run.
That loses history across versions and confuses planning outcomes with agreement.

Deferred alternative: replace the scheduler with a global multi-night optimiser.
That requires a separate solver model and benchmark. This release provides
cross-night backlog tracking and a reviewed carry-forward workflow, not a claim
of globally optimal scheduling. Pavan must review this boundary before build.

## Workstream A: conflict coordination

### Entry points and UI

- Night overview: Coordination summary and a case action in request details.
- `/plans/coordination`: queue with owner, selected night, case state, overdue
  response and pending-approval filters; `case` URL parameter opens exact detail.
- A case contains its source plan, selected request(s), server-derived conflict
  or deferral explanation, planner owner, response deadline and decision history.
- Proposals show before/after times, added/removed placements, new deferrals,
  affected organisations and validation status. Show up to three available
  validated options; do not invent alternatives when fewer exist.
- Planner can choose an existing validated slot or objective/pin preview and save
  it as an immutable proposal revision. Existing engine bounds remain in force.
- Apply proposal explicitly creates/selects a saved draft version, never edits
  the source snapshot and never publishes automatically.
- Organisation rows show Pending organisation approval / Organisation approved /
  Changes requested. Planner records an approval with confirmation time and a
  short required note describing its source (no attachment or contact details).
- Contractor workspace shows only the organisation's affected request changes
  and confirmation state. Contractor can request changes with a bounded note;
  the planner's approval-recording button remains planner-only in this release.
- Pending/change-requested states remain visible after Apply and in publication
  review. The UI explicitly states that they do not block publication.

### Identity, ownership and scope

Approved intake requests have engine IDs `R-<submission UUID>` and immutable
submission revisions. Resolve organisation membership server-side from this
identity; never trust a client-supplied participant list. Seeded requests such as
`M-001` have no contractor organisation: show **Operator-owned work — no contractor
approval applicable**, not fabricated participants. They remain planner-owned.

A new case defaults to its creating planner. Reassignment is limited to existing
trusted planner profiles. Contractor DTOs exclude other organisations, full plans,
global impact totals, planner-only notes, and alternative schedules for other work.

### Version and state semantics

Separate case lifecycle (`open`, `closed`) from proposal lifecycle (`proposed`,
`applied`, `superseded`, `withdrawn`) and per-organisation confirmation state.

Proposal revisions retain: source plan ID/revision/digest, request-revision
mapping, solver/constraint versions, strategy, pins, server-computed result and
impact digest. Approval records reference one exact proposal revision.

Creating a new proposal revision starts all its affected organisations pending;
previous confirmations remain visible only in history. Unrelated plan generation
does not inherit approvals. Show an approval badge only when the selected plan is
the exact applied plan linked to that proposal. This deliberately conservative
rule prevents a changed schedule from silently retaining old agreement.

Source changes mark an unapplied proposal stale and disable Apply until it is
regenerated. Staleness must not erase recorded historical confirmations. An applied
plan superseded by a different version is clearly labelled historical.

Use expected record versions for updates. Approval, revision and Apply races
return 409 with reload guidance instead of overwriting each other. Apply is
idempotent and links exactly one generated plan. Its write transaction checks the
proposal version and current planning basis, runs the existing server solver,
validates the result, verifies the reviewed result digest, saves the new plan and
records the application atomically. Any mismatch requires a new preview.

### Deadlines and escalation

Response deadlines are planner-selected timestamps displayed in SGT. A case is
overdue when the deadline has passed and any participant remains pending or has
requested changes. Show in-app escalation and an explicit planner escalation
action with a reason. No new email/Telegram delivery or background scheduler is
required. Closing a case requires a reason but cannot erase pending approvals on
its applied plan.

## Workstream B: accountable deferred work

### Durable identity and occurrence counting

Create a durable work item keyed to an intake submission UUID, or to a
night-qualified seeded request. Linked carry-forward submissions retain the same
work-item ID; identical titles never imply identity.

A deferred request in a generated draft is a **candidate deferral**, not a committed
occurrence. A planner can add it to the backlog explicitly, or publication can
record it automatically. Record at most one deferral occurrence per work item per
engineering night, regardless of retries, new drafts or repeated publication.

Append corrections when a same-night replacement publication schedules that item.
Keep historical events; derive the effective count without rewriting history.
Historical plans are not automatically backfilled: provide an explicit,
idempotent planner action to record a historical deferral.

### Metadata and lifecycle

Store planner owner, due date (SGT calendar date), existing criticality/priority,
reason, repeat-deferral escalation threshold, proposed next configured night and
event history. Owner defaults to creator; missing due dates are labelled **Needs
due date**, never silently treated as not overdue. Default repeat threshold is
two distinct effective deferred nights, labelled a configurable planning policy,
not an LTA safety requirement.

Work-item state is `open`, `scheduled`, `completed`, or `cancelled`. Only an exact
current published placement makes it scheduled; a draft placement does not close
the backlog. If supersession removes that placement, reopen it. Completion is
an explicit planner action with a reason/confirmation, not a solver inference.
Completed/cancelled items keep their audit history. Reopening requires a reason.

Overdue means unresolved work whose due date is before the current SGT date;
scheduled work is still unresolved until completed. Display overdue, repeatedly
deferred, missing owner/due date and awaiting target-night review distinctly.

### Cross-night workflow

`/plans/deferred` lists backlog across nights; `work` opens exact detail. Queue and
inspector links preserve the selected source night/version/request for return.
Contractors receive an organisation-scoped backlog section in their workspace.

Selecting **Propose next night** records a target from configured planning nights;
it does not reserve a slot or move approved input. **Prepare carry-forward request**
creates one idempotently linked intake draft for that target. Original approved
fields and history remain unchanged. The planner must review target-night windows,
resources and dependencies through normal intake approval before scheduling.

Cross-night dependencies are never copied as though valid. Target-incompatible
references are listed as review requirements and block approval until resolved.
Seeded work has no contractor ownership: carry-forward creation requires an
explicit organisation choice, otherwise keep it as an operator-owned backlog item.

Prevent two active approved occurrences of the same work item across nights.
Approval of a carry-forward must atomically retire the earlier active planning
occurrence and advance planning-source freshness using the existing lock order.
Do not retire a currently published occurrence without explicit planner confirmation
in the carry-forward flow. Past plan contents remain immutable. This needs database
concurrency and publication-race tests, not just UI validation.

## Architecture and proposed files

- `packages/core/src/types/coordination.ts`: proposal/case/confirmation contracts.
- `packages/core/src/types/deferred-work.ts`: work items and event contracts.
- `src/lib/coordination/{schemas,service,impact,http}.ts`: bounded input, authorised
  persistence, server-computed impact and existing typed HTTP envelopes.
- `src/lib/deferred-work/{schemas,service,http}.ts`: backlog, deduplication,
  carry-forward links and lifecycle transitions.
- Additive CLI-generated migrations in `supabase/migrations`: private tables,
  narrow authorised mutation functions, constraints, RLS and append-only events.
- New API families `/api/coordination` and `/api/deferred-work`: list/detail,
  revision-checked commands and no client-authoritative solver output.
- New planner pages `/plans/coordination`, `/plans/deferred`; focused components
  under `src/components/coordination` and `src/components/deferred-work`.
- Extend `SavedPlansWorkspace`, `PlannerInspector`, `SavedPlanReview`/
  `PlannerDialogs`, `RequestIntakeWorkspace`, contractor workspace and shared
  navigation. Keep forms/dialogs keyboard accessible and dirty-state protected.
- Extend `safeReturnTo` allowlists and navigation tests for the new paths/IDs;
  never allow arbitrary return URLs or permit contractors into planner pages.
- Refactor only the transaction-local plan creation helper needed for atomic
  proposal Apply. Reuse existing source locking, retry and validation logic.
- Integrate publication deferral recording within the publication transaction;
  notification delivery remains outside it and retains existing semantics.

## Security and failure behaviour

Follow verified identity + trusted profile + `withAuthenticatedTransaction`.
Private schema remains unexposed. Enforce organisation isolation in database
reads and response DTOs, not only client filters. Mutations are planner-only except
an organisation's own change-request note. Derive actors and timestamps server-side.
Use bounded plain-text notes, existing origin/JSON checks and exact-ID lookups.

Add optimistic versions, idempotency keys for creation/Apply/carry-forward, and
consistent source-lock ordering. Replayed commands must return the same result or
a clear conflict. Failed mutations retain form contents; successful writes followed
by failed refresh retain the saved ID and provide recovery. No silent success.

Organisation confirmations and backlog notes do not invalidate solver input.
Changes that affect approved scheduling facts do advance source revision. Due-date
metadata is tracking only in this release, not a hidden new solver constraint.

## Delivery sequence and review gates

1. Contracts, pure impact/confirmation derivation and work identity/counting tests.
2. Coordination persistence, RLS, APIs and atomic validated Apply.
3. Planner proposal/approval UI and contractor-scoped visibility/change requests.
4. Deferred-work persistence, publication deduplication and backlog UI.
5. Reviewed carry-forward intake, cross-night uniqueness and source invalidation.
6. Connected journeys, security/concurrency review, regression checks and docs.

Each deliverable follows failing test → implementation → focused passing tests.
After design approval, write separate detailed implementation plans for the
coordination and deferred-work workstreams, then execute inline with checkpoints.
Preserve the existing dirty tree; no wholesale formatting or unrelated commits.
Deployment remains separate from implementation verification.

## Acceptance scenarios

- Planner applies a validated proposal while every organisation is pending.
- Planner records one organisation approved; other organisations stay pending.
- A new proposal revision resets confirmations without deleting prior evidence.
- Two concurrent edits/approvals cannot approve the wrong proposal revision.
- Pending confirmation is visible in publication review but does not block publish.
- Invalid, stale or mandatory-work-missing proposals still cannot apply/publish.
- Contractor direct links never expose another organisation's requests or plans.
- Five generated versions do not count as five deferrals; repeated same-night
  recording/publication produces one effective occurrence.
- Same-night supersession scheduling the work corrects its effective deferral.
- Backlog survives refresh and changing nights; scheduled is not completed.
- Carry-forward preserves identity, cannot bypass intake approval, exposes invalid
  dependencies, and cannot leave two active approved occurrences.
- Missed response deadlines and overdue/repeated work appear in the correct queue
  without sending any external notification.
- Mobile/desktop, keyboard, dialog focus, unsaved edits, deep links, refresh,
  back/forward, expired sessions and failed-refresh recovery all behave consistently.

Run lint, typecheck, unit/component suites, real hosted DB/RLS/concurrency tests,
production build and authenticated E2E. Verify complete journeys in-browser with
isolated test data and cleanup. Record actual results and skipped checks in
`docs/PROJECT_STATUS.md`; update architecture, contracts, data model, testing and
decisions. No operational-safety certification or live-provider success is claimed.
