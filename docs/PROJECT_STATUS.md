# Project Status

Last updated: 2026-09-15

## Current checkout and implemented scope

Local `main` was fast-forwarded from `aa7395f` to `d5e714e` on 2026-09-14,
including PR #22's six sandbox pages. Existing uncommitted saved-plan revision,
guided-workflow, research and documentation changes were restored without conflicts.
Application changes and their accompanying contract edits remain uncommitted;
the backup stash is named `pre-main-sync-2026-09-14`.
The 2026-09-15 context commit contains event/research notes, the status archive,
and documentation navigation only; it does not ship those application changes.
No commit, push or deployment was performed during that synchronization.

Implemented: deterministic validated scheduling; verified planner/contractor
identity and RLS; structured intake and private meeting-text proposals; human
review/approval; anonymous workforce constraints; immutable saved plans and
conflict revisions; publication, scoped notifications and exports; linked
Gantt/workforce/geographic views; guided workflows; six exploratory sandbox pages.
Saved revisions preserve exact pins and parent provenance, independently recompute
on the server, and reject stale/superseded bases. Sandbox edits remain separate
from approved requests and durable plans. See the contracts for implementation detail.

## Latest verification evidence

The 2026-09-14 synchronization run verified the combined checkout:

- `npm test`: 614 tests across 68 files passed, zero skips (including DB integration).
- `npm run db:verify`: 22-request parity, digest `fnv1a:8c4a9050cfea5e8b`.
- `npx vitest run --config vitest.concurrency.config.ts`: 4 tests / 3 files passed.
- `npm run test:e2e`: 4 tests / 2 files passed, with controlled providers.
- Lint, typecheck, production build, geographic snapshot and `git diff --check` passed.
- Visual browser checks, actual screen-reader speech, native 200% workflow and
  live provider delivery were not run in that synchronization session.

These are saved results from this task's prior run, not a fresh 2026-09-15 test run.
Older browser/security/audit results and full implementation evidence are retained
in [PROJECT_STATUS_HISTORY.md](PROJECT_STATUS_HISTORY.md), with their original dates.
A passing controlled provider test does not prove live extraction quality or delivery.

## Remaining work and constraints

- The recorded roadmap has #4–#16 completed and #17 release verification open.
  Actual spoken-reader and native 200% workflow checks remain unverified.
- Then #18 consented audio, #19 scoped imports, #20 CP-SAT benchmark, and #21 a
  separate named-crew go/no-go decision, in numeric order. The previous chat's
  feature suggestions were options, not authorization to implement or reorder them.
- Operator planning rules and anonymized examples remain unavailable. Inputs,
  operational topology and safety assumptions are fabricated; this is a
  non-operational planning prototype, not operational authorization.
- Geographic-source redistribution permission remains unresolved, including for
  submission artifacts. Existing deployment does not establish rights clearance.
- No new live-provider success, user study or measured planner-time saving is
  claimed. The time-saving tile was removed on 2026-09-15 pending a measured
  baseline; the assumed 12 minutes per conflict remains only in the core function.
- Hosted development database; no Docker. Preserve existing user work and use
  `.env.example` for configuration names. Credentials stay in ignored `secrets/`.

## Hackathon context

[NEBULAX_PARTICIPANT_CONTEXT.md](NEBULAX_PARTICIPANT_CONTEXT.md) records the supplied
51-page pack: attendance, deadlines, PS1 submission requirements, logistics, source
provenance and unanswered questions. The submission video is **2–3 minutes**;
the research document's five-minute walkthrough is an internal rehearsal only.
[NEBULAX_PRODUCT_RESEARCH.md](NEBULAX_PRODUCT_RESEARCH.md) retains dated research
and proposals, not additional accepted scope. No submission or organizer contact
has been performed in this context-saving task.

## Deployment and local servers

Last recorded production URL: https://railplan-nine.vercel.app (verified 2026-09-09).
That recorded deployment was `8cbebb1` plus Vercel configuration, not the current
combined checkout. App login remains required; deployment/access have not been
rechecked here. Demo sign-in files remain under ignored `secrets/`; never paste
credentials into these documents or a public submission.

On 2026-09-15 no listener was found on the previously documented preview ports
3010 or 3101. An unrelated Node listener on 8788 was left untouched. Historical
claims that the sandbox server remains running are not current server status.

## Context maintenance — 2026-09-15

Submission assets: `assets/submission/` contains three original campaign PNGs
(Devpost 3:2 cover, wide banner, square social card), draft Devpost/social copy,
alt text and exact built-in image-generation prompts. Visual inspection checked
text and composition; all PNGs are below 5 MB and dimensions were verified.
No geography snapshot, credentials or official logos were used. No submission,
posting or application changes were made; application tests were not rerun for
this artwork/documentation task. The bundle does not replace the required pitch
video or establish that the event's results ZIP requirements are satisfied.

Preserved the original participant PDF byte-for-byte in ignored, owner-readable
`secrets/reference/`; extracted a credential-free working summary. Archived the
entire prior 893-line status file, corrected the stale documentation index and
qualified the research demo duration. Source pages 24–25 were visually checked;
all 51 pages were text-extracted. No application code or existing work was removed.
Documentation checks cover archive fidelity, local links, PDF checksum, ignored
source placement and whitespace. Application tests were not rerun for these docs.

## Contractor schedule and acknowledgement (P3) — 2026-09-15

Implemented the adoption review's third recommendation. Migration
`20260915140000_schedule_acknowledgements.sql` adds an append-only, RLS-scoped
acknowledgement table, the `acknowledge_schedule` function, an `acknowledgement`
field on the derived schedule, and notification text that names work by title and
sector with published and requested times. `POST /api/requests/:id/acknowledge`
records confirmed or cannot-comply answers against the current published version.
Contractors see "Your schedule" first on their workspace with the published time,
the requested time, station names and the two answers; planners see contractor
responses on the published version, with reasons for times that cannot be kept.

Verification (worktree without database configuration): typecheck and lint clean;
`npm test` 576 passed, 53 skipped. New coverage: contractor schedule shows the
published time against the requested time in station names, confirms, requires a
reason to decline, and keeps the answer on a stale-plan conflict; the planner
response panel summarises confirmed, declined and awaiting for the published
version only; a database test covers ownership, planner refusal, reason
validation, latest-answer-wins and re-asking after a new version.

**Database verification is blocked.** On 2026-09-15 the shared RailPlan Dev
database reported an applied migration, `20260915024501_planner_manual_request.sql`,
that exists in no branch of this repository, so `npm run db:migrate` refused to
run and the acknowledgement migration was **not applied**. `npm run test:db` was
run anyway for information: the new acknowledgement test and the two rewritten
notification wording assertions fail as expected against the unmigrated database,
and five unrelated `plans.db` tests timed out at 5 s under the same conditions.
The main checkout was returned to `main`. Whoever applied the missing migration
must commit it before the ledger accepts new migrations; then rerun
`npm run db:migrate` and `npm run test:db` and record the result here.

## Conflicts by root cause, unplaced work first (P2) — 2026-09-15

Implemented the adoption review's second recommendation. The core engine gains
`groupConflicts`, which collapses findings naming the same requests over
overlapping minutes into one clash with the rules it breaks listed beneath, and
`conflictsMetric`, which counts clashes with the raw finding count as its
denominator. The sandbox conflict panel, toolbar, baseline and overview tiles and
the saved-plan revision editor now count and list clashes. The planner-time-saved
tile is removed from the overview; the function remains in the core package for
a measured baseline. "Work without a slot" now sits beneath the conflicts on the
sandbox Conflicts page after a solve and above the saved-plan review panels, with
each row opening the request in the inspector.

Verification (worktree without database configuration): typecheck and lint clean;
`npm test` 570 passed, 52 skipped (database integration files skip without a
connection; no database or service code changed). New coverage: core grouping
collapses the M-008/M-014 block, crew and staffing findings into one clash with
the merged 01:00–02:15 window and is stable across re-validation; the sandbox
toolbar counts clashes and shows "Also breaks"; no estimated figure remains on
the overview; the saved review and revision editor list unplaced work and open
it in the inspector. No browser run for this change.

## Join the halves (P1) — 2026-09-15

Implemented the adoption review's first recommendation on `/plans`. The saved-plan
revision editor now presents, from the approved snapshot: a request queue with
Needs action / All / Pinned filters and deferred, pinned and moved states; the
conflicts in the requested times with the engine's recommended resolution, where
"Apply suggestion" pins the moved request; an inspector with requested versus
proposed time, the counterfactual "why this placement" with the rules that break
at the requested time, pin/unpin/try-requested controls and validated alternative
slots; a "Work without a slot" list with reasons and blocking rules; and the
existing change table and "Save as new draft". The sandbox is no longer in primary
planner navigation; the schedule page links to it as "Try with demo data".

Verification on this branch (worktree without database configuration): typecheck
and lint clean; `npm test` 566 passed, 52 skipped (the database integration
files, which probe for a connection and skip; no database or service code
changed). New coverage: recommended fix becomes a pin, unplaced work listed and
opened in the inspector, moved placement explained by what breaks at the
requested time, sandbox reached from the schedule page only. A fixture-backed
browser check at 1440px confirmed the three-panel layout; no authenticated
browser run. This is a product change on fabricated rules; it is not evidence
that planners complete the journey without help, which the review's adoption
test still has to measure.

## Product adoption review — 2026-09-15

Recorded [PRODUCT_ADOPTION_REVIEW.md](PRODUCT_ADOPTION_REVIEW.md): a candid
assessment of whether planners and contractors would choose the built product.
Verdict: not yet. Evidence is labelled Observed (live sandbox run), Code, Docs
or Assumption; no planner or contractor was interviewed.

Main findings: conflict repair, alternatives and pins exist only in the sandbox
over fabricated requests while `/plans` generates with empty pins; the as-submitted
view reports 30 conflicts for roughly ten distinct clashes because one collision
surfaces as block, team and workforce rows; Balanced and Maximum completion both
place 17 of 22 with the five deferred jobs hidden from the post-solve Conflicts
page; 13 of 17 placed jobs moved (735 minutes total) with no contractor response
path; intake uses minutes-after-midnight and block checkboxes; one seeded night
and no way to create another; the contractor's outcome is a single line and a
UUID-based Telegram message; the sandbox loses its loaded state on refresh.

Ten prioritised proposals (including removals) and a 45-minute adoption test
protocol are recorded. The three recommended next changes are: one planning path
on approved data, root-cause conflict grouping with deferred work in the primary
result, and a contractor-readable published schedule with acknowledgement. These
are proposals; they do not change the numbered issue order or authorize
implementation. The review used a temporary unauthenticated preview route that
was removed; the worktree contains only documentation changes. Application tests
were not rerun.

## Product intent and README — 2026-09-15

Expanded PROJECT_BRIEF.md with the planner's problem, two user roles, intended
request-to-publication experience, scope boundaries and measurable success criteria.
Reworked the root README using Best-README-Template's structure: product overview,
workflow diagram, stack, setup, usage, verification, roadmap, contribution guidance,
licence status, contact and acknowledgments. The rule list now includes all 13
current rules; shared setup documentation states the installed test-tool Node minimum.
No application implementation or existing uncommitted feature work changed.

Read-only checks confirmed PS1's public challenge wording, GitHub #17–#21 open,
#4–#16 closed, and HTTP 200 on the hosted login page. This checks link availability,
not authenticated application behavior or deployment freshness. The website and
participant pack disagree on some session times; the event context retains the
pack table and records that discrepancy for organizer confirmation.

Documentation validation covers Markdown rendering, navigation/relative links,
script/environment names, encoded rule coverage, staged scope and preservation of
unrelated work. Application tests were not rerun for documentation-only changes.
