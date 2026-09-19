# Project Status

## PS1 policy copy removed to recover schedule space — 2026-09-19

Removed the redundant policy-description strip for A/B/C and its unused copy
and CSS. Reallocated its 28px to the desktop schedule viewport. At 1440×1000,
the schedule now measures 538px high (previously 510px), with the footer still
visible at 979px. Pending-change review and export-blocking status remain in
their existing review/status surfaces. Scoped ESLint and typecheck passed;
browser inspection confirmed the strip is absent. No engine behavior changed.
Preview: http://127.0.0.1:3000/ps1.

PR preparation: rebased onto current main while preserving both independent
status updates. The combined PS1 engine/dataset/UI suite passed **205 tests in
19 files** on the rebased branch; typecheck and lint also passed. The redesign
and follow-up spacing adjustment are one commit.

## PS1 schedule-first workstation redesign — 2026-09-19

Implemented the approved Siemens-inspired direction in the existing public
`/ps1` app. The solved workspace now opens on an expandable contract/activity
schedule with actual weekly access blocks, planned-start hatching, completion
targets, search, scale controls and a functional horizon overview. All 54
activities in the public instance remain represented with their scheduled
workload; presentation filters do not alter solver delivery or exports.

Compact teal chrome, a grouped command ribbon and compact A/B/C policy controls
replace the report-style page framing. Full policy metrics remain available in
the comparison view. Location occupancy is a linked secondary view; attention
and selected-work details open on demand. Narrow screens retain triage,
inspection, review and proof. Low-glare presentation covers the new schedule.

Upload replacement now starts a new draft and cancels stale file reads and
worker results. Applied capacity cuts survive re-runs, pin changes and subsequent
maintenance proposals; an older preview is invalidated when its applied basis
changes. Inspector IDs are unique across mounted responsive instances. The
engine rules, output schema, browser-local execution and review-before-Apply
boundary remain intact.

Verification recorded during implementation:

- `npm test` — **900 passed, 79 database tests skipped** because no database was
  configured. A subsequently added inspector unique-ID regression also passed
  in its focused run; the full-suite count above predates that added test.
  A 28-test UI rerun passed, then six affected regressions passed after the final
  maintenance fix, including two new successive-cut cases and actual ZIP
  path/header/scenario checks.
- `npm run typecheck` and `npm run lint` — passed.
- Production build passed cleanly after correcting a CSS selector warning.
  Final verification is recorded in [design-qa.md](../design-qa.md).
- Browser checks at **1280, 1440, 1920, 390 and 768 CSS pixels** found no
  document-level horizontal overflow. Screenshots are in
  [design-evidence](design-evidence/).
- Public-instance and eight-file upload journeys reproduced **A 25.2 / B 44 /
  C 39.2**. Malformed CSV headers were rejected with visible recovery guidance.
- Linked inspection, proposal review, Apply and Undo were exercised. Official
  export remained disabled while a proposal awaited review.
- The exact three-CSV-per-scenario, nine-file ZIP format is covered by tests.
  The in-app browser's download event timed out, so a real downloaded ZIP was
  **not inspected** in this browser run.
- The scoped premium static audit returned **zero findings**. DESIGN.md lint
  returned zero errors and 12 documented token-reference warnings. Full-repo
  baseline findings outside this route remain separate inherited audit work;
  see [UX-CONTRACT.md](../UX-CONTRACT.md#static-audit-scope-and-inherited-findings--2026-09-19).

The active local preview is [http://127.0.0.1:3000/ps1](http://127.0.0.1:3000/ps1).
Paired source/rendered visual comparison passed after fixing canvas height,
low-glare surfaces and responsive spacing. This entry does not claim deployment
or native screen-reader verification. Final visual evidence and remaining
limitations are recorded in [design-qa.md](../design-qa.md). The durable
workflow decision is recorded in [DECISIONS.md](DECISIONS.md).

## Six more synthetic PS1 datasets — 2026-09-19

Added datasets 07–12: long spans with reversed endpoints, matched workfront
limits, separated ECLO windows, horizon-boundary work, priority contention and
a 240-activity mixed workload. This batch adds 48 CSVs, 71 contracts, 321
activities, 613 requested accesses and 84 dependency links. The complete
collection now has **12 datasets, 96 CSVs, 499 activities and 1,033 accesses**.
The manifest and dataset README include the new cases, construction details
and observed scores. The official public data and all first-batch CSVs remain
unchanged. Only the priority-contention case in this batch changes supply: the
Beta S12–S13 WB sector and both endpoint platforms have capacity 1.

Verification: **all 36 A/B/C outcomes** deliver complete workloads and pass
the local checker after output CSV serialization and reparsing. The dataset
suite now has **50 passing tests**. Added assertions cover long/reversed span
expansion, workfront saturation under unchanged weekly caps, quoted CSV fields,
week-30 completion, priority-tier ordering and rejection of B's separated ECLO
pattern when evaluated as C. Full `packages/ps1/` suite: **175 tests across 15
files passed**. Typecheck, targeted ESLint and `git diff --check` passed.

Known limits: the separated-window fixture exposes a C heuristic quality gap:
it currently chooses no ECLO and incurs more delay than necessary. This is
documented rather than hidden by changing demand. Scores are not optimality
claims. The existing cross-possession physical-night alignment limitation
still applies, and the local checker is not the organiser's reference validator.
No application code, schema, dependency, environment or architectural decision
changed. Browser UAT, full application/DB suites and production build were not
rerun for this fixture-only addition. No server was started. Ignored local
sharing bundles are `output/lta-ps1-datasets.zip` (all twelve) and
`output/lta-ps1-datasets-07-12.zip` (the six new input folders).

## Synthetic PS1 upload datasets — 2026-09-19

Added six complete eight-file input instances under
`packages/ps1/data/synthetic/`: small demo, co-sharing, Live interchange,
cross-contract dependency chains, capacity pressure and a 120-activity mixed
workload. Together they contain 48 CSVs, 178 activities and 420 requested
accesses. The README documents upload steps, construction, provenance, counts,
observed scores and expected scenario differences. The manifest records source
SHA-256 digests and expected A/B/C feasibility. All data is explicitly synthetic.

The published topology, buffer rules, horizon and 2/3 weekly contract caps are
preserved. Only the co-sharing and capacity-pressure cases alter location supply.
The official public instance, sample submission and public results are unchanged.
No solver, browser, API, database, dependency or architecture change was needed.

Verification: all **18 dataset/scenario combinations** deliver full workload and
pass local validation after CSV serialization/reparse. The new 26-test suite
also checks strict later-week dependencies, file counts/schema, source hashes,
span validity, four-way co-sharing, Live interchange crossover and the intended
congestion trade-offs. Full `packages/ps1/` suite: **151 tests across 15 files
passed**. `npm run typecheck`, targeted ESLint and `git diff --check` passed.
An initial authoring check exposed unsupported platform endpoints; the fixtures
were corrected to tunnel-sector endpoints before the passing verification.

Known limits: this is the existing local checker, not the organiser's reference
validator, and cross-possession physical-night alignment remains undecidable.
Some B/C runs use extra capacity even when A can finish on time; the README
records this heuristic quality gap without claiming optimal scores. The browser
upload UI, full application/DB suites and production build were not rerun for
this fixture-only change. No local server was started. A local sharing archive
is available at `output/lta-ps1-datasets.zip` (ignored by Git); source CSVs and
documentation are the tracked deliverables.

## Official PS1 specification captured as repo context — 2026-09-19

The spec sync below verified the engine against the organiser's statement but
left the requirements themselves outside `docs/`. Nothing in the documentation
set stated the rules, scoring formulas, output schema or deliverables we are
judged against, so readers fell back to the 2026-09-15 website excerpt and the
participant PDF pack.

[PS1_OFFICIAL_SPEC.md](PS1_OFFICIAL_SPEC.md) now restates the official statement
from `aochinwen/NebulaX-Hackathon-ProblemStatement` at `966c976` — the four
non-negotiables, network and demand models, the ten strict rules, Scenarios
A/B/C with their hard-fail conditions and penalty formulas, the three-CSV output
schema, the validator report shape, the judging rubric and the four deliverables
— and is declared authoritative for PS1 in `docs/README.md`, `AGENTS.md`,
`CLAUDE.md` and the root `README.md`. It complements rather than repeats the
predecessor-rule verification recorded below. Documentation only; no code,
schema, dependency or behaviour change.

Findings from the reconciliation:

- The eight vendored instance files in `packages/ps1/data/public/` are
  **byte-identical** to the organiser's `PS1/01_data/` (SHA-256 after newline
  normalisation, all eight matching).
- **PS1's deliverables conflict with the participant pack's generic list** on
  four points: GitLab versus GitHub, a 3-minute YouTube video versus a 2–3 minute
  pitch, pre-computed result CSVs versus an undefined results ZIP, and a
  write-up PS1 does not list. Unresolved; recorded as open questions for the
  organiser rather than decided here.
- Deliverables 1 and 2 are met by existing work (`packages/ps1/data/results/` and
  the `/ps1` hidden-instance upload path). **Deliverable 3 does not exist** — no
  video has been produced. **Deliverable 4 has no GitLab mirror.**
- Our local checker's rule tags are a superset of the four the organiser's
  example shows; the extra names are ours and must not be presented as the
  reference validator's.

Verification: markdown-only change; internal document links and the
cross-document anchors were checked by hand. No test, typecheck, lint or build
run was required or claimed.
## PS1 evidence calibration and spec sync — 2026-09-18

Documentation-only session closing issues #35–#40. No behavioural change: the
engine, API, schema and dependencies are untouched. `packages/ps1` tests pass
(125 tests across 14 files) after the comment renumbering below.

### Upstream spec update: predecessor precedence

The official problem statement was updated on 2026-09-18 at 06:57 UTC, 33 minutes
after our last commit to `main` (`0bd613d`, 06:24 UTC). Verified directly against
`aochinwen/NebulaX-Hackathon-ProblemStatement` at **`966c976`**, file
`PS1/PS1_README.md`, rather than from the issue description alone.

**Predecessor Precedence** is inserted as strict rule 3: an activity naming another
as `predecessor_activity_id` must not start until that predecessor has finished —
finish-to-start, zero lag (`FS+0`). "Finished" is the week of the predecessor's last
scheduled access night; the successor's first scheduled access night must fall in a
strictly later week. Cross-contract links are allowed; cycles are not. There are now
**ten** strict rules, not nine, and every rule from 3 onward is renumbered.

**The engine already conforms. No engine change was required.**

| Spec requirement | Implementation | Status |
| --- | --- | --- |
| Field parsed | `io/load.ts:85`, `:325` | Present |
| "Finished" = last access week | `engine/validate.ts` — `max(predecessor weeks)` | Matches |
| Successor first access strictly later | `successorStart <= predecessorEnd` fails | Matches |
| Scheduler enforces FS+0 | `engine/schedule.ts:347` — `max(predecessor weeks) + 1` | Matches |
| Cross-contract links allowed | Global topological sort, `schedule.ts:128-149` | Supported |
| Cycles rejected | `load.ts:412` (`InstanceError`) and `schedule.ts:149` | Rejected |
| Unknown predecessor rejected | `load.ts:399` | Rejected |
| Self-precedence rejected | `load.ts:402` | Rejected |

An earlier upstream commit (`16526c0`, 2026-09-17) corrected the penalty worked
example from "10 days" to "7 days". The arithmetic always used 7, so this was a
content-bug fix with no scoring change.

### Documentation drift corrected

Issue #40 named two stale comments. A full sweep of `packages/ps1` found **seven**:

| Location | Was | Now |
| --- | --- | --- |
| `engine/validate.ts:213` | *(no rule marker)* | `rule 3: predecessor precedence` |
| `engine/validate.ts:292` | `rules 4 and 5` | `rules 5 and 6` |
| `engine/validate.ts:347` | `rule 3: closures and buffers` | `rule 4` |
| `engine/validate.ts:366` | `rules 6 and 7` | `rules 7 and 8` |
| `engine/validate.ts:398` | `rules 8 and 9: ECLO` | `rules 9 and 10` |
| `engine/schedule.ts:400` | `Rule 9` (ECLO continuity) | `Rule 10` |
| `engine/validate.ts:83`, `README.md:22`, `package.json:6` | "nine hard rules" | "ten hard rules" |

Rules 1 and 2 are unchanged, so `engine/pins.test.ts:64` needed no edit.

### Release gate #17: responsive and keyboard matrix — 2026-09-18

Ran against the deployed `/ps1` (`railplan-nine.vercel.app`), then re-verified the
fix on a local dev server. The solve reproduced the recorded figures exactly:
**A 25.2, B 44.0, C 39.2**, Scenario C selected initially, locally conformant.

**Responsive — pass at all three widths.** Measured, not eyeballed: at 1280, 1440
and 1920 the document had **no horizontal page scroll** and **zero elements
overflowing the viewport** (excluding intentionally scrollable containers).
Effective widths after the scrollbar were 1271, 1431 and 1911. The three-column
solved layout — attention queue, location/week timeline, operations inspector —
holds at every width.

**Keyboard — pass, with one defect found and fixed.** Tab order follows the visual
reading order: command bar, policy cards, attention queue, timeline controls,
inspector. Across 90 Tab presses, **35 distinct stops, zero focus landings outside
the viewport** (focus always scrolls into view) and **no keyboard trap** — focus
wraps cleanly. The focus indicator is `solid 2px rgb(0, 75, 165)` at 1px offset,
applied by real keyboard focus rather than programmatic `.focus()`.

**Defect: WCAG 2.1 4.1.2 Name, Role, Value (Level A).** Of 72 focusable controls on
the solved workspace, one had no accessible name: the `sr-only` CSV file input in
`Ps1Workbench.tsx`. It was also the **first tab stop on the page**, so a keyboard
user's first Tab landed on a 1x1 clipped control with no name — the 2px outline is
applied but cannot be perceived on a clipped 1x1 box.

Fixed by taking it out of the tab order (`tabIndex={-1}`) and giving it an
`aria-label`. Nothing is lost: the input is fully proxied by the visible, labelled
"Upload instance files" and "Load another" buttons, both already keyboard
reachable. The same pattern in `SubmissionCheck.tsx` was fixed with it.

Re-verified after the fix: **zero focusable controls without an accessible name**
(72 of 72 named), and the first Tab now lands on the visible "Load another" button.
No console errors. 888 tests pass, typecheck, lint and build clean.

**Observation, not a 2.1 AA failure.** The "Reveal it" control measures 42x17,
below the 24x24 target-size minimum — but that is WCAG **2.2** SC 2.5.8, outside
the stated 2.1 AA bar. Recorded so the decision is deliberate rather than missed.

**Still outstanding on #17**, unchanged by this run: actual screen-reader speech
checks (VoiceOver approval still pending), native browser zoom, real Telegram
delivery receipt, the clean-database two-role demo, and geographic licence
clearance.

### Evidence calibration

A deep-research pass extracted 85 claims; 25 reached adversarial verification,
**11 confirmed and 14 killed**. The result is now recorded in
[PS1_EVIDENCE_BASE.md](PS1_EVIDENCE_BASE.md), including a **do-not-say list** so
refuted claims are not re-derived by accident. Only 9 of the 14 killed claims are
individually documented; that record-keeping gap is stated in the file.

Four positioning corrections followed from it:

- **The Singapore incumbent is named.** SMRT's TAMS has performed rules-based
  conflict checking on NSEWL since 16 August 2021 and reached the Circle Line by
  2025. `README.md` and [PROJECT_BRIEF.md](PROJECT_BRIEF.md) now lead with
  *contention resolution between competing requests* and the binding constraint,
  which is the part TAMS is not documented as doing — not with conflict detection,
  which is deployed capability here.
- **The scarcity premise is re-sourced** to the PS1 challenge wording. LTA's
  February 2026 joint release states that *more* engineering hours will be set
  aside, so it cannot support a fixed-envelope framing; footnote 4 of
  [NEBULAX_PRODUCT_RESEARCH.md](NEBULAX_PRODUCT_RESEARCH.md) is now scope-limited
  to the four things it does support.
- **Differentiation bets 1, 2 and 4 are downgraded** to gaps in *published*
  capability. Coverage rests on two operators; eight named commercial vendors
  produced zero verified findings. "No competitor does this" is now a prohibited
  phrase.
- **Bet 3 is the lead differentiator**, carrying the only independent quantified
  baseline: ORR/GHD, April 2021, 17–22% of agreed possessions cancelled before
  delivery. Four citation rules constrain its use, including past tense and
  problem-baseline-only framing.

### Still open

Issues #41 (planner usability pilot) and #42 (LTA's own tooling and a commercial
vendor survey) remain open and are **not** blockers for submission — #38's framing
discipline is precisely what makes the missing vendor survey safe to lack. #17
remains the open release gate.


## PS1 exception-first workspace implementation — 2026-09-18

Implemented on `codex/ps1-operations-workspace` in two feature checkpoints:
`4bb2e7a` (state/layout foundation) and `7a945e2` (reviewed interactions and
accessibility), followed by a release-readiness checkpoint. The public solver
now retains each A/B/C outcome independently,
opens C after a fresh solve, preserves the active policy on re-run, and rejects
stale asynchronous results through an operation epoch.

The solved experience now has a compact command bar, accessible policy cards,
exception-first attention queue, one-tab-stop location/week grid, disruption
capacity overlays, linked Summary/Why/Network/Changes inspector, grounded Q&A,
sticky review shelf, apply/undo history, proof drawer, copyable handover and exact
official export gate. Desktop and mobile have explicit distinct responsibilities;
low-glare mode is browser-session-only. No backend/API/schema/dependency change
was introduced.

Release verification:

- `npm test` — 967 tests passed across 116 files after the final queue refinement.
- `npm run typecheck`, `npm run lint` and `npm run build` — clean; Next.js 16.3.4
  statically generates `/ps1`.
- Direct production HTTP checks — `/` and `/ps1` both return 200.
- Production-browser solve — A 25.2, B 44 and C 39.2, with Scenario C selected
  initially and all three outcomes locally conformant.
- Review workflow — selected hotspot, imposed a one-night capacity cut, previewed
  impact, re-planned, confirmed export remained blocked pending review, applied
  revision 2 and undid to revision 3.
- Responsive checks at 390, 768, 1280, 1440 and 1920 CSS pixels found no page
  overflow; mobile exposes Attention/Selected/Review/Proof and hides matrix
  editing, while desktop retains the three-pane workspace. Narrow-width reflow
  equivalent to a 200% desktop zoom also passed without horizontal page overflow.
- Keyboard/AX smoke — policy cards, mobile tabs and the one-tab-stop grid expose
  labelled controls and expected focus semantics; automated VoiceOver speech was
  not available in this environment and remains a manual release check.
- Grounded Q&A cited the selected activity, contract and scheduled weeks; Proof
  showed the exact nine-file manifest; browser error/warning logs were empty.

## PS1 hardened optimiser and operations workspace — 2026-09-18

The public PS1 path now has strict RFC-style CSV parsing, cross-file instance
integrity checks and a reconciliatory submission validator. The false positives
found in the audit are closed: forged RESULTS, invalid access nights, duplicate
workload rows, sequence gaps and mismatched occupancy are hard failures. Live ECLO
windows use the full closure expansion on both affected lines. The checker labels
itself local because global night alignment is absent from the official format.

The greedy baseline remains available internally, while the product uses a
deterministic 24-start optimiser with bounded reconstruction, topological
predecessor order, unbounded scored Scenario-B possessions, evaluated Scenario-C
ECLO and a strict horizon. The published instance remains A 25.2 / B 44 / C 39.2.
Solves run in a browser worker with progress and cancellation by replacement.

The result workspace adds an activity/contract queue, linked timeline selection,
sticky four-tab inspector, closure-derived two-line schematic, deterministic Q&A,
review-before-apply for pins/disruptions, undo and a separate memory-only planning
log export. Infeasible scenarios cannot be downloaded; the official ZIP remains
exactly three CSVs under each A/B/C folder. Verification evidence is recorded at
the end of this implementation session.

Verification completed on the final implementation:

- `npm test` — 963 tests passed across 113 files.
- `npm run typecheck` and `npm run lint` — clean.
- `npm run build` — production build succeeds with `/ps1` statically generated.
- Direct HTTP smoke checks — `/` and `/ps1` both return 200.
- Production-browser smoke check — public instance solving runs in the Web
  Worker, all three public scenarios are locally conformant at A 25.2 / B 44 /
  C 39.2, the linked operations workspace renders, and deterministic Q&A cites
  the selected activity's computed schedule facts.
- The implementation branch is synchronized with its GitHub upstream before
  release (`HEAD...origin/ps1-judging-surface-ux` is `0 0`).

## PS1 restructured against scheduling-tool conventions — 2026-09-18

The page worked but read as a report: one column, roughly 4,000px, every panel
open at once, and a grid of sixty-seven rows with no way to narrow it. Changes
below follow what comparable tools actually do, with sources recorded in
`docs/DECISIONS.md` rather than invented.

**Master-detail, not stacked panels.** Selecting a cell used to open a block
_below_ a scrolling table, so clicking a row near the top pushed the page and
left the cell off screen. The detail now sits beside the grid and sticks while
the grid scrolls. Palantir's scheduling Gantt widget and the long-standing
"two-panel selector" screen pattern both put the detail adjacent, not beneath.

**A toolbar that narrows the grid.** Search by location name or id, plus filters
for At capacity, Pinned, Alpha and Beta, with a live count. This is the widget's
"violation rules filter" idea — toggle to focus on what needs attention — and
NN/g's finding that table design should serve the specific task: find, compare,
or act. Finding a bottleneck previously meant scrolling sixty-seven rows; "At
capacity" now cuts it to fifteen in one press.

**Progressive disclosure on what was always open.** Urgent maintenance is a
what-if, so it moved into a dialog reached from the grid or the result actions —
the same place RailPlan keeps its own disruption tester. The contract table now
shows the two contracts that overrun rather than all fourteen, twelve of which
say "on time"; the rest are one press away. NN/g's 2006 study is the basis:
deferring secondary controls measurably speeds initial task completion while
keeping them discoverable.

**Toolbar controls lost their per-button paragraphs.** Every action carrying a
visible sentence is right for actions that change a schedule — pin, adopt,
download, check — and wrong for view toggles, where the notes were louder than
the grid they described. Sort, filter and search now carry tooltips and a live
status line ("15 of 67 locations · along the line") instead. Consequential
actions keep their notes.

Verification: `npm run typecheck`, `npx eslint .` and the full suite pass — 946
tests across 111 files, including four new ones covering search, the capacity
filter, the empty-result escape and the detail panel opening and closing. The
flow was walked in a browser at 1280px: filter to fifteen rows, select a cell,
pin it, open urgent maintenance aimed at that cell.

**Not done.** The widget also keeps a change log of edits with a review step
before committing; PS1 still has no record of which pins were set or which
replans were adopted. That is the next thing worth building and is not in this
change.

## PS1 adopts RailPlan's design system — 2026-09-18

`/ps1` was built as its own package and had drifted into its own look: softer
radii, flat panels, a 20px page heading against the workspace's 29px, and a
metric grid that printed all eight formulas at once. Same repo, same author,
two visual languages. This pulls PS1 onto the system `globals.css` already
defines, reusing RailPlan's components and classes rather than copying them.

**The `fx` control is now shared.** `Figure` took `MetricValue` from
`@railplan/core`; it now takes a structural `FigureMetric`, which both that type
and PS1's `Metric` satisfy. PS1's eight figures use the real component, so the
arithmetic folds away behind `fx` instead of filling the panel. The unit suffix
deliberately stays limited to percent and minutes — "ECLO nights" followed by
"0 nights" says nothing twice.

**Non-colour redundancy reached the possession grid.** It was colour-only: an
over-capacity cell was red and nothing else, and a pinned week had no grid
representation at all. Over-capacity cells now carry `.bar-conflict` and pinned
weeks `.bar-pinned` — the same hatch and ruling the planner timeline uses, so
both survive greyscale and colour-vision deficiency. Pins are also now visible
as a _span_: pinning A028 marks all five locations it occupies that week, which
is what a pin actually constrains.

Finding that required fixing a real bug: the cells set the `background`
shorthand inline, which resets `background-image`, so any pattern class was
silently erased. It is `backgroundColor` now.

**Line identity, without borrowing the MRT colours.** Twelve block rows read as
three corridors in RailPlan because the gutter is tinted per line. Sixty-seven
PS1 rows now read as two lines the same way — but with new
`--color-line-alpha-tint` / `--color-line-beta-tint` neutrals, not North-South
red and East-West green. Alpha and Beta are fabricated lines in a challenge
instance; dressing them in real MRT hues would assert a correspondence that does
not exist. A hidden instance naming a third line gets the plain surface rather
than an invented colour.

**Also:** a rule every fifth week column, so a row thirty weeks wide can be
tracked across; `.ps1-panel` on the workspace card's border, radius and
`--rail-panel` gradient, with a live drop target borrowing `--rail-selected`;
and the page adopting `.workspace-page` typography, `.workspace-eyebrow` and the
prototype chip, which also widens the page to 1600px so the timeline has room.

Verification: `npm run typecheck`, `npx eslint .` and `npm run build` clean; 942
tests across 111 files still pass, including the RailPlan dashboard suite that
exercises `Figure` from the other side. The grid was checked in a browser for
distinct gutter tints, six week rules, and a pinned cell keeping both its
pattern and its load colour.

## PS1 judging-surface usability pass — 2026-09-18

Seven changes to `/ps1` and its entry point, from a walkthrough of the page as
the two people who actually use it: a judging panel opening the bare domain
cold, and a works controller reading the schedule it produces. No engine
behaviour changed except one explainability fix, and the scheduler's output on
the published instance is unchanged (A 25.2 / B 44 / C 39.2).

**The domain no longer answers with a password box.** `/` gated on
`workspaceActor()`, which redirects anonymous visitors to `/login`, and `/login`
linked nowhere onward. The PS1 scheduler — deliberately public, no account, no
server — was reachable only by typing the path. `landingAccess()` in
`src/lib/auth/page.ts` now distinguishes anonymous from unassigned without
redirecting, and anonymous visitors get `PublicLanding`: the open scheduler
first, the workspace sign-in second. `/login` and the access-pending page also
link to `/ps1`. `src/test/public-landing.test.tsx` guards all three states.

**All three scenarios are compared in one table**, above the tabs, with the
objective now on each tab label. There is deliberately no "best" column: each
scenario scores under its own rules, so ranking the objectives would be a
category error, and the caption says so. The physical columns — overrun days,
excess nights, ECLO nights, access-nights — are the comparable ones and are the
actual story. Loading the public instance now also solves it, in one click.

**The explanation no longer contradicts itself.** `explain.ts` computed
`predecessorBlock` separately from `blockers`, so A038's summary blamed A037
finishing late while all seven week rows beneath it read "no rule blocked this
week". Weeks before a predecessor's finish are now `kind: "predecessor"`, and
the summary accounts separately for any weeks after it cleared. Every slip on
the published instance is now attributed; the pre-existing "is honest when
nothing blocked the earlier weeks" test lost its fixture as a result and was
rewritten to construct the case rather than search for one, which is what it
should have done originally.

**The submission downloads as one archive.** `packages/ps1/src/io/zip.ts` is a
stored-entry ZIP writer with a fixed timestamp, so identical content produces
identical bytes; it is tested against the system `unzip`. Nine separate
downloads was both tedious and unreliable, since browsers throttle repeated
downloads silently. Per-scenario CSVs remain as a secondary action. Instance
upload now accepts drag-and-drop and **names the files it ignored** — previously
an unrecognised filename was dropped in silence, leaving a judge with eight
"missing file" lines and nothing connecting them to what they had selected.

**The validator can be pointed at a submission we did not write.** A new
"4. Check a submission" section validates any three submission CSVs against the
loaded instance, reading the scenario from `RESULTS.csv` rather than the open
tab. One click checks the organisers' published reference: it comes back
**feasible with zero hard violations, objective 32.2 under Scenario A**, against
our 25.2 on the same instance under the same rules. That is the evidence for the
claim in `packages/ps1/README.md` that our reading of the ambiguous rules is not
stricter than the judges' — previously asserted in prose only.

**The timeline reads as one vocabulary and drives the rest of the page.** The
grid said `ALP S01 EB · platform · cap 2` while the panel below it and the
disruption picker beside it said `PLAT:ALP:S01:EB`; `location.ts` now formats
every reference, with the raw id kept as the secondary form. The selected cell
carries an outline, the detail panel closes, and `TimelineRow.peak` — computed
by the engine and never rendered — drives a "busiest first" sort and a count of
locations reaching capacity. Urgent maintenance moved _below_ the timeline and
can be aimed at a clicked location-week, and its capacity now defaults to one
night fewer than nominal rather than a flat 1, which was not a cut at all on the
capacity-1 sections that make up most of the network.

**Every action states what it will do** before you press it, as rendered text
tied to its control with `aria-describedby` rather than a tooltip. Several
change with state: the disabled run button explains why it is disabled, and the
replan button says what to fix when the cut displaces nothing.

Verification: `npm run typecheck`, `npx eslint .` and `npm run build` clean;
942 tests pass across 111 files, including 13 new PS1 workbench tests and 5 ZIP
writer tests covering a real `unzip` round-trip. The judging flow was walked in
a browser end to end: cold load, one-click solve, scenario comparison, cell
selection, pin and release, cut-and-replan, reference check and ZIP download.
Database-backed suites were not re-run; nothing here touches them.

Not done, and deliberately: `/ps1` still does not accept a zipped instance as
_input_, the scenario tabs remain an incomplete ARIA tab widget (`role="tab"`
with no `tabpanel` or arrow-key handling), and at 375px the timeline's location
column takes most of the width. None changes a judging outcome; all three are
listed for after the deadline.

## Issue #21 named crew rostering evaluation — 2026-09-17

Issue #21 asks for an evaluation and an accepted decision, and explicitly forbids
implementation before approval. The evaluation is complete in
`docs/EVALUATION_NAMED_CREW_ROSTERING.md`; the decision is recorded as
**Proposed, awaiting Pavan's decision as data controller**. Authorising
collection of personal data about real workers is not an engineering call, so it
is the one decision in the log left open deliberately rather than accepted.

**Recommendation: no-go.** Of the four operational needs named rostering could
serve, two are safety-relevant (qualification matching, rest and fatigue) and
both are reachable without personal data — a role such as
`technician_hv_certified` carries the same planning power as knowing who holds
the certificate. The other two are efficiency gains and do not justify
introducing identity, location and absence data into a system that publishes its
output to contractors and Telegram.

One fact would overturn it, and it is the owner's to establish: whether any LTA
or regulatory obligation requires per-person auditable rest and qualification
records rather than plan-level assurance. Three further questions are listed in
the evaluation.

Acceptance criterion 2 — no named-worker table, API, seed, UI or log before
approval — is now enforced by `src/test/workforce-anonymity.test.ts`. It was
mutation-tested twice, against an injected `workforce_roster` and a differently
named `crew_member_roster`, to confirm it catches personal identifiers rather
than passing vacuously. It is a tripwire for the obvious shape of the mistake,
not a privacy control in itself. The aggregate role-capacity model remains the
production default and nothing was built.

## CI restored — 2026-09-17

CI had been red since `ef727b0` on 2026-09-15, three commits before this work.
The 2026-09-15 upstream reconciliation added the carry-forward, coordination and
deferred-work database suites without the reachability guard the other ten
`*.db.test.ts` files carry, so with no `DATABASE_URL` they connected to the inert
loopback fallback and failed with `ECONNREFUSED`, taking the whole run down.
Applying the existing idiom to those three files restored a green pipeline:
against an unreachable database the suite exits 0 with 742 passed and 79 skipped,
and against a real database all tests still pass, so no coverage was lost where a
database exists. `npm run test:db` remains the non-skipping gate.

## Issue #20 CP-SAT benchmark and solver decision — 2026-09-17

Issue #20 is complete. All four acceptance criteria are met and the decision is
recorded. Nothing is committed; the working tree carries these changes. No
application, solver, test or database code changed — only the offline benchmark
and documentation.

**Cross-language digests agree and schema drift fails fast.** Payloads carry
`instanceDigest`, `constraintVersion` and fixture name under schema
`railplan-cp-sat-payload-v2`; Python echoes all three and the harness rejects any
mismatch. Verified by deliberately tampering with the echo, which produced
`provenance drift on instanceDigest — sent fnv1a:8c4a9050cfea5e8b, received fnv1a:TAMPERED`;
the tampered file was restored. Wrong `schemaVersion`, missing keys and unknown
keys each raise `SchemaDrift` and exit non-zero. Python models no rule:
`validate()` remains the sole constraint authority.

**All reported feasible CP-SAT plans pass the validator.** Zero critical
violations and 5/5 mandatory on every feasible fixture. A CP-SAT plan returning
critical violations aborts the run rather than being reported.

**Results are reproducible.** `scripts/benchmark/results-2026-09-17.json` records
host CPU, core count, memory, Node/Python/OR-Tools versions, time limit, seed and
worker count alongside seven fixtures. `npm run benchmark:cpsat` reproduces it in
about 105 seconds.

| Fixture                     | Heuristic                         | CP-SAT                       |
| --------------------------- | --------------------------------- | ---------------------------- |
| baseline-feasible           | 17 placed, 88.2%, 735 move, 22 ms | 19, 95.3%, 1320 move, 6.0 s  |
| shortened-window-disruption | 15, 84.7%, 720 move, 14 ms        | 18, 92.9%, 1080 move, 2.3 s  |
| team-unavailable-disruption | 17, 88.2%, 735 move, 24 ms        | 18, 90.6%, 1395 move, 4.0 s  |
| locked-planner-pins         | 17, 88.2%, 735 move, 22 ms        | 19, 95.3%, 1350 move, 3.5 s  |
| adversarial-tight-windows   | 16, 84.7%, 480 move, 11 ms        | 17, 90.6%, 480 move, 2.2 s   |
| larger-cloned-night (33)    | 19, 74.6%, 1230 move, 33 ms       | 20, 76.9%, 1065 move, 75.2 s |
| mandatory-blocks-closed     | INFEASIBLE, 4/5, 49 ms            | INFEASIBLE, proved, 0.3 s    |

**The decision is recorded.** `DECISIONS.md` now carries
`2026-09-17 — No CP-SAT solver service; the TypeScript heuristic stands`, which
resolves the previously `Proposed` _Real optimisation solver_ entry. CP-SAT
produces better plans — one to three more jobs, +2.3 to +8.2 points of weighted
completion — at 157-2278x the runtime, and is rejected on latency, not quality.
The decision names the operational failure modes a service would add and what
would reopen it. MILP was never benchmarked and remains open.

Findings worth not rediscovering:

- Movement is not uniformly worse under CP-SAT. It rose 50-90% on the four
  22-request feasible fixtures, was identical on the adversarial one, and fell
  13% on the larger one.
- The CP-SAT objective faithfully encodes `max-completion`, whose own objective 4
  is "Movement from requested times is not penalised". The movement figures are a
  real consequence, not a proxy artifact. `balanced` and `min-risk` do price
  movement and were not benchmarked.
- Timing is load-sensitive; answers are not. Baseline ran 6121/5680/5556 ms idle
  but 50.0 s under concurrent load, and the larger fixture crossed from `OPTIMAL`
  at 75 s to a solver timeout at 96 s. The plan and objective were identical
  throughout.
- `timeLimitSeconds` bounds CP-SAT's search but not model construction. With
  thousands of cuts the build dominates, so a fixture budget checked between
  calls cannot interrupt one long call; the subprocess itself is now bounded at
  90 s. Three reporting statuses (`SOLVER_TIMEOUT`, `BUDGET_EXCEEDED`,
  `CUT_LIMIT`) replace throwing, so one hard fixture cannot discard the rest.
- Cloning all 22 requests gave a 44-request night neither method could satisfy —
  heuristic `INFEASIBLE` at 4/5 mandatory, CP-SAT exhausting five minutes over 35
  rounds and 14,001 cuts — which conflates scale with solvability. Cloning every
  second request keeps 33 requests feasible.
- The adversarial band started at 30 minutes and was genuinely infeasible,
  duplicating the closed-block fixture; 60 minutes keeps it tight but comparable.
- Clone requests must carry their own `workforceDemand` rows or every clone trips
  `WORKFORCE_CAPACITY` as undefined staffing.

`.venv-cpsat/` is git-ignored. Lint and typecheck pass.

## Release gate re-verification — 2026-09-17

Pulled `main` to `9ca5630` (two upstream commits: the Windows E2E preload file-URL
fix and the CP-SAT/verification documentation). The local branch
`codex/sitewide-ui-navigation` was already an ancestor of `origin/main` and holds
no unique work; it is untouched.

Every release gate passed on this commit, with no skips: lint and typecheck
exit 0; `npm test` 821 tests across 98 files in 268.86 s **including** the hosted
`*.db.test.ts` rollback/integration files; independent-session concurrency 13/13
in 97.21 s; production build with 43 routes; production HTTP E2E 6/6 in 83.45 s;
`geo:verify` 15 station points. **840 automated tests, zero failures.** Database
parity was `fnv1a:8c4a9050cfea5e8b` / 22 requests both before and after the E2E
run, and E2E fixture cleanup left no recovery manifest and no listening port.

**Issue #17 dependency gate closed.** `npm audit` now reports 0 vulnerabilities;
`vitest` and `@vitest/mocker` resolve to 4.1.11, clearing GHSA-82fw-gwwq-j7x9.
The stale "audit currently reports advisories" open finding in
`docs/SECURITY_REVIEW.md` was corrected in place with this evidence.

The 2026-09-16 `PlannerTimeline` React key warning was investigated and **did not
reproduce**: a targeted `console.error` probe over real solver output and over the
conflict-rich requested plan with violations was clean, the seven
`SavedPlansWorkspace` test files were clean, every JSX `.map` in the component
carries a key, and duplicate keys are excluded by the `plan_placements` primary
key. It remains open — it was seen once in a signed-in `next dev` session against
real saved data, which the test layer cannot recreate. A separate latent
fragility was found and recorded but deliberately not changed: `SandboxPlannerPanel`
concatenates `extraRequests` onto `demoFacts.requests` without deduplicating by id.

Still outstanding for #17 and unchanged: screen-reader speech and native browser
zoom (both need owner approval for VoiceOver on macOS), the exact 1280/1440/1920
keyboard and responsive acceptance matrix, real provider delivery, geographic
licence clearance and public deployment. The CP-SAT benchmark was not re-run —
`ortools` is not installed here and no Python package was installed — so the
2026-09-16 benchmark results stand as recorded. No commit, push, merge or
deployment was performed. Evidence and limitations:
[RELEASE_VERIFICATION_2026-09-17.md](RELEASE_VERIFICATION_2026-09-17.md).

Workstation note: the session hit a full disk (99%, `ENOSPC`) partway through
this update. `npm cache clean --force` reclaimed 3.8 GB. The cause is unrelated
caches, chiefly `~/Library/Caches` at 30 GB (Telegram 12 GB, lima 3.5 GB,
Codex 3.7 GB); this repository is 1.2 GB in total.

## Local planner verification — 2026-09-16

Agent-led verification at http://localhost:3000 on commit `203068d`: lint and
typecheck passed; the non-DB regression run passed 733/733 tests across 84 files.
Focused accessibility/navigation/planner tests passed 53/53 (included in the
broad run). Component tests emitted React act warnings. The Windows preload path
was converted to a file URL in both E2E spawn sites; provider-policy tests passed
3/3 afterward.

Signed-in browser checks exercised sandbox load/fixes/generation, linked request
selection, drag preview/apply/undo, workforce expansion, exact saved-version
reopening, stale-source publication guards, unsaved-request discard/cancel,
coordination/backlog empty states and notification settings. A compact request
drawer passed search, visible Tab focus and Escape focus restoration. Saved-plan
layout was spot-checked at emulated widths 1280/1440/1920 with automatic height;
this was not the complete viewport/zoom/keyboard/VoiceOver audit. The development
overlay reported a PlannerTimeline React key warning; no root-cause fix yet.

No retained workflow writes or real provider sends. In the user-confirmed exclusive
window, database parity, 88 rollback/integration tests, 13 independent-session
concurrency tests, production build and 6 controlled production E2E tests passed.
Exact E2E fixture cleanup restored 22-request parity at
`fnv1a:8c4a9050cfea5e8b`. The dev server was stopped before build and restarted;
localhost login returned HTTP 200. The existing generated next-env.d.ts change was
preserved. An offline pinned OR-Tools CP-SAT reference benchmark also completed:
it proved valid optima of 19/22 versus the heuristic's 17/22 at baseline and 18/22
versus 15/22 in a shortened window; both approaches identified the forced mandatory
block closure as infeasible. CP-SAT took 6.64–15.80 seconds on feasible fixtures
versus 26–69 ms for the heuristic and increased movement, so it remains a research
reference rather than a production replacement. Prepared the human study protocol and demo
storyboard; no participant measurements collected. See
[verification evidence and limitations](RELEASE_VERIFICATION_2026-09-16.md) and
[planner pilot](PLANNER_USABILITY_PILOT.md). The seven next steps in handoff.md
section 17 remain the priority, not the historical issue-number roadmap.

## GitHub merge verified — 2026-09-15

Pavan approved all recommended resolutions and pushing main after verification.
Checkpoint 18c32d3 preserves all local work before the actual merge with c70ecef.
All 29 textual conflicts are resolved; verification is complete and the merge is
ready for commit/push. PR #27 remains excluded. Current implementation keeps the single
sandbox and exact role-aware journeys, ports transient-state safeguards, and adds
server-validated requested-time conflict/repair review to Night overview. Unused
upstream duplicate editor/subpage components are excluded, with behavioural tests
adapted to the approved routes.

Fresh typecheck, lint and production build passed. Sandbox integration: 44/44;
saved conflict/read-only review: 13/13; request/notification/analysis DB: 35/35.
Initial full suite: 824 passed, three historical-UI assertions failed; those were
adapted to the approved server preview, dedicated settings page and explicit
discard guard, and their focused reruns passed. The subsequent whole-suite run
passed 820/820 tests across 98 files. Independent-session concurrency passed
13/13 and authenticated production HTTP tests passed 6/6. Database parity remains
fnv1a:8c4a9050cfea5e8b / 22 requests. After the final sandbox anchor-focus change,
the focused regression suite passed 9/9 and fresh lint/production build passed;
the whole suite was not repeated after that small change.
Independent read-only review found no critical/important issue in the merge or
carry-forward source-revision identity correction, including the final focus fix.
Browser checks passed at 1440×900 and 390×844: white surfaces, no document overflow,
expandable workforce, legacy redirects and focused anchors, keyboard dialog focus,
and consistent fabricated emergency data across queue/timeline/inspector. Browser
error/warning logs were empty. The existing saved plan was stale and correctly
disabled repair actions; no durable plan was created for manual verification.
Authenticated role coverage used the controlled E2E fixtures, not a full manual
contractor journey. No real provider sends, session-expiry wait or VoiceOver audit.
Production preview: http://127.0.0.1:3000 (session67690), optional AI/Telegram disabled.
No explicit deployment performed; the authorized main push may trigger configured
hosting automation. Historical entries below retain earlier facts.

## GitHub reconciliation — tooling and fresh merge assessment (2026-09-15)

Ported upstream `.gitignore`, ESLint and Vitest exclusions: local artwork/output
and duplicate `.claude/worktrees` sources stay out of the appropriate scans.
Full lint and typecheck passed. Vitest file discovery completed with only main
workspace app/core tests; this was discovery, not a full test run. Existing Vite
config-loader advisory remains. No app change or preview restart in this step.

Saved a fresh recoverable snapshot (tracked plus untracked source, separate index)
at `refs/codex-backups/reconciliation-checkpoint-20260915`. The original pre-sync
snapshot remains. A new merge-tree assessment against `c70ecef` reports29 textual
conflicts, not22: adapting upstream changes in the local UI creates additional
same-line overlaps. This is not an applied merge and no conflict markers/index
entries were installed. Earlier functional checkpoints are resolution decisions,
not Git-resolved files. No branch movement, push, or deployment occurred.

The remaining functional blocker is the saved-plan grouped requested-time conflict
editor/recommended-repair flow. It must reuse the existing server analysis/preview
boundary, not import upstream's duplicate client editor. After that: reconcile
remaining tests/docs and nonconflicting upstream additions, then perform the actual
merge with the recorded keep-single-dashboard/navigation decisions and run combined
verification. Current preview remains http://127.0.0.1:3000 (session40745); not
reverified in this tooling-only step.

## GitHub reconciliation — single-dashboard sandbox sessions (2026-09-15)

Pavan explicitly chose to keep the single dashboard, not upstream's six subpages.
Adapted `SandboxSessionBoundary` to the existing server-gated sandbox page. The
actor-keyed dashboard remount clears component-local controls/conversation; the
store clears demo inputs on first entry or actor change. Session epochs discard
late load/build/repair completions. Initial entry deliberately clears unowned
persisted demo pins; identity and epochs are not persisted. No database/auth policy
changes. Server role gate remains before the boundary; no client identity is trusted
for authorization. Reset clears pending work rather than allowing stale results back.

The initial test run failed because the boundary was absent. After implementation,
37/37 session/dashboard/navigation tests passed (15.41s), including same-actor
retention and cross-actor pending operations; typecheck passed. This resolves the
sandbox structural direction, not the final Git merge. Remaining upstream UI
features and combined review/verification still need reconciliation. Focused lint,
production build and whitespace checks passed. Preview restarted at
http://127.0.0.1:3000 (session40745), with AI/Telegram disabled; login HTTP200.
Authenticated cross-account browser testing was not run. Existing Vite advisory
remains. No push or deployment.

## GitHub reconciliation — request workflow (2026-09-15)

Compared upstream request workspace, intake, private editor and transcript diffs.
Retain local separate URL-addressable private-draft pages, exact submitted-request
handoff, contextual return and unsaved guards instead of upstream hidden tabs and
fragment-only handoff. Local status guidance already covers submitted/approved work.
Added the missing upstream Continue to scheduling action to the status summary,
using the approved request's night and engine request ID rather than a generic
`/plans` link. Planner-only; not offered for submitted/unapproved work. Existing
published-plan links retain their exact immutable version separately.

New regression failed before implementation; all41 tests across intake, request
journeys/pages and private editor passed (5.45s). Typecheck and focused lint passed.
No permission/backend/database changes; the destination's existing planner gate
remains authoritative. This records request-workflow reconciliation but does not
mark a Git merge resolved. Remaining saved-conflict and sandbox structural work,
combined verification and final Git integration are still pending. Production build
and whitespace checks passed. Preview restarted at http://127.0.0.1:3000 (session
66144), with live AI/Telegram disabled; login HTTP200. Browser interaction checks
were not performed. Existing Vite advisory remains. Nothing pushed or deployed.

## GitHub reconciliation — remove assumed planner-time claim (2026-09-15)

Removed the upstream-deprecated Planner time saved dashboard card, preserving
calculated movement, utilisation and workforce metrics and their formula controls.
The regression failed on the existing card before removal; the replacement
behavioural test checks its absence and retained calculation controls. All24
dashboard tests passed (13.29s), plus typecheck and focused lint. The unused legacy
metric helper/raw store baseline are retained for compatibility, not displayed as
a product benefit. No solver, saved metric or database changes. Full Git merge and
remaining request/sandbox/saved-conflict integration remain pending. Production
build and whitespace checks passed. Preview restarted at http://127.0.0.1:3000
(session47075) with live AI/Telegram disabled; login HTTP200. Authenticated browser
checks were not run. Existing Vite advisory remains. Nothing pushed or deployed.

## GitHub reconciliation — sandbox clash counts (2026-09-15)

Ported upstream `conflictsMetric` and wired the toolbar/requested banner plus
headline signals to grouped counts. The fabricated requested set now reports 16
clashes instead of 30 rule findings. Raw validator counts remain untouched and
labelled violations/findings. The headline metric counts critical clashes; the
panel retains all severities. Unreplanned disruptions use their impact findings.
Added `baselineClashes` captured on load/reset independently of the existing raw
baseline, so suggested repairs cannot lower the original comparison count.

Initial banner regression failed on 30 vs16; the existing baseline regression then
caught an edited-request comparison and was retained with the grouped baseline.
All 179 dashboard/core tests across11 files passed (20.55s). No saved-plan metric
schema, validator, solver, database or permission changes. The old estimated
planner-time figure is still present and remains a later upstream reconciliation
item; its raw baseline was not repurposed. Typecheck, focused lint, production
build and whitespace checks passed. Preview restarted at http://127.0.0.1:3000
(session66613) with live AI/Telegram disabled; login HTTP200. Authenticated browser
verification was not performed. The existing Vite advisory remains. Full Git merge
remains pending; nothing pushed or deployed.

## GitHub reconciliation — grouped conflict panel (2026-09-15)

Connected the upstream grouping helper to the existing `ViolationPanel` without
replacing its shell/styles. Header/chips count groups and separately report raw
rule findings. Expanded rows retain every rule detail. Selecting any member opens
its group (even outside the current category filter); repair resolves the selected
finding through the existing store and explicitly avoids promising every finding
will be cleared. Validator/store repair logic is unchanged.

The new integration test failed before implementation. A missing closing JSX tag
was caught and corrected during verification. All 24 dashboard tests then passed
(14.19s), followed by typecheck and focused lint. Other dashboard banner/KPI counts
still use their existing definitions and need reconciliation before final release;
the saved-plan grouped-conflict surface is also pending. Production build and
whitespace checks passed. Preview restarted at http://127.0.0.1:3000 (session 39301) with AI/Telegram process overrides still disabled; login HTTP 200. Browser
interaction/visual verification was not performed. Existing Vite advisory remains.
No merge/push/deployment.

## GitHub reconciliation — conflict grouping foundation (2026-09-15)

Ported `groupConflicts`/`ConflictGroup` and its three upstream regression tests
from `origin/main` at `c70ecef`. The three tests failed on the missing function
before the port. Added explicit coverage for transitive overlap, half-open touching
intervals, untimed findings, empty input and nonmutation. All 155 core tests across
10 files passed (7.90s), followed by typecheck and focused lint. Validator and solver
code are unchanged; grouping retains all findings and is presentation-only.

The function is not yet connected to local UI consumers. Displayed conflict counts
therefore have not changed, and the running preview was not rebuilt for this unused
helper. Next: integrate grouped conflict rows/actions into the existing UI without
importing the upstream replacement shell. Full Git merge, remaining workflows,
final verification and push/deployment remain pending.

## GitHub reconciliation — area 2b: requested-time preview action (2026-09-15)

Added upstream Try requested time behaviour to the existing saved-plan inspector,
preserving the shared button style and layout. It proposes a pin with the saved
request's team, preferred start and exact duration through the existing parent
preview handler; it does not save or publish. Existing pins require explicit
unpinning first. Loading, busy, stale and superseded states disable the action.
Five missing-button regressions failed before implementation. Inspector plus
preview/recovery suites passed 21/21 (6.65s); typecheck and focused lint passed.
Full grouped requested-conflict UI and the Git merge are still pending. No database
or solver changes in this step. Production build passed. Restarted the local
production preview at http://127.0.0.1:3000 (session 50905), retaining disabled AI
and Telegram providers through process-only overrides. Login HTTP returned 200;
authenticated browser interaction/visual checks were not performed in this step.
Whitespace checks passed; the pre-existing Vite config-loader advisory remains.

## GitHub reconciliation — area 2a: saved revision backend (2026-09-15)

Ported the merged upstream revision base contract and two real rollback DB tests
from `origin/main` (`c70ecef`), combining them with local preview/coordination
guards. Saves now persist `basedOnPlanId`, infer it for existing expectedBasis
callers, and reject mismatched or stale/superseded bases. A regression reproduced
the previously accepted superseded preview. Lineage does not change solver hashes;
original saved versions remain immutable. No migration or UI component changed.

Red checks: one contract test and four selected DB tests failed on missing lineage
or the accepted superseded preview before the implementation. Green: 19/19 across
the complete plans contract, plans DB and planner-analysis DB suites (20.32s).
Typecheck and focused six-file lint passed. Coordination DB and saved-plan
preview/recovery/UI suites passed 24/24 (21.57s), for 43 focused tests overall.
DB parity remains 22 requests with digest `fnv1a:8c4a9050cfea5e8b`; rollback fixtures
leave no durable changes. Whitespace checks passed. The existing preview login
at http://127.0.0.1:3000/login returned HTTP 200; no new browser/build verification
was performed. The pre-existing Vite config-loader advisory remains.
Security review: trusted planner authorization
precedes base reads, RLS remains active, UUIDs are validated, and source-lock/digest
checks precede writes; contractor revision attempts are denied in real SQL tests.
No SQL privileges, auth policy, provider calls or durable test records were added.

The full Git merge, upstream repair UI, final build/browser checks and release
verification remain pending. The local preview was not restarted, so this checkpoint
does not claim the running production build includes these backend changes.

## GitHub reconciliation — area 1: navigation checkpoint (2026-09-15)

Fetched `origin/main` at `c70ecef` without pulling into the working tree. The
pre-sync tracked/untracked snapshot is preserved at
`refs/codex-backups/pre-sync-20260915`. Merge-tree assessment found 22 conflicting
files. PR #27 remains open and is outside this sync.

Navigation/page-entry resolution: retain the current `WorkspaceNavigation`,
`src/app/plans/page.tsx`, `src/app/requests/page.tsx` and `src/app/sandbox/page.tsx`
entry behaviour. These preserve the approved shared theme, Home/history/settings,
coordination/backlog links, separate private drafts, role gates and URL selection.
The existing contextual sandbox return link already serves the upstream return-to-
saved-planning intent. Do not introduce the upstream sandbox layout alongside the
current page shell: that would duplicate navigation/workspace landmarks. Sandbox
subpages/session-boundary integration must be reconciled as a later whole area.

Added regression assertions for exact sandbox return selection, excluded private
query data, a single navigation/skip target, and contractor navigation scope.
Focused navigation/page/return/auth suites: 44/44 tests across five files (2.81s).
This is a preservation checkpoint, not a completed Git merge or release. No
production components, database, running preview or remote branches were changed.
Full build, browser UAT and full/DB suites are deferred until functional integration.
The existing Vite config-loader advisory remains. Next area: saved-plan repair and
revision workflow; request editing, sandbox subpages, engine changes and remaining
documentation/test reconciliation follow separately. Local preview remains at
http://127.0.0.1:3000; it was not restarted or reverified during this checkpoint.

## Deferred-work Task 3 — reviewed carry-forward verified locally

Review fix round 1: original-source reapproval could strand a previously prepared
target because generation zero dedupe ignored source revision. Additive migration
`20260915081323` makes lookup/uniqueness match the full source request/generation/
revision identity (seeded null uses zero), retaining immutable history and original
retry IDs. Rollback and independent-session regressions reproduced the failure;
fix-specific verification:24/24 related DB tests (47.65s),13/13 independent races
(69.69s), unchanged22-request parity, lint/typecheck passed. Initial existing-case
timeouts passed unchanged focused retry and the clean complete rerun. New migration
only committed as `e3e7cc8`; regression/docs changes remain in the fix-only unstaged
patch. Controller will run the fresh full-suite final gate. Preview PID53449 unchanged.

New task-owned files committed as `1fc5441` (ten files). Twenty-two existing-file
integrations remain unstaged with the preserved dirty baseline; exact task-only
changes are in `task-3-integration.diff` beside the detailed Task 3 report.

Implemented explicit linked-draft preparation and normal intake review, exact
published-source retirement confirmation, one active occurrence, dependency guards,
seeded-loader/workforce parity, latest cancelled restoration and direct SQL bypass
protection. Forward targets are strictly later than the active source, including
historical workflows. Private contractor DTO boundaries and nonblocking coordination
organisation confirmation remain intact. PROJECT_BRIEF now describes both journeys.

Four CLI-generated additive migrations were controller-reviewed and applied only
to dedicated hosted Dev; all prior checksums accepted unchanged. No reset, seed,
Docker, deployment or live provider send. New mapping/preparation fixture cleanup
verifies 21 immutable-history guards and never rewinds source revision.

Fresh lint/typecheck/build passed. Full suite: 774/774, 93 files, 190.02s. Required
DB rollback: 84/84, 14 files, 94.46s; original 22-request parity digest unchanged.
Earlier full-run failures were one unchanged DB latency timeout and outdated
coordination endpoint mocks; focused checks and fresh full run passed. An extra
old review-preimage test was accidentally discovered during the first required DB
run; all preimages now have non-executable `.snapshot` suffixes and the clean DB
rerun passed. Concurrency: 13/13, five files, 59.59s. Authenticated production HTTP:
6/6, two files, 62.65s. The new carry-forward HTTP journey asserted zero AI,
Telegram and blocked-provider calls.

Real isolated-browser journey passed: source inspector → explicit record → backlog
→ prepared target → ordinary request review → generation → validated-slot
coordination proposal → Apply with pending organisation response → publication →
scheduled (not completed) backlog. Exact-source publication checkboxes, failed
backlog refresh with preserved saved link, Back/Forward, reload, keyboard focus
trap/Escape return, 390×844 layout and own/foreign contractor views were verified.
No private-note or title leakage to foreign scope; no uncaught browser errors.
All three fixture browser sessions closed, exact accounts/data/session files and
recovery manifests removed, 21 guards verified. Post-cleanup 22-request parity
remained unchanged; source revision was never reset.

Final production rebuild passed (1646ms compile, 1777ms TypeScript). Preview:
`http://127.0.0.1:3000`, exec session `37676`, Next PID `53449`, npm parent `53432`.
Login page verified in a fresh browser with no errors. Optional Anthropic/Telegram
keys are empty only for this preview process; environment files are unchanged.
VoiceOver, a full manual accessibility audit and 1440/1920px layout sweeps were not
rerun in Task 3; desktop 1280px and mobile 390px were checked. Eight screenshots and
the detailed evidence/report are retained in the ignored SDD task folder.

Supabase advisor access remains permission-denied, not verified. Provider live
success, operational safety and geographic redistribution clearance remain outside
this task. Exact integration inventory, migration hashes, RED/GREEN and final local
server/evidence are in `.superpowers/sdd/2026-09-15-deferred-work/task-3-report.md`.

## Deferred-work Task 2 — backlog UI and connected journeys

Review fix round 1 makes lifecycle progress/errors available inside the modal and
adds Reload current work there. Recovery preserves the reason/target, shows the
latest state/version for review and requires another explicit Save action. Two
failing regressions reproduced missing modal status/alerts; 54 affected UI/navigation
checks now pass, with scoped lint/typecheck/whitespace checks passing. Fix edits
remain unstaged; exact source/test diff is in the Task 2 fix-1 artifact.

Implemented the shared-shell planner backlog, exact `work` URL detail reads,
trusted-owner/configured-night filters, due date/priority/threshold edits, required
reason dialogs and explicit completion/cancellation/reopen/escalation/target-night
commands. The contractor request workspace carries the exact work ID through page
composition and login, displaying only its scoped backlog DTO; private draft pages
omit it. Planner navigation, source-plan/intake links and saved-plan summaries connect
the backlog to Night overview. The inspector records only exact saved deferrals;
draft alternatives do not increment history and proposed nights do not approve work.

Confirmed mutation responses retain their exact item/version and recovery ID when
the list refresh fails. Explicit-record retries reuse the same key while the reason
is unchanged. Independent detail reads survive filters/pagination; aborted or late
responses cannot replace a newer URL selection. Unsaved metadata/reason guards and
dialog focus recovery cover keyboard exits, including removal of the completion
button after success. Role review confirms planner page gating, contractor-only DTO
acceptance, no planner links/history/actions in contractor views and no local-storage
persistence, provider calls or changed server permissions.

TDD observed missing UI/navigation failures, then regression failures for duplicate
Back confirmation, stale detail after a changed missing URL and lost completion
focus. Final affected suite: 87 tests across 10 files passed; full lint, standalone
typecheck and whitespace checks passed. The existing Vite config-loader advisory
remains. Integrated DB, production HTTP, browser and build verification are reserved
for Task 3. No migrations, deployment, server restart or live provider activity.
Existing production preview remains http://127.0.0.1:3000 (older build, not used as
evidence for this feature). New task-owned files are committed separately; baseline
integration edits remain unstaged and are inventoried in the Task 2 report.

## Deferred-work Task 1 — persistence and API

Implemented durable backlog identity, private append-only occurrence/audit history,
explicit historical deferral recording, publication INSERT-trigger projection,
same-night correction and current-publication precedence. Scheduled remains
unresolved; completion/cancellation/reopen/escalation are explicit planner actions.
Owner/due-date/priority/threshold/target-night metadata is version checked and does
not alter planning-source revision. Contractor SQL projections omit planner IDs,
plan links and notes. Bounded list/detail APIs include configured night/owner choices.

Root reviewed and approved additive CLI-generated migration
20260915050742_deferred_work.sql before hosted Dev application; it applied alone
with all prior checksum history unchanged. The applied file is now immutable.
Pure/API 9 tests, rollback DB 7 tests, initial publication/outbox bundle 29 tests,
existing concurrency 9 tests, typecheck and scoped lint pass. Exact fixture cleanup
restores 20 history guards; baseline parity passes for the unchanged 22 requests.
Supabase security advisors was denied by connector permissions; direct SQL checks
confirmed RLS, write grants, helper execution grants and fixed search paths.

Backlog UI and reviewed carry-forward remain subsequent tasks. Task 3 must extend
the current seeded scheduling projection with a retired-occurrence guard; intake
links already require the exact active approved revision for scheduled status.
No new live provider call, seed/reset, deployment or browser/build run occurred.
Existing production preview remains at http://127.0.0.1:3000/plans.

Task 1 review fix: a historical record after a scheduling correction and subsequent
complete removal could incorrectly restore the deferred count. A failing rollback
regression reproduced count1 instead of count0. Root-reviewed additive migration
20260915052157_deferred_work_publication_precedence.sql makes every current
publication outcome authoritative while retaining the historical note. Deferred,
plan and outbox regressions pass 22/22; typecheck, scoped lint, parity and 20 history
guards pass. Previous applied migration checksums remain unchanged.

Last updated: 2026-09-15

## Coordination Task 3 — integration verification

Added five actual independent-session coordination races and a production HTTP
two-organisation journey with controlled/off providers. Exact fixture cleanup now
removes coordination FKs before plans, supports an owned isolated future night,
verifies fixture removal, and restores all 17 history guards. The ordinary DB gate
includes coordination rollback coverage. Test facts/cleanup advance the global
Dev source revision without resetting it; old saved snapshots remain intact but
can become stale. Browser fixture accounts, requests, case, plans, night and
temporary session files were removed after checks.

Fixed two integration gaps with failing-then-passing regressions: owner/deadline
edits now participate in the unsaved guard; contractor ordinary request pages
forward an exact case ID through reload/login while private drafts omit it.
Foreign exact IDs report not-found without selecting another case. Affected
UI/navigation coverage passes 62 tests in eight files. Typecheck, lint, production
build and whitespace checks pass. Baseline parity remains
`fnv1a:8c4a9050cfea5e8b` for 22 requests; the required DB gate's 70 integration
checks and all 9 concurrency checks passed. The production HTTP suite passed all
5 tests with exact fixture cleanup; final evidence is in the Task 3 report.

Production-browser verification used isolated identities at 1440×900 and390×844:
keyboard validated-alternative creation, pending Apply, exact linked draft,
planner-recorded confirmation, contractor own-only display/change request,
revision reset, historical Apply disabled, and revision-1 status retained in
the applied-plan summary and publication dialog. Native Back Cancel preserves an
unsaved owner edit; Accept leaves, and refresh/back/forward preserve linked case/
plan context. Escape returns focus to dialog openers. Computed body is white,
no horizontal overflow or browser console/page errors occurred. A real token-expiry
wait and spoken-reader test were not performed; signed-out redirect context was.

No deployment, migration, live provider send, credential change or public-schema
exposure change. Hosted advisor permission remains unavailable as recorded in
Task 1; manual boundary review and real RLS tests provide the evidence here.
Updated production preview: http://127.0.0.1:3000 (session19168, PID40412), rebuilt
after review corrected the subtitle to “apply a validated proposal.” Static copy
assertion and coordination UI22/22 passed; `/login` health returned200.
New Task3 test files only are committed as `f9a4eb7`; fixture/integration/docs
remain unstaged for review. Final HTTP5/5 and post-cleanup baseline parity pass.

## Coordination and deferred-work — implementation started

Pavan approved the written design and explicitly authorised the current checkout.
Implementation plans: `docs/superpowers/plans/2026-09-15-coordination.md` and
`docs/superpowers/plans/2026-09-15-deferred-work.md`. Coordination backend is in
progress, with separate implementation/review and test-first verification. Baseline
verification passed 686 tests in 82 files. Coordination backend is implemented:
private immutable proposals/participant snapshots, revision-specific informational
confirmations, scoped contractor DTOs, optimistic lifecycle actions and atomic
validated Apply. Fresh source-plan rebasing preserves proposal history; exact
applied-plan filtering returns that revision's confirmations. Both reviewed
additive migrations were applied to dedicated Dev; the second corrects SQL JSON
operator precedence without changing the original applied checksum.

Backend verification passed 22 focused tests (including five real rollback
coordination DB tests and eight existing plan DB tests), then **700 tests in 85
files, zero skips** in the serial full run. Typecheck, full lint and diff whitespace
checks passed. Transient DNS failures during the first DB attempt recovered.
Real checks cover pending Apply, replay after later revisions, foreign-org denial,
scoped nested DTOs, stale rebase, immutable evidence and SQL forged-result rejection.
Hosted security advisors were unavailable due to tool permissions; manual SQL
review and real RLS checks are recorded, without claiming advisor clearance.
Planner/contractor UI, browser journeys and independent-connection coordination
race verification remain later integration work.

Coordination UI is now implemented locally: the planner queue exposes exact-case
URLs, bounded owner/night/state/overdue/pending filters, complete server-derived
proposal changes, revision previews, Apply and audited confirmation/lifecycle
actions. The saved-plan inspector creates cases only from existing validated
analysis parameters or up to three real alternatives. Contractors receive only
their scoped change cards and change-request action; private drafts do not receive
coordination content. Creation and Apply keep stable idempotency keys across an
uncertain response while their exact input/version is unchanged. Exact applied-plan summaries use `viewedRevision` in the
Night overview and publication review, without gating publication. Focused UI,
navigation, saved-plan and request regressions passed 52 tests across 8 files;
lint, typecheck and whitespace checks passed. Browser/runtime and complete
authenticated journeys remain Task 3 integration work; the existing port 3000
preview predates this checkout state and was not used as verification.
No deployment is authorised for these
features. Existing uncommitted changes are preserved.

Task 2 review round 1 fixed direct-link fallback, historical revision Apply and
confirmation alignment, delayed preview/mutation response races, and scoped case
pagination. Five new regressions raise the focused result to 57 tests across 8
files; typecheck, lint and whitespace checks remain green. These fixes are local
and retain the same Task 3 browser/authenticated integration boundary.

Task 2 review round 2 closed the remaining same-case preview reset and
mixed-filter cursor paths. Two exact-sequence regressions raise focused coverage
to 59 tests across 8 files; typecheck, lint and whitespace checks remain green.

### Design checkpoint (historical)

Pavan requested priorities one and three: conflict coordination with non-blocking
organisation confirmation, and accountable deferred work. Proposed design is in
`docs/superpowers/specs/2026-09-15-coordination-and-deferred-work.md`. It specifies
version-bound planner-recorded approvals, atomic validated Apply, scoped contractor
views, deadline escalation, distinct-night deferral counting, owned backlog and a
reviewed carry-forward intake flow. Global multi-night optimisation is explicitly
outside this proposed release and requires review of that boundary.

Only design documentation changed this turn. No application code, migration,
database mutation or deployment occurred. Design whitespace/placeholder checks
passed; runtime tests were not rerun for documentation-only changes. Detailed
implementation plans and build await written-design approval per the brainstorming
workflow. Existing uncommitted changes remain preserved. Previously running local
preview: http://127.0.0.1:3000 (not rechecked this turn).

## Full working-tree release — 2026-09-15

Deployed all current website changes (base `aa7395f` plus uncommitted work) to
https://railplan-nine.vercel.app. Vercel deployment
`dpl_Dm26veu5dm3Ps5CGa21XbpQ9A8c7` is READY, with a successful 34-second Next.js
production build. Immutable URL:
https://railplan-gwdgwjepg-pavanmadhup-1254s-projects.vercel.app.
This supersedes the undeployed labels in the historical entries below.

Release verification: latest local suite passed 686 tests, lint, typecheck and
build. Authenticated live browser verified generated sandbox result (17 placed,
5 deferred, zero violations), keyboard move preview, Apply and Undo; Night
overview loaded and Add request opened the organisation-aware form preserving
night context. White page styling verified; browser warnings/errors were absent.
No production request was submitted or saved plan published during verification.
No database migration, credential or environment change was performed this turn.
Local preview remains http://127.0.0.1:3000. Initial CLI authorization failure was
resolved by explicitly selecting the existing project team. The deployment's
10-minute error-log scan returned no matching logs. Continuous monitoring
and log-drain configuration were not audited.

## Sandbox drag-to-reschedule — 2026-09-15 (not deployed)

Generated sandbox drafts support horizontal snapped pointer proposals and
Alt+Left/Right keyboard proposals. Whole-request linked bars and clearance move
together visually; drop opens a validated solver preview, not an immediate edit.
Apply pins the selected time and updates the entire result. One-step Undo restores
the previous result/pins and is invalidated by other planning changes. Pins,
emergency/overrun work, busy/submitted views and pending disruptions are protected.
Touch users retain the existing inspector alternatives. No saved-plan, API,
database or solver changes; unrelated local work preserved.

Verification: all 686 tests across 82 files passed, including focused
store/component/dashboard regressions; lint, typecheck, production build and
diff whitespace checks passed. Real-browser pointer drag and keyboard preview,
Cancel, Apply and Undo verified; linked bars, inspector and metrics stayed in
sync, with no browser warnings/errors. Authenticated E2E was not rerun for this
sandbox-only change (no authentication/API changes). Production preview remains
running at http://127.0.0.1:3000; this feature has not been deployed.

## Planner Add request — 2026-09-15 (local, not deployed)

Night overview now links to manual creation with selected night/version/request
return context. Planner intake requires an organisation; saving creates a shared
draft, submission opens that exact request for separate review, and only approval
adds planning input. Organisation edits are included in unsaved-change protection.
The additive `20260915024501_planner_manual_request.sql` migration was applied to
the configured RailPlan development database; no existing migration was modified.

Security review: verified identity/profile gates in the service and new private
function, empty search path, no anonymous/public execution, contractor override
denial, organisation-scoped reads, existing JSON/origin guards and unchanged
approval requirements. Supabase management advisors could not be run: the connected
account's project list does not include RailPlan. Direct SQL privilege/search-path
tests and authenticated access-control tests passed instead.

Verification: lint/typecheck/build and database round-trip passed; scoped
feature/security suites passed. The first full suite had 675 passing tests and one
existing workforce timeout at 5 seconds; its isolated rerun passed. The second
full run passed 679 tests and caught the newly added stale-editor error regression
before its fix; after clearing the previous editor on failed new-request loading,
all 25 intake tests passed and the production build passed again. No further full
suite was run after that focused fix. Desktop/mobile browser
creation and refresh checked, no overflow or console warnings. The in-app native
unsaved prompt stalled browser automation; its test-only tab was closed, and the
organisation-only unsaved guard passed in component tests. All four authenticated
HTTP/provider-policy E2E tests passed, including planner manual creation and
submission; temporary fixtures were cleaned up by the harness. Local production
preview: http://127.0.0.1:3000. Frontend deployment remains a separate step.

## Shared sandbox UI deployed — 2026-09-15

At the owner's request, deployed the current working tree (base `aa7395f`, including
the uncommitted UI/navigation work) to the existing RailPlan project under
`pavanmadhup-1254`. Forced a clean remote production build, then promoted after
lint, standalone typecheck and all 671 tests across 80 files passed.
Deployment `dpl_DpsQwHCB268t4Uj1cztXqbYdCTZ3` is READY; remote build completed in
49 seconds. Live: https://railplan-nine.vercel.app/sandbox. Immutable deployment:
https://railplan-cs22jklp2-pavanmadhup-1254s-projects.vercel.app.

Authenticated production browser verification confirmed the actual shared queue
and timeline, white computed body background, blue controls, collapsed workforce
and a generated demo result of 17 scheduled / 5 deferred / 0 conflicts. Browser
console was clean. Anonymous login returned 200 and private overview API returned
401; deployment inspection resolves the live domain to the new deployment. The
deployment-specific 10-minute error scan returned no matching logs. Log drains and
continuous monitoring were not audited. No migration, auth/protection change,
environment change, saved-plan publication or provider message was performed.
Separate controlled-provider E2E/concurrency suites were not rerun. Existing
geographic-source licensing and operational-use limitations remain unresolved;
deployment does not constitute clearance. Local preview remains on port 3000.

## Sandbox component parity correction — 2026-09-15

The earlier colour/spacing pass was insufficient: sandbox retained its old queue,
chart and inspector. It now renders the same PlannerQueue/PlannerTimeline as Night
overview, with a shared request/time header in both inspectors. The sandbox adapter
uses fabricated visible inputs, including pending emergencies and disruptions;
no saved-plan API or persistence is introduced. Additional filters retain mandatory,
pinned, needs-action and conflict-category views. Detailed facts/corridor remain
expandable, while alternatives are directly visible. Toolbar uses planner controls.

Forty focused component tests, lint, typecheck and production build passed. New
regressions were observed failing before implementation. An initial test used the
wrong disruption method and was corrected to exercise the actual store; an ARIA
tab warning was fixed by using aria-selected only. Browser checks verified the
shared layout at 1440px, selected-request details, keyboard workforce expansion,
390px without horizontal page overflow, and no console warnings/errors.
Local preview: http://127.0.0.1:3000/sandbox. No deployment or separate provider E2E.
The full suite passed 670 tests across 80 files before the final additional-filter
regression; the final 40 focused tests include that filter and its implementation.
The existing Vite future-config-loader advisory remains non-blocking.

## Sandbox visual alignment — 2026-09-15

Aligned the sandbox summary, draft toolbar, timeline tabs and inspector typography
with Night overview's white/blue design. Four headline figures now include draft
deferrals; movement and utilisation remain available under Calculations. The
primary action says “Generate draft schedule” rather than claiming optimality.
Desktop panels use the taller saved-workspace height range and retain the compact,
click-to-expand workforce section. Demo data, repairs, pins, scenarios and solver
behaviour are unchanged; sandbox publication remains unavailable.

Verification: 29 focused tests, all 668 tests across 80 files, lint, standalone
typecheck and production build passed. The existing Vite future-config-loader
advisory remains. Desktop browser measurement at 1440×900: timeline 684.5px, closed workforce
48.5px; keyboard expansion passed. Computed body background is white; 390px mobile
has no horizontal page overflow and browser console has no warnings/errors.
No separate authenticated E2E/provider run or deployment for this presentation
change. Local production preview: http://127.0.0.1:3000/sandbox.

## Click-to-expand workforce availability — 2026-09-15

Night overview and Demo sandbox now share a collapsed-by-default workforce header
with shortage/unknown-demand status. Clicking or pressing Enter/Space reveals the
chart and detailed controls; hidden content stays mounted and inert so filters
survive reopening and tab switches. Removed duplicate external workforce headings.
The closed panel uses content height instead of reserving chart space, giving that
space back to the engineering timeline. No solver or API changes.

Focused workforce, sandbox-panel and saved-plan tests: 26 passed. Lint and production
build (including TypeScript) passed. Browser checks verified saved-panel height
44px closed / 280px open, sandbox 48px / 299px, visible status while closed,
mobile without overflow and no console errors. Full suite: 667 tests passed across
80 files. No deployment or separate authenticated E2E/provider run.
Local preview: http://127.0.0.1:3000/plans and /sandbox.

## Taller engineering timeline — 2026-09-15

Raised the saved planning workspace's desktop height range from 450–720px to
650–900px, allocating 200px more to the timeline at a 1440×900 viewport. Measured
timeline scrolling area increased from 260px to 460px; workforce stays 140px and
row/text sizes are unchanged. The existing 650px mobile workspace is retained.
Browser verification confirmed the larger rendered timeline, no page overflow at
390px and no console warnings/errors. Thirteen panel tests, lint and production
build (including TypeScript) passed. Full suite/E2E were not rerun for this CSS-only
change. No deployment. Local production preview: http://127.0.0.1:3000/plans.

## Request UX priority batch — 2026-09-15

Implemented the first three priorities from the owner's UX review: shared HH:MM
inputs with explicit planning-date/day offsets in manual intake and private draft
editing; request-inbox search and status/night/organisation filters; role-specific
status/next-step guidance separating the current revision, active approval and
published slot. Unknown private times remain null; blank required manual times
are blocked before saving. API integer-minute contracts, permissions and solver
rules are unchanged. Filters apply only to the loaded, scoped recent list (up to
100 records), disclose that limit, and do not replace an open selection or edits.

Verification: 667 tests across 80 files passed; lint, typecheck and production
build passed. Initial failing regressions confirmed the missing controls and
missing required-clock guard. A TypeScript narrowing error in the duration-only
branch was corrected before the successful build. Browser checks covered the
authenticated planner inbox, search/clear controls, white computed background,
390px responsive width without overflow and no console warnings/errors. The live
inbox is empty, so populated clock/status cases and contractor behaviour were
verified in component tests, not a live browser submission journey. The existing
Vite future-config-loader advisory remains. No separate E2E/concurrency/provider
suite, deployment, migration or credential change was performed.

Final consolidation moves the existing planner-only published-plan link into the
status summary and removes duplicate approval/slot paragraphs. An existing test
caught changed active-approval wording; the original explanation was retained.
All 32 affected component/journey tests passed again after that consolidation.

Remaining review recommendations: actionable overview indicators, richer version
history/comparison entry, clearer sandbox adjustment retention and generation
wording, and task-based usability testing. These are not claimed implemented by
this incremental request-workspace batch. Local preview: http://127.0.0.1:3000.

## Production stylesheet cache correction — 2026-09-15

The owner reported beige Home surfaces and a transparent primary button after
deployment. Inspection of both the actual browser and served CSS confirmed old
`--color-paper: #edebe6` and missing `--rail-primary` despite correct local source.
Rebuilt with `vercel deploy --prod --force --yes` (build cache explicitly skipped).
Deployment dpl_Gr1m6FRLcNRYmwzDJyRASFhXvizK is READY at the existing production alias;
immutable URL: https://railplan-93nqi1771-pavanmadhup-1254s-projects.vercel.app.
Production build passed in 50s. Refreshing the reported tab now yields a white
rgb(255,255,255) body and blue gradient rgb(0,85,184) → rgb(1,72,155) primary action.
Screenshot confirms neutral panels and readable buttons. No app logic changed;
unit/E2E tests were not rerun for this cache-only rebuild.

Release lesson: validate computed production colour tokens and primary-button
backgrounds, not just content and headings. Earlier deployment verification missed
the stale CSS. If source and served bundles differ, rebuild without build cache.

## Home and sandbox updates deployed — 2026-09-15

At the owner's request, released the current working tree (base aa7395f plus the
site-wide navigation, Home guide and sandbox corrections) to the existing RailPlan
production project. Deployment dpl_AiHmfcQEGgXQdWz8kKirbDqCtmwz is READY at
https://railplan-nine.vercel.app. Immutable URL:
https://railplan-kwcsnv7mt-pavanmadhup-1254s-projects.vercel.app.
Vercel production build completed in 49 seconds. No commit/push, migrations or
authentication/provider configuration changes were made.

Release used the preceding 661-test, lint, typecheck and build verification.
Post-deploy checks: login HTTP 200, anonymous private overview HTTP 401;
authenticated browser Home-to-sandbox journey exposes the new headings and 160px
workforce panel, with no browser console warnings/errors. Existing operational
and geographic licensing limitations remain; this deployment is not clearance.

## Sandbox panel styling correction — 2026-09-15

Corrected the remaining legacy sandbox panel presentation identified in the owner's
screenshot: single Work requests / Engineering timeline / Request details headings,
MRT chips, stronger request titles, pale-blue selection, hatched clearance and a
larger inspector title/time summary. Width controls and the retained assistant are
expandable rather than permanently occupying panel space. All underlying sandbox
repair, alternatives, pinning, workforce and scenario computations are unchanged.
The compact workforce panel no longer shrinks under timeline pressure; its 72px
chart fits fully inside a 160px panel below a roughly 570px desktop timeline.

Focused panel/workforce tests (19), full suite (661 tests / 79 files), lint,
typecheck and production build passed. Separate HTTP E2E/provider checks were not
rerun for this sandbox-only presentation correction.
Browser checks verified schedule generation, request selection, width control
disclosure, workforce detail expansion and complete chart visibility. Desktop and
390px mobile had no document overflow. No deployment or backend changes.
Preview: http://127.0.0.1:3000/sandbox.

## Home guide and page introductions — 2026-09-15

Added an authenticated Home guide at `/`, linked from Home and the RailPlan brand.
Six numbered stages explain Prepare → Submit → Review → Schedule → Publish → Track,
with role-scoped action links and a separate planner sandbox explanation. Supported
night/version/request context is preserved through Home. Added short descriptions
to saved planning, request review, contractor intake, private drafts and sandbox;
history, settings and login retain their existing introductions. Post-login direct
workspace destinations, permissions, APIs and solver behaviour are unchanged.

Verification: 661 tests across 79 files passed; lint, typecheck, production build
and diff check passed. The initial build caught an unsupported Testing Library
test option; it was corrected and the final build passed. Browser checks confirmed
desktop and 390px mobile Home layout without overflow, Home-to-drafts navigation,
the draft introduction and a clean console. Viewport overrides were reset.
No separate HTTP E2E/concurrency/provider rerun for this content/navigation change;
contractor link scoping is covered by automated rendering tests, not a fresh browser
login. No deployment. Preview: http://127.0.0.1:3000/.

## Site-wide UI and navigation implemented locally — 2026-09-15

On `codex/sitewide-ui-navigation`, extended the approved white/blue palette and
shared role-aware shell across saved planning, demo sandbox, request intake,
private transcript drafts, notification settings, login and system states.
Added `/plans/history`, `/settings/notifications`, `/requests/drafts` and
`/contractor/drafts`; selected records and night/version return context survive
linked journeys. Exact submission and published-plan links retain role boundaries.
Sandbox uses queue–timeline–inspector with a larger timeline and compact expandable
workforce, keeping fabricated inputs separate from saved plans and retaining its
repair, scenario, geography, calculations and assistant capabilities.

Shared unsaved guards cover edited forms, previews, notification settings and sign
out. Back uses cancelable pre-traversal events where available and a tested
capture-phase fallback. Auth return paths have an exact path/query allowlist and
server-resolved role checks. Independent review identified and corrected missing
sandbox return context, router restoration ordering and native-link double prompts.
No solver, migration, permission, provider-setting or deployment change was made.
Pre-existing local changes were preserved; this work is not committed or deployed.

Verification: 659 tests across 79 files passed; four authenticated production HTTP
E2E tests passed with controlled providers; lint, typecheck, production build and
diff checks passed. After the last internal-link correction, 18 affected tests
passed again. A Vite future-config-loader advisory remains (not a test failure).
Desktop and 390px mobile browser checks covered the shared palette, sandbox/history/
request/settings/overview links, no document overflow, conflict focus and mobile
inspector Escape/focus return. Sandbox measured a 589px timeline versus a 140px
compact workforce at desktop width. A 720px reflow check also passed.

Remaining manual release QA: explicit browser Back Cancel/OK, contractor visual
journey and actual browser zoom. Chrome showed the Back warning, but browser control
was interrupted before reliable Cancel/OK verification; automated traversal and
both-role authorization checks pass. No live Telegram/LLM delivery, screen-reader
audit or new database concurrency run was performed for this UI/navigation update.
Existing geography licensing uncertainty remains. Local production preview:
http://127.0.0.1:3000/plans. Deployment remains a separate release step.

## Updated workspace deployed — 2026-09-15

At the owner's request, deployed the current working tree (base aa7395f plus the
connected-workspace and styling changes) to Pavan's existing RailPlan Vercel
project. Deployment dpl_3VSRivj27a427rUZYEJWo6juKBWp is READY and promoted to
https://railplan-nine.vercel.app. Immutable deployment URL:
https://railplan-47baijgp6-pavanmadhup-1254s-projects.vercel.app.
No Git commit/push, migrations, provider settings or authentication changes were
made. Existing geographic-source licensing uncertainty remains unresolved.

Fresh checks: 615 tests across 73 files passed; lint, typecheck, diff check and
Vercel production build passed (build output completed in 44s). Anonymous login
returned 200, private overview 401 and private workspace 307. Live browser login,
saved-plan loading and actual white/blue-gradient styling were verified with no
browser console warnings/errors. Existing saved draft correctly reports changed
inputs; no plan generation, publication or live notification was performed during
deployment verification. Separate concurrency/provider E2E suites were not rerun
this turn; their earlier passing results remain documented below.

## Palette correction — 2026-09-14

Sampled intact reference-image regions instead of guessing the palette: primary
blue around #01489B, panel neutral #FBFBFB, selected blue #CAE0FC. Removed the
blue-grey page tint, unified planner link/tab accents, and introduced subtle
primary, selected-bar and panel gradients. Browser computed styles verified the
new white canvas, consistent #004BA5 link/tab colour and expected gradients after
rebuilding. Lint, typecheck, build and four planner-panel tests passed; no DB/E2E
rerun for this CSS-only correction. Reference raster artefacts mean this is not a
claim of pixel-perfect equivalence. Preview: http://127.0.0.1:3000/plans.

## Reference styling correction — 2026-09-14

Matched the approved reference more closely with cool white panels, saturated
blue actions and pills, pale-blue selected timeline bars, MRT line chips and
compact queue rows. Context tabs now sit in the timeline header. The workforce
view is a complete 90px-high overview inside a 140px body, not the earlier clipped
full chart; detailed filters and interval inspection expand on demand. It retains
actual team/role people counts, rather than relabelling them as aggregate crews.
Existing solver, saved facts and publication behavior are unchanged.

Verification: a new compact-chart regression failed before implementation and
passed afterward; 20 focused tests, lint, typecheck and production build passed.
Browser inspection at 1440px and 390px confirmed chart visibility, detail expansion
and no document overflow or console warnings/errors. Full DB/E2E suites were not
rerun for this presentation-only change. Preview: http://127.0.0.1:3000/plans.

## Timeline space adjustment — 2026-09-14

Reduced the scrollable context/workforce body from 195px to 120px as approved,
giving the engineering timeline 75px more vertical space. Browser measurements
at the same viewport confirmed timeline height increased from 192px to 267px;
workforce overflow remains scrollable. Lint, typecheck, production build and
10 focused planner tests passed. No planning logic or data changed; full DB/E2E
suites were not repeated for this CSS-only adjustment. Production preview remains
running at http://127.0.0.1:3000/plans.

## Connected night workspace — 2026-09-14

Implemented the owner's approved reference UI on `/plans`: real configured-night
overview, exact pending count, scheduled/mandatory/deferred/critical metrics,
searchable request queue, all-block timeline with separate clearance hatching,
desktop inspector and narrow-screen dialogs. Workforce, geography and calculated
metrics share request selection. URL state retains night/version/request.

Server-only, read-only saved analysis provides explanations, alternatives, pin
and objective previews plus five-objective comparison. Saving a preview re-solves
with source/engine/digest guards; saved versions remain immutable. History is
cursor-paged, current publication is independent of pagination, and saved-version
comparison distinguishes schedule movement, reassignment, revised facts and
deferrals. Publication review retains the existing endpoint/outbox behavior;
delivery, exports and review notes remain separate. Request review supports a
server-side night filter before its existing limit.

Async abort/epoch guards, unsaved-preview discard, publication gating and exact-ID
recovery cover late responses and successful writes whose display refresh fails.
Independent review found these two recovery gaps; fixes now have four additional
passing regressions. No solver changes, migrations, provider configuration,
public deployment or changes to user-owned AGENTS/next-env edits.

Verification complete: full suite 614 tests/73 files, zero skips; required database
parity, 62 rollback tests and 4 real concurrency tests; 4 production HTTP E2E tests;
lint, typecheck and production build all pass. Browser testing caught an exported
placement carrying extra display fields into the strict pin API. The workspace now
normalizes the payload to placement fields; a red-then-green regression and a real
pin-preview/save browser journey verify the fix.
Production-browser checks covered 1280/1440/1920 desktop widths, 390px mobile,
native Chrome 200% zoom, mobile search/shared selection, Escape focus restoration,
saved-version comparison, publication review without publishing, and all three
context tabs. No document-level horizontal overflow or browser console errors were
observed. Spoken screen-reader testing remains a manual follow-up, not a verified
claim. The existing Vite future config-loader warning is non-blocking.
Existing dev server was stopped before build. Development `127.0.0.1` rejected
Next resources under its dev-origin policy; using `localhost` resolved hydration
without changing application permissions. A production preview is running at
http://127.0.0.1:3000/plans. Browser verification left two fabricated-input drafts
for 2026-09-16 (d1427599 and 885e1bbf); neither was published and no live notification
was sent. No public deployment was made. Existing geographic-source licence
uncertainty remains unchanged.

## Vercel deployment — 2026-09-09

Deployed and promoted at the owner's request, under the verified account
`pavanmadhup-1254` and team `pavanmadhup-1254s-projects`. No deployment or mutation
was made in Ayush's account. Project `railplan` is
`prj_cu87fVlWwHlXQZ0rVoQLAkjiYqJy`; deployment
`dpl_9C4v4LsGz14XQb2B31s5by8SdkSZ` is READY (production).

Public URL: https://railplan-nine.vercel.app

At the owner's subsequent explicit request, Vercel Authentication was disabled
for the RailPlan project (`ssoProtection: null`). Both the public domain and
`railplan-pavanmadhup-1254s-projects.vercel.app` now reach the RailPlan login
without a Vercel account (anonymous HTTP200). Anonymous `/api/requests` still
returns401 and `/plans` redirects to the app's `/login`. Both aliases resolve to
the same verified deployment. App session, role and RLS checks remain unchanged;
application access requires a provisioned RailPlan account. This deployment does not clear the geographic-source
licence conflict or complete #17's spoken-reader/200% workflow verification.

The deployed application is commit `8cbebb1` plus the new Vercel configuration:
Next.js preset, locked `npm ci`, Node24.x and Singapore (`sin1`) function region.
The remote production build passed. Source upload excludes local env files,
agent scratch files and local build artifacts; the public Supabase CA is included.
Production has the two public Supabase settings and a server-only secret
`DATABASE_URL` for the existing RailPlan Dev project. Local credentials remain
ignored with mode0600. AI and Telegram credentials are absent.

Live verification passed: browser sign-in/out, saved-plan display (17 placements,
5 deferrals), real hosted planner/contractor access, catalogue read, independently
validated feasible plan generation, JSON export, contractor403 denials and
cross-origin403 rejection. Browser error/warning logs and Vercel runtime error
scan were empty. One temporary probe initially asserted the wrong heading wording;
correcting the probe to the rendered planner navigation passed without app edits.
Two temporary users, their organisation and one draft plan were removed. The
22-request canonical digest remains `fnv1a:8c4a9050cfea5e8b`. No real provider send,
plan publication or local preview server was involved. Deployment did not use Git
integration or push the current branch; subsequent releases can use the linked CLI.

## Owner-requested teammate access — 2026-09-09

Created two persistent shared demo accounts at the owner's request, one planner
and one contractor in a separate teammate-demo organisation. Existing accounts
were not replaced. Both use independent random passwords and confirmed demo login
identifiers in the reserved `.example` domain. These are not email inboxes;
password recovery is operator-managed. Shared-account actions cannot identify
which teammate performed them. Planner access includes demo approval/publication;
contractor access remains organisation-scoped. No database or Vercel administration
access is granted by these app logins.

Both roles passed real hosted password authentication and their correct workspace
on the public production URL. Contractor access to planner APIs and cross-origin
planner mutations were rejected with403. Verification sessions were signed out;
the two requested accounts remain for the team. No request or plan fixture was
created for this account check. Credentials are only in ignored, owner-readable
`secrets/railplan-team-demo.json` and `secrets/railplan-team-signin.txt`.

The owner separately requested Supabase environment values. Only `DATABASE_URL`
and the two documented `NEXT_PUBLIC_SUPABASE_*` variables were copied to ignored
mode0600 `secrets/railplan-supabase.env`; the unrelated Vercel OIDC token was
excluded. The database URL is a privileged backend credential, separate from the
teammate app login file. Neither file is committed or included in Vercel uploads.

## Ordered issue work — #4–#16 implemented; #17 in progress

Working branch: `codex/remaining-issues`, based on `1c8d999`. The owner requested
#4–#21 in numeric order and requires hosted Supabase without Docker. Existing
fixes through #17's implementation were pushed to `main` at the owner's request.
On September 9, #4–#16 were independently rechecked and closed in numeric order;
#1–#3 were already merged pull requests. #17 remains open; #18–#21 have not started.

The owner approved the actual VoiceOver check on September 9. The macOS switch
was enabled, but automation could not obtain the reader's caption panel or an
actual spoken phrase. DOM/AX labels therefore remain supporting evidence only;
the spoken screen-reader check is unverified. VoiceOver was confirmed off after
the attempt. Native Chrome zoom was observed changing devicePixelRatio from 2 to 2.2
and viewport width 1470 to 1336, then restored to 2/1470. This confirms native zoom
control, but is not a completed 200% workflow check. No temporary app accounts or
persisted fixtures were created during this attempt; the preview was stopped.

The September 9 audit found GHSA-82fw-gwwq-j7x9 in Vitest 4.1.10 and its mocker.
Vitest is now pinned to 4.1.11, with compatible development-toolchain refreshes
(Vite 8.2.2 and Rolldown 1.2.7). Independent lock review confirms all production
dependency entries are unchanged; npm audit reports zero findings. The focused
accessibility/notification suite passes 37 tests. Patch verification also passes:
582 tests across 65 files (zero skips, including the 59 rollback DB checks),
4 actual-concurrency checks, 4 production HTTP E2E checks, lint, typecheck and
Next16.3.4 build. E2E uses controlled providers and cleans its hosted fixtures.
The seed/hash rehearsal and geographic-source results below were verified on
September9 before this development-only patch; they were not redundantly rerun.

Fresh verification: **582 tests pass, zero skips,65 files**; required DB59 rollback
and4 actual-concurrency checks; lint/typecheck/Next16.3.4 production build pass.
The separate production HTTP E2E suite passes4 tests, including the complete
two-role workflow through real hosted sessions. Controlled providers prove one
Anthropic extraction and Telegram failure→retry→success with no duplicate send.
Private-schema RPC access returns406/PGRST106; exact fixture cleanup restores all13
history guards. JSON bytes match, CSV formula defense and contractor scope pass.
Seed --verify-only passes after real writes/parity readback/rollback, with all19
table hashes and source revision/generation unchanged. No fresh hosted/Auth reset,
live provider receipt or public deployment is claimed.

The dependency audit's10 findings are resolved (Next/eslint16.3.4,PostCSS8.5.28 and
compatible transitives); fresh npm audit reports0. Assistant same-origin JSON
checks precede quota and raw errors/model values stay out of logs. Independent
security and UI review/re-review are clean. Accessibility fixes cover small-text
contrast, modal scroll/focus, live assistant answers and notification retry focus;
two follow-up findings have failing-then-passing regressions and50 scoped checks.

Production browser checks pass at1280×800,1440×900,1920×1080 and640×400: saved
Gantt selection, publication feedback,2px keyboard focus and no page overflow.
Login also fits320 CSS pixels. In the short modal, tabbing scrolls actions into
view; focus wraps within the modal and returns after Escape/Cancel. Assistant
answering without credentials retains input focus and updates its named live
region. These are rendered keyboard/AX checks and zoom-equivalent layout sizes,
not actual screen-reader speech or a browser zoom-menu check.
Transcript extraction without credentials shows an accessible error and retains
the entered text. Browser error/warning logs are empty. Final browser cleanup
removed two temporary users, their organisation and one fabricated saved plan;
all13 history guards are enabled and the22-request baseline digest is unchanged.
The test session is signed out, viewport restored, and preview servers are stopped.

#16 is implemented: planners land in saved planning with consistent role-scoped
navigation; the interactive fabricated conflict-repair tool remains at `/sandbox`.
Saved versions have a primary Gantt and linked queue/inspector/workforce/map built
from immutable saved facts. Adjustable panels retain child state, persist bounded
local preferences and support pointer/keyboard resizing with status announcements.

Verification: **536 tests pass, zero skips**,62 files; DB59 rollback+4 actual
concurrency checks, lint/typecheck/build and independent full review pass. Initial
review found the new sandbox route missing cookie-refresh proxy coverage; the
Next matcher regression reproduced and fixed it. Browser visual review then found
solid MRT-coloured task bars could imply conflict status. Bars are now neutral,
with line identity on block labels and accent selection. The new regression plus
saved-review/combined-journey10 checks, typecheck, final build and re-review pass.

The production two-role journey used only UI actions after account provisioning:
contractor create/submit → planner review/approve revision3 → generate18 placements
→ Gantt/inspector/map inspect → publish → explicit missing-destination notification
failure → contractor sees01:15–01:30 revision3 → actual downloaded published JSON
with that exact revision/slot. Contractor `/plans` access redirects to its scoped
workspace. Pointer and keyboard resizing,2px visible focus, collapse/reload
preference retention and1280/1440/1920 overflow checks pass. Sandbox repair,
alternative, pin, emergency replan, engine-grounded assistant and formula inspection
pass; unplaced mandatory work remains explicitly infeasible. Browser logs are empty.
Two users,one request,one plan and one notification attempt were removed;13 history
guards are enabled, baseline parity/replay pass, test sessions signed out, layout
defaults restored and preview stopped. #17 is next.

#15 is implemented: deterministic persisted-plan JSON/CSV exports, separate
source/publication assessment, formula neutralization and authenticated downloads.
Verification: **505 tests pass, zero skips**,57 files; required DB59 rollback and4
isolated concurrency checks, lint/typecheck/build and independent SQL/backend/UI
reviews pass. Migration `20260907132243_readonly_planning_source.sql` is applied
and immutable. Export reads do not mutate source revision or lock generation.

Production browser JSON and CSV downloads were saved through Chrome's Save dialog
and parsed from disk. JSON placements, metrics, objectives and validation exactly
match the selected saved version; its superseded state is prominent. CSV has17
placements and5 deferrals, matching that version. Widths1280/1440/1920 have no
horizontal overflow; browser logs are empty. In-app download initiation was observed;
actual file saving was verified in Chrome. No live Excel re-save safety claim.
Two temporary users and two published plan fixtures were removed; all13 history
guards are enabled, baseline parity and immutable migration replay pass. Both test
sessions were signed out and preview stopped. #16 is next.

#14 is implemented: immutable contractor-scoped publication outbox, versioned
planner-managed destinations and explicit audited retry. Publication commits
before delivery attempts; missing credentials, rejections, rate limits and unknown
outcomes remain visible. Confirmed success is never resent. Unsent superseded
plans cannot be dispatched. Baseline fabricated requests without an organisation
have no notification recipient. The bot token stays server-only.

Verification: **474 tests pass, zero skips**,53 files; required DB56 rollback
and4 isolated concurrency checks pass. Lint/typecheck/build and independent
transport, SQL, service/API and UI reviews pass. Live tests found a claim-function
alias collision; new migration `20260907130903_notification_claim_aliases.sql`
corrects it without editing applied `20260907125221_telegram_publication_outbox.sql`.
A delayed retry response/destination-change race was reproduced and fixed with
configuration-version and test-ID guards. Two actual overlapping claim calls
produce exactly one attempt/provider invocation; successful retries send nothing.

Production browser checks passed destination save with zero deliveries, visible
missing-bot state, successful publication with a separate credential failure,
exact scoped message/time/sector, explicit retry/attempt history and contractor
own-slot visibility with planner-route denial. Widths1280/1440/1920 had no overflow;
680px visual inspection was readable and browser logs were empty. Browser bundles
contain no Telegram transport/token-variable references. Two temporary users,
one approved request, one published plan and its notification/configuration history
were removed; all13 history guards are enabled. Baseline parity and migration
replay pass; preview stopped. No real Telegram messages were sent. Live success
requires configured credentials and an authorized destination; it remains unverified.
#15 is next.

#13 is implemented and technically verified: a strict, attributed local snapshot
of fifteen station points, reproducible from the official March2026 polygon
archive, drives an accessible SVG below the primary timeline. Map, timeline and
inspector share request/block identity, including emergency work. Public geography
has no effect on solver inputs or feasibility; depot markers and connecting blocks
remain explicitly fabricated.

Verification: **405 tests pass, zero skips**,47 files; required DB49 rollback
and3 isolated concurrency checks pass. Lint/typecheck/build, exact source
reproduction and independent code/security review pass. Production browser checks
passed map-to-timeline and timeline-to-map selection, emergency highlighting,
source notices and whole-map station labels at680px. Widths1280/1440/1920 had no
document overflow; browser logs were empty. Final label-only adjustments passed
scoped lint/typecheck and production rebuild. Two temporary accounts were removed,
no saved artifacts created, baseline parity unchanged and preview stopped.

**Publication gate:** the source archive's internal-use notice conflicts with the
DataMall open-data licence. Clearance remains unconfirmed; do not publicly deploy
or redistribute the geographic snapshot until resolved. No raw source geometry or
archive is committed. #13 is not claimed licence-cleared. #14 is next.

#11 is committed as `1ee6c16`. #12 is complete: an accessible workforce chart
above the Gantt displays exact available, demanded and signed remaining people by
team/role. Slot and non-aligned event boundaries come from the shared workforce
assessment. Unknown demand, out-of-window shortages, pending replan and infeasible
plans stay explicit. Contributor selection synchronizes chart, timeline and
inspector, including read-only emergency placement and staffing details.

Verification: **368 tests pass, zero skips**,43 files; required DB49 rollback
and3 isolated concurrency checks pass. Lint/typecheck/build and independent
reviews pass. Review found filters reset during loading; component and actual
store regressions reproduced it, and preserving hidden/inert details fixed it.
No solver rules, database facts or applied migrations changed.

Production browser checks passed shortage counts/contributors, shared selection,
filter retention across generation/alternative/pin/strategy changes, emergency
preview/replan with demand counted once, exact emergency inspector and clearing.
An infeasible emergency replan explicitly reports unplaced mandatory work despite
zero current violations. Widths1280/1440/1920 had no document overflow; browser
logs were empty. Default objective and viewport restored, two temporary accounts
removed, no saved artifacts created, baseline parity unchanged and preview stopped.
#13 is next.

#10 is committed as `c48974e`. #11 is complete: owner-private proposal edits,
explicit submission into the shared request review queue, immutable source and
revision evidence, and rejection-reversal/cancellation source invalidation.
Migration `20260907114117_unified_request_review.sql` is applied and immutable.

Verification: **346 tests pass, zero skips**,38 files; required DB49 rollback
and3 isolated concurrency tests pass. Lint/typecheck/build, independent backend/UI
review, migration replay and baseline parity pass. Cross-boundary tests cover
source-inert private edits/submission, exactly one approved engine revision,
immutable original evidence, and stale plans after approval, rejection reopening
and cancellation.

Production browser verification passed contractor private edit/save/explicit
submission, planner original evidence review and approval, and saved generation
with18 placements including the approved request at01:15–01:30. The original
model-attributed title stays in revision1; edited current fields show human
attribution. Owner-private lists stayed separate. Widths1280/1920 had no document
overflow and browser logs were empty. Both temporary users, both private drafts,
one submitted request and one generated plan were removed; history guards restored,
parity unchanged and preview stopped. Live model extraction remains unverified
without a key. #12 is next.

#9 is committed as `186c7a4`. #10 is implemented: owner-private transcript
proposals with bounded UTF-8 input, exact evidence, unsupported fields unset and
an explicit extract-and-save action. Migration `20260907093242_private_transcript_drafts.sql`
is applied and immutable. Model calls have a12-second timeout, no retries/tools,
strict output schema, disabled SDK logging and a private per-owner quota. Raw
transcripts are neither stored nor logged; no private draft changes planning facts.

Verification: **328 tests pass, zero skips**,33 files; required DB43 rollback tests
and3 isolated concurrency tests pass. Lint/typecheck/build, migration replay,
baseline parity and independent backend/UI/security reviews pass. Before application,
a SQL null-field guard was tightened; an initial CASE syntax failure rolled back
and was corrected before successful application. No applied migration changed.

Production browser verified separately scoped contractor/planner controlled drafts,
visible evidence and unknown fields, actual missing-key503 preserving input, and
manual intake remaining usable. The controlled stored proposals exercise display
and ownership; they are not live-provider extraction results. Widths1280/1440/1920
had no overflow and browser logs were empty. Two temporary owners and two private
drafts were removed; all8 immutable-history guards are enabled and baseline parity
still matches22 fabricated requests. Preview stopped. The model key remains absent,
so successful live-provider extraction is explicitly unverified. #11 is next.

#9 implements separate contractor proposals, organisation-scoped draft editing,
submission, information requests, rejection, explicit planner approval and
cancellation. Every change appends an immutable revision and audited actor/reason.
Only active approved revisions become planning inputs; proposed amendments retain
the previous approval until replacement or cancellation. Scheduled status derives
from the current published plan and its exact approved revision.

Migration `20260907085837_request_intake.sql` is applied and immutable. Independent
backend review resolved a baseline dependency deletion/night-move gap before
application; an assembled-instance check also fails closed on missing references.
Full **306 tests pass without skips**, across28 files. Required DB gate includes
intake and passed parity,40 rollback tests and3 isolated concurrency tests.
Lint, typecheck, production build, migration replay and independent security/code
review passed. Rollback files run sequentially to avoid shared-source lock queues;
long hosted intake journeys have a scoped20-second I/O budget after measured
network variance. Assertions and explicit concurrency tests remain intact.

Production browser UAT passed contractor save/submit, planner approval, saved
plan generation/publication, contractor published placement, revision/edit/reload,
immutable original approval and cancellation/logout. The test plan had18 placements,
including approved revision4 at01:15–01:30. SQL independently confirmed7 revisions,
original approved title unchanged, and no active approval after cancellation.
Responsive widths1280/1440/1920 had no horizontal overflow; browser logs were clean.
Temporary2-role accounts,1 request and1 published plan were removed by exact IDs;
all7 immutable-history guards are enabled. Cleanup retries rolled back until the
owner lock and deferred-FK trigger handling were correct. Final baseline parity
matches22 requests. Preview stopped; no local server is running. #10 is next.

RailPlan Dev is healthy on Supabase Free in Singapore, project
`ufcdynfjfzbjvglsdaqp`, in `pavan2184's Org`. The new empty hosted database is
the replacement for #4's local Docker reset baseline. Neither unrelated
Supabase projects nor the local NRI_Land database were modified.

#6 is committed as `c0e39ce`. #7 is complete with anonymous roles, availability
and request demand, canonical parity, bounded validation and immutable saved-plan
provenance. Migration `20260907082740_workforce_facts.sql` is applied and immutable.
The seeded workforce digest is `fnv1a:8c4a9050cfea5e8b` for 22 requests, two roles,
22 team/role availability windows and 44 demand rows. Team capacity still counts
crews; explicit role headcounts count people. No worker identities are collected.

#7 verification: six new database regressions failed before migration and passed
afterward. Full suite **259 passed, zero skipped**, 23 files. Required DB gate:
parity, **33 rollback tests**, and **3 isolated concurrency tests** passed. These
include both availability-insert/parent-night-resize orderings; the second writer
is observed waiting and rejects any resulting out-of-night window. Temporary
committed fixtures are cleaned up by exact IDs. Workforce-only edits change both
instance and saved-plan digests, stale older drafts with an audit, and preserve
old snapshots. Migration replay, lint, typecheck, production build and independent
security/code review passed. No UI changed in #7; existing dashboard tests pass.
No local preview server is running.

#8 is complete. WORKFORCE_CAPACITY is a critical shared-validator rule with exact
team/role/interval/headcount/contributor evidence. Crew concurrency remains
separate; absent supply is zero and undefined demand fails closed. Candidate
search, pins, repairs, alternatives, emergencies and independent final validation
all enforce it. Metrics include person-minute utilisation and shortage intervals
with formulas. Constraints-v3/solver-v3 provenance protects saved publication.

Verification: full **284 passed, zero skips**, 24 files; required DB **34 rollback
plus 3 isolated concurrency tests** passed, including fresh mandatory workforce
infeasibility refusing publication. Lint/typecheck/build and independent reviews
passed. Review fixed emergency alternative lookup, unsupported alternatives
claiming feasibility, and stale disruption metrics after repairs/view changes.
The last two copy corrections passed targeted UI tests and a fresh typecheck/build.
No applied migration changed; parity stays `fnv1a:8c4a9050cfea5e8b`.

Production browser UAT passed login, submitted workforce evidence and formula
(3825/13200 person-minutes), generation (17 placed, 5 deferred, zero violations
and zero workforce shortages), disruption preview, requested/planned view change,
replan and logout. Workforce utilisation changed 23.2% → 24.5% with emergency
impact and 30.3% on the requested-plan impact; the replan honestly reported
mandatory work without a slot. Widths1280/1440/1920 had no document overflow;
browser warnings/errors were empty. Browser viewport restored, temporary planner
removed, no saved UAT plans created, final database parity passed. Production
preview stopped before the final build. #9 is next.

Implemented for #4:

- Transactional migration runner with an unexposed SHA-256 migration ledger;
  repeated migrations are a no-op and edited applied migrations fail.
- Corrected PostgreSQL enum pair ordering to match TypeScript lexical ordering.
- Seeded all 22 fabricated requests and read them back through the real loader.
- Consistent repeatable-read loader transactions also fix stalling pooled reads.
- Shared content comparison reports changed sections, ignores object property
  order, and preserves meaningful request block order.
- Required db:verify/test:db commands cannot turn missing infrastructure into a
  passing gate. Ordinary tests show explicit skips only if the probe fails.
- Hosted TLS verifies Supabase's public CA and hostname; prepared statements
  are disabled for transaction pooling. Port 6543 works; 5432 times out on this
  network. Credentials are confined to ignored, owner-readable `.env.local`.
- Updated v0.4 contracts, package versions, setup and security documentation.

Verification (2026-09-07):

- Both migrations applied successfully to the empty hosted database.
- db:migrate rerun: both recorded as already applied.
- db:seed and db:verify: database/literal digest `fnv1a:fef0c4904e890f43`, 22 requests.
- npm test: **191 passed, zero skipped**, across 11 files; includes live database
  parity, rolled-back equipment drift, all public tables using RLS, and reversed
  work-class pair rejection.
- Lint, typecheck, production build and diff whitespace checks passed.
- Before database setup, db:verify correctly failed while optional tests reported
  unavailable-database skips. No browser UI behavior changed in this baseline.
- Code review passed after adding missing/edited migration-history rejection.
  The follow-up run passed 17 migration/instance tests, live migration replay,
  lint and typecheck. The prior full suite/build passed unchanged app behavior.
- No local app server started. #4 is complete under the hosted/no-Docker
  requirement; #5 authentication is next.
- npm audit has unresolved advisories; remediation remains a release gate.

Historical environment recovery: the initial Docker image pull exhausted disk
space and was stopped. The owner then selected hosted Supabase. Project build
output was deleted to recover space; no unrelated volumes or source were deleted.
Docker-backed npm commands were removed. All current database work is online.

## Issue #5 — implementation and database authorization verified

Added official Supabase SSR login/logout, server-verified identities and trusted
planner/contractor profiles. Pages gate the existing planner UI and give
contractors an honest workspace pending #9 intake. Added operator-only profile
provisioning for confirmed Auth UUIDs and a loopback-only demo auth seed that
refuses hosted databases and generates random credentials into an ignored 0600
file. No default online accounts were created.

The identity migration adds profiles, organisations, scoped RLS and a private
atomic assistant quota. Application queries set transaction-local authenticated
role and verified claims before loading profiles. Only planners manage existing
planning facts; shared action guards cover assistant, solve, approve, publish
and resource management. Later issue tables/routes are not preimplemented.

The assistant now uses server identity, typed 401/403/503, an actual streamed
64 KiB body bound, and a shared user-keyed quota. Parent applied the migration
and fixed migration-runner replay to preserve private function schema usage
while denying authenticated access to the migration ledger.

Verification: final full suite **220 passed, zero skipped** across 16 files;
required `test:db` passed 20 tests after database parity verified all 22 requests.
Lint, typecheck, production build and diff whitespace checks passed. Real
rollback database checks cover planner/contractor/anonymous/unassigned access,
organisation isolation, forged metadata, shared quota and private ledger denial.
Local auth seeder correctly refused the hosted environment; operator script
rejected missing arguments. Local auth account creation was not exercised
because no local Supabase Auth instance is running under the no-Docker direction.

Production HTTP verification passed the real login Server Action, returned
session cookies, correct planner/contractor/unassigned workspace, and logout
cookie removal for all three temporary identities. Anonymous API access returned
401; contractor and unassigned access returned 403; planner input validation
returned 400. The browser rendered the login page and its generic invalid-login
alert correctly. Temporary hosted identities and their organisation were deleted
with exact-ID cleanup after verification. No permanent demo credentials remain.

Independent security/code review passed after classifying Auth service/network
failures as 503 rather than 401, with regressions. The earlier disk error was
resolved; current production preview runs at http://127.0.0.1:3000. #5 is complete
for the hosted workflow; #6 is next. Local Auth creation remains an explicitly
unrun optional check. No GitHub issues have been closed yet.

## Issue #6 — immutable saved plans implemented

The dedicated `/plans` workspace generates server-computed durable versions from
canonical database facts, lists/reloads the latest 20 versions per night, records
planner decisions and publishes with independent validation and stale-source
protection. It displays exact placements, deferrals, calculated metrics and
provenance. The existing dashboard remains explicitly local exploration; wider
workflow integration follows #16. No #7 workforce contracts are preimplemented.

The applied migration stores private immutable runs, normalized children,
append-only decisions/publications/audits and a global source revision. Current
request, child, resource and topology changes conservatively stale all drafts.
Publication supersedes with a separate immutable link; stale rejection audits
commit before HTTP 409. Private write functions derive actor IDs from verified
claims, planner RLS denies contractor reads, and application SQL runs with actual
authenticated privileges. JSON/Origin/body/schema bounds guard all mutations.

Review found and fixed a repeatable-read publication race before migration
application: a separate lock generation now forces overlapping callers to retry
from BEGIN. The true-concurrency test observed both first-publication transactions
waiting, then proved one published version and one superseded version. Its
committed future-night/request/actor fixtures were removed by exact-ID owner
cleanup, with exclusive table locks and immutable triggers restored within one
transaction. The schema remains outside exposed Supabase Data API schemas.

Verification: `npm test` **245 passed, zero skipped**, across 20 files,
including six live rollback persistence/RLS tests and seven saved-plan UI tests.
Required `test:db` passed canonical parity for 22 requests, 26 rollback tests
and one isolated concurrency test with cleanup. Lint, typecheck, production build
and diff whitespace checks passed. Independent review passed after fixing the
concurrent-publication race, stale UI state and Next.js origin handling. The origin
guard compares the actual Host with the transport protocol, rejects malformed
origins and scheme/port mismatches, and ignores untrusted forwarded-host headers.

Production browser UAT passed sign-in, server generation, stale rejection,
fresh generation, review note, publish, full reload, a different strategy and
supersession, then logout. The reloaded balanced plan retained 17 placements and
5 deferrals. A separate SQL read confirmed committed audit counts: three create,
one decision, one stale rejection, two publish and one supersede. Browser console
reported no errors. Exact-ID cleanup removed the three temporary plans and their
Auth user; all six immutable-history guards were verified enabled afterward.
Database parity still matches the original 22 fabricated requests. The production
preview at http://127.0.0.1:3000 was stopped before the next implementation/build.
#6 is complete; #7 is next. Existing dependency advisories and broader release
accessibility checks remain #17 gates. No GitHub issue has been closed.

## Historical implementation record

The entries below describe earlier milestones. Their "not yet verified" notes
are historical; the current verification state is recorded above.

## Current version

v0.4.0 — the engine extracted into a package, and the planning facts given a
contract and a schema. The engine itself is unchanged.

## v0.4.0 — packages/core and the planning facts (Phase 1 of the backend plan)

**`packages/core` is now a workspace package** holding `domain`, `data`,
`engine` and `types`, consumed by the web app and the API route through
subpath imports (`@railplan/core/engine/solve`). Inside the package imports are
relative; there is no `@/` alias there on purpose, because an alias meaning one
thing in the app and another in the engine is a trap for whoever moves a file
next. The 77 engine tests moved with it and pass with no assertion changes.

`docs/ARCHITECTURE.md` has claimed since v0.2.0 that the engine knows nothing
about the interface. That held by discipline alone. An ESLint rule now fails the
build if anything under `packages/core` imports from the web app, from React, or
from Next — which also matters because the package is about to be consumed by
something that is not a Next app.

**`PlanningInstance` is the contract for a night's facts** — stations, blocks,
adjacency, zones, teams, equipment, incompatible work classes, requests, and the
window — as one serialisable value with a canonical ordering and a content
digest. It exists because those facts are about to have three readers: this
package's literals, Postgres, and a Python CP-SAT service. Three readers of the
same facts is exactly where they quietly stop being the same facts, so
`instanceDigest` is the check that says whether two sources agree.

**The schema is authored** in `supabase/migrations/`: 16 tables with the
constraints in the database rather than only in the application, because the
application is about to stop being the only writer. `mandatory` is a generated
column (`priority = 'critical'`) rather than a stored one; the incompatible-pair
table has a `check (class_a < class_b)` so the same rule cannot be stored twice
in opposite orders; `request_blocks` holds atomic block ids and a position,
never a sector label. Every table has row-level security enabled with no
policies, which denies everything by default until Phase 2 defines who may read
what.

### Not yet verified

**The migration has never been applied and the seed has never run.** The Docker
daemon became unresponsive while pulling the Supabase images, so the round trip
is written but unproven. What _is_ verified: the migration parses under the real
Postgres parser (`libpg-query`) as 2 enums, 16 tables, 3 indexes and 16 RLS
statements, all 16 tables have RLS enabled, and all 18 foreign keys target
tables defined in the same migration.

To finish it:

```
npm run db:start   # supabase start
npm run db:seed    # writes the literals, reads them back, compares digests
```

The seed exits non-zero on a digest mismatch and names the section that differs.
`src/test/instance.test.ts` runs the same comparison and skips when no database
is reachable, so `npm test` stays green on a clone without Docker.

### The engine now reads the night it is given

This was deferred and has since landed, because it is what makes the Phase 4
gate mean anything: a validator that can only check plans built from the
literals it has compiled in is not a gate.

`PlanningWorld` derives from a `PlanningInstance` the things the rules actually
need — lookups by id, the adjacency walks, the compatibility matrix. It is
carried on `ValidationContext.world`, which was already threaded through
`validate`, `solve`, `computeMetrics`, `explainPlacement`, `findAlternatives`
and `recommendResolution`. So the engine became instance-driven with **no public
signature changes and no call-site churn**, and every existing caller keeps
working by falling back to the literal world.

Two consequences worth knowing:

- **Strategy profiles express a reserve, not a clock time.** `planningWindowEnd:
WINDOW_END - 45` became `windowReserveMinutes: 45`. "Keep the last 45 minutes
  clear" survives a night with a different handback deadline; "stop at 03:15"
  silently means something else.
- **`inputHash` now identifies which night was planned**, not just how. It
  includes `instanceDigest`, so two solves that agree on strategy, locks and
  requests but disagree on the topology no longer collide.

Verified rather than asserted: the derived world is checked against the module
topology it replaces across every block pair, every class pair and every
request's sector label; and a separate suite hands the engine a deliberately
different night — a shortened window, a scarcer asset, a severed adjacency — and
insists the answers move.

## v0.3.1 — the assistant route made defensible (Phase 0 of the backend plan)

The engine was never the weak point; the single route in front of it was. This
session fixed live defects in `src/app/api/assistant/route.ts` and added the HTTP
primitives the later phases build on. Nothing about the engine, the solver or the
dashboard changed.

Defects fixed, each with a test:

1. **An unvalidated `strategy` was an unhandled 500.** `solve()` ran outside the
   route's try/catch and `strategyProfiles[unknown]` is `undefined`, so the
   solver dereferenced it and threw. Now a 400 with a typed envelope.
2. **`locked` was unbounded client-controlled CPU.** Every entry is re-validated
   at every candidate start inside the solver, and `buildFactSet` ran five more
   complete solves per request on top. Now capped at one pin per plannable
   request, with each `requestId` and time checked, behind a 64 KB body guard.
3. **No timeout on the model call.** The SDK retries timeouts, so a bare timeout
   is not a bound — `{ timeout: 12_000, maxRetries: 1 }` is, under a
   `maxDuration` of 30.
4. **`stop_reason: "max_tokens"` was unhandled.** Adaptive thinking is on by
   default on this model and `max_tokens` caps thinking and reply together, so a
   truncated answer was possible — and a half-sentence containing only real
   figures passes the grounding check. Truncation now falls back to the engine.
5. **The client could forge assistant turns.** `history` accepted
   `role: "assistant"` entries and replayed them into the prompt. The guard
   catches invented numbers, not injected instructions, so the route now accepts
   only the planner's own questions.
6. Added: per-request id echoed to the client, `pino` structured logging with
   token counts and a cost estimate, and a provisional in-memory rate limit.

**Six solves per question became one.** `comparisonTable()` takes no arguments
and solves the unmodified request set, so it is constant for the life of the
process and is now computed once. The rest of the fact sheet is cached on
`inputHash`, with the _measured_ solve time assembled per call and never cached —
a cached sheet quoting a previous run's timing would be a figure the engine
produced, but not one describing the run in front of the planner.

### Known limits of this phase

- **The rate limit is per-instance and provisional.** It lives in one server's
  memory, so on a multi-instance host it limits per instance and resets on a cold
  start. It is replaced by a Postgres token bucket keyed on the authenticated
  user in Phase 2. The input bounds, not the limiter, are what removed the
  amplification that made a flood dangerous.
- The API contract was stale at this milestone; synchronized during issue #4.

## Summary

RailPlan takes 22 overnight maintenance requests, detects every constraint
violation in them, builds a schedule that satisfies those constraints, and
verifies its own answer before showing it.

The headline change from v0.1.0: **nothing is a fixture any more.** The five
hand-authored schedule files are deleted. The six hand-typed conflicts are
deleted. Every conflict, placement, KPI, alternative and explanation is computed
from the request data at run time.

## What works

- **Conflict detection.** Twelve rules over 12 atomic track blocks, crew
  capacities, equipment unit counts, isolation zones, work-class compatibility,
  dependencies, travel and handback. Run against the submitted times it finds 22
  violations across 4 clusters — including a shared block between `NS10-NS12`
  and `NS11-NS13`, which no amount of string comparison would catch.
- **Scheduling.** Dependency-aware ordered insertion with bounded repair, at
  15-minute resolution. Solves in roughly 20-70 ms and reports `OPTIMAL`,
  `FEASIBLE` or `INFEASIBLE` honestly, with solve time, candidate count and an
  input digest on screen.
- **Independent verification.** Every plan the solver produces is handed back to
  the validator before display. A plan that fails is reported infeasible, not shipped.
- **Five objectives, one solver.** Balanced, maximum completion, minimum risk,
  minimum changes and emergency reserve are objective profiles. They produce
  measurably different plans: emergency reserve reaches 100% emergency capacity
  against 25% for balanced, and minimum changes holds movement well below
  maximum completion.
- **Calculated metrics.** Eleven figures, each exposing its formula, numerator
  and denominator behind an `fx` control. Emergency capacity is measured by
  actually inserting each scenario and re-validating.
- **Explanations by counterfactual.** "Why did M-014 move?" is answered by
  replaying it at 01:00 and reporting what breaks, in the rules' own numbers.
- **Planner control that counts.** Pinning a placement enters it as a hard
  constraint and re-solves; the plan and every metric move with the decision.
- **Validated alternatives.** Generated by re-solving, shown by default with why
  each works and what it costs. Slots that fail, or that push a conflict onto
  another request, are not offered.
- **Disruptions that change the inputs.** A scenario rewrites the request set or
  the validation context; the plan is re-checked, then solved again.
- **A grounded assistant.** Reads engine output only. Any answer containing a
  figure the engine did not produce is discarded and the engine answers instead.

## What this session changed

The engine was already right; the interface was describing the tool rather than
the job. This session reframed it around what a scheduler actually does.

- **Three named steps** replace the "as submitted / as planned" toggle:
  _Requested plan → Conflicts → Optimised schedule_, each a control, each
  showing its own state. "Solve" is now "Generate optimal schedule".
- **Conflicts have a kind.** Six planner-facing categories — sector overlap,
  engineer availability, incompatible work, equipment, sequencing, engineering
  hours — projected from the twelve rule ids in `engine/conflicts.ts`. The
  projection is total and exclusive, and a test asserts both.
- **Conflicts have an interval.** `Violation.window` carries the exact minutes a
  rule is broken in, so the chart shades the 15 minutes at fault rather than
  condemning two 60-minute jobs.
- **The chart stacks what shares a block.** Jobs on one block are packed into
  sub-lanes, because drawing two overlapping possessions at the same height hid
  the collision the chart exists to show. Bars carry the assigned team.
- **Suggested fixes, applied.** `engine/resolutions.ts` searches every candidate
  start for every request in a conflict, re-validates each, and offers the
  cheapest move that clears it — or reports that no single move does.
  "Apply suggested fixes" runs that greedily over the whole list: 22 conflicts
  to 6 in 8 moves on this dataset, with what it could not fix left named.
- **Accepted suggestions edit the requested plan**, not the solver output
  (`overrides` in the store), so a planner can fix conflicts one at a time and
  watch the count fall before the solver is involved at all.
- **Figures follow the step.** Before scheduling: requests, conflicting
  requests, unresolved conflicts, engineer and engineering-hours utilisation.
  After: conflicts against the submitted baseline, requests scheduled, mandatory
  work, movement, and estimated planner time saved.
- **Scenario testing demoted** from a headline figure and a primary button to a
  quiet strip below the workspace. It is a good demo; it is not the problem.

### The one assumption, declared

"Planner time saved" is the only figure on the dashboard that is not arithmetic
over the plan. It multiplies conflicts resolved by
`ASSUMED_MINUTES_PER_MANUAL_CONFLICT` (12), a named constant in `engine/metrics.ts`.
The figure is labelled _estimated_, its `fx` panel says "assumption, not a
measurement", and its baseline is the conflict count in the requests **as
submitted** — not the count after the tool's own fixes, which would let the tool
quietly lower the bar it is judged against. A test asserts that baseline.

## Verification

- `npm test` — 184 passed, 2 skipped across 11 files (the two skips are the
  database round trip, which needs a running Postgres).
  covering the hardened boundary and the fact-set cache).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — succeeds; `/` static, `/api/assistant` dynamic.
- Manual browser pass at 1512 px: load, review conflicts, apply one suggestion,
  apply all, generate the schedule, inspect, pin, disrupt, re-solve.

## What this session fixed

Four defects found by testing rather than by reading:

1. A Zustand selector returning a freshly-built array on every call, which put
   the dashboard into an infinite render loop and left the page blank.
2. An unlayered `button { color: inherit }` in `globals.css` outranking Tailwind's
   layered utilities, making every dark button render its label invisible.
   `@layer base` does not survive the CSS minifier; the reset was removed instead.
3. The work-overrun disruption never actually extending the job, and the impact
   check appending a duplicate placement that collided with itself.
4. Explanations naming the subject request among its own conflict partners.

## Known limits

Recorded in full in `CURRENT_IMPLEMENTATION_AUDIT.md`. In brief: the solver is a
heuristic and says so; crews are not reassigned; travel is enforced only for
single-crew teams; the topology is invented; there is no export; a full
screen-reader pass has not been done.

## Next

1. Benchmark the heuristic against an OR-Tools CP-SAT model on the same
   instance set, and compare feasibility, plan quality and solve time before
   deciding whether a backend is worth its failure modes.
2. Export the plan as JSON and CSV — the artefact is real now.
3. Crew reassignment, once qualification data exists to justify it.
4. Screen-reader pass and a responsive check at 1280 and 1920.

## Do not break

- The validator is the only authority on feasibility. Nothing may assert a plan
  is safe without running it.
- Every displayed figure keeps its formula, numerator and denominator.
- The assistant never introduces a number the engine did not produce.
- Solver status stays honest: no `OPTIMAL` without grounds, no hiding a deferred
  mandatory job behind a clean violation count.
- A suggestion is offered only after it has been inserted and re-validated. The
  panel says "no single move fixes this" when that is the answer.
- Conflict categories stay a projection of the rule ids, never a second opinion
  about them.
