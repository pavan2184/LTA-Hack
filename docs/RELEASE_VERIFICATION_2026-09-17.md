# Release gate verification — 17 September 2026

Scope: issue #17 release gate re-verification on `main` at commit `9ca5630`, after
pulling the two upstream commits that had not been fetched locally. This is a
complete automated-gate pass plus a dependency re-audit. It is not a human
usability study, a screen-reader audit or a public-deployment sign-off.

## Automated evidence

Every gate below was run in this session, in the order shown, on macOS (darwin
24.5.0, Node 24.2.0, npm workspace `railplan@0.4.0`). Exit codes are actual.

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | Passed, exit 0. |
| Typecheck | `npm run typecheck` | Passed, exit 0. |
| Unit, component and hosted DB | `npm test` | 98 files, 821 tests passed; 268.86 s. Includes the `*.db.test.ts` rollback/integration files; none excluded. |
| Independent-session concurrency | `npx vitest run --config vitest.concurrency.config.ts` | 5 files, 13 tests passed; 97.21 s. |
| Production build | `npm run build` | Passed. 43 routes compiled; static generation completed. |
| Production HTTP E2E | `npm run test:e2e` | 2 files, 6 tests passed; 83.45 s. Controlled provider stubs only; exact fixture cleanup completed. |
| Geography snapshot | `npm run geo:verify` | Passed. 15 station points; bundled snapshot, no network. |
| Database parity (before) | `npm run db:verify` | 22 requests, `fnv1a:8c4a9050cfea5e8b`. |
| Database parity (after E2E) | `npm run db:verify` | 22 requests, `fnv1a:8c4a9050cfea5e8b` — unchanged. |
| Dependency audit | `npm audit` | **0 vulnerabilities.** |

Total: **840 automated tests passed, zero failures, zero skips.**

The full captured output of the broad run contained no React warnings and no
console errors. This differs from the 2026-09-16 run, which recorded `act(...)`
warnings under `--reporter=dot` with DB tests excluded; the reporter and file set
were different, so this is not by itself evidence that a warning was fixed.

## Dependency audit — GHSA-82fw-gwwq-j7x9 now clears

The open finding carried since 2026-09-09 is resolved and re-verified here:

- `npm audit` reports **0 vulnerabilities** (previously two moderate entries for
  `vitest` and `@vitest/mocker` against GHSA-82fw-gwwq-j7x9).
- `npm ls vitest @vitest/mocker` resolves `vitest@4.1.11` and
  `@vitest/mocker@4.1.11`. 4.1.11 is the fixed release; 4.1.10 was affected.

`docs/SECURITY_REVIEW.md` open finding 4 previously instructed readers not to
repeat a zero-vulnerability claim because the audit was dirty. That instruction
is now stale and has been corrected in place, dated and tied to this evidence.
The correction states what was verified — the dependency tree at this commit on
this machine — and not that the deployed environment is secure.

## E2E side-effect containment

The E2E suite writes real fixtures to the hosted development project, so its
cleanup was checked rather than assumed:

- Port 3101 released; no server process left running.
- No `railplan-e2e-recovery-*.json` manifest left in the temp directory, which is
  the suite's own signal that cleanup completed rather than aborted.
- Source digest identical before and after (`fnv1a:8c4a9050cfea5e8b`, 22 requests).
- `git status` clean; no working-tree residue.

## The PlannerTimeline React key warning — investigated, not reproduced

The 2026-09-16 record carries an unresolved development-overlay warning naming
`src/components/plans/PlannerTimeline.tsx`. It did not reproduce here:

- A targeted probe rendered `PlannerTimeline` with a real `solve()` result, and
  again with the conflict-rich requested plan plus live violations and a selected
  violation, spying on `console.error`. No key warnings. (Probe was temporary and
  has been removed; the working tree is clean.)
- All seven test files that mount `SavedPlansWorkspace` were run together —
  51 tests, no key warnings.
- Statically, every JSX `.map` in the component carries a key: the corridor map
  (`line.id`), block rows (`block.id`), packed occupations (`p.requestId`), axis
  and grid ticks (`tick`), and conflict segments (`v.id`).
- Duplicate keys are ruled out structurally. `railplan_private.plan_placements` is
  `primary key(plan_id, request_id)`, so a saved plan cannot carry the same
  request twice; `facts.blocks` comes from an unjoined `select * from track_blocks`
  keyed by primary key; and `SavedPlansWorkspace` passes no `violations` prop at
  all, so the nested segment list is empty on that path.

**This finding stays open.** It was observed once in a signed-in `next dev`
session against real saved data, and nothing above rules that out — it establishes
only that the test layer and the current fabricated data do not produce it.
Reproducing it needs a live signed-in planner session on that specific saved plan.

### Related latent fragility found while investigating

`src/components/layout/SandboxPlannerPanel.tsx` builds its facts as
`requests: [...demoFacts.requests, ...Object.values(inputs.context.extraRequests ?? {})]`.
That concatenation does not dedupe by `id`. It is safe with the current data —
the only scenario that populates `extraRequests` is `block-closure`, which adds
`EM-001`, an id absent from the 22 `M-*` literals — but a future scenario that
overrode an existing request through `extraRequests` would put two entries with
the same id into `facts.requests`. No fix was applied: this is outside the scope
of the issues being worked and is recorded here so it is not rediscovered.

## What this pass does not establish

Unchanged from 2026-09-16 unless stated:

1. **Screen-reader speech and native browser zoom.** Not run. This needs the
   owner's macOS session and explicit approval to enable VoiceOver; the approval
   requested earlier remains pending. No spoken output is claimed.
2. **The exact responsive acceptance matrix.** 1280×800, 1440×900 and 1920×1080
   browser UAT with full keyboard traversal was not run in this session.
3. **CP-SAT reference benchmark.** Not re-run. `ortools` is not installed in this
   environment and no Python package was installed. The 2026-09-16 benchmark
   results stand as recorded; nothing here supersedes them.
4. **Real provider delivery.** No real Anthropic or Telegram request was made.
   E2E provider responses are controlled local fixtures.
5. **Geographic source licence clearance.** Unresolved. No redistribution claimed.
6. **Public deployment.** None performed.

## Code hygiene observed while reading the codebase

Not a gate, recorded as context: `src/` and `packages/core/src/` contain zero
`TODO`/`FIXME` markers and zero `as any` or `@ts-ignore` escapes. Six
`react-hooks` lint suppressions exist, each with a written justification; the
`set-state-in-effect` suppression in `SavedPlansWorkspace.tsx` is sound because
the state write follows a network await rather than running synchronously in the
effect body.

## Boundaries retained

The fabricated-data and non-operational decision-support boundary is unchanged.
No output of this system is an operational instruction or a safety approval. No
plan, request, coordination, backlog or notification write was retained outside
the E2E suite's own removed fixtures. No commit, push, merge or deployment was
performed in this session.
