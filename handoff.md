# RailPlan project handoff

Last updated: 18 September 2026 (Singapore)

Application version: `0.4.0`

Repository: <https://github.com/pavan2184/LTA-Hack>

Production: <https://railplan-nine.vercel.app>

Production deployment: Vercel Git deployment from `main` (`Ready`)

PS1 implementation merge commit: `cc004c73af0efde968b85f82e3068fbaf68eb318`

## 1. Executive summary

RailPlan is a non-operational rail-maintenance planning prototype for two user
groups:

- planners, who review requests, resolve conflicts, generate and publish an
  engineering-night plan; and
- contractor organisations, which prepare requests and see their own published
  slots.

The product now contains two deliberately separated planning surfaces. The
authenticated RailPlan workspace connects the request-to-publication journey and
keeps Night overview as the authoritative saved-planning surface. The public
`/ps1` workspace solves the NebulaX PS1 challenge entirely in the browser, with a
hardened local conformance validator, deterministic multi-start optimiser,
linked operations workspace and exact nine-file submission export. Both use the
same white, light-grey and blue design system, while the sandbox remains a
separate, clearly fabricated place for experimentation.

The original GitHub reconciliation resolved 29 textual conflicts and combined
the approved local work with upstream `main`. Open PR #27, which adds contractor
schedule acknowledgements, was deliberately excluded. The PS1 hardening and
workspace release was then merged through PR #34, deployed from `main`, and
smoke-tested at the canonical production URL.

## 2. Product boundary

RailPlan helps a scheduler reconcile four interacting concerns:

1. access to atomic track blocks and shared conflict zones;
2. compatibility between simultaneous work classes;
3. team, skill, equipment and anonymous workforce capacity; and
4. request timing, clearance, dependencies and handback.

The planning engine and validator are deterministic TypeScript. Generative AI is
optional and may extract supported request fields or phrase an explanation; it is
not allowed to approve a request, establish feasibility, invent an operating rule
or certify railway safety.

The PS1 assistant is not generative. It answers only supported question
categories from solver, validator and revision facts already in memory. It cites
the relevant activities, contracts, locations, weeks and objective terms, and
returns its supported categories for an unsupported question.

All baseline requests, topology, workforce and scenario data are fabricated. The
geographic view is illustrative and is not an operational network map. A plan is
an aid to human coordination, not permission to access track or carry out work.

## 3. Current user journey

### Planner journey

1. Start at Home for a six-step guide to the product.
2. Review submitted work in Request review.
3. Assign scheduling and safety fields, then approve, return or reject the exact
   immutable request revision.
4. Open Night overview with the selected night, plan version and request retained
   in the URL.
5. Review requested-time clashes, inspect all underlying rules, and preview a
   server-validated repair without changing the saved plan.
6. Generate and inspect a draft, compare objectives, pin exact commitments, review
   workforce/geography/calculations, and save a new immutable version.
7. Publish only a fresh, complete, independently validated version. Notification
   delivery is tracked separately from publication.
8. Revisit Plan history, coordination cases, deferred work or notification
   settings through the shared navigation.

### Contractor journey

1. Start at Home or the contractor workspace.
2. Create a structured request, or prepare a private proposal from meeting text.
3. Review the proposal before explicitly submitting it.
4. Follow the exact submitted request and its status through URL-addressable
   selection.
5. See only the organisation's published slots and organisation-scoped
   coordination information.

Contractor intake approval and coordination confirmation are different concepts.
A request must be approved before it becomes a planning input. A coordination
proposal may remain visibly pending organisation confirmation without blocking a
planner from applying or publishing it; the planner records approval after the
organisation confirms through its established process.

## 4. Page and route map

| Route | Role | Purpose and current behaviour |
| --- | --- | --- |
| `/` | Public entry | Product landing page with direct access to the public PS1 scheduler and authenticated RailPlan entry. |
| `/ps1` | Public | Browser-only NebulaX PS1 solver, local conformance validator, linked operations workspace and official submission export. |
| `/login` | Public entry | Supabase sign-in with a safe, role-checked local return path. |
| `/plans` | Planner | Night overview: queue, engineering timeline, inspector, plan controls and publication journey. |
| `/plans/history` | Planner | Cursor-paged immutable plan history and exact version reopening. |
| `/plans/coordination` | Planner | Versioned coordination proposals, organisation response state and Apply. |
| `/plans/deferred` | Planner | Durable backlog, ownership, due dates and reviewed carry-forward preparation. |
| `/requests` | Planner | Review workspace plus planner-created request intake. |
| `/requests/drafts` | Planner | Planner's private transcript-derived proposal drafts. |
| `/settings/notifications` | Planner | Organisation delivery configuration and test controls with unsaved-change protection. |
| `/sandbox` | Planner | Fabricated, non-persistent queue–timeline–inspector planning laboratory. |
| `/sandbox/requests` | Planner | Compatibility redirect to `/sandbox#sandbox-requests`. |
| `/sandbox/schedule` | Planner | Compatibility redirect to `/sandbox#sandbox-schedule`. |
| `/sandbox/resources` | Planner | Compatibility redirect to `/sandbox#sandbox-resources`. |
| `/sandbox/conflicts` | Planner | Compatibility redirect to `/sandbox#sandbox-conflicts`. |
| `/sandbox/scenarios` | Planner | Compatibility redirect to `/sandbox#sandbox-scenarios`. |
| `/contractor` | Contractor | Organisation-scoped request workspace and published slots. |
| `/contractor/drafts` | Contractor | Organisation owner's private transcript-derived drafts. |

The shared navigation uses consistent labels and active states. Planner navigation
connects Home, Night overview, Request review, Plan history and Demo sandbox, with
notification settings in the header. Contractor navigation omits planner-only
destinations.

Relevant navigation context is retained with query parameters. Night, saved plan,
intake request and engine request selection are separate identifiers. Refresh,
direct links, Back and Forward restore the intended selection. Forms, previews and
settings guard against leaving with unsaved changes. Unsafe or cross-role login
return paths are rejected.

## 5. UI and experience changes

### Shared visual system

- Replaced page-specific warm/beige styling with shared white and light-grey
  surfaces, blue primary actions and pale-blue selection states.
- Preserved meaningful warning, validation and MRT/sector colours.
- Standardised typography, buttons, cards, tabs, form controls, loading states,
  empty states, errors, access-denied states and portal-rendered dialogs.
- Removed duplicate page headers in favour of one role-aware shell.
- Added a short purpose description at the beginning of each main page.
- Made the authenticated Home page explain the entire request-to-publication flow.

### Night overview

- Uses the approved work-request queue, large block-based engineering timeline and
  persistent request inspector layout.
- Shows actual saved-plan metrics rather than illustrative values.
- Displays work and clearance separately; deferred work never appears as a
  scheduled bar.
- Keeps Workforce, Geography and Calculations as linked views for the selected
  request.
- Gives the engineering timeline more vertical space.
- Makes Workforce availability a compact disclosure that expands on click or
  keyboard activation while preserving its filters.
- Supports objective comparison, exact pins, change review, plan history, exports,
  publication review and delivery status.
- Adds a clear `Add request` entry point. It reuses the audited intake workflow at
  `/requests?request=new`; it does not inject unreviewed work into a plan.

### Requested-time conflicts and repairs

- Conflict counts represent grouped clashes, while all underlying rule findings
  remain inspectable.
- Unplaced work is presented alongside conflicts rather than hidden elsewhere.
- The Night overview can request a server-side review of original requested times,
  with current exact pins overlaid.
- A selected conflict is recomputed on the server. The recommended time becomes a
  proposed pin and passes through the full solver and independent validator.
- A successful repair opens the existing change-review dialog as an unsaved
  preview. It never silently modifies or publishes the saved plan.
- Stale plans, changed source facts, engine mismatches and superseded versions
  disable unsafe repair or publication actions.

### Sandbox

- Retains one dashboard instead of the upstream six-page split.
- Uses the same queue, timeline, request header and inspector presentation as Night
  overview, backed only by fabricated in-memory data.
- Keeps conflict repair, alternatives, pins, five objectives, workforce,
  geography, calculations, disruptions, emergency work and the grounded assistant.
- Enlarges the engineering timeline and makes Workforce availability expandable.
- Keeps adjustable queue and inspector widths where compatible.
- Adds named anchors and compatibility redirects from the former sandbox routes.
  Loading an anchor reveals and focuses the relevant section.
- Clears transient filters, assistant state and unowned demo pins on the first
  session or actor change. Epoch guards prevent late async results from restoring
  stale state after reset or account change.

### Timeline drag proposals

- Generated sandbox bars can be moved horizontally with pointer or keyboard input.
- Movement snaps to the configured 15-minute planning interval and moves all linked
  block bars together.
- Dragging proposes a pin to the normal solver; it does not directly edit a
  placement.
- The user reviews the complete validated reflow before explicit Apply.
- One guarded Undo restores the prior result and pins.
- Pinned work, forced scenario work and saved-plan timelines remain non-draggable.
- Duration and track assignment cannot be changed by dragging.

### Request workspaces

- Planner and contractor workspaces share clearer status language and searchable,
  role-appropriate action filters.
- Request and private-draft selections are URL-addressable and can load a record
  even when it is not in the current bounded list.
- Transcript submission opens the exact submitted request.
- Planner approval offers a contextual route back to the selected engineering
  night.
- Published-plan references are actionable for planners. Contractors see only
  their organisation's slot details and never receive planner-only plan data.
- Clock inputs explicitly distinguish midnight, next-day times and unknown values.
- Unsaved creation, correction and transcript edits are protected during navigation.

## 6. Public PS1 scheduler and operations workspace

### Runtime and privacy boundary

- `/ps1` is public and requires no account. Instance parsing, solving,
  validation, explanations and revision history run locally in the browser.
- Solves run in a Web Worker. Starting another solve replaces and terminates the
  previous worker; test environments without Worker support use the same engine
  through a main-thread fallback.
- Plans, pins, disruptions and history are session-only and are cleared by a
  refresh. No PS1 database, authentication flow, secret or environment variable
  was introduced.
- Uploads are limited to 5 MB per file and approximately 50,000 total rows. The
  UI reports actionable errors instead of attempting an unbounded parse.

### Instance and submission boundary

- `packages/ps1/src/io/csv.ts` is the shared RFC-style CSV implementation. It
  supports quoted fields, doubled quotes, embedded newlines and CRLF/LF, and
  enforces exact headers and row widths.
- All eight instance files reject duplicate identifiers or parameters, missing
  and ambiguous records, invalid integers/ranges/booleans/dates, invalid foreign
  keys, inconsistent activity types, self-predecessors and predecessor cycles.
- Submission parsing preserves the official wire format and exact column order.
  It requires one RESULTS row per contract under one scenario and recomputes
  every completion date, overrun and objective input rather than trusting the
  submitted values.
- Access rows require integer weeks/nights, one row per activity/week,
  contiguous unique `access_seq` values and a night within the applicable
  contract/type/week possession count. A row can satisfy workload only once.
- Occupancy is reconstructed from each access location, direction, workfront,
  buffers, Live mirroring and interchange effects. Missing, duplicate, extra and
  orphan occupancy rows are hard failures.
- Scenario C's two-week ECLO window is validated against every affected line,
  including cross-line effects created by Live work. Official Scenario A/B/C
  capacity, co-sharing and objective semantics remain unchanged.

### Local conformance boundary

Closure expansion is one authoritative implementation shared by the solver,
validator, timeline, schematic network and explanations. The checker is labelled
`local conformance validator`: the official output identifies `access_night`
only within contract/type possessions, so a global physical night cannot be
reconstructed across contracts. The UI and `ValidationReport` disclose
`cross_possession_night_alignment` as undecidable instead of inventing a
cross-contract collision rule. If the organiser supplies a reference validator,
it should become a final gate without changing the nine-file submission format.

### Deterministic optimiser

- Activities are scheduled in deterministic topological order, so every
  predecessor completes before its successor starts.
- The optimiser runs 24 seeded construction starts using deadline, slack,
  priority, bottleneck, duration and predecessor-aware orderings, followed by a
  bounded reconstruction/local-neighbour search. The configured ceiling is
  2,500 evaluations; the public instance currently completes after 120.
- Candidate moves cover week shifts, ordering/repacking choices, co-sharing,
  ECLO and excess-possession trade-offs. Every incumbent is validated and only a
  feasible score improvement can replace it.
- Scenario B no longer has the artificial `supply + 2` cap. It may buy all
  required excess possessions and pays the official objective cost.
- Scenario C evaluates ECLO, extra nights, co-sharing and delay by their actual
  objective deltas rather than disabling ECLO.
- `horizon_weeks` is the hard output boundary. An instance that cannot be
  completed within it returns a non-submittable `INFEASIBLE` outcome instead of
  rows the validator would reject.
- Pins and disruptions are hard constraints. An unsatisfiable proposed revision
  returns diagnostics and cannot be applied or downloaded.
- Repeated runs with the same input/options produce byte-identical CSV output.

The public-instance objectives remain A 25.2, B 44 and C 39.2.

### RailPlan-inspired workspace

- A comparison header shows feasibility, objective, overrun, excess nights,
  ECLO use, access-nights and solver effort for all scenarios without ranking
  scores that use different rules.
- The searchable activity/contract queue filters Late, Pinned, Live, ECLO,
  Disrupted and Warning items and stays linked to timeline and inspector
  selection.
- The central location-by-week possession timeline exposes capacity pressure,
  filters and selection without fabricating geographic coordinates.
- A sticky inspector provides accessible Summary, Why, Network and Changes tabs.
  The schematic dual-line network is derived only from uploaded locations and
  the authoritative closure expansion, including workfront, buffers, Live
  mirroring, interchange effects, disruptions and capacity pressure.
- Scenario and inspector tabs implement tab/tabpanel relationships and keyboard
  navigation. The workspace has responsive desktop/mobile layouts and labelled
  interactive controls.
- Deterministic Q&A explains placement or movement, contract overrun,
  bottlenecks, scenario differences, pins/disruptions, and ECLO/excess use from
  computed facts. It never speculates outside those categories.

### Reviewed changes, history and export

- Pins, unpins and disruption replans produce a comparison preview before they
  affect the active plan. The preview reports score/feasibility changes, changed
  completion dates, moved activities/accesses, churn and validation changes.
- Apply creates an in-memory revision. Undo restores the preceding revision.
  The Changes inspector and exported `PS1_PLANNING_LOG.json` record the session.
- The planning log is never added to the official submission ZIP.
- CSV and ZIP actions are disabled for pending, invalid or incomplete scenarios.
  The official ZIP contains exactly `A/`, `B/` and `C/`, each with
  `RESULTS.csv`, `SCHEDULE_ACCESS.csv` and `SCHEDULE_OCCUPANCY.csv`.

### Public PS1 interfaces

- `SolveOutcome` distinguishes `FEASIBLE`, `INFEASIBLE` and
  `INVALID_INSTANCE`, with optional submission, score, diagnostics, warnings,
  starts, candidates and elapsed time.
- `SolveOptions` carries scenario, pins, disruptions and the deterministic
  optimisation budget.
- `ValidationReport` includes local-conformance status and undecidable-rule
  disclosures.
- `PlanRevision` and `PlanDiff` represent review/apply/undo state, score deltas,
  churn and validation changes.
- `QaAnswer` contains answer text, supporting facts and linked entities.
- The official `Submission` wire type and published CSV schemas did not change.

## 7. Planning, persistence and workflow changes

### Saved planning

- `/plans` is the authoritative persisted-planning workspace.
- Server generation saves immutable facts, normalized parameters, result,
  assessment, engine versions, source revision and input digest.
- Read-only previews are separated from the saved snapshot in client state.
- An `expectedBasis` binds a save to the exact previewed source, engine and
  parameters. `basedOnPlanId` records version lineage without becoming a solver
  input.
- Current publication lookup is independent of paginated plan history.
- Missing mandatory work, critical violations, stale source facts or an engine
  mismatch prevents publication.

### Coordination

- Coordination cases retain immutable proposal revisions, organisation participant
  snapshots, append-only events and an exact applied-plan link.
- Proposal impacts include every changed placement or deferral.
- Organisation confirmation is revision-bound and informational. Pending,
  approved and changes-requested states remain visible.
- `Apply` re-solves current facts, checks reviewed result and impact digests, and
  creates a linked saved draft atomically. Publication remains a separate action.
- Contractors receive a narrow organisation-scoped projection without other
  organisations, global proposals or planner-only notes.

### Deferred work and carry-forward

- Repeated deferrals are tracked in a durable backlog using stable request/work
  identity, not titles.
- Backlog items carry ownership, SGT due date, priority, threshold, proposed night,
  optimistic version and append-only events.
- Publication records effective placed/deferred outcomes; later corrections do not
  erase history.
- Scheduled is a projection of the current publication. Completion and
  cancellation remain explicit lifecycle decisions.
- Carry-forward prepares a linked ordinary intake draft on a strictly later
  configured engineering night. Preparation does not approve or retire work.
- Approval validates the target request, dependencies, the exact current source
  publication and source generation before switching the active occurrence.
- Retired seeded/input records and old saved plans are preserved for audit rather
  than deleted.

### Planner-created requests

- Planners may initiate a request from Night overview and choose an existing
  contractor organisation.
- The server verifies the planner profile and trusted organisation catalogue.
- The new request is an audited draft revision and still requires the normal
  submission/review/approval lifecycle.
- Contractor creation continues to derive organisation from the authenticated
  profile; a client cannot override it.

## 8. API changes and trust boundaries

The current public application routes are under `src/app/api`. The main additions
or extensions are:

- `GET/POST /api/plans` and `/api/plans/overview` for saved-plan generation,
  summaries and night context;
- `/api/plans/[id]/analysis` for trusted server inspection, requested-time conflict
  review, bounded repair previews and objective/pin previews;
- `/api/plans/[id]/publish`, `/export`, `/notifications` and `/decisions` for the
  immutable release journey;
- `/api/coordination` and `/api/coordination/[id]/actions` for revisioned
  coordination;
- `/api/deferred-work` and `/api/deferred-work/[id]/actions` for backlog and
  carry-forward operations;
- `/api/requests`, `/api/requests/[id]`, `/actions` and `/catalogue` for scoped
  intake/review; and
- `/api/ingestions/*`, `/api/notifications/*` and `/api/assistant` for private
  proposals, delivery configuration and grounded explanations.

Strict schemas reject unknown or client-computed analysis fields. The repair API
accepts only the strategy, exact locks and a bounded violation identifier. It loads
facts and recomputes the finding on the server. Browser state is never an
authorization source.

PS1 deliberately adds no API route. Its instance and submission files never
cross an application HTTP boundary: parsing, solving, validation, deterministic
Q&A and export all execute in the browser bundle.

## 9. Authentication, security and privacy

- Supabase Auth verifies identity; a trusted profile supplies the planner or
  contractor role.
- PostgreSQL RLS protects planning facts and workflow records. Contractors cannot
  read the global planning instance or another organisation's data.
- Authentication return paths are allowlisted local workspace routes with bounded
  navigation identifiers. External, encoded, malformed and cross-role destinations
  are rejected.
- Secrets remain server-side. Never commit `.env.local`, database credentials,
  provider tokens or the ignored shared-demo credential file.
- Transcript extraction retains supported fields and bounded evidence excerpts,
  not the full meeting source.
- Workforce is anonymous aggregate capacity. The project does not store named
  workers, personal locations, leave or individual qualifications.
- Notification publication and Telegram delivery are separate states. Delivery
  failure does not roll back an otherwise valid publication.
- The assistant can read computed output and phrase an answer but cannot mutate a
  plan or bypass the validator.
- The reconciliation introduced no RLS relaxation, authentication policy change or
  client-side scheduling authority.
- PS1 is an explicit public, browser-only exception to the authenticated RailPlan
  boundary. It has no persistence or external assistant, rejects oversized and
  malformed uploads before solving, and does not log uploaded instance contents.

## 10. Architecture map

| Area | Main location | Responsibility |
| --- | --- | --- |
| Domain engine | `packages/core/src` | Serializable facts, validator, heuristic solver, metrics, alternatives, explanations and conflict grouping. |
| PS1 engine | `packages/ps1/src` | Official instance/submission I/O, closure expansion, deterministic optimiser, scoring, local conformance validation, revisions and grounded Q&A. |
| PS1 worker/UI | `src/workers/ps1.worker.ts`, `src/components/ps1` | Browser worker orchestration, scenario comparison, queue, timeline, inspector, review/apply/undo and exact submission export. |
| App routes | `src/app` | Role-gated pages and authenticated HTTP boundaries. |
| Saved planning | `src/lib/plans`, `src/components/plans` | Overview reads, analysis, immutable generation, review and publication UI. |
| Requests | `src/lib/requests`, `src/components/requests` | Intake, immutable revisions, private proposals and review journeys. |
| Sandbox state | `src/store/useRailPlanStore.ts` | Fabricated inputs, results, pins, filters, scenarios and guarded async state. |
| Navigation | `src/components/layout`, `src/lib/navigation`, `src/lib/auth` | Shared shell, URL context, redirects, dirty-state guards and safe returns. |
| Persistence | `src/lib/db`, `supabase/migrations` | Authenticated transactions, RLS-backed workflows and source revisioning. |
| Tooling | `scripts/db`, `scripts/e2e` | Migration, seed/parity, authorization, concurrency and authenticated HTTP verification. |

The core invariant is: a solver proposes, but the corresponding independent
validator decides whether a complete result is feasible. PS1 additionally uses
one closure expansion everywhere that occupancy is computed or explained. UI
state, AI output and stored metrics are never treated as the feasibility
authority.

## 11. Important implementation decisions

- Keep one sandbox dashboard and redirect former subpages to sections.
- Keep saved planning and sandbox state separate even when navigation carries the
  same night/request context.
- Keep the Night overview's server-preview model instead of adopting a duplicate
  client-side revision editor.
- Count distinct clashes for headline UX while retaining every rule finding.
- Treat drag-and-drop as a reviewed solver proposal, not direct chart mutation.
- Treat organisation coordination confirmation as informative, not a publication
  permission gate.
- Use normal intake review for carry-forward rather than directly moving a work
  item between nights.
- Preserve immutable histories and append corrections instead of rewriting records.
- Remove the speculative “planner time saved” metric because it lacked measured
  evidence.
- Exclude PR #27 contractor acknowledgements until it is separately reviewed and
  approved.
- Keep PS1 browser-only and session-only; do not add auth, persistence, external
  LLM calls or secrets to a hidden-instance workflow.
- Enforce `horizon_weeks` as the submission boundary until an organiser validator
  proves overflow weeks are legal.
- Describe PS1 validation as local conformance and disclose rules the official
  output cannot decide; do not fabricate global night alignment.
- Keep closure expansion authoritative across solving, validation, visualisation
  and explanations.
- Require review before applying pins or disruptions, and keep the auxiliary
  planning log outside the official submission archive.

See `docs/DECISIONS.md` for the full rationale and superseded historical choices.

## 12. Verification completed for the current release

The PS1 hardening and workspace release was verified with:

- full Vitest run: 963/963 tests passed across 113 files;
- focused PS1 engine/UI regression run: 136/136 passed across 13 files;
- strict parser and integrity fixtures for quoted CSV, numeric/range/reference
  failures, duplicate parameters and predecessor cycles;
- validator regressions for forged RESULTS, invalid nights, duplicate workload,
  non-contiguous sequences, occupancy reconciliation and Live/ECLO cross-line
  windows;
- solver regressions for deterministic byte-identical output, strict horizons,
  congestion, reordered identifiers, Scenario B demand and Scenario C trade-offs;
- review/apply/undo, grounded Q&A, invalid-download blocking, worker progress and
  exact ZIP-content coverage;
- lint, TypeScript and Next.js production build: passed;
- public-instance score gates: A 25.2, B 44 and C 39.2;
- GitHub post-merge CI: passed; and
- production HTTP and browser checks: `/` and `/ps1` returned 200, the Web Worker
  solved all scenarios, the linked operations workspace rendered, deterministic
  Q&A cited schedule facts, and the official ZIP action completed.

The current Vercel Git deployment reached `Ready` from `main` and the canonical
production alias served the new `/ps1` content. The earlier RailPlan reconciliation
was separately verified with:

- full Vitest run: 820/820 tests passed across 98 files;
- independent-session concurrency: 13/13 passed across five files;
- authenticated production HTTP journeys: 6/6 passed across two files;
- focused final sandbox anchor regression: 9/9 passed;
- lint: passed;
- TypeScript/production build: passed;
- hosted database parity: `fnv1a:8c4a9050cfea5e8b`, 22 requests;
- independent code review: no critical or important regression found; and
- browser checks at 1440×900 and 390×844: no document overflow, expandable
  workforce, keyboard dialog focus, working legacy redirects/anchors, correct
  white surfaces and consistent fabricated emergency data.

That earlier Vercel deployment compiled successfully, completed TypeScript and
static page generation, and reached `Ready` in 48 seconds. Its post-deployment
probes returned HTTP 200 for `/`, `/login` and `/sandbox`.

The first full reconciliation run had three failures caused by tests asserting
superseded UI structures. The tests were rewritten around the approved server
preview, dedicated notification settings page and explicit discard guard. They
were not removed to make the suite pass.

## 13. Verification limitations and known risks

- No operational LTA rules or real maintenance data have been validated.
- The heuristic produces a feasible candidate within the encoded model; it does
  not prove global optimality. CP-SAT remains a future benchmark candidate.
- The PS1 optimiser is deterministic and bounded, but still heuristic; a feasible
  outcome is locally conformant, not a proof of global optimality.
- Cross-contract physical-night collisions are undecidable from the official PS1
  files because they expose no global night identifier. An organiser reference
  validator has not been provided, so local conformance remains the release gate.
- Synthetic hidden-instance fixtures cover malformed inputs, congestion and
  trade-offs, but the actual private judging instances were not available.
- Reduced meeting time and planner effort are hypotheses, not measured outcomes.
- Live Anthropic success and a real Telegram delivery were not exercised in the
  final controlled-provider suite.
- The final browser pass did not include VoiceOver, a genuine token-expiry wait,
  every contractor page manually, or a complete 1920px/zoom sweep.
- The existing saved plan used during manual checks was stale, correctly disabling
  repair. A new durable user plan was not created solely for the browser check.
- Public redistribution of the geographic snapshot remains blocked until its
  conflicting source reuse notices are resolved.
- The Codex Vercel connector is authenticated to a different team. The deployment
  succeeded with the repository's local Vercel credentials for
  `pavanmadhup-1254s-projects/railplan`.
- Vercel reported two dependency install scripts pending `allowScripts` review
  (`esbuild` and `unrs-resolver`). The production build still passed; review this
  policy before changing package installation behaviour.

## 14. Deliberately excluded or deferred work

- PR #27 contractor schedule acknowledgements.
- Named-worker scheduling, leave, personal qualifications or location tracking.
- Saved-plan import into the sandbox or sandbox publication.
- Direct duration/track editing through the timeline.
- Audio ingestion until consent, retention and deletion policy is approved.
- External source integrations until provider, scope and data handling are agreed.
- CP-SAT replacement; benchmark it against the current heuristic first.
- Any claim of operational safety approval or automatic execution.
- Any claim that the PS1 local checker decides global physical-night alignment.
- Importing RailPlan's authenticated APIs, Supabase data or minute-level models
  into the PS1 browser-only surface.

## 15. How to run the project

Use Node.js 22.13+ on the Node 22 line, or Node 24, with npm. The project runs
directly in Node; Docker is not part of the supported workflow.

```bash
npm ci
cp .env.example .env.local
npm run db:migrate
npm run db:verify
npm run dev
```

Open `http://localhost:3000/ps1` for the public browser-only challenge workflow.
No database or authentication setup is required for that route. The published
instance can also be solved from the command line with:

```bash
npm run ps1:solve
```

Only seed a dedicated empty RailPlan development database:

```bash
npm run db:seed
```

Do not reset or reseed a shared hosted database. Provision confirmed users with
the operator-only script documented in `docs/TEAM_HANDOFF.md`.

Required release checks:

```bash
npm test
npm run test:db
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Database and E2E tests use shared hosted resources and should run serially in a
coordinated window. The E2E harness creates exact temporary fixtures and cleans
them up. Do not use real provider tokens or recipients for the controlled suite.

## 16. Environment configuration

Check `.env.example`; do not invent variable names. The main settings are:

| Variable | Scope |
| --- | --- |
| `DATABASE_URL` | Server-only PostgreSQL/Supabase connection. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Auth endpoint for the same project. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key, never a service-role secret. |
| `ANTHROPIC_API_KEY` | Optional assistant and transcript extraction. |
| `TELEGRAM_BOT_TOKEN` | Optional publication delivery. |

The verified Supabase connection uses the transaction pooler on port 6543 with
certificate and hostname validation. Migration checksums are immutable; add a new
migration rather than editing one already applied.

## 17. Git and deployment record

- `18c32d3`: complete local checkpoint before upstream reconciliation.
- `e3e7cc8`: carry-forward source revision identity correction.
- `1fc5441`: reviewed carry-forward workflow and verification.
- `c70ecef`: upstream `main` used for the final merge.
- `ef727b0`: reconciled merge, pushed to `origin/main` and deployed.
- `985a639`: PS1 parser, validator, optimiser, worker, operations workspace,
  revision/Q&A flows, tests and documentation.
- `f8195c6`: CI timing correction for the complete PS1 pin-review test; no
  production behaviour changed.
- `cc004c7`: PR #34 squash merge to `main`, deployed to production.

Recoverable backup refs were retained:

- `refs/codex-backups/pre-sync-20260915`
- `refs/codex-backups/reconciliation-checkpoint-20260915`

The production alias is `https://railplan-nine.vercel.app`; the public challenge
route is `https://railplan-nine.vercel.app/ps1`. The earlier reconciled release
used pinned Vercel CLI `50.1.6`. The current PS1 release was deployed by the
repository's Vercel Git integration after PR #34 merged. The remote build detected
Next.js `16.3.4`.

## 18. Recommended next steps

### Execution update — 2026-09-16

- **Planner study — prepared, not conducted.** The frozen-night protocol,
  measurements and demo script are in `docs/PLANNER_USABILITY_PILOT.md`.
  A human planner participant is still required.
- **Accessibility — partially completed.** Component tests and browser checks at
  1280, 1440 and 1920px passed without obvious clipping. Complete browser zoom,
  full keyboard traversal and macOS VoiceOver testing remain.
- **Provider testing — controlled tests completed.** Provider-policy tests passed
  3/3 and controlled production E2E passed 6/6. No real provider or recipient was
  used; an explicitly authorized non-production recipient is still required.
- **Geographic permission — outstanding.** Do not publicly redistribute the
  snapshot until reuse permission is resolved.
- **PR #27 — outstanding.** It was not reviewed or merged.
- **CP-SAT benchmark — completed.** The reference model found valid optima of
  19/22 versus the heuristic's 17/22 at baseline, and 18/22 versus 15/22 under
  the shortened window. Both detected the mandatory-block fixture as infeasible.
  CP-SAT was materially slower and increased movement, so it remains an offline
  benchmark rather than a production replacement.
- **Demo — prepared, not recorded.** The storyboard exists and the controlled
  end-to-end journey passed. A human-paced rehearsal and recording remain.
- **PS1 — implemented and deployed.** Parser/validator hardening, deterministic
  optimisation, the browser worker, operations workspace, reviewed changes,
  grounded Q&A and exact export are live. The organiser reference validator and
  actual hidden judging instances remain external dependencies.

Detailed evidence and limitations are recorded in
`docs/RELEASE_VERIFICATION_2026-09-16.md`.

1. Run a short planner usability study using the same night once with the current
   manual process and once with RailPlan. Measure active reconciliation time,
   unresolved clashes, rework and confidence instead of displaying assumed savings.
2. Conduct the remaining accessibility pass with VoiceOver, browser zoom and full
   keyboard traversal at 1280, 1440 and 1920px.
3. Exercise real provider integrations in a controlled, non-production test with
   authorized recipients and review provider/error logging for sensitive content.
4. Resolve geographic-data reuse permission before public redistribution.
5. Review PR #27 as a separate product/security decision; do not merge it implicitly.
6. Benchmark the current deterministic heuristic against a CP-SAT reference on
   known feasible, infeasible and disrupted fixtures.
7. Prepare the 2–3 minute hackathon demonstration around one complete story:
   request → exact clash → reviewed repair → validated version → publication →
   contractor-scoped slot.
8. If the organiser publishes an executable reference validator, add it as the
   final PS1 release/submission gate and reconcile any demonstrated difference
   without changing the official CSV schemas.
9. Re-run the deterministic PS1 property and score suites against any authorised
   hidden or additional benchmark instances before the final judging submission.

## 19. Source-of-truth documents

- `docs/PROJECT_BRIEF.md` — product intent, users, scope and success evidence.
- `docs/ARCHITECTURE.md` — system shape and authoritative boundaries.
- `docs/DATA_MODEL.md` — database and domain identity.
- `docs/API_CONTRACT.md` — HTTP commands, DTOs and permission rules.
- `docs/TESTING.md` — required test coverage and release gates.
- `docs/DECISIONS.md` — accepted design/architecture decisions and rationale.
- `docs/PROJECT_STATUS.md` — dated implementation and verification evidence.
- `docs/SECURITY_REVIEW.md` — threat boundaries and remaining findings.
- `docs/TEAM_HANDOFF.md` — environment, database and identity operations.
- `README.md` — public project overview and basic setup.

If this handoff conflicts with a more specific contract, the current code plus the
corresponding architecture, data model, API contract and decision record are
authoritative. Historical sections are retained for traceability and may describe
superseded UI compositions.
