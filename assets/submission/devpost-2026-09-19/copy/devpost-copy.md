# RailPlan

**Tagline:** Railway access planning, explained.

**Full lockup:** RailPlan — Railway access planning, explained.

## Short description

RailPlan turns railway maintenance demand into a weekly track-access plan. Upload the eight input CSVs, compare three planning policies, inspect the reasons behind each placement, and review changes before applying them—all in your browser.

## Inspiration

Railway access planning is a coordination problem: maintenance teams share limited working windows, activities depend on earlier work, and a change in one location can affect another. A useful planning tool needs to make those relationships visible and give the planner a clear way to inspect a proposed change.

We designed RailPlan around the schedule itself. The work stays in view; explanations, location occupancy and change review appear when needed.

## What it does

RailPlan accepts the eight CSV files defined by the PS1 challenge and runs three policy scenarios through a same-origin native CP-SAT service. The public example contains 54 activities across 14 contracts and a 30-week planning horizon.

The workspace connects four tasks:

- **See the work.** Expand contracts into activities and inspect weekly access blocks, planned starts, completion targets and dependencies.
- **Explain the placement.** Select an activity to examine its schedule, constraints and related network locations.
- **Review a change.** Test urgent maintenance, compare the proposed impact, then explicitly apply or discard the revision. Applied changes can be undone.
- **Hand over the result.** Inspect local conformance checks and export the three required CSVs for each of scenarios A, B and C: nine files in one ZIP.

Uploaded instance data stays on the device. The PS1 workflow does not require an account.

## How we built it

The interface uses Next.js, React and TypeScript. A dedicated TypeScript scheduling package runs in a Web Worker so planning and checking can happen locally while the interface remains available. The schedule, explanations, scenario metrics and exports use the same underlying instance and plan data.

We borrowed the density and hierarchy of industrial scheduling software: a compact command ribbon, an expandable work tree, a wide timeline and details on demand. A low-glare theme supports a different viewing environment without changing the workflow.

## Challenges we ran into

The challenge requires complete delivery of every activity while respecting dependencies, possession rules, exclusion buffers, weekly allocations and workfront limits. Congestion cannot be solved by silently dropping work.

We also had to make revisions trustworthy in the interface. A proposal must remain separate from the applied plan, its impact must be visible, and uploads or later changes must not leave stale results on screen.

## What we are proud of

A planner can move from an overview of all work to the reason for a particular placement, test a disruption and review the resulting changes without leaving the workspace. The same upload-to-export path supports the published example and new eight-file instances.

## What we learned

Explainability is most useful beside the decision it explains. A schedule becomes easier to evaluate when dependencies, capacity constraints and changed placements are visible in context.

## What's next

Improve the scheduling heuristics, extend scenario testing and evaluate the interface with railway planning practitioners. Further operational use would require validation beyond this hackathon prototype.

## Built with

TypeScript, Next.js, React, Web Workers, Tailwind CSS, Vitest.

## Links

- Source: https://github.com/pavan2184/LTA-Hack
- Add the verified hosted `/ps1` application URL and the demo video URL when ready.

## Submission notes — not promotional copy

- These assets describe the public PS1 prototype. Local conformance checks are not the organiser's reference validator or operational approval.
- Scenario scores use different policy objectives; do not rank A, B and C by their raw numeric scores.
- Do not claim global optimality, safety certification, production deployment, measured time savings or AI-generated scheduling.
- The nine-file result ZIP is separate from this marketing asset pack.
- The PS1 official requirements request a GitLab repository and a three-minute YouTube video. This pack supplies neither; confirm repository submission requirements with the organiser.
