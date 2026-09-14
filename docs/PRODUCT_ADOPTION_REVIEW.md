# Product Adoption Review

Reviewed: 2026-09-15 · RailPlan v0.4.0 · worktree at `269d792`
Status: product review and proposals. Nothing here changes the accepted architecture
or the numbered issue order; implementation requires a separate decision.

## Verdict

**Would people genuinely choose to use RailPlan in their daily work? Not yet.**

The engine is credible and the honesty of the product is unusual. But the part
planners would live in, resolving clashes on the real request set, only exists
against fabricated demo data. The durable path generates a plan they cannot touch,
and the contractor receives a one-line message containing a UUID. A planner would
run it once, admire it, and return to the spreadsheet and the WhatsApp group.

The strongest asset is the validator-as-authority design and the explanation
engine. The biggest adoption risk is not interface polish. It is that the rules
are invented, nobody has watched a planner use it, and the two halves of the
product are not joined.

The honest pitch framing is "a validated conflict engine and an auditable
publication trail, ready for shadow planning against one real corridor", not
"a scheduler planners use". The gap between those two sentences is this review.

## What was inspected, and how to read the labels

The review is grounded in the checked-in code and docs, plus a live run of the
sandbox engine in a browser through a temporary unauthenticated route that was
removed afterwards. The authenticated workspaces could not be driven in a browser:
no demo credentials exist in this checkout and provisioning accounts is operator
work. Their journeys were traced from the components, the API contract and the
production journey test. Uncommitted revision-editor work in the main checkout
was read for context and is labelled as such.

| Label          | Meaning                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| **Observed**   | Seen in the running sandbox at 1440px on 2026-09-15                                    |
| **Code**       | Read directly from components, services, migrations or tests in this worktree          |
| **Docs**       | Stated in the project's own brief, status, research or decisions                       |
| **Assumption** | Inference about users or current practice; not verified with any planner or contractor |

## User need and adoption

### Who it is most useful for

**Docs.** The brief names two roles: the access planner who reconciles requests
for one engineering night, and the contractor who submits work and receives a
slot. The planner is the only person for whom RailPlan currently changes the job.
The contractor gets a form that is stricter than the email they send today and a
message that is thinner than the one they receive today.

**Assumption.** Today this planner reconciles a possession register or
spreadsheet, contractor requests arriving by email or a work-management system,
and a weekly coordination meeting where clashes are argued out. The recurring
pain is not "I cannot see the Gantt". It is "I found out on Thursday that two
crews want the same section, and now I have to call four people." The product
research reaches the same conclusion from vendor material, not from a planner.

### Is the problem compelling enough to switch?

The problem is compelling. The switch is not yet earned, for three reasons the
code makes concrete.

- **Code. Feasibility is judged against invented rules.** Thirteen constraint
  rules, twelve atomic blocks and four incompatibility pairs are fabricated. The
  team says so on every page. A planner cannot trust "0 violations" until at
  least one corridor's real rules have been encoded and checked by an engineer.
- **Code. The decision tools and the durable plan are not connected.** Conflicts,
  alternatives, pins and disruption replanning live in `/sandbox` over the 22
  fabricated requests. `SavedPlansWorkspace.tsx` posts `locked: []` and offers no
  way to inspect a clash or move a job. The one journey a planner would repeat
  weekly does not exist end to end in the committed product. A revision editor
  with pins exists in the main checkout as uncommitted work.
- **Docs. No evidence of time saved.** The brief admits the planner-time-saved
  figure assumes 12 minutes per conflict. No planner has used the tool.

## The journey, as built

Observed figures use the Balanced profile unless stated.

### First visit (`/login` → `/`)

- **Code.** There is no way in. Sign-in is email and password on
  operator-provisioned accounts; there is no signup, no invitation, and
  organisations are created by SQL. An unassigned account sees "Workspace access
  pending." Defensible for a pilot; a locked door for anyone evaluating from the
  README link.
- **Observed.** The login page states "Non-operational prototype" and
  "Fabricated planning data" before the user has done anything. Twenty-eight
  disclaimer strings exist across the interface. Each is correct; together they
  teach the user that nothing here is real.

### Contractor submits work (`/contractor`)

- **Code.** The form asks for times as "minutes after midnight on the planning
  night: 60 = 01:00, 240 = 04:00", twelve atomic-block checkboxes, equipment unit
  counts and anonymous role headcounts. A contractor who writes "Khatib to
  Yishun, 1am to 2am, 3 pax" will not translate that into `NS13-NS14` and
  `preferredStart: 60` without help. This is the first place a real user stops.
- **Code.** The planning-night dropdown lists nights from the database. One night
  (`2026-09-16`) is seeded. There is no way to ask for another date.
  Meeting-text extraction needs an API key and produces private drafts whose
  fields must still be completed in the same minutes-and-blocks vocabulary.
- **Code.** Draft, submit, needs-info and revise states, field-level server
  errors and version checks are properly done. Nothing is silently lost.

### Planner reviews (`/requests`)

- **Code.** Approval requires team, priority, clearance, skills, dependencies and
  a safety confirmation for every request. The right facts, with no help: no
  suggested team from work class, no clash warning against already-approved
  work, no view of the night filling up. The planner cannot see the consequence
  of an approval until they generate on another page.
- **Code.** The same page hosts "Private transcript drafts" for the planner, so
  an extraction workflow is stacked under a review workflow.

### Generate a schedule (`/plans`)

- **Code.** Pick a date and an objective, "Generate and save plan." The result is
  immutable. The planner cannot pin, move, defer, swap crews or ask why; the only
  lever is another objective and another generation. The page then shows, in one
  column: notification settings, version list, a five-panel saved review,
  provenance (source revision, input digest), exports, validation, a metrics
  accordion, a placements table, deferred work, delivery history and a free-text
  decision form. An audit record wearing a workspace's clothes.
- **Code.** Any other date returns "This planning night does not exist." Nothing
  explains how a night comes to exist.
- **Code.** Publication is gated correctly: current source, matching engine
  versions, all mandatory work placed, independent validation, audit on stale
  rejection. This is the part planners would come to trust.

### Understand the result (`/sandbox`, demo data only)

| Observed                                                    | Value                               |
| ----------------------------------------------------------- | ----------------------------------- |
| Conflicts shown for 22 requests as submitted                | 30, across 19 requests              |
| Rows for one clash (M-008 vs M-014: block, team, workforce) | 3                                   |
| Placed under Balanced and under Maximum completion          | 17 of 22, 5 deferred either way     |
| Total movement from requested times                         | 735 min; 13 of 17 placed jobs moved |
| "Planner time saved"                                        | 6 h, computed as 30 × 12 min        |

- **Observed.** The headline count triples the same collision whenever two jobs
  share a block, a team and a supervisor. A planner reads thirty findings to find
  roughly ten problems, and the time-saved tile multiplies the inflated number.
- **Observed.** After generating, the Conflicts page says "No conflicts" and in
  small text that five requests have no slot "as a capacity outcome, not a rule
  breach." The five deferred jobs, the actual decision the planner now faces, sit
  on another page behind a "Needs action" filter.
- **Observed.** Opening a deferred job (M-004, high priority) gives a good
  counterfactual explanation and then a dead end: "No other start time validates
  with the rest of the plan held still. Every candidate is blocked by Track block
  capacity." No move-to-another-night, shorten, split or crew substitution.
- **Observed.** Movement is large and unexplained to the person it affects.
  M-021 was requested at 03:00 and placed at 01:15; M-003 at 02:00 and placed at
  00:00. Intake defaults earliest/latest bounds to the full window and captures
  no reason for a requested time, so the solver cannot respect one.
- **Observed.** A browser refresh on any sandbox page returns to the "Load the
  submitted requests" landing. Only objective and pins persist; the objective
  persisted silently across sessions.
- **Observed.** The disruption flow is the best moment in the product. Applying
  "Emergency track fault" first re-checks the current plan (2 violations); "Solve
  around it" then states plainly that M-008, mandatory work, cannot be placed and
  the plan cannot be published. Status, solve time, candidate count and
  provenance make the result feel earned.

### Publish and hand over

- **Code.** The contractor's entire view of the outcome is one sentence on their
  request: "Scheduled in published plan `<uuid>`: 01:15–02:15 (revision 1)." No
  schedule page, no comparison with what they asked for, no way to accept or say
  "we cannot make 01:15." The Telegram text is built in a database trigger:
  "RailPlan published version `<uuid>` / Night … / Changed requests: `R-<uuid>` |
  scheduled 01:15-02:15 | EW20-EW22".
- **Code.** Exports are JSON and CSV of the saved version. No printable night
  plan, calendar file or email.

### Handle a change after publication

- **Code.** A contractor revision advances the source revision, every saved draft
  goes stale, and the planner must regenerate from scratch. "Minimum changes"
  measures movement from requested times, not from the published plan, so a small
  input change can reshuffle the night with no diff. The research document
  already flags this.

### Return next week

- **Code.** There is no second night. Nights are seeded, not created. Deferred
  work has nowhere to go. There is no backlog, recurrence or carry-forward.

## Core capabilities

**Essential, absence prevents real use**

- Conflicts, alternatives, pins and replan on approved requests, saved as versions
- Multiple nights: create, list, carry deferred work forward
- Human-unit intake: clock times, station ranges, work-class defaults
- Contractor-readable published schedule with accept / cannot comply
- Change-aware replanning: what moved versus the published version, and why
- At least one operator-validated rule set (the adoption gate, not a feature)

**Useful, improves it**

- Root-cause grouping of conflicts (one clash, one row)
- Clash warning at approval time, before generating
- Reasons attached to time bounds ("crew starts 01:00")
- Printable night plan or calendar export
- Bulk import of requests from CSV
- Session that survives refresh; deep links to a request or conflict

**Unnecessary now, adds surface**

- Five objective profiles (two would do until planners ask)
- Geographic map panel in the saved review (orientation only, rights unresolved)
- Chat assistant as a primary panel
- Adjustable panel layouts and their preference storage
- Roadmap items #18–#21 (voice, imports, CP-SAT, named crews) ahead of the essentials

## Fit with real workflows

**Assumption.** Scheduling here happens across a work-management system that
owns the work order, a shared possession register or spreadsheet, email and
messaging with contractors, and a coordination meeting. RailPlan touches none of
the first three and replaces the fourth with a solver.

- **Calendars and systems (Code).** No import, no calendar file, no work-order
  reference field. The tool asks contractors to re-key work that already exists
  elsewhere, and a planner cannot reconcile RailPlan with the system of record.
- **Communication (Code).** Telegram is one-way, per organisation, gated on a
  typed numeric chat ID. Failure and retry are modelled thoroughly;
  acknowledgement is not modelled at all.
- **Collaborators (Code).** Two roles. No resource owner, isolation authority or
  supervisor. Team assignment is fixed at approval and never reconsidered.
- **Habits (Observed).** Planners think in station names and clock times. The
  interface speaks in `NS13-NS14`, minutes after midnight, source revisions and
  an FNV-1a digest on the main status bar. Keep the engineering register for
  trust, one layer down.

Where it fits well: explicit approval revisions, immutable versions and
stale-source refusal match how possession decisions are audited. A planning
manager would want it even if planners grumble.

## Reasons to return, and reasons to leave

| Would build trust                            | Would make them stay                                                     | Would make them leave                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Every figure carries its formula             | The published plan is the one contractors work to, with acknowledgements | A "0 violations" plan an engineer overrules because a real rule was missing |
| Independent re-validation after every solve  | A change on Wednesday produces a small, explained diff on Thursday       | Being unable to move one job without regenerating the night                 |
| Impossible cases are named, not hidden       | Deferred work is visible and carried, so nothing is forgotten            | Thirty findings for ten problems, every night                               |
| Publish refuses stale or infeasible versions | Fewer phone calls because the clash was found on submission              | Contractors asking what the UUID in the message means                       |

## Prioritised improvements

Ordered by how directly each removes a reason not to adopt. Removals are
included; the product is already larger than its evidence.

| #   | Change                                            | Kind        | User problem                                                             | Specific change                                                                                                                                                                                                                                                             | Why it matters                                                                                                               | How to validate                                                                                                                                                       |
| --- | ------------------------------------------------- | ----------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | One planning path, on approved data               | Consolidate | Real planning work is only possible on 22 fabricated requests            | Move conflict list, inspector with alternatives, pin and replan into the saved workspace on the approved instance; save each committed change as a new draft with parent provenance; land the uncommitted revision editor first; demote the sandbox to "try with demo data" | The only journey repeated weekly, and the demo judges will believe; the research doc reached the same priority on 2026-09-09 | Five planner stand-ins approve two requests, generate, resolve one clash via an alternative, publish. Target: all finish without help and without opening the sandbox |
| P2  | Conflicts by root cause, deferred work first      | Simplify    | One clash shows as three rows; unplaced jobs are hidden after a solve    | Group violations sharing request set and overlapping interval into one finding with binding rules beneath; show "17 placed, 5 without a slot" with the five jobs inline in the primary result; retire the time-saved tile until measured                                    | Alert counts that match the planner's sense of the problem are the basis of credibility                                      | Three engineers count clashes by hand vs grouped count; time for planners to name the deferred jobs after a solve                                                     |
| P3  | A schedule a contractor can read and answer       | Add         | Outcome is one sentence with a UUID and an ID-based chat line            | Per-organisation published-schedule page: title, station range, planned vs requested time, what changed; "Confirmed" / "Cannot make this time" with reason flowing back as needs-info; rewrite Telegram text in the same words with a link                                  | Publication nobody confirms is a message, not a schedule; gives the planner the one signal the solver cannot                 | Three contractor readers state work, time, place and change correctly from the message alone; acknowledgement rate within 12 h in a shadow pilot                      |
| P4  | Nights as a series, with a home for deferred work | Add         | One seeded night; deferred jobs are a dead end                           | Planner creates nights; "carry to" another night as a new revision keeping approval; backlog view of unplaced approved work                                                                                                                                                 | Planning is a rolling queue; the product ends at 04:00 on the demo night                                                     | Share of deferred jobs given a destination inside the tool during pilot                                                                                               |
| P5  | Intake in the requester's units                   | Simplify    | Minutes after midnight, block checkboxes, unit counts                    | Clock pickers; from/to station expanding to blocks via `expandSector`; work-class defaults; duplicate last request; reason field on earliest/latest bounds                                                                                                                  | First field decides whether the form is finished; bounds with reasons stop the solver moving 03:00 to 01:15                  | Time and error count to submit one realistic request, before and after                                                                                                |
| P6  | Replan against the published version              | Add         | Any input change stales all drafts and regeneration reshuffles the night | "Revise from published": pin unaffected placements, solve only what changed, show a diff of moved / unchanged / deferred                                                                                                                                                    | Planners accept a tool that changes little and explains it                                                                   | Zero unforced moves on the disruption fixtures                                                                                                                        |
| P7  | Survive a refresh and a link                      | Fix         | Refresh returns to landing; objective persists silently; no URLs         | Persist or auto-reload state; selected request and objective in the URL; show active objective in the heading                                                                                                                                                               | Planners paste links and refresh when something looks wrong                                                                  | Refresh mid-task in the usability session; recovery without help                                                                                                      |
| P8  | One disclaimer, not twenty-eight                  | Remove      | Warnings on every page, footer, panel and export note                    | One persistent banner stating data source and rule status for the current night; keep boundary text in publish and export only                                                                                                                                              | Correctness preserved; constant self-negation is not; the banner becomes a trust signal when real rules arrive               | Ask participants whether the tool felt real; count unprompted mentions                                                                                                |
| P9  | Trim what evidence does not support               | Remove      | Six pages and a control-room register for a four-hour night              | Two objectives; drop geographic panel from saved review until rights clear; assistant behind an "Explain" affordance; version strings and digest into provenance details; remove panel preferences                                                                          | Credibility comes from depth in one journey, not breadth                                                                     | Time to first meaningful action, before and after                                                                                                                     |
| P10 | Get one real rule set                             | Discover    | All constraints are invented; this caps adoption regardless of UI        | Ask the PS1 mentor for "Key Considerations for Planning" and one anonymised request-to-final-plan night for one corridor; encode; show agreement and disagreement with the engineer; mark unknowns                                                                          | The research doc's question list has been unanswered since 2026-09-09; nothing else converts a demo into a pilot candidate   | Zero unexplained misses on engineer-labelled clashes for that corridor                                                                                                |

## Three changes to make next

1. **Join the two halves (P1).** Land the revision editor already in the main
   checkout, then move the sandbox's conflict list and inspector onto the saved
   instance. Everything else assumes a planner can act on the real plan.
2. **Show the problem at its true size (P2).** One row per clash, deferred work in
   the primary result, no time-saved tile. Cheap, and it changes the first
   impression of every solve.
3. **Close the loop with the contractor (P3).** A readable published schedule with
   confirm / cannot comply, and a message in the same words.

## Adoption test, sized for the week available

Run twice with the same protocol: this week on the fabricated night with whoever
has scheduled anything in an operations setting, and after the hackathon on a
mentor-sourced anonymised night.

**Protocol, 45 minutes per participant, 3–5 planner stand-ins, 3 contractor stand-ins**

1. **Baseline (10 min).** Hand the planner the 22 requests as a spreadsheet. Ask
   them to find the clashes and propose a night plan by hand. Record time,
   clashes found, and how many they mark "need to call someone".
2. **RailPlan (20 min).** Same requests, already approved. Tasks: name the
   clashes; generate; resolve one deferred job by alternative or pin; publish.
   Think aloud. Record completion without help, time to first decision, solver
   moves they would overrule and why, and whether they open other pages.
3. **Contractor readback (5 min).** Show the published message and page. Ask:
   what work, when, where, what changed from what you asked? Would you confirm?
4. **Exit (5 min).** "Would you use this to plan next Tuesday's night? 1–5" and
   "What is the one thing missing?"

**Gates that would justify calling it adoptable for a shadow pilot**

- All planner participants publish a plan with one manual change and never open
  the demo sandbox.
- Time to an agreed plan is lower than the hand baseline for at least four of
  five, with equal or fewer missed clashes.
- At most one solver placement per plan the planner would overrule as unrealistic.
- Every contractor reader states work, time, place and change correctly from the
  message alone.
- Median "next Tuesday" score of 4 or higher, and the top "missing" item is on
  this list rather than new.

If the fabricated-night run fails the first two gates, the problem is the journey
and this list is the fix. If it passes them but participants still score 2 or 3
on "next Tuesday", the problem is trust in the rules, and P10 is the roadmap.

## Evidence base

Repository worktree at commit `269d792` (clean); uncommitted revision-editor work
in the main checkout read for context; live sandbox run on 2026-09-15 via a
temporary unauthenticated route, removed afterwards; the project's brief, status,
decisions and research documents. No planner or contractor was interviewed; every
statement about current practice is marked as an assumption. A styled copy of
this review was published privately as a Claude artifact on the same date.
