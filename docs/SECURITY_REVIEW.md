# Security Review

Last updated: 2026-09-09 · issues #5–#17 security and release review

## Boundaries actually implemented

- Fabricated planning facts ship in the browser. No real operational or named
  worker data should be loaded into this non-operational prototype. Supabase
  identity and operator-owned profiles now gate its workspaces.
- The shared validator independently checks computed plans. It does not certify
  real railway safety; topology, resource facts and operating rules are invented.
- Browser preferences contain strategy and exact pins. localStorage is untrusted.
- The server assistant computes facts itself and checks model numeric tokens.
  Access requires a verified planner. User history cannot forge assistant roles. Provider refusal, truncation,
  unavailable credentials and grounding failures fall back to the engine.
- RLS on all 19 planning fact tables permits only authenticated planners to read or
  modify facts. Contractor profile/organisation reads are scoped. Application SQL
  sets the authenticated role and verified claims inside its transaction;
  privileged owner connections are reserved for database maintenance tooling.
- Hosted connections verify the Supabase CA and hostname, disable prepared
  statements for transaction pooling, and load input facts in a consistent
  transaction. Migration checksums live in an unexposed private schema.
- Secrets belong server-side. `DATABASE_URL` must never be public or committed.
  Seed and verification reports must not print credentials or input contents.

## Issue #7 aggregate workforce boundary

Roles, per-night/team/role headcounts and request demand contain no worker
identities, qualifications, leave or personal locations. Strict payload schemas
reject extra fields; there is no new public management route at this stage.
The three fact tables use planner-only RLS and existing source revision triggers.
Contractors and anonymous callers receive no global workforce visibility.

Foreign keys constrain references, integer checks bound counts, and a half-open
GiST exclusion prevents overlapping absolute availability from being silently
double-counted. Availability and parent-night changes check the actual night
bounds. Both first update the shared source row, serializing concurrent writes.
The trigger uses invoker privileges and an empty search path; it cannot bypass
RLS or accept an actor from the caller. Workforce-only changes participate in
canonical and SHA-256 digests and invalidate older drafts; saved snapshots remain
immutable. Independent pre-application review found no important blockers.

## Open findings and ordered remediation

1. The numeric allow-list does not prevent semantically misleading prose or
   instruction injection that uses permitted numbers. Model output remains
   presentation only and cannot schedule, approve or change rules.
2. Model/engine exception logging may include upstream error details. Audit
   payload logging before transcript or personal-data support (#10/#17).
3. Seed truncates planning facts. Use only a dedicated disposable RailPlan
   development database. Never run it on an unrelated or production project.
4. `npm audit` currently reports dependency advisories; do not repeat the obsolete
   zero-vulnerability claim. Package remediation and re-audit are release gates
   in #17, with exact current verification recorded in project status.

## Work requiring further review

The implemented identity/RLS boundary is reviewed below. Further reviews cover
transcript evidence/privacy/injection (#10), Telegram token handling and
scoped delivery (#14), CSV formula injection (#15), voice/import retention and
OAuth scope (#18/#19), and named crew identity/retention/deletion (#21).

Current two-role database and API regression checks pass. Production login/logout
verification passed; accessibility and complete release review
remain #17 gates.

## Issue #5 authentication review — 2026-09-07

Reviewed the SSR cookie lifecycle, user verification, role input sources,
application SQL privileges, RLS grants/policies, private definer function,
request body allocation, quota concurrency and operator provisioning.

- Identity is verified with Supabase `getUser`, not the cookie session object.
  Anonymous Supabase sign-ins and unassigned profiles cannot enter planning.
- Profile role and organisation are server-owned. Auth user metadata cannot
  grant planner access. No frontend/service-role key, signup trigger or public
  provisioning route exists. Operator provisioning requires confirmed email.
- All 16 existing planning tables have explicit planner policies with USING and
  WITH CHECK. Contractor profile/org reads are scoped. Authenticated clients
  cannot edit roles, organisations, quota state or migration history.
- App SQL changes role and verified claims within one transaction; the pooled
  owner connection does not bypass RLS. Claim values are parameters, never SQL.
- Assistant throttling is keyed by verified user and serialized with a row lock,
  with server-fixed capacity/time. Its private definer has an empty search path,
  explicit auth.uid/profile checks and no PUBLIC/anon EXECUTE privilege.
- Actual bytes are bounded before JSON parsing, independent of Content-Length.
  Unauthorized requests cannot invoke the planning engine or model. Upstream
  auth/database exceptions are not logged or shown to the browser.
- Next Server Actions provide same-origin checks for login/logout. Proxy
  refresh responses are private/no-store. Tokens/passwords are never written
  to logs or application tables. Login uses generic failure text.

The real rollback suite passed role/organisation isolation, metadata forgery,
private-table denial, shared token consumption and role cleanup. HTTP tests
passed 401/403/503, bounded body and 429 behavior. The session tests distinguish
invalid/missing identities (401) from network and Auth service outages (503). Production login/logout Server Actions, session cookies and role pages passed
with three temporary hosted identities. Browser login rendering and invalid-login
feedback passed. Exact-ID fixture cleanup completed afterward. Independent review
passed after correcting Auth outage classification to 503 with regressions.

Limits: role/account provisioning remains trusted operator work; no customer
self-service signup or password recovery UI is delivered here. Supabase token
revocation follows its access-token lifetime; getUser verifies server identity,
not a bespoke auth.sessions revocation policy. Later intake/notification objects do not exist yet; plan/audit boundaries are reviewed separately below.
The assistant still handles fabricated facts and retains its documented
semantic grounding limits. Existing npm advisories remain a release gate.

The optional local auth seed checks exact loopback hosts and non-production mode
before connecting. It generates fresh random passwords into an ignored 0600
file and refuses existing accounts/files. Five guard tests pass; running it with
the hosted development environment correctly refuses before any database write.
Local Auth account creation remains unverified because no local Supabase Auth
instance is running under the owner's no-Docker requirement.

## Issue #6 persistence review — 2026-09-07

- Generation accepts bounded parameters only, loads database facts in one
  repeatable-read transaction and computes/validates server-side. Full-input
  SHA-256 covers topology, resources and every pin field, including team/end.
- Private snapshot/child/publication/decision/audit tables have planner-only RLS
  SELECT grants. No authenticated direct writes, update/delete APIs or public
  writable snapshot functions exist. Immutable triggers reject changes including
  maintenance-role UPDATE/DELETE/TRUNCATE. Contractor reads are denied entirely.
- Narrow private SECURITY DEFINER write functions have empty search paths,
  revoked PUBLIC/anon execute, trusted planner checks and auth.uid-derived actors.
  These functions accept server-computed output: **railplan_private must remain
  absent from exposed Data API schemas**. Exposing it would remove that server
  computation boundary. It is intentionally distinct from public RPC schemas.
- A shared revision/generation row serializes source mutations and publication.
  Review caught the repeatable-read stale-snapshot hole in a read-only row lock;
  generation updates now force retries, verified with two genuinely concurrent
  first publications. Contractor no-op writes cannot stale planner versions.
- Publish checks source, independent validation, mandatory coverage, current
  engine versions and saved/current full-input digests. Stale rejection audit
  commits before returning 409. Supersession appends a link, never edits output.
- Mutations enforce same Origin (when present) against actual Host and request
  scheme/port, JSON content type, byte/schema
  bounds and verified planner permission before persistence. Correlation logs
  never include database exceptions, tokens, request payloads or decision text.
- Actor UUIDs survive account deletion without cascading audit loss. Append-only
  audit stores action/actor/IDs/time only. Bounded decision text is ordinary
  planner content, never executable instructions or authorization metadata.

Live rollback persistence/RLS tests and isolated committed concurrency tests
passed. The concurrency test's privileged exact-ID cleanup locks fixture tables,
changes trigger state only within its cleanup transaction, restores every trigger
before commit and fails visibly if cleanup cannot complete. This is development
test maintenance; no app API can disable triggers or erase audit history.

Browser UAT found Next production normalizing `request.url` to its configured
listen hostname. The CSRF check now uses the actual Host authority with the
Next-derived request scheme, validates malformed authorities/origins, and ignores
untrusted x-forwarded-host. Regressions reproduce the legitimate hostname mismatch
and reject sibling hosts, protocol/port mismatch, opaque origins and injected
userinfo/path/comma authorities. Deployment proxies must preserve Host.

Final #6 verification: production browser generation, stale rejection, review,
publication, reload and supersession passed. Independently read committed audits
matched all actions. Exact-ID temporary-plan/account cleanup restored all six
history guards. Review also verified Next.js Host normalization handling keeps
Origin scheme/port checks and ignores caller-supplied forwarded hosts.

Issue #7 live verification passed: authenticated planner roundtrip/mutations,
contractor/anonymous denial on all three tables, invalid references/counts/windows,
non-overlap and parent resize checks. Separate committed concurrency tests cover
both write orderings and assert no out-of-night rows; fixtures cleaned. Saved-plan
regressions confirm workforce-only stale rejection audits and immutable snapshots.
Full259, required DB33 and isolated concurrency3 tests passed; final independent
review found no important defects.

## Issue #8 hard workforce enforcement

The shared validator owns staffing feasibility. Missing supply means zero;
missing or invalid demand definitions produce a critical unknown-demand finding,
not zero staffing. Emergency/custom requests supply explicit role demand through
trusted engine context. No new network input or extra permissions were added.
Workforce fields contain aggregate headcounts only. Exact shortages include
team, role, participants, interval, demand, availability and shortfall.

Candidate evaluation, pins, repair, alternatives and final validation use the
same rule. Automatic repair preserves locks and rejects newly introduced
conflicts. Saved-plan publication rejects fresh infeasible mandatory work;
constraint/solver version changes invalidate old engine output. Workforce
arithmetic and shortage count flow into the assistant fact allow-list; template
answers preserve exact validator evidence without inventing headcounts.

Independent review found emergency alternatives ignored extra requests (fixed)
and the UI impact metric cache could survive a change to its underlying plan
(fixed with four transition regressions). Unsupported alternative IDs also now
return false with actual validation findings. All scoped reviews are clean.
Full284 tests, required DB34/concurrency3, lint/typecheck/build and production
browser workflow passed. Last copy corrections passed two targeted UI tests and
a fresh build. Browser errors/warnings empty; temporary account cleaned and
final hosted parity unchanged.

## Issue #9 contractor request intake

Private request submissions and immutable revisions separate untrusted proposals
from approved engine inputs. Server verification supplies the actor identity;
RLS scopes contractor reads to their organisation. Narrow private mutation
functions recheck role, organisation, allowed transition and expected version,
then append the actor/reason/time with the new snapshot. No authenticated role
can directly edit these tables or erase revision history. Catalogue reads expose
only the references needed by each role; contractor scheduling reads return only
their request's placement from the current published plan.

HTTP bodies have byte/schema limits, same-origin mutation checks and field-level
errors. SQL independently validates bounds, reference membership, completeness,
team skills and dependency cycles. Approval requires a planner's explicit safety
confirmation. Approved revisions retain exact provenance in saved plan facts;
revision drafts preserve prior approval, while replacement/cancellation advances
the planning source. No draft or submitted proposal enters solver inputs.

Independent review identified a JSON dependency reference gap: baseline predecessor
deletion/night changes could bypass intake lifecycle checks. Before applying the
migration, a source-serialized baseline guard and assembled-instance reference
validation were added. Live tests cover this failure path, cross-organisation
reads/mutations, immutable history, lifecycle/version conflicts, loader inclusion,
source staleness and exact publication-derived revisions. Review found no further
important backend defects. Full306 tests, DB40/concurrency3 and production two-role browser verification pass.
No new personal worker fields, external messages or model calls are introduced.

Final #9 browser evidence confirms contractor submission, planner approval,
server-generated publication, scoped exact placement, immutable prior revision
across amendment and cancellation. Cleanup removed exact temporary IDs under
exclusive locks and restored all seven history guards before commit; final parity
passed. Browser console clean. No production server remains running locally.

## Issue #10 private transcript proposals

The explicit extract-and-save action sends at most64KB of UTF-8 text to the
configured model. Raw text is bounded in memory and excluded from database
records and application logs. Retained evidence is short, exact text with
server-computed offsets; unsupported values remain null and visibly incomplete.
Model output cannot contain approval, role, priority, safety or scheduling fields.
No proposal alters canonical planning facts or their source revision.

Private drafts are scoped to the authenticated owner, including planner users.
Organisation identity comes from the trusted profile. The intended persistence
boundary accepts validated draft snapshots only, through private narrow functions,
with immutable revision history. These schemas must stay outside the exposed
Data API schemas, as with saved plans. Backend SQL/model review passed. The reviewed migration is applied and immutable.

The UI treats evidence as plain React text, labels confidence as a model estimate,
and has no submit/approve control in this issue. File selection stays local until
the explicit save action; fatal UTF-8 decoding, byte bounds and pending-file gating
are tested. Failed extraction retains source text for correction/retry, while
success clears it. The manual request workspace remains independent. Six UI tests
and a read-only review pass. Production unavailable-model and two-owner privacy checks pass.

Final #10 verification:328 tests, DB43/concurrency3, lint/typecheck/build and
independent reviews pass. Controlled owner fixtures show exact excerpts and
missing fields; real503 preserves input and leaves manual intake usable. Live
provider extraction remains unverified without credentials. Fixtures are removed,
all8 immutable guards are enabled, parity is unchanged and the preview stopped.

## Issue #11 human review boundary — implementation review

Owner-only private edits must append history and preserve unknown fields. Human
changes remove current model confidence/evidence attribution, while the original
excerpts remain in immutable revisions. Explicit submission is the only operation
that shares the proposal and saved history with an organisation and planners;
other private drafts remain isolated. Optimistic versions make the submission
atomic and prevent duplicate request creation. Contractor organisation is trusted
profile data; planner submissions require an explicit valid organisation choice.

The submitted request's source snapshot is immutable and scoped through request
access. Evidence remains labelled as its original source, even when the request
is later corrected. Approval remains a separate planner-only operation, requiring
all request and safety fields. Only an active approved revision joins canonical
facts. Source invalidation must also cover rejected-request reopening and
cancellation, so saved plans cannot bypass these human decisions.

The cross-boundary regressions now pass: private edit and submission leave planning
inputs unchanged; approval adds exactly one revision; approval, rejection reopening
and cancellation stale saved plans. Independent backend and UI reviews found no
important remaining issues. Full346 tests, DB49/concurrency3 and production two-role
browser verification pass. The browser confirms human attribution, original evidence
history, explicit sharing and separate approval. Controlled fabricated proposals
were used; no live model-success claim is made. Temporary records were removed,
history guards restored, parity verified and preview stopped.

## Issue #13 source and geographic presentation boundary

The versioned fifteen-point snapshot contains public coordinate facts and minimal
provenance only. Runtime schema pins reviewed official HTTPS links and metadata,
known station names/source references, unique IDs/coordinates and Singapore bounds.
The offline transformer verifies archive hash, known member paths, CRS and encoding;
no untrusted archive extraction or runtime map calls are used. No raw footprints,
archive, internal source XML or tracking SDK is bundled. Geometry never changes
validator facts or feasibility; map markers keep the fabricated block IDs.

Independent code/security review found no important defect. This review does not
clear source redistribution rights: the DataMall open-data page conflicts with the
archive’s internal-use notice. The snapshot, map and documentation retain that
conflict; public deployment/redistribution requires source-permission resolution.
No external request to LTA or public publication has been performed.

## Issue #14 Telegram boundary

The server transport uses a fixed HTTPS host/path with a constrained token, numeric
52-bit chat identifier, plain text, disabled link previews, no redirects/retries,
8-second whole-response deadline and64KiB response cap. It never emits raw
provider descriptions, exceptions or token-bearing URLs. Confirmed success requires
an integer message ID and matching destination; timeouts/network/5xx or malformed
acknowledgements are ambiguous. Tests use controlled responses only.

The publication boundary creates immutable scoped payloads transactionally,
then records append-only claims/results outside publication. Role checks and narrow
SQL functions derive actors and destinations; the client cannot supply send content,
recipient or provider status. Known success blocks every future resend. Abandoned
claims and uncertain outcomes require explicit duplicate-risk acknowledgement.
Config changes are versioned and audited. Independent migration/service/API/transport
and UI reviews pass. Live rollback7 tests cover organisation scoping, planner RLS,
versioned config, immutable history, abandonment/late success,429 and supersession.
A real two-connection overlap test confirms one claim/provider call and no resend
of known success. A PL/pgSQL alias collision discovered by live tests was fixed in
new migration `20260907130903_notification_claim_aliases.sql`; the previously
applied migration is untouched. A delayed UI retry response is applied only to the
same configuration version and test ID; a reproduced regression covers the race.
Full474 tests,requiredDB56+4,lint/typecheck/build and production two-role checks
pass. Browser bundles have no Telegram transport/token-variable references;
missing-credential delivery and explicit retry stay separate from publication
success. All temporary data was removed and13 history guards verified enabled.
No live provider success is claimed.

## Issue #15 export boundary — reviewed

Global plan exports require verified planner access. Files contain saved plan facts
and provenance, including approved descriptions, but no private transcript evidence,
credentials or notification destinations. Current source/publication observations
are separate and do not substitute new inputs or assert operational approval.
JSON preserves exact values. Every CSV string cell is escaped; formula prefixes
and leading whitespace/control variants are neutralized as text. This is an
initial-export mitigation, not a promise about every spreadsheet program or a
file re-saved by one; [OWASP documents that limitation](https://owasp.org/www-community/attacks/CSV_Injection).

Safe UUID attachment filenames, UTF-8 content types, nosniff and private no-store
headers prevent content/header ambiguity and shared caching. The browser aborts
obsolete version downloads and does not download error responses. Independent
backend/security/UI reviews,505 tests,DB59+4,lint/typecheck/build and actual
browser JSON/CSV download inspection pass. Temporary fixtures were removed.

## Issue #16 role navigation and snapshot UI — reviewed

Page guards still derive roles from verified server identity. Navigation is a
convenience, never an access-control boundary. The default planner route now opens
saved planning; the new sandbox route has the same planner guard. Initial review
found its missing session-refresh proxy matcher. A Next matcher regression
reproduced both base/nested failures; adding `/sandbox/:path*` passes all9 matcher
checks and independent re-review. No static assets were added to auth refresh.

Saved visual review fetches the already planner-authorized export endpoint.
No credentials, approved content or identities are written to local layout storage.
No new endpoint, DB grant, provider send or safety authority is introduced.
Obsolete snapshot requests must be cancelled/ignored; remote failures stay visible
without replacing saved content with demo literals. Independent full review and re-review are clean.536 full tests,DB59+4 and
production two-role UI journey pass. Final colour-only correction passed10 focused
checks/typecheck/build and visual recheck. No live external provider calls were made.

## Issue #17 release review — in progress

Independent audit found no P0/P1 implementation defect but reproduced two P2
assistant gaps: missing same-origin JSON enforcement before quota/provider work,
and raw exception/model-token logging. Both are fixed. Authenticated origin and
content-type checks now precede quota; logs use fixed events/counts, validated
numeric usage and allowlisted stop reasons. SDK logging is explicitly disabled.
Ten new security cases plus22 existing assistant and9 proxy cases pass; independent
re-review is clean. Tests include cross-origin/simple content types, private-error
sentinels and adversarial provider metadata.

The initial dependency audit reported7 high and3 moderate findings. Next.js and its
ESLint configuration are upgraded together to16.3.4; the PostCSS override is8.5.28,
and compatible transitive updates resolve the remaining advisories. A fresh
`npm audit --json` reports zero findings. The [Next.js upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
and [16.3.4 release](https://github.com/vercel/next.js/releases/tag/v16.3.4) informed
the upgrade; no major-version codemod is needed. This audit covers dependencies,
not permission clearance or proof that an entire deployed environment is secure.

Five accessibility P2 findings are fixed with regression evidence: scroll-bound
modal/real launcher focus restoration, contrast-safe small text, assistant result
announcements, stable notification card identity and retry outcome focus/live
status. Final independent re-review also resolved saved line-label contrast and
ambiguous retry HTTP/network-failure focus, with50 focused regression checks.
Full582 tests and required DB59+4 checks, lint/typecheck/build and E2E4 pass.
Hosted private-schema RPC access is denied with406/PGRST106. Controlled provider
success/failure/retry, stale publication, organisation/owner isolation, exact
exports and sensitive-log sentinel checks pass through production HTTP.

Actual hosted seed rollback verification preserved all19 fact hashes and source
revision/generation. A harness cleanup SQL42601 was fixed with bound UUID arrays;
failed-run recovery and successful cleanup both verified all13 guards enabled.
No destructive hosted/Auth reset or real provider request was made.

Rendered keyboard/AX checks pass at1280×800,1440×900,1920×1080 and640×400; login
also fits320 CSS pixels. Modal actions scroll into view, tab focus wraps and
returns after dismissal. Saved Gantt selection has a2px focus outline and the
CC label computes to rgb(135,83,0). Missing-AI assistant answers retain input
focus and populate the named live region; transcript errors preserve entered
text. Browser error/warning logs are empty. These do not establish actual spoken
screen-reader behavior or native browser zoom at that milestone.

September 9 follow-up: owner approval was received and VoiceOver was enabled in
a separate Chrome test window. Native accessibility access to VoiceOver timed out;
its caption panel and last-spoken-phrase command did not produce observable speech
evidence. No spoken output is claimed. VoiceOver was subsequently confirmed off.
Native Chrome zoom changed DPR2→2.2 and viewport1470→1336, then was restored;
a complete 200% workflow remains unverified. #17 remains open.

The fresh September 9 audit identified moderate GHSA-82fw-gwwq-j7x9 in the Vitest
mock plugin. Pinning Vitest 4.1.11 and refreshing compatible development tooling
clears the advisory: npm audit reports zero findings. Independent lock review
confirms no production dependency entries changed. npm 11.3.0 initially failed
inside Arborist with a null `edgesOut`; npm 11.19.1 completed the installation
without changing global npm. The focused accessibility/notification 37 tests pass.
Vite emits an informational warning about a future config-loader default; no
warning suppression or unrelated application/configuration changes were added.
Full patch verification passes: 582 tests/65 files including the 59 rollback DB
checks, 4 actual-concurrency checks, 4 production HTTP E2E checks, lint, typecheck
and production build. E2E uses controlled providers, verifies sensitive-log guards
and removes its temporary hosted fixtures. No actual provider sends or deployments
were performed. The seed/hash rehearsal remains the pre-patch September9 result.
