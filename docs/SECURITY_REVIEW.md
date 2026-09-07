# Security Review

Last updated: 2026-09-07 · issues #5–#6 authentication and persistence review

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
- RLS on all 16 planning tables permits only authenticated planners to read or
  modify facts. Contractor profile/organisation reads are scoped. Application SQL
  sets the authenticated role and verified claims inside its transaction;
  privileged owner connections are reserved for database maintenance tooling.
- Hosted connections verify the Supabase CA and hostname, disable prepared
  statements for transaction pooling, and load input facts in a consistent
  transaction. Migration checksums live in an unexposed private schema.
- Secrets belong server-side. `DATABASE_URL` must never be public or committed.
  Seed and verification reports must not print credentials or input contents.

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
