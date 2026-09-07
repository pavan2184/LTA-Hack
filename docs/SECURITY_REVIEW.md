# Security Review

Last updated: 2026-09-07 · v0.4.0 baseline review

## Boundaries actually implemented

- Fabricated planning facts ship in the browser. No real operational or named
  worker data should be loaded into this unauthenticated prototype.
- The shared validator independently checks computed plans. It does not certify
  real railway safety; topology, resource facts and operating rules are invented.
- Browser preferences contain strategy and exact pins. localStorage is untrusted.
- The server assistant computes facts itself and checks model numeric tokens.
  User history cannot forge assistant roles. Provider refusal, truncation,
  unavailable credentials and grounding failures fall back to the engine.
- The database migration enables RLS on all 16 planning tables without policies.
  Owner connections bypass it; there is no application role boundary yet.
- Hosted connections verify the Supabase CA and hostname, disable prepared
  statements for transaction pooling, and load input facts in a consistent
  transaction. Migration checksums live in an unexposed private schema.
- Secrets belong server-side. `DATABASE_URL` must never be public or committed.
  Seed and verification reports must not print credentials or input contents.

## Open findings and ordered remediation

1. No authentication or organization isolation; required in #5 before exposing
   collaborative planning or real data.
2. The assistant's size guard trusts Content-Length and its limiter trusts proxy
   headers and process memory. Actual streamed bytes and authenticated shared
   limits are required at the hardened API boundary.
3. The numeric allow-list does not prevent semantically misleading prose or
   instruction injection that uses permitted numbers. Model output remains
   presentation only and cannot schedule, approve or change rules.
4. Model/engine exception logging may include upstream error details. Audit
   payload logging before transcript or personal-data support (#10/#17).
5. Seed truncates planning facts. Use only a dedicated disposable RailPlan
   development database. Never run it on an unrelated or production project.
6. `npm audit` currently reports dependency advisories; do not repeat the obsolete
   zero-vulnerability claim. Package remediation and re-audit are release gates
   in #17, with exact current verification recorded in project status.

## Work requiring further review

Authentication/RLS and CSRF (#5), immutable audit/publishing and stale sources
(#6), transcript evidence/privacy/injection (#10), Telegram token handling and
scoped delivery (#14), CSV formula injection (#15), voice/import retention and
OAuth scope (#18/#19), and named crew identity/retention/deletion (#21).

No complete two-role security or accessibility release review has passed yet.
