# Security Review

Last updated: 2026-07-15

## Scope

Frontend-only deterministic prototype. Backend, auth, uploads, payments, external APIs, secrets, personal data, and real operational data are out of scope.

## Data and Threat Model

- Public: product copy and fabricated rail schedules.
- Local only: selected strategy and locked mock request IDs.
- Sensitive/secrets: none.
- Primary risk: users mistaking mock recommendations for operationally safe schedules. Mitigation: UI and documentation label the product as a prototype using simulated plans.

## Browser and Dependency Risks

- No user-generated HTML or remote content is rendered.
- localStorage is non-sensitive and schema-limited.
- Export does not create or transmit a file.
- Keep dependencies limited to the declared UI/testing stack and review install audit output.
- `postcss` is pinned through an npm override to the patched 8.5.19 release because Next.js 16.2.10 otherwise resolves an older vulnerable nested copy.

## LLM/File/Auth Risks

No runtime LLM, prompt input, uploads, authentication, or logging exists.
