# PS1 submission checklist

Prepared 19 September 2026. This is a handover checklist, not a record that the
unchecked actions have happened. PS1 requirements come from
[the official specification](PS1_OFFICIAL_SPEC.md); event logistics come from
[the supplied participant pack](NEBULAX_PARTICIPANT_CONTEXT.md).

## Release and links

| Field | Value to confirm before submission |
| --- | --- |
| Released commit | **TODO:** exact commit tested on the hosted app |
| Judge entry point | https://railplan-nine.vercel.app/ps1 — verify this deployment |
| GitHub source | https://github.com/pavan2184/LTA-Hack |
| GitLab source | **TODO:** team-owned GitLab URL, or recorded organiser acceptance of GitHub |
| Three-minute YouTube video | **TODO:** actual published video URL |
| Portal submission | **TODO:** named team member and confirmation receipt |
| Physical sign-in | **TODO:** named team member and completion time |

Local release evidence: public scores **A 25.2 / B 44 / C 25.2**; all 12
synthetic upload/solve/download flows checked, including all 108 CSVs after actual
browser download. This does not complete the hosted-release checks below.
The production site still serves the older interface and public C 39.2.
Deployment access is outstanding: the current CLI account (`ducksss`) lists only
its own team, while the existing project belongs to `pavanmadhup-1254s-projects`.
The browser dashboard also requires login. Use the existing team's account or
have its owner deploy the tested branch; do not create an unrelated replacement.

- [ ] Deploy the intended commit and record its deployment URL/commit above.
  `vercel.json` sets `git.deploymentEnabled` to `false`; merging does not trigger
  the configured Git deployment. Do not infer freshness from a successful merge.
- [ ] Open the judge URL on a second laptop or private browser without an account.
  Confirm upload, worker assets and the redesigned work schedule load successfully.
- [ ] Freeze the tested release for recording and submission. If code changes,
  repeat the affected checks and update the release identity.

## Required public results

- [x] Generate results from the exact eight files in
  [`packages/ps1/data/public/`](../packages/ps1/data/public/) using the release
  solver. Keep synthetic fixtures and disruption demonstrations separate.
- [x] Confirm full activity/workload delivery and no hard violations under the
  local checker for A, B and C. Reference-validator results, if obtained, must be
  identified separately; local conformance is not reference-validator approval.
- [x] Inspect the actual submission archive. It contains **nine CSVs**:
  `A/`, `B/` and `C/`, each with `SCHEDULE_ACCESS.csv`,
  `SCHEDULE_OCCUPANCY.csv` and `RESULTS.csv`. Exclude validation JSON, summaries,
  session logs, screenshots and input files from this official results archive.
- [x] Check the published header order, one scenario per `RESULTS.csv`, and
  load/recheck each scenario's three downloaded CSVs against its source instance.
  Save the final results beside the commit/deployment evidence.

Run `npm run ps1:solve` to regenerate `output/PS1-public-results.zip`. Public
CSV files and local validation reports are tracked under `packages/ps1/data/results/`;
the submission ZIP is generated locally and contains only the nine required CSVs.

## Judge journey on the hosted release

Use a fresh upload from one complete synthetic folder, then the public files.
Do not describe our prepared fixtures as the organisers' undisclosed tests.

- [ ] **Upload instance files** → eight files ready → **Run all three scenarios**.
  Confirm all displayed counts come from that uploaded instance.
- [ ] **Compare metrics** and switch A/B/C. Check complete workload, meaningful
  policy differences, and a readable failure if a scenario cannot be solved.
- [ ] Select an activity in **Work schedule**; inspect **Why** and **Network**.
  Verify the explanation refers to that activity and its actual constraints.
- [ ] **Location occupancy** → **Bottlenecks** → occupied week →
  **Test urgent maintenance**. Reduce capacity; **Re-plan around it** →
  **Adopt this schedule**. Confirm the proposal appears for review and exports
  remain blocked. Inspect **Moved accesses**, **Held still** and completion changes;
  then **Apply reviewed change** and **Undo**. Repeat the cut, apply it and use
  **Re-run** to check that it persists. Re-run starts a fresh solve history, so
  exercise Undo before re-running. Start a fresh session for submission.
- [ ] **Proof and export** → **Download official nine-file ZIP**. Open the actual
  browser download and check its nine paths, headers and per-scenario results.
  Automated ZIP tests alone do not complete this item.
- [ ] **Load another** with a different instance. Confirm counts and results
  change; try an incomplete/malformed upload and recover with the correct files.
- [ ] Let a teammate do the above without coaching. Record solve duration and
  where they hesitate; do not claim measured time savings without a baseline.

Record evidence in the release verification/status notes: commit, URL, browser,
input folder, A/B/C results, elapsed solve time, disruption parameters, moved/held
counts, download contents, and any skipped checks. The
[synthetic dataset README](../packages/ps1/data/synthetic/README.md) describes the
fixtures; its historical scores must not replace fresh measurements.

## Video, source and portal

- [x] Prepare a [three-minute script](../assets/submission/DEMO_SCRIPT.md) and a
  [PS1-specific short write-up](../assets/submission/PS1_WRITEUP.md).
- [ ] Record the tested hosted build, review the exported video, publish to
  YouTube, and check playback from a signed-out browser. Record its URL above.
  Confirm the chosen visibility allows judge access.
- [ ] Provide complete source/setup instructions. At preparation time this
  checkout has only the GitHub `origin` remote; `gh` is installed and `glab` is
  not. This does not establish whether a GitLab project exists elsewhere.
- [ ] Resolve the official GitLab requirement versus the pack's GitHub wording.
  Supply the team's GitLab destination if a mirror is required. Mirror the
  release source and verify judge access; do not publish secrets or private data.
- [ ] Submit the hosted app, source, results, video and requested write-up through
  the team's portal; save confirmation. The pack's results-ZIP/write-up wording
  differs from the PS1 list, so retain both prepared artifacts and confirm with
  organisers. No portal URL, passkey or receipt is stored in this checklist.
- [ ] Complete physical submission sign-in. The supplied pack gives **19 September
  2026, 16:00 Singapore time** as the deadline and **14:30** as counter opening.
  It names EA Atrium outside LT7A / EA Foyer inconsistently; confirm onsite and
  follow any later organiser update. Portal upload does not replace sign-in.

## Evidence boundaries for the pitch

Use “locally conformant” for our checker. The official CSVs do not establish a
global physical-night identity across separate possessions. Describe the canvas
as weekly planning, not a dispatch clock. Use observed cost/runtime/churn from
the recorded run; do not claim an optimal solution, reference-validator parity,
operator adoption or measured hours saved. All activities must remain scheduled
in full; a prettier or cheaper partial schedule is not a successful result.
