# Security Review

Last updated: 2026-07-15

## Scope

Frontend-only deterministic prototype. Backend, auth, uploads, payments, external APIs, secrets, personal data, and real operational data are out of scope.

The mathematical, mapping, statistical, and solver documents are proposals. Their future risks are recorded below but are not present in v0.1.0.

## Data and Threat Model

- Public: product copy and fabricated rail schedules.
- Local only: selected strategy and locked mock request IDs.
- Sensitive/secrets: none.
- Primary risk: users mistaking mock recommendations for operationally safe schedules. Mitigation: UI and documentation label the product as a prototype using simulated plans.

## Current Trust Boundaries

- All domain fixtures ship in the frontend bundle and must be treated as public.
- localStorage contains only strategy and mock lock IDs and is not a secure store.
- No server trusts or validates client input because no server exists.
- No audit log, identity, approval authority, or role boundary exists.
- Current accept/reject/lock controls demonstrate interaction only; they are not an operational approval workflow.

## Current Integrity Risks

- Fixture metrics and “zero conflicts” can be mistaken for independently calculated safety assurance.
- Applying an alternative or lock can change visible placement without recalculating conflicts or metrics.
- Static explanations can drift from placements and disruption metadata.
- Fixture-derived release-readiness copy can still be over-trusted despite its explicit simulation disclaimer.

Mitigation in the current version is explicit prototype labelling and documentation. These issues must be fixed, not merely labelled, before operational use.

## Browser and Dependency Risks

- No user-generated HTML or remote content is rendered.
- localStorage is non-sensitive and schema-limited.
- The interface exposes no import/export action and does not create or transmit files.
- Keep dependencies limited to the declared UI/testing stack and review install audit output.
- `postcss` is pinned through an npm override to the patched 8.5.19 release because Next.js 16.2.10 otherwise resolves an older vulnerable nested copy.

## LLM/File/Auth Risks

No runtime LLM, prompt input, uploads, authentication, or logging exists.

If an LLM is added later, it may paraphrase structured solver facts only. It must not create constraints, decide feasibility/priority/safety, or alter calculated values. Prompt injection, operational-data leakage, misleading explanations, logging, and output validation require a new review before implementation.

## Security Gates for Proposed Future Work

### External map or dataset

- Verify licence, attribution, version, provenance, and allowed caching.
- Vendor a reviewed demo snapshot where possible instead of depending on live availability.
- Treat external strings and geometry as untrusted input and validate size/schema.
- Do not infer operational topology or safety boundaries from public station coordinates.

### Backend solver

- Add authentication, role-based authorisation, rate/size limits, request validation, timeouts, resource quotas, and audit logs.
- Prevent solver-denial-of-service through bounded horizons, job counts, alternatives, memory, and solve time.
- Record input hash, constraint/model version, user locks, solver status, and approvals.
- Do not expose confidential topology, staff availability, vulnerabilities, or operational plans to unauthorised clients.
- Return infeasible/time-limited status honestly; never convert it to an apparently valid plan.

### Operational or personal data

- Classify engineer identity, qualification, roster, location, and availability before collection.
- Apply data minimisation, retention, access control, encryption, audit, and deletion rules.
- Use role/skill capacity rather than named personnel when identity is unnecessary.
- Complete a legal/privacy and operational security review before ingesting real data.

### File import/export

- Validate file type, schema, size, formula content, and identifiers.
- Prevent CSV/Excel formula injection and unsafe HTML/PDF content.
- Label exports with data timestamp, model/constraint version, solver status, and non-operational status where applicable.

### Automated decision support

- Keep safety rules hard and version-controlled.
- Require independent post-solve validation and human approval.
- Preserve an immutable audit record of inputs, outputs, overrides, and reasons.
- Test stale data, conflicting locks, infeasibility, partial results, and rollback.
