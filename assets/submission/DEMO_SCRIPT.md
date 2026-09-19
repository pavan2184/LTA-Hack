# RailPlan PS1 — three-minute demo

Recording draft, 19 September 2026. This is a script and shot list; no finished
video or YouTube upload is claimed. Use the deployed `/ps1` from the tested
release. Read the narration naturally and use the remaining time in each segment
to let the displayed result become legible. Finish at 3:00.

## Rehearsal setup

1. Open the hosted `/ps1` in a clean browser at a readable desktop size. Close
   unrelated tabs and notifications. Keep the browser URL visible at the start.
2. Prepare the eight files from
   [`05-capacity-pressure`](../../packages/ps1/data/synthetic/05-capacity-pressure/)
   in a local folder. It is a **prepared synthetic instance**, not an organiser
   hidden test. It exposes policy tradeoffs with only nine activities. Upload
   from disk; do not use the built-in public-instance shortcut for this shot.
3. The production-build rehearsal used **Policy A**, location
   `SEC:ALP:S02_S03:EB`, **From week 16**, **To week 16**, **Reduced to 0**
   (nominal capacity 1). It displaces `05-A006` in contract `05-C006`. Repeat
   this exact cut on the hosted release before recording.
4. Verified rehearsal result: **1 of 22 accesses moved**, **95.5% held still**,
   one activity and one contract affected. The locally feasible plan's score
   changes **2184 → 2191**, and that contract's completion changes
   **2027-04-25 → 2027-05-02**. These are results of this identified synthetic
   run; use the actual displayed values if a later release changes them.
5. Rehearse selecting one moved activity and opening **Why**. If its explanation
   does not establish a particular causal claim, describe the changed weeks and
   displayed constraints without inventing that cause.
6. Download/recheck the final archive once before the take. The separate official
   public-results deliverable must come from a fresh, unmodified public-instance
   run, not from this synthetic disruption demonstration.

## Timed narration and actions

### 0:00–0:18 — The controller's question

**Show:** The `/ps1` start screen, with a brief “2AM: access withdrawn” title.

**Say:**

> It is two in the morning. Urgent maintenance removes access that several
> contractors were counting on. Which work must move, what will finish later,
> and what can stay? RailPlan helps a controller inspect that decision while
> keeping every activity in the plan.

### 0:18–0:45 — Prove the upload path

**Do:** **Upload instance files** → select all eight synthetic CSVs → show file
readiness/counts → **Run all three scenarios**. Keep enough of the solve visible
to establish that the UI is responding. Label any waiting-time edit explicitly;
do not imply edited footage establishes a runtime measurement.

**Say:**

> We start with eight files uploaded from disk. This is our prepared test
> instance; judges can upload their own undisclosed data through the same path.
> No account is required. Parsing, scheduling and local checking run in the
> browser. The workload and network come from the files, rather than a fixed
> demonstration chart.

### 0:45–1:12 — Explain the policy choice

**Do:** **Compare metrics**. Switch A → B → C, then return to A for the cut.
Expand one contract in **Work schedule** and select an activity.

**Say:**

> A keeps supply fixed and allows completion to slip. B keeps planned completion
> dates and pays for extra access or longer working windows. C balances both,
> with limits on that flexibility. The comparison exposes the costs and delays.
> The schedule shows actual allocated weeks, including gaps, alongside planned
> starts and completion targets. These are weekly allocations, not physical
> dispatch times.

### 1:12–1:45 — Turn the disruption into a proposal

**Do:** **Location occupancy** → **Bottlenecks** → select the rehearsed occupied
location/week. Open **Test urgent maintenance**, set **From week** / **To week**
to the same week and **Reduced to** to 0. Pause on the displaced activities.
Choose **Re-plan around it**, then **Adopt this schedule**.

**Say:**

> Now this location loses its available capacity for one week. RailPlan first
> identifies the displaced work. Replanning holds the unaffected accesses in
> place and tries to fit the affected work under the reduced quota. This is a
> proposal. The applied plan has not changed, and export is paused while the
> controller reviews it.

### 1:45–2:15 — Show the consequences before applying

**Show:** The **Review before apply** shelf: **Moved accesses**, **Held still**,
activity IDs and contract completion changes. Allow time to read the real values.
Choose **Apply reviewed change**.

**Say:**

> Here, one of twenty-two accesses moves and ninety-five point five percent stays
> unchanged. The affected contract finishes one week later, and the score rises
> from twenty-one eighty-four to twenty-one ninety-one. The controller sees that
> consequence before choosing. We apply the reviewed change, keeping the result
> connected to the affected activity and contract.

### 2:15–2:38 — Inspect one moved activity

**Do:** Return to **Work schedule**, select a moved activity, open **Why** in its
details, and briefly show **Network** if it adds useful evidence. Point to an
actual displayed constraint and the allocated weeks. Keep mouse movement calm.

**Say:**

> Selecting a moved activity links its allocation to the contract and the
> constraints behind placement. The network view exposes the locations affected
> by the work. The controller can inspect the explanation and use Undo to restore
> the previous applied plan. Human review remains a separate step from solving.

### 2:38–3:00 — Leave the judge with a usable result

**Do:** **Proof and export** → show **Ready to export** and the local-checking
boundary → **Download official nine-file ZIP**. Show the real extracted A/B/C
folders briefly. End on the tested app URL and source URL.

**Say:**

> Proof and export makes our local checking boundary explicit. It produces the
> specified three CSVs for each scenario, with the session log kept separate.
> Our checker is not the organisers' reference validator. RailPlan gives a
> controller a complete plan, an explanation of what changed, and a reviewable
> handover when access disappears.

## Final recording checks

- Every screen comes from the tested release and the same identified instance.
- The uploaded instance is labelled synthetic; it is never called an unseen
  organiser test. The published public outputs are supplied separately.
- Every spoken or overlaid metric matches the shown run. Avoid stale benchmark
  numbers, optimality claims, invented time savings and unverified validator claims.
- UI text and evidence remain readable at normal YouTube playback size. Do not
  spend recording time on optional authentication, Telegram or unrelated routes.
- Watch the exported 3:00 video with audio before upload; then test its YouTube
  URL signed out. Record the URL in the submission checklist.
