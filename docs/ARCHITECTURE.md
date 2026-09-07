# Architecture

Last updated: 2026-09-07

## Shape

A server-gated Next.js App Router workspace over a pure TypeScript planning engine, plus
dynamic routes for the assistant and durable plan versions. Postgres planning-facts migrations and a
seed/loader exist; saved planning consumes immutable database snapshots. Supabase email/password authentication gates planner and contractor workspaces; no live feed
yet. The owner requires database development without Docker.

```
packages/core/src/domain/     network topology, crews, assets, work-class rules   (facts)
packages/core/src/data/       22 requests, emergency scenarios, disruptions       (inputs)
packages/core/src/engine/     intervals, validate, solve, metrics,                (computation)
                alternatives, explain, strategies, hash
src/store/      Zustand: view state + solver invocation             (orchestration)
src/components/ dashboard                                           (presentation)
src/lib/assistant/ fact set, grounding guard, templates             (language layer)
src/app/api/assistant/ Claude call, server-side                     (model boundary)
```

The dependency arrow points one way. `domain` knows nothing about `engine`;
`engine` knows nothing about `components`; `components` never compute a planning
result, they render one.

## The central rule

**`validate()` is the only authority on whether a plan is feasible.**

The solver calls it while building. It calls it again on the finished plan, from
scratch, before returning. The alternatives generator calls it on every candidate.
The explanation engine calls it on counterfactuals. The tests call it on solver
output as a property. Nothing anywhere is allowed to assert that a plan is
acceptable without going through it.

This is what makes the difference between a tool that shows a schedule and a tool
whose schedule means something. A solver that only trusts its own incremental
checks will eventually ship a plan that violates a rule it stopped looking at.

## Why atomic blocks

A request arrives labelled `NS10-NS12`. Another arrives labelled `NS11-NS13`.
Compared as strings they are unrelated; on the ground they share `NS11-NS12`.

So a sector label is display only. `expandSector` turns it into block ids at
module load, and every rule, the solver, the timeline and the corridor map all
work on those ids. The timeline draws one row per block rather than per request
for the same reason: a chart keyed on the requested sector would hide precisely
the collision the tool exists to find.

## Why capacities, not names

v0.1.0 modelled equipment as a string. Two jobs both listing "Thermal imaging
unit" looked like a coincidence. Modelled as a count — one calibrated unit — it
is a constraint the validator finds without a human noticing.

The same dataset shows why this matters more than crew headcount: Power Systems
has two crews, so `TEAM_CAPACITY` is satisfied for M-004 and M-011 running
together. They still cannot both run, because there is one thermal imaging unit
and one SS-4 isolation. Three rules, one answer, none of them typed in.

## Strategies are objectives, not schedules

A strategy is three deterministic levers over one solver: the order requests are
considered in, how candidate start times are ranked, and how much separation or
reserve the profile insists on. Profiles remain objective parameters. Two profiles running the same
constraints differ only by those numbers, which is what makes the comparison
meaningful rather than decorative.

## Planner decisions re-enter the solve

Pinning a placement is not an overlay. It becomes a hard constraint and the night
is solved around it. This is the difference between an interface that lets a
planner move a bar and one where moving the bar means something: the KPIs, the
violations and the rest of the schedule all move with the decision, or the tool
reports that the decision cannot be honoured.

## Disruptions change inputs

Each scenario translates into solver inputs — a mandatory emergency job pinned to
its window, a crew marked unavailable, a job stretched by its overrun, an earlier
handback deadline. Then the ordinary solver runs. Nothing is precomputed, which
is why a scenario is allowed to come back infeasible.

## The model boundary

The assistant is a presentation layer over solver output and is constrained
structurally rather than by instruction alone:

1. The browser sends the question and the parameters identifying the plan — never
   the plan. The server re-solves and builds its own fact set, so nothing the
   client sends can become a fact the model repeats.
2. The fact set is serialised into the prompt *and* reused as the allow-list for
   the grounding check, so the two cannot drift.
3. Any answer containing a numeric token absent from that fact set is discarded.
4. On rejection, refusal, missing credentials or network failure, templates over
   the same engine output answer instead, and the interface says which happened.

The assistant can rephrase, summarise and prioritise. It cannot introduce a
quantity, and it never decides feasibility.

## Determinism

Same inputs, same plan. Guaranteed by fixed request ordering with `id` as final
tie-break, integer minutes throughout, candidate starts generated in a fixed
order, and a repair loop that re-solves from scratch rather than mutating in
place — so the result is a function of its inputs and not of the order repairs
happened in. `inputHash` makes it checkable, and a test asserts it.

## Performance

22 requests solve in 20-70 ms, so solving runs inline. A Web Worker would add
failure modes without removing a visible stall. The progress strip shows three
real phases rather than a fake timer. That trade changes if the dataset grows.

## Deployment

Any Node host that can build Next.js. `/`, `/contractor`, `/login` and `/api/assistant` need a server. Without `ANTHROPIC_API_KEY` the assistant degrades to templates and the
rest of the application is unaffected.

## Database boundary (v0.4.0)

`PlanningInstance` is the serializable contract shared by literals and the
Postgres loader. Canonical ordering and section-level digest comparison detect
source drift. `PlanningWorld` derives the lookups carried through engine context.
The core package cannot import web, React or Next code; ESLint enforces this.
`supabase/migrations` stores schema history, `scripts/db/seed.ts` writes demo
facts, and `scripts/db/verify.ts` is the required non-skipping parity gate.
The hosted RailPlan Dev project passes migration, seed and literal/database parity
verification. The loader uses a repeatable-read transaction for a consistent
snapshot and transaction-pooler compatibility. The dedicated `/plans` workflow persists server-generated versions and audits; the demo sandbox remains explicitly local exploration.

## Identity boundary — issue #5

`@supabase/ssr` maintains cookies through the Next.js proxy and server clients.
Pages and the assistant verify the current user with `auth.getUser()`, then load
an operator-assigned profile. Signup metadata is never authorization input.
Missing configuration fails closed; unassigned accounts see access pending.
Contractors receive a separate workspace with structured intake in #9. The planner's
existing deterministic UI remains client-side behind the server page boundary.

All application SQL goes through `withAuthenticatedTransaction`: it sets the
transaction-local authenticated role and minimal claims derived from the verified
user, reads the trusted profile under RLS, and closes its connection. The owner
connection used by maintenance scripts is never the application authorization
context. Plan generation, decisions, publication and request intake use this
transaction boundary. Future resource routes must retain the same verified-role
checks and transaction boundary.

Assistant limits use a locked per-user token bucket in the private schema, shared
across application instances. A narrowly granted private definer function checks
the current planner profile, chooses the caller from `auth.uid()`, and fixes the
rate and clock server-side. Clients cannot mutate the bucket directly.

## Versioned planning boundary — issue #6

`src/lib/plans` accepts bounded generation parameters, loads canonical database
facts, solves against a derived world and independently validates before saving.
Transactions begin at repeatable read before the profile lookup. Every planning
fact mutation advances a conservative global source revision under a shared row
lock. Generation and publication update a separate lock generation on that row;
this forces overlapping repeatable-read callers to retry from BEGIN instead of
publishing from an old MVCC snapshot. Three total attempts bound retries.

Runs contain immutable facts, parameters and computed output. Placements and
deferrals are normalized. Separate append-only publication rows link superseded
versions without editing their content. Stale publication returns a value inside
the transaction, commits the rejection audit, then throws the typed HTTP error.
Publication revalidates saved placements against current facts and requires
matching full-input SHA-256, current engine versions and all mandatory work.

Tables and narrowly granted write functions are in the non-exposed
`railplan_private` schema. Authenticated SQL reads use planner RLS. Write functions
recheck trusted planner profiles and derive actors from auth.uid(). Never add this
schema to Supabase's exposed Data API schemas. Contractor reads remain denied
until a later scoped delivery contract exists.

## Workforce fact boundary — issue #7

Anonymous staffing data crosses the same PlanningInstance/seed/loader/canonical
hash boundary as topology and equipment. Role and demand catalogs remain plain
serializable facts. The database loader and workforce write-payload schema call
`assertWorkforceInstance` for references, counts, actual night bounds and duplicate/
overlapping data. Existing pure engine callers continue to accept the instance
with defaults; canonical sorting does not itself reject exploratory request/window
changes. No workforce solver rule or metric is introduced before #8.

PostgreSQL `btree_gist` supports the availability exclusion constraint. Shared
source-revision statement triggers serialize supply mutations and parent-night
window changes. The row checks run after that serialization and validate both
sides of the relationship, including concurrent READ COMMITTED writers. Workforce
facts are planner-only under RLS and every change invalidates old draft provenance.

## Anonymous workforce enforcement — issue #8

`engine/workforce.ts` segments work and absolute availability at every endpoint,
per assigned team and role. It merges only segments with identical contributors,
demand and supply. The validator reports each overloaded segment independently;
crew capacity remains a separate rule. No worker identities or qualifications are
inferred from these aggregate counts.

The same assessment feeds person-minute utilisation and shortage interval metrics.
Supply is intersected with the team's shift, engineering window and any outage;
overrun extends demand, while block-clearance time does not. Missing supply is
zero. Missing or malformed demand is unknown and blocks feasibility. Extra jobs
carry explicit `ValidationContext.extraWorkforceDemand` definitions; built-in
emergency scenarios declare fabricated counts rather than inheriting a staffing
standard. Emergency insertability is revalidated with those counts.

Candidates, pinned final plans, repair and alternatives use the shared validator.
Automatic repair preserves locks and rejects moves that introduce a new conflict;
workforce conflict identity includes its team, role, counts and interval. The
solver resolves mandatory custom requests from its actual input pool, so a
staffing-blocked emergency is reported infeasible even when absent from literals.

## Structured request intake — issue #9

`src/lib/requests` keeps contractor proposals separate from engine inputs. Private
submission rows point at an append-only revision/event stream. Every edit and
transition advances an optimistic version, records the authenticated actor and
preserves the prior snapshot. A narrow private mutation function derives the
organisation from the trusted profile, checks the lifecycle and revalidates JSON
against actual database references. HTTP uses the same authenticated SQL role,
bounded JSON, same-origin rules and explicit planner approval permission as plans.

Contractors receive only selection metadata through a scoped catalogue function.
They cannot read global maintenance facts, team choices, supply or whole plans.
Planner-only catalogue fields include teams/skills and approved dependency choices.
Only active approved immutable revisions are appended by `loadPlanningInstance`
to operator-seeded baseline facts. Stable `R-<submission UUID>` IDs and exact
`submissionRevision` values enter saved facts and their digests. An approved
revision is never materialized into mutable public maintenance request tables.

Approval and active cancellation advance the shared planning-source revision under
the existing generation/publication lock. Revising approved work leaves the old
approved revision active until replacement approval; cancelling removes it.
Active prerequisites cannot be cancelled or moved to another night until their
approved dependents are revised. Scheduled status is a scoped query of the current
publication's actual placement and exact revision, including when a newer draft
exists. Intake status never asserts solver feasibility. The richer evidence and
AI proposal review queue remains issue #11 after transcript proposals in #10.

Baseline DELETE/id/night changes also check inbound approved intake dependencies
through a private trigger. The assembled loader fails closed on missing or
cross-night dependencies and unknown request block/team/equipment references,
including after trusted maintenance operations that bypass ordinary row changes.

## Private transcript proposals — issue #10

`src/lib/ingestions` reads authenticated same-origin raw UTF-8 text with a streamed
64 KiB byte bound. The owner explicitly requests extraction and saving of excerpts.
A separate owner-keyed database quota permits a burst of three and refills one
attempt per minute. Model work runs outside database transactions. Missing
`ANTHROPIC_API_KEY` returns a typed unavailable response; manual intake remains
independent. No new credential names or fallback identity providers are introduced.

Claude Sonnet 5 receives a fixed system instruction, selection-only catalogue and
one JSON-encoded untrusted transcript message. It has no tools or planner fields.
Structured JSON output is independently checked with strict Zod schemas. The SDK
has a 12-second timeout, no retries and logging explicitly off. Exceptions are
mapped to safe codes without logging source, output or upstream error objects.

Every evidence quote must match an exact source substring. The server computes
UTF-16 offsets and checks any quoted timestamp. Field support is conservative:
verbatim title/description, exact known references, labelled durations/windows and
explicit count-plus-resource references. Unsupported or inconsistent facts become
null with missing-field flags; confidence is only a model estimate. Invented
quotes reject the whole batch. Excerpts are bounded and aggregate coverage cannot
reconstruct the full source. The complete transcript never enters SQL or logs.

Private draft pointers and immutable initial revisions contain only validated
partial fields, estimated confidence, missing flags, retained excerpts, timestamps
and extractor/model provenance. Reads require the exact authenticated owner,
including for planners; organisation membership does not grant access. This store
has no submission, approval or planning-source side effect. Issue #11 adds the
explicit owner editing/submission journey over this private proposal boundary.

## Explicit proposal sharing and review — issue #11

Owner-private proposals can be edited with expectedVersion and a reason. Nullable
fields remain unknown until the owner supplies them; blank text normalizes to
null. Changed fields become manual, lose current model confidence and supporting
quotes, and retain their original extraction evidence in immutable history.
Existing extraction revisions are never rewritten: nullable audit metadata reads
with original-owner/extract/private fallbacks for the pre-review records.

Explicit submission is one transaction: verify current owner/version, validate all
contractor fields, derive the contractor organisation (or require a planner's
explicit known-organisation choice), append a private submit revision, create one
submitted RequestSubmission and store an immutable source snapshot. A changed
contractor organisation cannot silently inherit an old organisation's draft for
sharing. Submission shares retained fields, evidence and revision history with the
selected organisation and planners; other private material remains owner-only.

`request_proposal_sources` is readable through submission RLS, not through broader
private-draft access. Request detail reads include the immutable source snapshot;
list reads omit the heavy bundle. The ordinary submitted-request review lifecycle
then owns needs_info/rejection/approval and subsequent manual changes. Evidence
remains explicitly original proposal evidence if later request fields change.
Only complete approved request revisions cross the existing engine boundary.

Private edits/submission only advance lock generation for coherent catalogue
checks; they do not alter planning input provenance. Every cancellation and
rejected-to-draft reversal now increments the planning source, alongside approval
and approved replacement, exactly once per successful transition. Private history
is capped at 100 revisions to bound the deliberately shared snapshot.

## Workforce visualization

The chart projects `assessWorkforce` intervals, the same assessment used by the
validator and metrics. It retains slot and non-slot event boundaries, shows signed
remaining headcount, and separates teams and roles. Components do not derive
new demand or supply rules. Missing demand stays unknown. A shared
`visiblePlanningInputs` adapter assembles pending disruption placements for both
impact validation and the chart, preventing duplicate emergency work or overruns.
The existing request selection synchronizes contributor buttons with the Gantt
and inspector. The demo sandbox remains an exploratory literal snapshot; saved review receives its own persisted world.

## Geographic context

`data/geography/` contains a versioned presentational station-point snapshot.
`src/lib/geography/` validates its source metadata and exact known station set.
Offline scripts transform a reviewed local archive; the renderer imports JSON
and makes no map-service request. Core instances, hashes and feasibility never
import geography. Connections reference existing fabricated block IDs; geography
does not supply track alignment, operational possession/isolation or safety data.

## Issue #16 role journeys and saved visual review

Authenticated `/` routes planners to `/plans` and contractors to `/contractor`.
Shared navigation exposes request review, saved planning and the explicitly
fabricated `/sandbox` only to planners; every route retains server-side role checks.
SavedPlanReview reads the existing planner-only JSON export endpoint and constructs
a world from immutable facts for its Gantt, workforce and local geographic views.
It never substitutes the sandbox store or regenerates feasibility. Publication
status/source freshness are separate observations; publication still revalidates
on the server. Saved IDs key visual selection and pending requests are cancelled
on changes. Layout preferences are browser-local presentation data only.

## Issue #17 release harness and log boundary

The application has no test-mode provider endpoint or alternate authorization
path. A separate test child starts the normal production server on127.0.0.1:3101.
A guarded Node preload intercepts only fixed provider hosts with controlled
responses, allows configured Supabase Auth traffic, and rejects other external
fetches. The parent uses real cookies and application HTTP for domain changes.
Temporary identity bootstrap and exact cleanup are privileged fixture tooling,
not application APIs. Default tests exclude this committed-fixture suite.

Assistant API calls apply the shared Origin/Host JSON mutation guard before quota
and retain deterministic fallback. Application logging never serializes prompt,
provider exception, ungrounded token or arbitrary usage metadata; only fixed
events, counts and bounded numeric usage cross the log boundary.
