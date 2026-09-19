# RailPlan — explainable track-access planning

RailPlan helps a railway works controller plan competing maintenance activities
and recover when urgent work reduces available access. The public `/ps1`
workspace accepts the eight official CSV inputs, solves scenarios A, B and C in
the browser, and presents their costs and completion tradeoffs in a linked work
schedule, location-occupancy view and activity inspector. Judges can upload their
own instance without an account.

The controller can identify work displaced by a capacity cut, generate a replan
that holds unaffected accesses in place, inspect moved work and completion-date
changes, and explicitly apply or discard the proposal. Applied changes support
Undo. Explanations and schedule questions use computed planning facts. Exports
contain the specified three CSVs for each scenario; handover notes and the
session log remain separate.

RailPlan's technical core is a deterministic TypeScript heuristic with an
independent local conformance checker, running in a browser Web Worker. The
interface uses Next.js, React and Tailwind CSS. The PS1 upload and solve path
does not require the separate authenticated application's database or an LLM
service. Complete workload delivery and represented hard constraints gate
export; incomplete results are not presented as successful plans.

The prototype's contribution is the connection between policy comparison,
disruption repair, visible consequences and controller review. It does not
claim mathematical optimality, operational safety approval or parity with the
organisers' reference validator. The local checker explicitly identifies the
cross-possession physical-night alignment that the published CSV format cannot
resolve. Current measurements and verification belong to the tested release's
evidence, rather than unsupported outcome claims.

App: https://railplan-nine.vercel.app/ps1

GitHub: https://github.com/pavan2184/LTA-Hack

Before submission, confirm the hosted commit and add the actual YouTube URL and
required GitLab URL (or organiser-approved repository alternative) to the portal.
This file is the PS1-specific short write-up; the archived 2026-09-15 Devpost copy
describes the separate authenticated product and should not replace it.
