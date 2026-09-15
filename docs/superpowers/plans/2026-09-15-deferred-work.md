# Deferred Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track accountable backlog across nights, with truthful deferral counts and reviewed carry-forward requests.

**Architecture:** A private work-item identity links original and carry-forward submissions. Append-only occurrences/events derive backlog status independently of immutable plan contents. Publication hooks and approval guards use existing source-lock order.

**Tech Stack:** Existing Next.js 16, React, TypeScript, Zod, postgres, Supabase Auth/RLS and Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-15-coordination-and-deferred-work.md`, Workstream B.

## Global Constraints

- Existing validation, mandatory-work, source-freshness and publication checks remain mandatory.
- No automatic publication, provider messages, production deployment, named-worker data, or safety-rule changes are included.
- Private schema remains unexposed.
- Preserve the existing dirty tree; no wholesale formatting or unrelated commits.
- Scheduled is not completed. Drafts do not increment deferral counts. Organisation approval is non-blocking.
- User approved current checkout. Do not spawn child agents. Main controller reviews migrations before applying to the dedicated hosted Dev database; no Docker/reset/seed.
- Follow TDD and read required docs/skills. Commit only task-owned new files; preserve unstaged integration edits in already-dirty files.

### Task 1: Durable backlog service and publication projection

**Files:** Create `packages/core/src/types/deferred-work.ts`, `src/lib/deferred-work/{schemas,projection,service,http}.ts`, API `/api/deferred-work` list/create, `/api/deferred-work/[id]` detail and `/api/deferred-work/[id]/actions` POST; `src/test/deferred-work.test.ts`, `src/test/deferred-work.db.test.ts`, `src/test/api.deferred-work.test.ts`; CLI-generated additive migration. Extend publication through a private INSERT trigger so retries and direct existing publication paths cannot bypass recording.

**Interfaces:** Export `listWorkItems(identity,filters,connection?)`, `getWorkItem(identity,id,connection?)`, `recordDeferral(identity,input,connection?)`, `actOnWorkItem(identity,id,input,connection?)`. Identity is the existing VerifiedIdentity. Inputs parsed by strict schemas; results use new shared contracts. Projection helper `effectiveDeferredNights(events)` accepts chronological `{night,kind:'deferred'|'scheduled'}` records and returns unique effective night strings. `workItemFlags(item,today)` derives due-date/threshold signals without hidden clock access.

- [ ] Write failing pure tests for unique-night counts, correction, SGT due boundary and scheduled-not-completed:
```ts
expect(effectiveDeferredNights([
  {night:'2026-09-16',kind:'deferred'},
  {night:'2026-09-16',kind:'deferred'},
  {night:'2026-09-17',kind:'deferred'},
  {night:'2026-09-16',kind:'scheduled'},
])).toEqual(['2026-09-17']);
```
Also assert due today is not overdue, prior-day open/scheduled work is overdue, completed/cancelled is not, missing due date yields missing-data flag, repeat threshold counts distinct effective nights.
- [ ] Run `npx vitest run src/test/deferred-work.test.ts`, observe RED, implement deterministic projections and bounded schemas. Dates are ISO SGT calendar dates; no implicit UTC day comparison.
- [ ] Write rollback DB tests before persistence: explicit record validates exact plan deferral; repeated key returns same item; generated drafts have no occurrences; same-night publication retry/supersession is deduped/corrected; planner owner reassignment only to trusted profiles; contractor own reads only; lifecycle notes survive; metadata leaves planning source unchanged.
- [ ] Generate migration through CLI. Tables: work items (durable source key, owner, due date, priority, threshold default 2, proposed night, optimistic version), linked submissions, append-only work events/occurrences, mutation idempotency records. Seeded identity is night+engine ID; intake identity is submission UUID or existing linked item, never title. Immutable actor UUIDs must survive profile deletion. Contractor cannot read operator-only items or another organisation's note/detail.
- [ ] Implement bounded list filters owner/night/overdue/repeated/missing-due/state with cursor max 50, detail by exact UUID. `recordDeferral` requires planId, requestId, reason, idempotencyKey and validates server-side saved facts. Assign creator by default. Commands `update` metadata, `complete`, `cancel`, `reopen`, `escalate`, `propose-night` require expectedVersion; lifecycle commands require note <=1000 chars.
- [ ] Publication trigger records each deferred item at most once per effective night; replacement publication scheduling an item appends a correction. Resolve all linked IDs to one durable item. New current placements derive scheduled; removal reopens unresolved work. Completed/cancelled historical items never resurrect implicitly. Historical recording is explicit, idempotent and subordinate to current same-night publication state.
- [ ] Send migration for main-agent review, then run authorised migration and focused real DB/API tests. Verify publication/outbox regressions together, serially. Commit only new files and report RED/GREEN evidence and integration edits.

### Task 2: Backlog UI and connected journeys

**Files:** Create `src/app/plans/deferred/page.tsx`, `src/components/deferred-work/{DeferredWorkWorkspace,DeferredWorkSummary}.tsx`, `src/test/deferred-work-ui.test.tsx`; modify planner inspector/workspace, shared navigation, contractor composition, safe return-path allowlists and navigation tests.

**Interfaces:** Consume Task 1 services through HTTP. `DeferredWorkWorkspace({role})` receives own/planner DTOs; selected work UUID in `work`. `DeferredWorkSummary({planId})` links exact current plan candidates and tracked items.

- [ ] Write failing component tests for candidate-to-record action, missing due date label, owner edit, overdue/repeated filtering, exact deep link, reload preservation and forbidden details.
```tsx
expect(screen.getByText('Needs due date')).toBeVisible();
expect(screen.queryByRole('button',{name:'Mark completed'})).not.toBeInTheDocument();
```
The latter uses a contractor fixture, not a mocked permissions component. Planner fixture must expose completion action and require a note before submit.
- [ ] Run `npx vitest run src/test/deferred-work-ui.test.tsx`, observe RED, build shared-shell backlog with owner/due/criticality/reason/history/target-night controls. State is persisted through API, not local storage. Provide exact source-plan/request return links to planners only.
- [ ] Add Night overview deferred count/action and inspector Record deferral. Explain that draft alternatives do not increment history. Contractor sees own backlog and scheduling state, not cross-org resource totals. Preserve pagination selection by independent exact-ID detail.
- [ ] Add live status, keyboard/focus, dialogs and unsaved-change guards. Errors preserve edits; success followed by failed reload keeps record ID and recovery. New route/URL keys remain role-safe in login return handling.
- [ ] Run focused component, plan and navigation suites then lint/typecheck. Report/commit new files, leave baseline integration diffs unstaged.

### Task 3: Reviewed carry-forward and final release verification

**Files:** Add `src/lib/deferred-work/carry-forward.ts`, `src/test/carry-forward.db.test.ts`, `src/test/carry-forward.test.tsx`, `scripts/db/deferred-work-concurrency.test.ts`; extend deferred actions and UI, request intake service/UI, and CLI-generated additive migration for approval/loader guards. Update all project docs and E2E fixtures/cleanup.

**Interfaces:** `prepareCarryForward(identity,itemId,{expectedVersion,targetNight,organisationId?,idempotencyKey},connection?)` returns linked draft request ID. Existing intake approval consumes a validated carry-forward context server-side; no client-controlled ownership or automatic approval. Add catalogue/detail review metadata only for a scoped linked request.

- [ ] Write failing tests for duplicate preparation, invalid target-night bounds/dependencies, seeded item requiring explicit organisation, draft not entering solve, only one active approved occurrence and published-source confirmation.
```ts
expect(first.requestId).toBe(retried.requestId);
expect(targetFacts.requests.some(r => r.id === `R-${first.requestId}`)).toBe(false);
```
Here targetFacts is loaded after preparing but before submitting/approving; test actual DB transactions, not fabricated expected output.
- [ ] Implement target-night draft using existing create path and a durable work-item/submission link atomically. Preserve original fields/history. Carry invalid dependencies as explicit review metadata, not silently approved fields. Approval must require resolution of review requirements and ordinary safety/skill/window validation.
- [ ] Guard all approval entry points in SQL using source lock → work-item lock → submission locks in stable ID order. On valid target approval, retire earlier active occurrence atomically and advance source revision. Existing dependencies on the earlier occurrence must be resolved first, not orphaned. If earlier work is currently published, require explicit planner confirmation tied to that exact publication/version; stale confirmation cannot retire a different publication.
- [ ] Preserve operator-seeded rows and past plan facts. Use an explicit active-occurrence mapping consumed by the loader to suppress carried seeded work; include this mapping in source invalidation and parity tests. Never delete seeded facts or modify old migrations. Extend rollback/concurrency cleanup for exact new fixture IDs.
- [ ] Add independent-session tests for two target approvals racing, approval versus publication, double preparation and backlog publication retry. Run serially after ordinary tests; assert uniqueness, atomic rollback and unchanged historical snapshots.
- [ ] Browser-test planner backlog → prepare target request → review/approve → generate → publish → backlog scheduled, plus contractor scoped visibility and pending organisation approval. Test mobile, keyboard, history and failed reload with no live provider sends.
- [ ] Run full lint/typecheck/unit suite/build, required DB/concurrency and authenticated E2E. Security-review RLS/direct-function access, forged actors/owners, stale versions, unsafe returns and retained notes. Update ARCHITECTURE/DATA_MODEL/API_CONTRACT/TESTING/DECISIONS/PROJECT_STATUS with actual outputs, risks and local URL. Do not deploy.
