# Planner usability pilot

Prepared 16 September 2026 from `handoff.md` section 17 and `PROJECT_BRIEF.md`.
Status: protocol prepared; no participant measurements collected.

## Purpose and participants

Compare reconciliation of the same fabricated engineering-night facts using the
participant's ordinary manual method and RailPlan. A planner account enables app
access; a participant is the person whose work we observe. The project owner can
do a first rehearsal. Evidence about actual planner benefit needs participants
who perform scheduling work, ideally including someone unfamiliar with RailPlan.
Label builder/teammate rehearsals separately from planner research.

Allow about 45 minutes for a first exploratory session. Use participant codes,
not names, and take task notes only. Do not record audio/video without consent.

## Prepare one frozen scenario

1. Use the fabricated 2026-09-16 baseline: 22 requests, 12 atomic blocks,
   00:00-04:00 SGT. Record the commit, input digest and objective used in each run.
   The previously verified baseline digest is `fnv1a:8c4a9050cfea5e8b`; recheck if
   inputs have changed.
2. Give both conditions the same request facts, block map, rules, capacities,
   dependencies, mandatory work and handback deadline. Prepare the manual packet
   from those frozen facts before timing; do not compare against a manual task
   that lacks the information available to RailPlan.
3. Agree on the output: a proposed schedule, unresolved clashes, deferred jobs
   with reasons, and a short explanation of one scheduling tradeoff.
4. Give a short unscored interface practice session using different examples.
   Reset the sandbox before the measured run. Sandbox experiments stay local;
   study timing does not require publishing to the shared database.

## Session script

Say: "We are testing the product, not you. Use the information provided to plan
this night. Explain what is unclear; ask for help if you would otherwise stop."

1. Complete the task with the participant's usual manual method. Start timing
   when they begin reviewing the facts; stop when they declare a plan ready.
2. Complete the same task in RailPlan: inspect requested-time conflicts, explain
   one specific overlap, review a repair, generate, inspect mandatory work and
   deferrals, and explain the resulting choice.
3. After each condition, ask: "How confident are you that you can explain this
   plan and its unresolved work?" Use 1 (not confident) to 5 (very confident).
4. Ask which step was hardest, what they expected to happen, and what information
   was missing. Record assistance and misinterpretations, not just completion.

Repeating the same night creates a learning effect. Alternate manual-first and
RailPlan-first across participants; record the order. One owner rehearsal cannot
establish time savings or general usability.

## Measurement sheet

| Measure | Manual | RailPlan |
| --- | --- | --- |
| Participant code / experience / condition order | | |
| Commit and input digest | | |
| Active reconciliation minutes (exclude breaks; record help separately) | | |
| Total elapsed minutes | | |
| Task completed without help? | | |
| Unresolved grouped clashes / underlying rule findings | | |
| Mandatory jobs missing | | |
| Deferred jobs with an explicit reason | | |
| Rework: previously accepted choices revisited | | |
| Assistance count and reason | | |
| Confidence 1-5 | | |
| Observed confusion / participant comments | | |

Evaluate both final schedules against the same validator/rules. Do not compare
grouped clashes in one condition against raw violation counts in the other.
Keep individual results and limitations visible; do not turn one run into a
percentage-savings claim.

## Separate 2-3 minute demo rehearsal

This is a presentation script, not the timed usability study. Prepare a controlled
request and fresh saved plan in the assigned test environment before recording.

| Time | On-screen story |
| --- | --- |
| 0:00-0:20 | Explain competing maintenance requests in a short engineering night; identify fabricated prototype data. |
| 0:20-0:45 | Show a contractor submission and planner review of its exact revision. |
| 0:45-1:15 | Inspect one exact clash: shared block/resource, time interval and rule. |
| 1:15-1:45 | Preview a validated repair; show changed work and any deferrals, then save the reviewed version. |
| 1:45-2:15 | Show publication readiness, mandatory coverage and the independent assessment. Publish only the agreed test version. |
| 2:15-2:40 | Switch to the contractor's own published slot; explain that delivery status is separate. |
| 2:40-3:00 | State limits: fabricated rules/data, heuristic scheduling, and human coordination decisions. |

Do not mix sandbox repairs into a story that claims the same repair was saved or
published. Do not present controlled-provider fixtures as real Telegram delivery.
