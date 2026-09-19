# RailPlan documentation

Last updated: 2026-09-19 · v0.4.0

Read `PS1_OFFICIAL_SPEC.md` first — it is what we are being judged against.
Then `PROJECT_BRIEF.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_CONTRACT.md`,
`TESTING.md`, `DECISIONS.md` and `PROJECT_STATUS.md` before code changes.

- `PS1_OFFICIAL_SPEC.md`: **authoritative** PS1 requirements — rules, scenarios, scoring, output schema, validator, judging rubric and the four deliverables. Restated from the organiser's repository at commit `966c976` (2026-09-18). Wins over any other doc on PS1 technical requirements.
- `PS1_BENCHMARK.md`: repeatable solver quality checks and measured before/after results on identical public and synthetic inputs.
- `PS1_SUBMISSION_CHECKLIST.md`: release verification, exact public-result archive, video/source handover and remaining submission actions.
- `PROJECT_BRIEF.md`: canonical product intent, target users, workflow, scope and success criteria.
- `NEBULAX_PARTICIPANT_CONTEXT.md`: supplied event pack — logistics, deadline, attendance and open questions. Its generic submission list conflicts with PS1's own deliverables; see `PS1_OFFICIAL_SPEC.md`.
- `PROJECT_STATUS.md`: concise current implementation, latest recorded checks and remaining gates; update this snapshot after meaningful work.
- `PROJECT_STATUS_HISTORY.md`: preserved dated snapshots and milestone evidence; read only for historical details and append detailed verification here.
- `TEAM_HANDOFF.md`: setup and developer orientation.
- `SECURITY_REVIEW.md`: implemented boundaries and open risks.
- `CURRENT_IMPLEMENTATION_AUDIT.md`: historical engine audit; current implementation and evidence are in `PROJECT_STATUS.md`.
- `DETERMINISTIC_SCHEDULING_AND_ANALYTICS.md`: historical design and further roadmap.
- `RAIL_SCHEDULING_RESEARCH.md`: research, not operational validation.
- `NEBULAX_PRODUCT_RESEARCH.md`: challenge index, rail/port comparisons, current-product gaps and proposed demo/pilot priorities.
- `PRODUCT_ADOPTION_REVIEW.md`: 2026-09-15 adoption review of the built product; journey friction, prioritised proposals and an adoption test. Proposals, not accepted scope.
- [archive/README.md](archive/README.md): historical issue plans, specifications and superseded submission-copy provenance; current status determines remaining work.

The inputs are fabricated; schedules, conflicts, metrics, alternatives and
assistant engine answers are computed. The heuristic is independently validated
against the encoded constraints, which are not authoritative LTA safety rules.
Database schema and loading exist; completed database checks and blockers are
recorded in `PROJECT_STATUS.md`. Identity, intake, review, saved planning and scoped collaboration are implemented;
remaining release gates and numbered roadmap items are in current status. The owner requires no Docker.
