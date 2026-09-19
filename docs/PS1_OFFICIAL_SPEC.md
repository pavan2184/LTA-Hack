# PS1 official problem statement — authoritative requirements

Captured 2026-09-19 from the organiser's repository
[`aochinwen/NebulaX-Hackathon-ProblemStatement`](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement),
file `PS1/PS1_README.md`, at commit `966c976` (2026-09-18, "Document predecessor
precedence rule"). Earlier commits: `16526c0` (2026-09-17 content fixes),
`3ea7744` (2026-09-17 initial publication).

This is a **restatement** of the official specification, not a verbatim copy.
Read the original file in the organiser's repository when exact wording matters.
Everything below is the organiser's requirement unless a paragraph is marked
"RailPlan note", which is our own reconciliation against this repository.

## Precedence

This document is the authoritative source for **PS1 technical rules, data
formats, scoring and deliverables**. It supersedes:

- the website excerpt in
  [NEBULAX_PARTICIPANT_CONTEXT.md](NEBULAX_PARTICIPANT_CONTEXT.md#challenge-framing-and-ps1-source-excerpt),
  which is motivational framing only, and
- the participant PDF pack's generic submission list, which was written for all
  three problem statements and **conflicts with PS1's own deliverables** — see
  [Deliverables](#1-deliverables--what-we-must-hand-over).

The participant pack still governs **event logistics**: the 19 September 2026
16:00 deadline, the physical submission sign-in, the counter opening at 14:30,
attendance and the Hackathon Portal. Neither source overrides the other on its
own subject. Where they disagree, ask the organiser rather than picking one.

---

## 1. Deliverables — what we must hand over

The official PS1 README lists **four** deliverables:

| #   | Deliverable                 | Detail                                                                                                                                                                           |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Public test results**     | Pre-computed `SCHEDULE_ACCESS.csv`, `SCHEDULE_OCCUPANCY.csv`, `RESULTS.csv` for the **provided** `01_data/` instance — proof the solver works on known data                      |
| 2   | **Hosted live web app URL** | A running app where judges **upload an undisclosed hidden instance** (the 8 CSV instance files) into the UI, run the scheduler live, visualise the result and validate the logic |
| 3   | **3-minute YouTube video**  | Walkthrough of the app, the 2AM works-controller experience, the scheduling timeline and explainability features                                                                 |
| 4   | **GitLab repository URL**   | Complete source, solver implementation, setup instructions, documentation                                                                                                        |

### Conflicts with the participant PDF pack — unresolved

| Item              | Participant pack (2026-09-15)                    | Official PS1 README (2026-09-18)                          |
| ----------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Source repository | GitHub repository URL + README                   | **GitLab** repository URL                                 |
| Video             | 2–3 minute video pitch, host unspecified         | **3-minute YouTube** video                                |
| Results           | "ZIP file containing results", schema undefined  | Three named CSVs for the provided dataset                 |
| Hosted artefact   | "Hosted prototype domain"                        | Live app that **accepts a hidden 8-file instance upload** |
| Write-up          | Short write-up: solution, uniqueness, tech stack | Not listed under PS1                                      |

**Do not silently resolve these.** The GitLab/GitHub difference and the
YouTube-hosting requirement both change what a team physically submits. Confirm
with the organiser (`LTA_Nebula_X@lta.gov.sg` or the Telegram channel) or at the
submission counter. Until then, preparing both forms is the safe path: this
project's source currently lives on GitHub, and the pack's write-up costs little
to produce even if PS1 does not require it.

### RailPlan note — status against each deliverable

Verified against this worktree on 2026-09-19; see
[PROJECT_STATUS.md](PROJECT_STATUS.md) for the evidence behind each claim.

1. **Public test results** — `packages/ps1/data/results/{A,B,C}/` holds the three
   CSVs per scenario for the published instance. Recorded scores A 25.2 / B 30 /
   C 25.2, all three locally conformant.
2. **Hosted live web app** — `/ps1` is unauthenticated, accepts the eight CSVs by
   drag-drop or file picker, matches them on the published filenames, solves all
   three scenarios in a browser worker and exports the nine-file ZIP. Hidden
   instance data never leaves the device. Deployment freshness is a separate
   check, not assumed here.
3. **3-minute YouTube video** — not produced. The asset pack in
   `assets/submission/` has artwork and copy only. No video URL exists.
4. **Repository URL** — GitHub only. No GitLab mirror exists.

The vendored instance in `packages/ps1/data/public/` is **byte-identical** to the
organiser's `PS1/01_data/` for all eight files (verified 2026-09-19 by SHA-256
after newline normalisation).

---

## 2. The ask, and the non-negotiables

Build a tool that decides which contractor gets track access, on which nights,
across a dual-line network — and proves the answer. The output is a possession
schedule a works controller could dispatch against, and it is checked
mechanically by the **same reference validator the judges run**.

Four non-negotiables:

- **Complete workload baseline.** Every activity in `08_ACTIVITY_DETAILS.csv`
  must be scheduled with its full access workload. Dropping or truncating work
  to relieve congestion is not allowed. This is a **gate**: quality scores are
  only evaluated once full delivery holds.
- **Feasibility first.** Exclusion buffers, 750V live-rail opposite-bound
  mirroring, the `Live`-only interchange crossover, location capacities, legal
  mix rules, weekly allocation budgets and workfront caps must never be breached.
- **Keep scheduling under congestion.** When demand exceeds supply the solver
  must not stop or declare the case impossible — it packs co-sharing locations
  and compresses timelines toward the least planned completion overrun.
- **Co-sharing increases capacity.** Compatible work packed into a shared sector
  (`co_share_group`) raises nightly throughput. Buffers never overlap: only
  `Live` and `Non-live (Consist)` carry an exclusion buffer, and one possession's
  buffer must clear before the next possession's span or buffer begins.

Form factor is our choice — web app, desktop, CLI or a service behind a thin UI.
Deliverable 2 nonetheless requires a hosted web UI judges can upload into.

---

## 3. The network

Two lines, **Line Alpha (`ALP`)** and **Line Beta (`BET`)**, ten stations each:
eight exclusive stations per line (`S01`–`S08` on Alpha, `S11`–`S18` on Beta)
plus two interchange hubs, `H01` and `H02`, which exist on both lines.

- **Two independent bounds.** Each line has eastbound (`EB`) and westbound (`WB`)
  track, scheduled separately except for the couplings below.
- **Two bookable things.** Capacity is tracked at the **tunnel sector** between
  stations (`SEC:ALP:S02_S03:EB`) and the **platform sector** at a station
  (`PLAT:ALP:S03:EB`). A job spanning stations books every tunnel and platform
  sector between its book-in and book-out points, inclusive.
- **Every station has its own platform per bound per line.** A normal station's
  `EB` and `WB` platforms are independent locations, so one `PC` on each can run
  concurrently.
- **Interchange tunnels are physically two adjacent tunnels, not one.** Alpha has
  `SEC:ALP:H01_H02` and its own `H01`/`H02` platforms; Beta has its own. Booking
  Alpha's never draws down Beta's.
- **The one exception is `Live`.** Cutting traction power at the interchange
  affects both tunnels, so a `Live` activity's closure also closes the other
  line's `H01_H02` tunnel sector and its `H01`/`H02` platforms. `PC`, `PM` and
  `C` stay confined to their own line.

Worked example from the spec: each line's tunnel sector holds up to 4 activities
a night (1 `PC` + 3 `C`, or 4 `C`); each interchange station has 4 platforms
(`EB`/`WB` × Alpha/Beta), each holding 4 — 16 across the station.

The published instance has 18 tunnel sectors and 76 location rows in
`04_LOCATION_SUPPLY.csv`, over a 30-week horizon starting **2027-01-04**.

---

## 4. The demand

**Contracts** (`07_PROJECT_DETAILS.csv`, 14 rows in the published instance):

- **Nature of works** sizes the buffer: `Live` (2 sectors each side, mirrors the
  opposite bound), `Non-live (Consist)` (1 sector each side), `Non-live (Others)`
  (no buffer).
- **Access type:** `PM` takes sole possession of its location; `PC` is a
  possession master that may host co-workers; `C` is a co-worker.
- **Weekly allocation:** `number_of_maximum_access_per_week` is a flat per-contract
  cap, the same every week — **2 for `Live` contracts, 3 for all others**. This
  column is what the validator enforces for rule 7.
- **Workfronts:** `number_of_workfronts` is the maximum concurrent activities the
  contract can run on one night.
- **Dates and priority:** `contract_completion_date` is contractual;
  `planned_completion_date` is the target overrun is measured against.
  `contract_priority` is 1 High / 2 Default / 3 Low.

**Activities** (`08_ACTIVITY_DETAILS.csv`, 54 rows in the published instance):
working section (`start_location_id` → `end_location_id`), workload in
access-nights (`total_accesses`), `planned_start_date`, `activity_priority`
(1/2/3) and a nullable `predecessor_activity_id`.

---

## 5. Strict rules — must never be violated

1. **Workload conservation.** Every activity scheduled, nightly yields summing to
   ≥ `total_accesses`. A standard night yields **1.0**, an ECLO night **1.5**.
   None dropped, omitted or partial. This gates all quality scoring.
2. **Planned start date.** No activity starts before its planned start week.
3. **Predecessor precedence.** Finish-to-start with zero lag (`FS+0`). "Finished"
   is the week of the predecessor's last scheduled access night; the successor's
   first access night must fall in a **strictly later week**. Cross-contract
   links are allowed; cycles are not. _(Added to the spec on 2026-09-18.)_
4. **Closures and buffers.** An occupied night closes a sector to external
   activities. Only `Live` / `Non-live (Consist)` carry a buffer. `Live` mirrors
   its closure to the opposite bound and — only `Live` — crosses onto the other
   line's `H01_H02` tunnel and platforms at the interchange. Buffers never
   overlap: if a buffer reaches `S02`, the next buffered work on that bound
   starts no earlier than `S03`.
5. **Possession locations and legal mixes.** Per location-week a location packs to
   capacity as **one `PM` alone**, or **one `PC` + ≤3 `C`**, or **≤4 `C`**.
6. **Co-sharing exemption.** The same `(location_id, week, co_share_group)` is one
   possession occupying one access-night slot — no buffers between its members,
   and they are exempt from each other's closures. Different `co_share_group`
   values at the same location-week are separate possessions on separate nights
   within that week's allocation, and buffers apply between them normally.
7. **Weekly allocation.** A contract+type cannot use more distinct `access_night`
   values in a week than `number_of_maximum_access_per_week`.
8. **Workfronts.** At most `number_of_workfronts` distinct activities of that type
   may share one `access_night`. Combined with rule 7, a contract+type's maximum
   distinct activities per week is
   `number_of_maximum_access_per_week × number_of_workfronts`.
9. **Early closure / late opening (ECLO).** Buys extra working time per night at
   the cost of public travelling hours.
10. **ECLO continuity window — Scenario C only.** Every `eclo=1` access affecting
    a line must fall within one continuous span of **at most 2 calendar weeks**,
    chosen independently per line. A cross-line `Live` activity's ECLO nights
    must fit **both** windows at once. Since an activity gets at most one access
    night per week, this caps any single activity at 2 ECLO nights under C.
    **Scenario B is exempt.** Vacuous in A, where ECLO is forbidden outright.

---

## 6. Scenarios and scoring

Three scenarios are three separate answer keys, each validated independently.
**All scores are penalties — lower is better, zero is perfect.**

| Scenario                               | Rigid side                                 | Flexible side     | Hard-fails on                                                                                                     |
| -------------------------------------- | ------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| **A** Strict supply, flexible schedule | `LOCATION_SUPPLY` capacity; ECLO forbidden | Completion dates  | Any capacity excess (`capacity`), any `eclo=1` (`eclo`)                                                           |
| **B** Strict schedule, flexible supply | `planned_completion_date`                  | Capacity, ECLO    | Any overrun past planned date (`planned_date`)                                                                    |
| **C** Balanced                         | Neither                                    | Both, with limits | Capacity beyond **1 excess access-night per location-week** (`capacity`); ECLO outside the 2-week per-line window |

Scenario C's instance may also ship amended, higher local supply in specific
spots — a second, separate source of elasticity on top of the per-week allowance.

### Score formulas

```
Score_A = Σ_tier ( priority_weight_tier × overrun_days_tier )

Score_B = 7 × excess_access_nights_total  +  5 × eclo_nights_total

Score_C = Σ_tier ( priority_weight_tier × overrun_days_tier )
        + 7 × excess_access_nights_total
        + 5 × eclo_nights_total
```

A has no ECLO term because ECLO is forbidden there, not merely penalised. B has
no overrun term because a feasible B submission has zero overrun by construction.

### Priority weighting — two stacked signals

- **Contract tier** (`contract_priority`) sets the band and dominates:
  **100×** per overrun-day for Priority 1, **10×** for Priority 2, **1×** for
  Priority 3.
- **Activity priority** (`activity_priority`) only nudges within its own
  contract's band: **+0.3 / +0.2 / +0.0** for 1 / 2 / 3, added on top of the
  contract weight. A Priority-1 contract costs 100–130× depending on which
  activity is late; a Priority-2 contract's ceiling of 13× can never reach
  Priority-1's floor of 100×.

Per-unit cost ordering, cheapest first:

**P3 overrun-day (1–1.3×) < excess access-night (7, i.e. 3×) < ECLO night (5, i.e.
4.3×) < P2 overrun-day (10×) < P1 overrun-day (100×)**

So in **B/C**: absorb pressure with Priority-3 slip first, reach for ECLO next,
spend extra access-nights only when ECLO headroom is exhausted, and delay
Priority-2 or Priority-1 contracts only as a last resort. In **A** only the
overrun levers are legal — ECLO and excess nights are not moves at all.

---

## 7. Output schema

For **each** scenario, exactly three CSVs:

| File                     | Columns                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `SCHEDULE_ACCESS.csv`    | `activity_id,access_seq,week,eclo,access_night`                   |
| `SCHEDULE_OCCUPANCY.csv` | `activity_id,week,location_id,co_share_group`                     |
| `RESULTS.csv`            | `scenario,contract_number,simulated_completion_date,overrun_days` |

- `eclo` is 0 for a standard night, 1 for an ECLO night.
- `access_night` is which of that `(contract_number, activity_type)`'s granted
  weekly nights (1..`number_of_maximum_access_per_week`) this access falls on. It
  is a **local accounting index per contract+type+week, independent of location
  or sector** — this is what rules 7 and 8 are checked against, not a wall-clock
  night.
- `co_share_group` is an arbitrary label (`b1`, `b2`, …) identifying which
  possession at that location-week the activity occupies.
- `RESULTS.csv` carries **one scenario only**; the validator rejects a mixed file.

Nine files total across A, B and C. `PS1/03_submission_sample/` in the
organiser's repository is a feasible, zero-hard-violation example against
`01_data/` — a format reference, not a runnable tool.

**RailPlan note.** The one thing this format cannot encode is a physical night
shared across separate possessions, so our local checker labels itself _local_
rather than claiming validator parity. Keep that distinction in the UI and in
any claim we make to judges.

## 8. Validator report

The reference validator emits, per submission: `scenario` (read from
`RESULTS.csv`), `feasible` (true only when `hard_violations` is empty),
`hard_violations` as `{rule, severity, detail}` entries, `soft_scores`, and a
`detail` block.

`soft_scores` carries `overrun_days_total`, `contracts_overrunning`,
`earliness_days_total`, `excess_access_nights_total`, `eclo_nights_total`,
`priority_overrun` and `priority_weighted_score`. `objective_score` and
`formula_version` are added only when the submission is feasible.

Two subtleties worth keeping straight:

- `priority_overrun` buckets **raw** overrun-days by **contract** priority only.
  It does not use `activity_priority` at all — a Priority-1 activity overrunning
  inside a Priority-3 contract lands in the "3" bucket.
- `priority_weighted_score` is
  `contract_weight × (1 + activity_priority_nudge) × overrun_days`, summed per
  overrunning activity.

`detail` supplies `capacity_hotspots`, `nights_scheduled` and `eclo_nights`.

Rule tags shown in the official example include `closure`, `capacity`, `eclo` and
`planned_date`. **The full tag vocabulary is not published.** Our local checker in
`packages/ps1/src/engine/validate.ts` uses a superset —`workload`, `start_date`,
`predecessor`, `closure`, `capacity`, `mix`, `weekly_allocation`, `workfront`,
`eclo`, `eclo_window`, `planned_date`, `schema` — whose extra names are ours, not
the organiser's. Do not present them to judges as the reference validator's tags.

## 9. Judging

| Dimension               | What judges look for                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problem fit**         | Handles A, B and C sensibly; output feasible and well-formed; trade-offs and displaced work **explained**, not just produced. Approach is open.                       |
| **Technical execution** | Scored directly from the **reference validator's output on hidden instances** — feasibility, violation count, and score relative to the reference solver's benchmark. |
| **Ease of use**         | A works controller could pick it up and use it. Interface form is our choice; judges look for genuine usability, not a feature checklist.                             |

Optional bonus directions: dynamic re-optimisation after a mid-horizon
disruption with minimal churn on unaffected work; natural-language querying over
the schedule; and open innovation such as predictive bundling, contractor
negotiation support, depot and engineering-train logistics, fragility scoring or
what-if sandboxing.

**RailPlan note.** The disruption re-plan, the grounded Q&A and the explain/why
panels already on `/ps1` map onto the first two bonus directions and onto the
"explained, not just produced" half of Problem Fit. Dimension 2 is out of our
hands once submitted — it is decided by the hidden instances, which makes
deliverable 2's upload path the single highest-risk surface.

---

## 10. Open questions

None of these can be resolved from the published material. They need the
organiser, or a decision by a named person on the team.

| Question                                                                               | Why it matters                                               | Who resolves |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------ |
| GitLab or GitHub repository URL?                                                       | Deliverable 4 names GitLab; our source is on GitHub          | Organiser    |
| Must the video be hosted on YouTube specifically?                                      | Deliverable 3 says YouTube; the pack said only "video pitch" | Organiser    |
| Is the pack's write-up and results ZIP still required for PS1?                         | PS1's own list omits both                                    | Organiser    |
| How are the hidden instances delivered to the app — judge upload only, or a file drop? | Determines whether any non-upload path needs building        | Organiser    |
| What is the reference validator's full rule-tag vocabulary?                            | Our extra tag names are inferred                             | Organiser    |
| Does any hidden instance vary the 30-week horizon or the 2/3 weekly caps?              | Solver assumptions must not hard-code the published values   | Organiser    |

Event logistics questions — portal link, passkey, counter location, finalist slot
format — remain tracked in
[NEBULAX_PARTICIPANT_CONTEXT.md](NEBULAX_PARTICIPANT_CONTEXT.md).
