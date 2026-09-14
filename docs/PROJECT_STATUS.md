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
  claimed. The displayed time-saving estimate still assumes 12 minutes per conflict.
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

Preserved the original participant PDF byte-for-byte in ignored, owner-readable
`secrets/reference/`; extracted a credential-free working summary. Archived the
entire prior 893-line status file, corrected the stale documentation index and
qualified the research demo duration. Source pages 24–25 were visually checked;
all 51 pages were text-extracted. No application code or existing work was removed.
Documentation checks cover archive fidelity, local links, PDF checksum, ignored
source placement and whitespace. Application tests were not rerun for these docs.

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
