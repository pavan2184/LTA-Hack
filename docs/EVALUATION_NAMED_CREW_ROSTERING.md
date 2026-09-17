# Evaluation: named crew rostering, leave, and reassignment

Issue #21. This is an evaluation, not an implementation. Its purpose is to put a
go/no-go decision in front of the data controller with enough detail to make it,
and to record what would have to be true before any named-worker data is
collected.

**Status: awaiting the data controller's decision. Nothing has been built.**
The aggregate role-capacity model remains the production default. Issue #21
acceptance criterion 2 — "no named-worker table, API, seed, UI, or log is added
before approval" — is enforced by `src/test/workforce-anonymity.test.ts`, which
fails if personal identifiers appear in any workforce table.

## 1. What exists today

The production model is anonymous by construction:

| Type | Shape | What it does not hold |
| --- | --- | --- |
| `WorkforceRole` | `{ id, name }` — a category such as "technician" | Any individual's qualifications |
| `WorkforceAvailability` | people `count` per planning night, team, role, interval | Who those people are |
| `WorkforceDemand` | people `count` per request and role | Who is assigned |

Tables `workforce_roles`, `workforce_availability` and `request_workforce_demand`
store counts under row-level security. `assessWorkforce()` segments supply and
demand into intervals and reports shortfalls. The validator enforces capacity;
the solver respects it. The source comment is explicit: *"Configurable anonymous
role categories; never individual qualifications."*

This model can answer "are four technicians available on T-TRK between 00:00 and
04:00, and does this plan need five?" It cannot answer "is Siti qualified for
high-voltage work, is she on leave, and can she reach Jurong by 01:00?"

## 2. The operational need, stated honestly

Named rostering is worth considering only for questions the aggregate model
genuinely cannot answer. Four candidates:

1. **Qualification matching.** Some work needs a specific certification held by
   some members of a role, not all. Aggregate counts overstate capability.
2. **Rest and fatigue compliance.** Minimum rest between shifts is a per-person
   rule. Counts cannot express it.
3. **Travel feasibility.** Consecutive jobs at distant sites may be impossible
   for the same person even when the counts balance.
4. **Reassignment after disruption.** When a person becomes unavailable
   mid-night, replacing them requires knowing who they were.

Only 1 and 2 are safety-relevant. 3 and 4 are efficiency concerns.

## 3. Anonymous alternatives, which must be ruled out first

Each need above has a cheaper answer that collects no personal data:

| Need | Anonymous alternative | Cost |
| --- | --- | --- |
| Qualification matching | Split roles more finely — `technician_hv` as a distinct role with its own counts | More roles to maintain; no loss of expressiveness |
| Rest and fatigue | Model as reduced availability: a team's count drops in the window after a heavy shift | Approximate; cannot track an individual across nights |
| Travel feasibility | Per-team base location and a minimum inter-site gap, applied to counts | Conservative; may reject feasible plans |
| Reassignment | Re-solve the affected interval with reduced counts, which the engine already does | Loses continuity of who does what |

**Finer-grained roles solve the only two safety-relevant needs without any
personal data.** That is the central finding of this evaluation. A role called
`technician_hv_certified` carries the same planning power as knowing that Siti
holds the certificate, and carries none of the risk.

## 4. What named rostering would require

If the decision is nonetheless to proceed, the following must be specified
*before* code, not discovered during it.

**Data controller and purpose.** Named. A stated lawful basis for processing
employment data, and a purpose limitation that forbids reuse for performance
management, which is how rostering data most often drifts.

**Minimisation.** The smallest set that answers §2: a pseudonymous worker key,
role, certification identifiers with expiry, shift windows, and base location.
Not: name, national ID, contact details, date of birth, home address, medical
information, or leave *reason*. Leave should appear only as an availability gap.

**Qualification provenance.** Who asserts a certification, against what
authority, with what expiry and revocation path. A stale certification that the
validator trusts is a safety failure, not a data-quality one.

**Retention, correction, deletion, audit.** Retention tied to the planning
night, not indefinite. A correction path, because a wrong certification record
blocks legitimate work. Deletion that survives into exports, notifications and
backups. An audit trail that records access without itself becoming a second
surveillance surface.

## 5. Threat model

Exposure across the roles that exist today.

| Actor | Gains | Harm |
| --- | --- | --- |
| **Planner** | Who works where, all night, every night | Movement profile of identified workers; the plan becomes a location history |
| **Contractor** | Visibility of the assigned crew | A competitor learns which specialists a rival holds |
| **Administrator** | Everything, by definition | Absence patterns imply medical and family circumstances |
| **Support** | Debug access to plans and logs | Personal data in logs and error traces, the most common leak path |
| **Integration** | Whatever the publication payload carries | Telegram delivery would carry names to a third-party messenger |

Three risks are specific to this system rather than generic:

- **A published plan becomes a movement record.** RailPlan publishes plans to
  contractors and Telegram. Named placements turn an operational document into a
  per-person timetable of where an identified worker will be, at night, at a
  known trackside location. That is a physical-safety consideration, not only a
  privacy one.
- **Absence is inferable even without leave reasons.** A gap in one person's
  availability, repeated weekly, discloses more than the field that was
  deliberately omitted.
- **Support paths leak first.** The existing logging, error envelopes and
  exports were designed when workforce data was counts. Every one would need
  re-review, and criterion 2 of the issue covers logs for that reason.

## 6. Recommendation

**No-go for named rostering. Proceed with finer-grained anonymous roles
instead.**

The two safety-relevant needs — qualification matching and rest compliance — are
reachable without personal data, as §3 sets out. The two remaining needs are
efficiency gains, and they do not justify introducing identity, location and
absence data about real workers into a system that publishes its output to
contractors and a third-party messenger.

This recommendation is conditional in one direction: if the LTA's operating
rules require *auditable per-person* rest compliance, rather than
plan-level assurance that rest was respected, then anonymous roles cannot satisfy
a regulator and the decision changes. Whether that obligation exists is a
question for the owner, not an engineering judgement, and it is the single fact
most likely to overturn this recommendation.

## 7. If the decision is go

A prototype must be separate from production and must demonstrate, before any
integration:

- Explainable assignment — every placement names the qualification that
  justified it.
- Independent validation — the validator verifies qualification, availability,
  travel and rest, rather than trusting the assigner, exactly as it does for
  every other constraint today.
- No weakening of hard safety rules. Named data may add constraints; it may
  never relax one.
- The aggregate model stays the production default until the prototype is
  reviewed on its own evidence.

## 8. Open questions for the owner

1. Does any LTA or regulatory obligation require per-person auditable rest and
   qualification records, as opposed to plan-level assurance? This is the
   decisive question.
2. Who is the data controller for worker data — LTA, the contractor
   organisation, or both jointly?
3. Would named placements appear in contractor-facing publications and Telegram
   deliveries, or be planner-only?
4. Is there an existing workforce or HR system of record, making RailPlan a
   consumer of qualification data rather than a new collector of it?
