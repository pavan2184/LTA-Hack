# RailPlan project handoff

Last updated: 15 September 2026 (Singapore)

Application version: `0.4.0`

Repository: <https://github.com/pavan2184/LTA-Hack>

Production: <https://railplan-nine.vercel.app>

Production deployment: `dpl_7pMBfJBr7bfHNMori2uQ2JhfjWvu` (`Ready`)

Deployed source commit: `ef727b0a25cfa25bb026a9c3da189e9e58cd8a1e`

## 1. Executive summary

RailPlan is a non-operational rail-maintenance planning prototype for two user
groups:

- planners, who review requests, resolve conflicts, generate and publish an
  engineering-night plan; and
- contractor organisations, which prepare requests and see their own published
  slots.

The latest work turns the project from a collection of partly disconnected
workspaces into one role-aware product. It introduces a shared white, light-grey
and blue visual system; connects the request-to-publication journey; makes Night
overview the authoritative saved-planning workspace; and preserves the sandbox as
a separate, clearly fabricated place for experimentation.

The final GitHub reconciliation resolved 29 textual conflicts and combined the
approved local work with upstream `main`. Open PR #27, which adds contractor
schedule acknowledgements, was deliberately excluded. The reconciled result was
pushed to `main` and explicitly deployed to Vercel.

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
| `/` | Authenticated users | Role-aware Home guide explaining preparation through tracking. |
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

## 6. Planning, persistence and workflow changes

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

## 7. API changes and trust boundaries

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

## 8. Authentication, security and privacy

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

## 9. Architecture map

| Area | Main location | Responsibility |
| --- | --- | --- |
| Domain engine | `packages/core/src` | Serializable facts, validator, heuristic solver, metrics, alternatives, explanations and conflict grouping. |
| App routes | `src/app` | Role-gated pages and authenticated HTTP boundaries. |
| Saved planning | `src/lib/plans`, `src/components/plans` | Overview reads, analysis, immutable generation, review and publication UI. |
| Requests | `src/lib/requests`, `src/components/requests` | Intake, immutable revisions, private proposals and review journeys. |
| Sandbox state | `src/store/useRailPlanStore.ts` | Fabricated inputs, results, pins, filters, scenarios and guarded async state. |
| Navigation | `src/components/layout`, `src/lib/navigation`, `src/lib/auth` | Shared shell, URL context, redirects, dirty-state guards and safe returns. |
| Persistence | `src/lib/db`, `supabase/migrations` | Authenticated transactions, RLS-backed workflows and source revisioning. |
| Tooling | `scripts/db`, `scripts/e2e` | Migration, seed/parity, authorization, concurrency and authenticated HTTP verification. |

The core invariant is: the solver proposes, but the independent validator decides
whether a complete result is feasible. UI state, AI output and stored metrics are
never treated as the feasibility authority.

## 10. Important implementation decisions

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

See `docs/DECISIONS.md` for the full rationale and superseded historical choices.

## 11. Verification completed for the reconciled release

The final reconciliation was verified with:

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

The final Vercel deployment compiled successfully, completed TypeScript and static
page generation, and reached `Ready` in 48 seconds. Post-deployment probes returned
HTTP 200 for `/`, `/login` and `/sandbox`. No runtime errors were observed during
those probes.

The first full reconciliation run had three failures caused by tests asserting
superseded UI structures. The tests were rewritten around the approved server
preview, dedicated notification settings page and explicit discard guard. They
were not removed to make the suite pass.

## 12. Verification limitations and known risks

- No operational LTA rules or real maintenance data have been validated.
- The heuristic produces a feasible candidate within the encoded model; it does
  not prove global optimality. CP-SAT remains a future benchmark candidate.
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

## 13. Deliberately excluded or deferred work

- PR #27 contractor schedule acknowledgements.
- Named-worker scheduling, leave, personal qualifications or location tracking.
- Saved-plan import into the sandbox or sandbox publication.
- Direct duration/track editing through the timeline.
- Audio ingestion until consent, retention and deletion policy is approved.
- External source integrations until provider, scope and data handling are agreed.
- CP-SAT replacement; benchmark it against the current heuristic first.
- Any claim of operational safety approval or automatic execution.

## 14. How to run the project

Use Node.js 22.13+ on the Node 22 line, or Node 24, with npm. The project runs
directly in Node; Docker is not part of the supported workflow.

```bash
npm ci
cp .env.example .env.local
npm run db:migrate
npm run db:verify
npm run dev
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

## 15. Environment configuration

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

## 16. Git and deployment record

- `18c32d3`: complete local checkpoint before upstream reconciliation.
- `e3e7cc8`: carry-forward source revision identity correction.
- `1fc5441`: reviewed carry-forward workflow and verification.
- `c70ecef`: upstream `main` used for the final merge.
- `ef727b0`: reconciled merge, pushed to `origin/main` and deployed.

Recoverable backup refs were retained:

- `refs/codex-backups/pre-sync-20260915`
- `refs/codex-backups/reconciliation-checkpoint-20260915`

The production alias is `https://railplan-nine.vercel.app`. Deployment was made
with pinned Vercel CLI `50.1.6`; the remote build used Vercel CLI `59.16.0` and
detected Next.js `16.3.4`.

## 17. Recommended next steps

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

## 18. Source-of-truth documents

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
