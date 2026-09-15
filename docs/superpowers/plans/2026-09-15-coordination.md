# Coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver versioned conflict proposals whose organisation confirmations are visible but never block validated Apply/publication.

**Architecture:** Private, revision-checked workflow records reference immutable plan snapshots. Server-only impact calculation and atomic plan creation reuse existing planning transactions. Contractor responses expose only organisation-scoped changes.

**Tech Stack:** Existing Next.js 16, React, TypeScript, Zod, postgres, Supabase Auth/RLS and Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-15-coordination-and-deferred-work.md`, Workstream A.

## Global Constraints

- Organisation confirmation is informational, not a prerequisite to applying a validated proposal or publishing a plan.
- Existing validation, mandatory-work, source-freshness and publication checks remain mandatory.
- No automatic publication, provider messages, production deployment, named-worker data, or safety-rule changes are included.
- Private schema remains unexposed.
- Preserve the existing dirty tree; no wholesale formatting or unrelated commits.
- Pavan authorised working in the current checkout. Address Pavan in user-facing messages.
- Read required project docs and applicable skills before implementation. Main agent manages all subagents; implementers must not spawn helpers or reviewers.
- Do not apply hosted migrations until the main agent reviews the SQL. Database tests run serially. Existing dirty files may be edited but must not be staged wholesale: commit only new task-owned files; main agent preserves/reviews integration diffs separately.

## Delivery

Task 1 owns server contracts/storage/API, Task 2 owns UI integration, Task 3 owns complete verification. Deferred work has a separate following plan.

### Task 1: Versioned coordination backend

**Files:** Create `packages/core/src/types/coordination.ts`, `src/lib/coordination/{schemas,impact,service,http}.ts`, `src/app/api/coordination/route.ts`, `src/app/api/coordination/[id]/route.ts`, `src/app/api/coordination/[id]/actions/route.ts`, `src/test/coordination.test.ts`, `src/test/coordination.db.test.ts`, `src/test/api.coordination.test.ts`, and one CLI-generated migration. Modify only necessary transaction-helper portions of `src/lib/plans/service.ts`.

**Interfaces:** Consume `analysePlan`, `solvePreview`, `planInputDigest`, `read`, `transaction`, existing `VerifiedIdentity` and `CreatePlanInput`. Export `listCases(identity, filters, connection?)`, `getCase(identity,id,connection?)`, `createCase(identity,input,connection?)`, `actOnCase(identity,id,input,connection?)`. Every method returns serialisable contracts defined in `types/coordination.ts` and typed HTTP errors.

- [ ] Write failing tests for server-derived full-plan impact (including deferred/removed/new placements), own-organisation projection, and confirmation revision isolation. Example consumer assertion:
```ts
expect(projectOrganisationChanges(changes, "org-a").map(x => x.requestId)).toEqual(["R-a"]);
expect(confirmationsForRevision([
  { organisationId: "org-a", revision: 1, status: "approved" }
], 2, ["org-a"])).toEqual([{ organisationId: "org-a", revision: 2, status: "pending" }]);
```
`changes` is a literal fixture with one record owned by org-a and one by org-b. Types/required fields belong in the fixture and helper contracts, not test-only production hooks.
- [ ] Run `npx vitest run src/test/coordination.test.ts`, observe missing-behaviour failures, then implement pure helpers and strict input schemas.
- [ ] Define private cases (source plan, selected IDs, owner, deadline, version/state), immutable proposal revisions (parameters/basis, result/impact digests and participant snapshots), per-revision confirmation events, and append-only case/application events. Creation requires `idempotencyKey`; actions require `expectedVersion`. Apply requires the exact proposal revision and returns its linked plan ID. Derive participant ownership from submission UUID and exact snapshot revision; baseline IDs have no contractor participant.
- [ ] Write database tests with real rollback Auth/profile/org fixtures: planner create, contractor own read/change request, foreign-org denial, stale mutation, new revision reset, Apply while pending, repeated Apply same result, rejected stale source and immutable evidence. Use existing rollback fixture patterns; no production fixtures.
- [ ] Generate migration with the installed Supabase CLI, then implement constraints/RLS and narrow private writes. All actors derive from `auth.uid()`. Contractor policies must not expose full proposal JSON; expose a scoped function/DTO only. Version checking and append-only evidence are enforced in SQL, not client UI.
- [ ] Implement service algorithms and route adapters. Commands: `revise` (new server-validated parameters), `approve` (org ID, confirmedAt, required note), `request-changes` (own org, note), `apply`, `assign`, `deadline`, `escalate`, `close`, `reopen`, `withdraw`. Note cap 1000 chars; IDs UUID except engine request IDs (max 64); cases max 100 selected requests; page size max 50 with cursor. Do not accept participant lists, solver output or actor IDs from clients.
- [ ] Apply inside one existing planning transaction, not via an HTTP call: source lock → case lock/version → current basis check → server solve → result/impact digest check → save plan → link application/event. Reuse an extracted transaction-local plan creation helper; no nested independent commit. Strip timings from semantic result digest. A failed refreshed solve cannot save a changed unreviewed result.
- [ ] Before hosted mutation, send migration path and test command to controller for SQL review. Then run approved migration and focused DB/API tests. All DB tests use the current environment and no Docker.
- [ ] Run focused regression `npx vitest run src/test/coordination.test.ts src/test/coordination.db.test.ts src/test/api.coordination.test.ts src/test/plans.db.test.ts`, plus typecheck/lint. Report RED/GREEN evidence and exact unresolved checks. Commit task-owned new files only; report unstaged integration diffs.

### Task 2: Planner and contractor coordination UI

**Files:** Create `src/app/plans/coordination/page.tsx`, `src/components/coordination/{CoordinationWorkspace,CoordinationSummary,OrganisationConfirmations}.tsx`, `src/test/coordination-ui.test.tsx`. Modify `WorkspaceNavigation`, `SavedPlansWorkspace`, `PlannerInspector`, `PlannerDialogs`, contractor/request workspace composition, `src/lib/auth/return-path.ts`, navigation tests.

**Interfaces:** Consume Task 1 routes/contracts. `CoordinationSummary({planId})` reads exact applied-plan confirmations. `CoordinationWorkspace({role})` renders planner or scoped contractor content; it never computes feasibility.

- [ ] Write UI failures for pending Apply enabled, organisation mark approved dialog, newer revision pending, other-org content absent, API failure retained form, exact case direct link, and publication still enabled while confirmation pending.
```tsx
expect(screen.getByRole("button", {name: "Apply proposal"})).toBeEnabled();
await user.click(screen.getByRole("button", {name: "Mark organisation approved"}));
expect(screen.getByRole("textbox", {name: "Confirmation note"})).toBeVisible();
```
- [ ] Run `npx vitest run src/test/coordination-ui.test.tsx` to establish RED, then add white/blue shared-shell page, queue filters (owner/night/state/overdue/pending), exact `case` URL selection and contextual return.
- [ ] Build create case from inspector, up-to-three real validated alternatives and objective/pin proposal previews through existing analysis. Show complete before/after and deferral changes; no invented options. Offer revision creation, Apply, assignment, deadline, escalation/close/reopen/withdraw and audited confirmations. Show stale or superseded versions explicitly.
- [ ] Add contractor scoped cards and request-changes notes without planner-only plan links, participant/global totals or notes. Add exact-plan summary to Night overview and publication review; pending/change requested never gate publishing. Explicit copy: "Organisation confirmation does not replace safety or publication approval."
- [ ] Add role-safe navigation/return allowlists for `/plans/coordination` and `case`. Preserve dirty edits, abort stale responses and retain successful mutation IDs on failed reload. Keyboard dialogs restore focus; status changes use live regions.
- [ ] Run UI/navigation/plan regression tests, lint/typecheck. Report TDD and changed file list; commit only task-owned new files.

### Task 3: Coordination end-to-end verification

**Files:** Extend `scripts/e2e/journey.test.ts`, add `scripts/db/coordination-concurrency.test.ts`, and update required DB script and docs `ARCHITECTURE`, `DATA_MODEL`, `API_CONTRACT`, `TESTING`, `DECISIONS`, `PROJECT_STATUS`.

- [ ] Add real independent-session race tests: revision versus approval, double Apply, and planning-source mutation versus Apply. Assert exactly one applied plan, no confirmation attached to wrong revision, and no source-stale publication.
```ts
expect(new Set(successfulApplyResults.map(x => x.appliedPlanId)).size).toBe(1);
expect(confirmedRevision).toBe(reviewedRevision);
```
- [ ] Exercise real authenticated HTTP creation → proposal → pending Apply → planner recorded confirmation → contractor isolation → revision reset; provider calls remain controlled/off. Keep exact fixture cleanup and no broad deletion.
- [ ] Run focused concurrency and E2E after ordinary DB tests stop. Inspect browser complete journey at desktop/mobile with keyboard, refresh/back/forward and console checks. Record failures honestly.
- [ ] Update docs with actual evidence, new contracts and permission boundaries. No deployment. Review task diff before marking complete.
