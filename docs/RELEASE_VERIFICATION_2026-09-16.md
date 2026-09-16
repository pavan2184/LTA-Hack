# Local planner verification — 16 September 2026

Scope: follow-up to `handoff.md` section 17, using the user's signed-in planner
session at http://localhost:3000. Commit: `203068d`. This is an agent-led browser
rehearsal and local regression pass, not a human usability study or release sign-off.

## Automated evidence

| Check | Result this session |
| --- | --- |
| `npm run lint` | Passed, exit 0. |
| `npm run typecheck` | Passed, exit 0. |
| `npm test -- --exclude "**/*.db.test.ts" --exclude "**/instance.test.ts" --reporter=dot` | 84 files, 733 tests passed; 273.65 seconds. DB tests deliberately excluded. |
| Focused accessibility, workspace-navigation, planner-inspector, planner-preview, planner-recovery and planner-panels tests | 6 files, 53 tests passed. These overlap the broad run; do not add their counts. |
| `npm exec -- vitest run --config vitest.e2e.config.ts scripts/e2e/provider-policy.test.ts --reporter=verbose` | Initially 2 passed / 1 failed on Windows; after the narrow file-URL correction, 3/3 passed. No real provider requests. |
| `npm run test:db` | Baseline verified, then 88/88 rollback/integration and 13/13 independent-session concurrency tests passed. |
| `npm run build` | Passed: production compilation, TypeScript and static generation completed. |
| `npm run test:e2e` | 2 files, 6/6 tests passed in 59.45 seconds. Controlled provider responses only; exact fixture cleanup completed. |
| Offline CP-SAT reference benchmark | Completed all three fixtures. Baseline: CP-SAT optimal 19/22 and 95.3% weighted completion versus heuristic 17/22 and 88.2%. Shortened window: CP-SAT optimal 18/22 and 92.9% versus heuristic 15/22 and 84.7%. Both reported the forced mandatory-block closure infeasible. Every reported plan had 0 critical validator findings and all 5 mandatory requests placed. |
| Read-only database parity check earlier in this session | 22 requests; `fnv1a:8c4a9050cfea5e8b`. |

The broad run printed React `act(...)` warnings in component tests, including
dashboard and deferred-work navigation. Assertions passed; this was not a
warning-free test run. The earlier suggestion that lint/tests were hung was not
established: properly tracked runs completed. The development server was stopped
before the production build and restarted afterward; localhost login returned
HTTP 200. Post-E2E parity was unchanged at 22 requests /
`fnv1a:8c4a9050cfea5e8b`.

## Observed browser journeys

The browser was VS Code's integrated Chromium preview on Windows. Native UI
interaction used the computer-use skill; no credentials were copied or entered by
the agent. Normal preview content was approximately 845 pixels wide on screen.

| Journey | Observation |
| --- | --- |
| Existing saved draft | 17/22 scheduled, 5/5 mandatory, 5 deferred, 0 critical violations. Historical source revision 611 was labelled changed; repair/publication controls were disabled. |
| Sandbox load | 22 fabricated requests; 19 conflicting requests and 16 grouped clashes at requested times. |
| Sandbox suggested fixes | 5 suggested moves applied locally; requested-time clashes reduced to 10 affecting 15 requests. |
| Sandbox generation | 17 scheduled, 5 deferred, all 5 mandatory covered, 0 remaining conflicts. |
| Linked selection / drag | Selecting M-001 highlighted both block bars. A 15-minute move preview showed M-001 at 00:15, no other moved request, and 5 deferred. Apply updated both bars to 00:15–01:15. |
| Sandbox undo | Restored both M-001 bars to 00:00–01:00 and announced the previous draft was restored. |
| Workforce | Expanded team/role availability view; no shortages displayed in this draft. |
| Unsaved request navigation | Entered only a disposable title without saving. Navigation prompted before leaving; Escape retained the form, and confirmed discard left it. No request was created. |
| Exact history reopening | Opened draft `87711799-a9c0-48da-baad-8a5c20abd852` from history; URL and displayed draft matched. Historical-source protections remained. |
| Coordination / deferred work | Both dedicated pages loaded with filters and explicit empty states for the selected context. No records created or changed. |
| Notification settings | Loaded labelled destination fields and a message that bot credentials were not configured. Save/test-send controls were disabled for unchanged, empty destinations. No destination edit or message send. |
| Compact request drawer | Opening focused search. Searching M-002 showed 1 of 22 requests. Tab visibly focused the All filter; Escape closed the drawer and returned visible focus to Work requests. |

### Responsive spot-check

Used the integrated browser's Device Emulation width control at 1280, 1440 and
1920 CSS pixels with automatic height and fit-to-preview scale. The saved-plan
queue, timeline and inspector remained in separate columns, and publication
controls remained visible. No obvious horizontal clipping was seen in these
sampled views. Restored normal preview mode afterwards.

This does **not** establish the exact 1280×800 / 1440×900 / 1920×1080 acceptance
matrix, every page, browser zoom, complete keyboard traversal or screen-reader
operation. Fit-to-preview scaling is not browser zoom. VoiceOver was not run
(this workstation is Windows).

## Findings requiring follow-up

### 1. Saved timeline React key warning

The development issue overlay reported:

> Each child in a list should have a unique "key" prop.

It named `PlannerTimeline`, pointing to `src/components/plans/PlannerTimeline.tsx`
line 52 and its `SavedPlansWorkspace` caller. The warning was present during this
browser session; a clean-session minimal reproduction and exact root cause remain
to be established. Tested selection/drag/undo flows worked, but the browser pass
was not console-clean. No application fix was made.

### 2. Windows provider-preload path correction — resolved locally

The first provider-policy test originally failed with
`ERR_UNSUPPORTED_ESM_URL_SCHEME`: Node interpreted the absolute `C:\...` preload
path as the unsupported `c:` protocol rather than a file URL. Both the standalone
policy spawn and production-server spawn now convert the resolved preload path
with `pathToFileURL(...).href`. The focused policy suite then passed 3/3 and the
complete production HTTP suite passed 6/6 on Windows. No application route,
authorization rule or provider allowlist changed.

### 3. CP-SAT reference benchmark — completed offline

Added a pinned OR-Tools 9.15.6755 reference model under `scripts/benchmark`.
It does not change the production solver. Candidate placements are checked by the
existing TypeScript `validate()` constraints-v3 authority; validator findings seed
or lazily add no-good cuts. The baseline and shortened-window results were proven
optimal by equal objective values and best bounds, and independently revalidated
with zero critical findings.

| Fixture | Production heuristic | CP-SAT reference | End-to-end CP-SAT time |
| --- | --- | --- | --- |
| Baseline | 17 placed; 88.2%; 69.30 ms | Optimal; 19 placed; 95.3%; 5/5 mandatory | 15.80 s |
| Mandatory blocks closed | Infeasible; 98.56 ms | Proven infeasible | 1.46 s |
| Window shortened to minute 210 | 15 placed; 84.7%; 26.43 ms | Optimal; 18 placed; 92.9%; 5/5 mandatory | 6.64 s |

CP-SAT produced more placed work on the two feasible fabricated fixtures, but took
roughly two to three orders of magnitude longer and produced substantially more
movement minutes (1,410 versus 735 at baseline; 1,080 versus 720 in the shortened
window). This is evidence for continued offline benchmarking, not enough evidence
to replace the fast interactive heuristic or add a Python production dependency.

## Remaining handoff work and user input

1. **Planner study:** protocol and measurement sheet are in
   `PLANNER_USABILITY_PILOT.md`. Still prepare the frozen manual packet and recruit
   a human participant. A login is access, not a participant. No measured time
   savings, confidence results or human observations exist yet.
2. **Accessibility:** complete exact viewport/zoom and keyboard coverage; arrange
   a Mac with VoiceOver for that specific check. Current component tests and
   limited keyboard observations do not replace it.
3. **Shared-resource regression:** completed in the user-confirmed exclusive
   window: 88 rollback/integration, 13 concurrency and 6 E2E tests passed. Repeat
   only in another coordinated window because these suites create exact temporary
   fixtures and advance source revision monotonically.
4. **Real integrations:** current UI says Telegram is unconfigured. Real provider
   checks need an explicit non-production recipient/data scope and consent to
   send. Do not paste credentials in chat. No real Anthropic/Telegram run occurred.
5. **Geography permission and PR #27:** remain separate permission/product/security
   decisions. No implicit permission to redistribute or merge. The CP-SAT reference
   benchmark is now complete for the three fabricated fixtures, but broader
   representative sampling and a product latency/quality threshold are still needed
   before any solver replacement decision.
6. **Demo:** a 2–3 minute storyboard is in the pilot document. The automated
   controlled request-to-publication/contractor journey passed, but a human-paced
   visual rehearsal and recording are still required; sandbox work cannot stand in
   for saved publication.

No retained plan/request/coordination/backlog/notification writes, provider sends,
deployment, merge, commit or push were performed. E2E writes were isolated and
removed by exact cleanup. Sandbox changes were local and
the unsaved request title was discarded. The pre-existing generated
`next-env.d.ts` modification was preserved. Local server remains
http://localhost:3000.
