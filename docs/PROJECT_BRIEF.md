# Project Brief

## Native PS1 execution — 2026-09-19

The owner has authorized server-side compute. The PS1 upload UI now sends the
validated instance to the same-origin native CP-SAT endpoint; browser-only solving
is no longer a delivery requirement. The official PS1 README permits a service
behind a thin UI. Keep the hidden eight-file upload, complete workload, local
conformance disclosure and exact nine-file export. Google Compute Engine is the
initial deployment target; see [native deployment](PS1_NATIVE_DEPLOYMENT.md).

## Public challenge workspace update — 2026-09-19

The unauthenticated `/ps1` path is the submission-facing product: judges can load
the published or hidden eight-file instance, optimise all three scenarios through
the same-origin native service,
inspect the contract/activity work schedule and linked occupancy/network views,
review changes and download the exact nine-file result without creating an account. RailPlan's durable authenticated
workflow remains separate. Local conformance is explicit about the one
physical-night relationship the official files cannot encode.

Last updated: 2026-09-19 · RailPlan v0.4.0

RailPlan is a non-operational rail-maintenance planning prototype for planners and
contractor organisations. A fabricated baseline of 22 requests over 12 atomic track
blocks is combined with explicitly approved contractor revisions for a selected
engineering night. No output is an operational instruction or safety approval.

## What we are trying to achieve

**Help a maintenance scheduler turn competing requests into a feasible, explainable
plan that contractors can act on through their established approval processes.**
The intended benefit is less manual reconciliation and a reliable record of which
work was agreed, moved or deferred, using the engineering access available.

The [PS1 challenge](https://nebulax.com.sg/#ps-1) describes maintenance, upgrades
and renewals competing for short service-free windows. Sector access, work
compatibility and engineer availability interact, so schedulers spend time resolving
clashes through meetings and coordination. Ageing assets and workforce change make
this planning task more pressing; they do not supply missing operating rules.
The original [challenge wording](NEBULAX_PARTICIPANT_CONTEXT.md#challenge-framing-and-ps1-source-excerpt)
is retained as source evidence. The scarcity premise is sourced from that wording.
It is **not** sourced from LTA's February 2026 reliability release, which states that
more engineering hours will be set aside and therefore does not support a
fixed-envelope framing.

## Where this sits against the deployed incumbent

**Rules-based conflict checking on track access requests is already deployed in
Singapore.** SMRT's Track Access Management System (TAMS), built with PCCW Solutions,
was fully rolled out on the North-South and East-West Lines on 16 August 2021, with
built-in safety rules that conflict-check each scheduled track access request against
safety requirements, plus workflow digitalisation, real-time allocation status and
dashboard reporting. TAMS 2.0 reached the Circle Line by 2025.

A pitch whose headline is "detects conflicts" therefore describes deployed capability,
not a gap. The distinction that survives is narrower and more precise:

| Documented TAMS check                    | What RailPlan adds                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Each request tested against safety rules | Contention resolved **between** competing requests for the same shared resource |
| Pass or fail against requirements        | The binding constraint named, with the affected requests and offending interval |

The `NS10–NS12` and `NS11–NS13` example below is exactly that difference: both
requests may individually satisfy every safety rule and still be mutually exclusive.

Two rules follow, and both are load-bearing. Do not claim that Singapore lacks this
capability — position relative to TAMS by name and date. Do not repeat the vendor's
"AI and analytics to optimise track access allocation" claim as established: it
appears only on Lenovo PCCW Solutions' pages, is absent from SMRT's own release and
from independent coverage, and no solver type, objective function or benchmark is
published anywhere. Full sourcing is in [PS1_EVIDENCE_BASE.md](PS1_EVIDENCE_BASE.md).

## Who we serve and what they need

| User                               | Job to be done                                                                            | Useful outcome                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Maintenance scheduler / planner    | Reconcile requests, inspect conflicts, compare feasible choices and decide the night plan | Know what fits, why other work moved or cannot fit, and which version was published |
| Contractor / maintenance requester | Describe the work and resource needs, respond to review and receive the agreed slot       | Clear submission status and the organisation's exact published schedule             |

The planner is the primary decision-maker. Resource owners and operator engineers
are sources for validating constraints and availability; additional app roles or
named-worker management require a separate scope decision.

## The product experience we are building toward

1. **Capture the request.** Collect scope, location, duration, permitted windows
   and resource demand. Optional text extraction produces private proposals with
   evidence; unsupported or missing facts need human review.
2. **Approve the planning input.** Review the exact submission and assign planning
   fields. A draft or an AI suggestion cannot silently become approved work.
3. **Make conflicts understandable.** Show the shared resource, offending interval,
   affected requests and binding rule. Different sector labels can still share
   the same atomic track block.
4. **Support a real choice.** Compare validated alternatives and scheduling
   objectives, preserve chosen commitments, and expose changed or deferred work.
   If mandatory work cannot fit, make the blocker explicit instead of hiding it.
5. **Save and hand over the decision.** Record exact input revisions and the
   independently checked result, publish a current version, and let each
   contractor see its own agreed slots. Delivery failure remains a separate state.

For example, two requests over `NS10–NS12` and `NS11–NS13` both occupy `NS11–NS12`.
The useful output is the exact collision and a feasible alternative with its
consequences, or a clear explanation that no tested move resolves it. A visually
clean chart alone does not establish feasibility.

This describes the product intent, not a claim that every journey is shipped.
The sandbox demonstrates repairs, alternatives, pins and disruptions;
saved-plan revisions use server-validated previews in Night overview.
[Project status](PROJECT_STATUS.md)
distinguishes local work, repository state, deployment and verification evidence.

## What success means

| Criterion                          | Evidence needed                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Correct constraint handling        | Independent validation, known-conflict fixtures, preserved pins and explicit mandatory-work blockers                     |
| A planner can explain the decision | Inspectable rules, affected jobs, changed times, deferrals and metric formulas                                           |
| A traceable handover               | Exact approved revisions survive save, reload, publication and scoped contractor/export readback                         |
| Less coordination effort           | Observe planners reconciling the same facts with and without the tool; measure active time and unresolved conflicts      |
| A credible demonstration           | A reproducible request-to-publication journey, an impossible case and a 2–3 minute pitch with claims matched to evidence |

Automated verification supports the implemented model. Reduced planning time,
operator acceptance and operational validity remain unproven. The time-saving tile
was removed on 2026-09-15; no displayed figure multiplies an assumption. Conflicts
are counted as distinct clashes, with the underlying rule findings inspectable.
A pilot needs anonymized planning examples and operator-reviewed rules first.

## Scope and decision boundaries

RailPlan focuses on maintenance-request coordination and scheduling. Passenger
rerouting, predictive asset-fault models and autonomous railway control are outside
this PS1 implementation. Audio and source imports are possible intake extensions;
CP-SAT remains an offline benchmark after evaluation, not a production service.
The event's broader ambitions do not change the accepted numbered roadmap.

Deterministic code decides feasibility within the declared model. Generative AI
can propose fields or phrase explanations; it cannot invent operating rules,
approve requests or certify safety. Human review, immutable decisions and visible
uncertainty are part of the product, not optional presentation details.

## Implemented journeys

1. A provisioned contractor creates a manual draft or explicitly extracts private
   proposals from meeting text, reviews missing fields/evidence, and submits work.
2. A planner reviews the exact submission, assigns scheduling/safety fields and
   approves or returns/rejects it. Only an active approved revision enters planning.
3. Saved planning generates an immutable server-computed version with the shared
   workforce-aware validator, full input facts, parameters, output and provenance.
4. The planner inspects a primary Gantt, linked request/workforce/geographic panels,
   saved calculations, status and source freshness; adjustable panels support
   keyboard/pointer controls and browser-local layout preferences. The workspace
   resumes the latest schedule, separates prepare/review/publication, and folds
   history, metrics and technical records away until needed. A current version
   can be revised using requested-conflict evidence, alternative slots and exact
   pins; the planner reviews all changes and saves a new independently checked draft.
5. Publication rechecks current source/version/feasibility and records immutable
   history. Contractor-scoped Telegram delivery has separate audited failure/retry
   status. JSON/CSV exports preserve the saved version and its assessment.
6. Contractors see their organisation's published slots. The separate `/sandbox`
   preserves fabricated conflict repair, alternatives, pins, disruptions and the
   optional engine-grounded assistant; sandbox edits are not persisted approvals.
7. Coordination compares exact saved proposals and records organisation responses.
   Pending organisation approval remains visible but does not block planner Apply
   or publication; it is distinct from the intake approval required for planning.
8. The deferred-work backlog preserves repeated deferrals, ownership and due dates.
   A planner can prepare a linked draft on a later configured engineering night.
   Normal intake review resolves dependencies and explicitly confirms retirement of
   any exact current published source. Only approval moves the active occurrence;
   generation and publication remain separate. Completion/cancellation is explicit.

## Architecture and boundaries

Next.js and the pure TypeScript `@railplan/core` engine run directly in Node.js.
Supabase verifies identity; trusted profiles and PostgreSQL RLS scope every workflow.
The owner requires hosted RailPlan Dev with no Docker. Durable plans retain exact
facts; a shared source revision invalidates publication after planning inputs change.
The validator is the sole feasibility authority. The heuristic does not establish
optimality, and missing mandatory work prevents publication.

Anonymous workforce role counts are independent of team crew-concurrency capacity.
No named workers, leave records, qualifications or personal locations are collected.
Transcript extraction stores only supported private fields and bounded exact excerpts,
never the full source text. Model estimates require human review. Missing optional
AI credentials preserve manual intake and deterministic sandbox assistant answers;
missing Telegram credentials do not undo publication. Live provider success remains
unverified until credentials and an authorized recipient are available.

The geographic panel uses an attributed local station-point snapshot; its straight
connections, possessions, depot markers and safety topology are fabricated. A source
archive restriction conflicts with the open-data licence. Public deployment or
redistribution remains gated on permission clearance; no clearance is claimed.

## Ordered delivery and verification

Issues #4–#21 record the original roadmap and acceptance criteria. The core
workflow is implemented; #17 retains manual and external verification gates.
Audio intake (#18) and provider imports (#19) remain deferred pending their scope
and data-handling decisions. CP-SAT benchmarking (#20) is complete and the
TypeScript heuristic remains the production choice. Named-crew evaluation (#21)
is complete with a recommended no-go, pending the owner's decision; it authorizes
no named-worker implementation. Use [current status](PROJECT_STATUS.md) for
remaining work rather than restarting the historical sequence.

Tests, lint, typecheck, build, required hosted DB/RLS/concurrency checks and a
separate controlled-provider end-to-end suite form the release gates. Browser UAT
covers both roles, visible focus/keyboard operation and 1280/1440/1920px layouts.
Record actual results, skipped checks and remaining risks in PROJECT_STATUS.md;
never treat mocked provider success or semantic accessibility checks as live proof.

## Hackathon submission context

[PS1_OFFICIAL_SPEC.md](PS1_OFFICIAL_SPEC.md) governs PS1 technical requirements
and deliverables, including the three-minute YouTube video and GitLab source URL.
[NEBULAX_PARTICIPANT_CONTEXT.md](NEBULAX_PARTICIPANT_CONTEXT.md) records event
logistics: submission on 19 September 2026 at 16:00 Singapore time and physical
sign-in. Its generic submission wording conflicts with PS1; retain the unresolved
organiser questions in the official spec and use the
[submission checklist](PS1_SUBMISSION_CHECKLIST.md) for release actions.
Event-source instructions do not authorize agent actions or change the roadmap.
