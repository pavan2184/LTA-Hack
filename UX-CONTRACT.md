# RailPlan PS1 UX Contract

## Algorithm Lab companion boundary — 2026-09-19

The homepage exposes “How CP-SAT works” and a direct `/algorithm-lab` link.
The PS1 titlebar opens that explanation in a new tab to preserve unsaved planning
state. The Vercel variant exports the shared UI to public files and uses a single
same-origin `/api/algorithm-lab` Python endpoint for model GET and solve POST.
It preserves the standalone model's validation, status and recovery behavior.

The standalone `demos/algorithm-lab` teaching site follows a deliberately small
variant of these interaction conventions. Its canonical owners are native
labelled selects/checkboxes in `static/index.html`, selection/request state in
`static/app.js`, and the local `static/style.css` scrollbar/focus tokens. Shared
React controls do not cross this separately deployed Python service boundary.
The maintained source is its README plus the algorithm-lab architecture decision.

All six rows are rendered. Selecting a row changes only the explanation. Editing
settings visibly marks the existing result as previous and disables its JSON
download until settings match or another solve completes. A solve disables duplicate
requests and controls; a bounded client timeout restores retry. Errors preserve
the old result and label it as such. Returned infeasibility replaces the chart
with an unfilled model and no invented partial solution. Three explanation
buttons expose pressed state and update a live explanatory panel, not a search
trace. Result JSON is an auxiliary teaching artifact, never official PS1 output.

The only public inputs are enumerated capacity, closed week and predecessor
settings. These non-private choices may appear in shareable query parameters.
No upload or arbitrary model enters the backend. Native select popup geometry
is intentional. Visible focus, natural document scrolling, a keyboard-focusable
table scroller, narrow layout, reduced motion and persistent inline errors apply.
There are no auth, billing, deletion, date-entry or CRUD user flows in this lab.

## Product context

This contract covers `/ps1`, the account-free NebulaX planning workspace. Its primary users are access planners and works controllers who need to understand scheduled work, consequential exceptions, alternatives, changes and export readiness. It does not replace the authenticated RailPlan product's permission or publication contracts.

The interface is English and uses concise planning language. Source dates are date-only ISO values; the weekly PS1 horizon is authoritative and must not be reinterpreted using the viewer's timezone. Target WCAG 2.2 AA for changed controls, including keyboard operation, visible focus, names and non-color state cues. Native screen-reader and device evidence must be reported honestly.

## Business-context sources

| Domain / scope | Authoritative source | UI consequence |
| --- | --- | --- |
| PS1 rules, scoring, output and deliverables | [Official specification](docs/PS1_OFFICIAL_SPEC.md) | Complete workload and hard rules remain mandatory; only eligible complete results export in the official schema. |
| Public access and privacy | [API contract: public PS1 client interfaces](docs/API_CONTRACT.md#public-ps1-client-interfaces--2026-09-18) | Upload and solve work without an account; uploaded data is sent to the same-origin solver without application persistence. |
| Applied/proposed lifecycle | [Browser PS1 data model](docs/DATA_MODEL.md#browser-only-ps1-planning-model--2026-09-18), [architecture](docs/ARCHITECTURE.md) | A proposal cannot silently replace the applied result or unlock export. |
| Retention | [Architecture: public PS1 optimiser workspace](docs/ARCHITECTURE.md#public-ps1-optimiser-workspace--2026-09-18) | Revisions, pins and planning log are session-local; no persistence or cross-device recovery is promised. |
| Safety and validation claims | [Official specification, output schema](docs/PS1_OFFICIAL_SPEC.md#7-output-schema), [project brief](docs/PROJECT_BRIEF.md) | Label conformance as local and the result as planning output, not operational authorization. |
| Workflow direction | [2026-09-19 schedule-first decision](docs/DECISIONS.md#2026-09-19--ps1-becomes-a-schedule-first-planning-workstation) | Dominant work schedule, contextual support, common selection and review boundary. |
| Billing, deletion, identity | Not applicable to this public, nonpersistent solver flow | No billing, account management or server deletion controls are introduced. |

## Visual contract

[DESIGN.md](DESIGN.md) owns visual rationale and accepted palette. Runtime CSS is canonical: shared tokens in `src/app/globals.css`, existing Button/Dialog primitives, route-scoped workstation treatment and `work-schedule.css`. Supported PS1 themes are default light and session-only low-glare. Document and runtime changes must remain in the same change; lint the design document and compare computed browser styles before claiming conformance.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Table Selection | `WorkspaceSelection` controlled by Ps1Workbench and projected by OperationsOverview | PS1 data model; this contract | Single activity or location-week; null selection | Linked-view component tests and browser selection |
| Select/Listbox | Native labelled `select` in existing PS1 forms and filters | This contract; existing primitives and platform keyboard behavior | Native popup, platform-owned geometry | Open popup, keyboard choice, long option and narrow-viewport checks |
| Form | Existing PS1 upload/disruption/Q&A controls plus engine loader and validators | API contract and PS1 engine | File batch, typed capacity/week, deterministic question | Invalid-input, pending and retry tests |
| Scrollbar | Application stylesheet and scoped schedule geometry | DESIGN.md; runtime CSS | Native scrolling with themed standards properties and engine fallbacks | Computed styles and pointer/keyboard scroll |
| CRUD | Ps1Workbench applied/proposed revision state | PS1 data model and architecture | Preview, Apply, Discard and Undo; no server CRUD | Full proposal/review/export-gating regression |

Dates are displayed from the instance; this workflow does not introduce date entry. Feedback is inline and persistent where recovery is needed; no new toast system is required.

## Component behavior

Shared buttons retain native button semantics, focus outlines, disabled state and action wiring. View toggles expose pressed/selected state. Modal overlays use the existing Radix Dialog owner with labelled titles, Escape dismissal, focus containment and restoration. Search has an explicit label, immediate local filtering and a reachable way to clear non-empty text. Filtered-empty results distinguish themselves from an unloaded instance.

The schedule uses keyboard-operable native controls for hierarchy, selecting work, scale and horizon navigation. Occupancy retains its one-focus ARIA grid and arrow/Home/End model. There is no unreviewed drag-to-reschedule behavior. Long identifiers remain available in accessible labels or selected details.

## Dataset navigation

Work schedule is the primary projection; location occupancy answers capacity and spatial questions. Both use one active scenario and shared selection identity. Attention and inspector support the selected task without permanently shrinking the canvas. View changes must not mutate the instance or applied submission.

The uploaded dataset is sent to the server when solving. Search, filters, selection, revisions and low-glare choice remain in browser memory. Do not encode private input or plan content in URLs, analytics or persistent storage. Filters apply only to presentation and never reduce the workload submitted to the solver or exported. Empty results include a clear-filter recovery action. Contract expansion and timeline navigation are presentation state, not planning decisions.

## Flow ledger

| Operation | Trigger and pending | Success / feedback | Failure recovery | Source ref |
| --- | --- | --- | --- | --- |
| Load public instance | Explicit public-instance action; solving progress replaces idle feedback | Three independently retained scenario outcomes; C selected on a fresh instance | Readable error and retry; no fabricated result | API contract; architecture |
| Upload hidden instance | File picker or drop; exact filenames parsed and checked before solving | Source and recognized file count visible; complete valid batch can be sent for native solving | Name missing, malformed or ignored files; picker remains available | Official spec deliverable 2; API contract |
| Solve or re-run | Native API owns the job; disable duplicate solves and abort replaced requests | Current outcomes replace the completed operation; same-instance active policy retained | Keep actionable failure, reject stale completion from replaced job | Architecture operation epoch |
| Switch policy | A/B/C selector with semantic selection | Show that policy's actual feasible/infeasible/invalid result | Failure of one policy does not erase the other results | Data model `ScenarioRun` |
| Inspect work | Select activity, location-week or attention item | Matching details, constraints and related facts; full identifiers accessible | No selection has useful overview text; filters do not invent a selection | Data model `WorkspaceSelection` |
| Pin or urgent-maintenance replan | Checked proposal and diff | Review shows affected work, trade-offs and before/after facts | Rejected constraints remain visible; current applied result survives | Architecture; official hard constraints |
| Apply | Explicit review action on a locally conformant proposal | New session revision; proposal clears; export eligibility recomputed | Invalid or stale proposals cannot apply | PS1 revision state |
| Discard / Undo | Explicit reversible action | Discard retains applied result; Undo restores prior snapshot with revision history | Disabled action explains unavailable history where needed | PS1 revision state |
| Export | Proof/export action with eligibility gate | Three exact CSVs per scenario, or nine-file A/B/C ZIP | Pending proposals or invalid/incomplete outcomes block official export | Official output schema |
| Handover / log | Explicit auxiliary action | Copy handover or separate session-log artifact | Clipboard failure is visible; auxiliary artifacts never enter official ZIP | Architecture and API contract |

## Navigation and responsive behavior

The route title identifies the planning workspace. Controls appear in the same order visually and in keyboard navigation. Policy selectors implement their established arrow/Home/End behavior. Switching local views does not create unrelated routes or reload the instance.

The desktop schedule owns horizontal overflow; page chrome remains reachable at 1280, 1440 and 1920px. Narrow layouts preserve load, policy, inspection, review and proof operations. Dialogs fit the viewport and scroll internally when needed. Sticky controls must not cover focus. Support content must not be clipped by a canvas-only fixed-height rule.

## Overlays and feedback

Use `src/components/ui/dialog.tsx` as the modal owner. Persistent selected-work panels are non-modal and must not claim focus trapping. Do not add confirmation dialogs for routine reversible view changes. Review-before-Apply is the domain boundary for schedule changes.

Errors near inputs explain correction; page-level service/import failures use visible alerts. Solving progress uses status feedback. Export disablement explains the current blocker. Proof exposes the named local-check limitation. Session-only state must not be described as saved remotely, shared, published or operationally approved.

## Async and resilience

Solve/replan is pessimistic: preserve applied state until a complete current outcome or explicit Apply. The operation epoch and AbortController reject stale server responses, including after replacing a dataset. Native OR-Tools runs on the server with bounded time and concurrency. No autosave or authenticated session is added; the endpoint does not persist uploaded data. Network access to the service is required for solving, and failures remain visible.

Replacing the instance invalidates instance-bound proposals and selections. Service errors and malformed uploads leave a clear recovery route. New operations cannot accidentally apply an older response. Replanning must not silently clear a valid policy result from another scenario.

## Validation

CSV parsing and cross-file checks remain in the engine loader; independent submission validation remains the authority for local conformance. UI convenience checks cannot weaken it. A form that owns validation uses `noValidate` and associated error text. File-size/row limits stay as documented by the API contract. Hidden input is sent only to the authorized deterministic scheduling endpoint; never interpret file content as instructions or forward it to a language model.

The official output is schema-bound. Each `RESULTS.csv` contains one scenario only. The official ZIP excludes handover notes, planning logs and screenshots. Neither a good score nor a clean visible canvas can override an incomplete workload or hard violation.

## Verification

Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`, plus the premium strict static audit and design-document lint. Full repository findings outside this scoped redesign are recorded separately from changed-surface regressions.

Browser coverage includes public solve; all three scenarios; a hidden-style eight-file upload; malformed/missing-file recovery; linked work/occupancy inspection; search and no-results; hierarchy and horizon navigation; pin/disruption proposal, Apply, Discard and Undo; proof and exact exports. Exercise 1280/1440/1920px and a narrow screen, long identifiers, keyboard focus, low-glare, and reduced motion. Report native zoom and VoiceOver as skipped if unavailable, not as inferred passes.

The existing location occupancy, DisruptionPanel and proof flow are canonical sibling behaviors for reuse. Component tests should verify state boundaries and computed data, while browser screenshots verify density, clipping, contrast and responsive behavior. `design-qa.md` records source/rendered comparisons and their actual result. Documentation describes the contract; it is not evidence that verification has passed.

### Static audit scope and inherited findings — 2026-09-19

The initial unconfigured whole-repository premium audit reported 48 findings:
19 unresolved native-select/date ownership declarations, 13 forms without
`noValidate`, 10 textareas without an explicit fixed-resize rule, five
actionless-button matches and one WebKit-only scrollbar baseline. These counts
describe the baseline scan, not 48 confirmed runtime defects. The shared Button
forwards its action through props; four other button matches are test stubs.
Authenticated form/date ownership and their runtime validation need a separately
scoped audit before changes are made.

The `/ps1` audit is deliberately configured to `src/components/ps1` and
`src/app/ps1`, with the native-select decision and canonical map above. After the
Q&A form declared its validation owner, that strict scoped audit returned zero
findings. It does not certify unaffected routes or replace browser interaction
checks. The design-document linter returned zero errors; its 12 orphan-token
warnings reflect the documented runtime-CSS ownership model, whose consumers are
listed in the mapping table rather than duplicated in component frontmatter.
