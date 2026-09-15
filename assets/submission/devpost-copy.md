# RailPlan

## Tagline

Turn competing rail-maintenance requests into a plan schedulers can explain.

## Inspiration

When train services pause, maintenance teams share a short engineering window.
Track access, equipment and workforce constraints interact: moving one job can
create a clash somewhere else. RailPlan explores how schedulers can make those
trade-offs visible and keep a clear record of the decision.

## What it does

Contractors submit maintenance requests. A planner reviews and approves the exact
input revision, generates a schedule and inspects conflicts and resource demand.
Saved plans preserve their inputs and results. Publication makes the agreed
version available to the relevant contractor organisations, with JSON/CSV exports
and separately tracked optional Telegram delivery.

A sandbox lets planners explore alternative slots, pin commitments and replan
around fabricated disruptions. Every proposed result is checked against the same
declared constraints. If mandatory work cannot fit, the blocker remains visible.

## How we built it

The Next.js and React interface sits over a pure TypeScript planning engine.
The heuristic solver proposes placements; a shared validator independently checks
the finished result. Atomic track blocks reveal overlaps that different sector
labels would otherwise hide. Equipment, team and anonymous workforce capacity
are modelled as constraints.

Supabase Auth and PostgreSQL row-level security separate planner and contractor
access. Immutable versions retain planning provenance. Optional Anthropic-powered
features assist with private meeting-text proposals and grounded explanations;
human approval and deterministic validation remain separate from generated text.

## What makes it different

RailPlan connects request review, understandable conflicts and a traceable handover.
It shows why work moved or was deferred, preserves the facts behind a saved plan,
and distinguishes publishing a plan from successfully delivering its notification.
The planner can inspect the decision rather than simply receive a clean chart.

## Challenges we ran into

Different sector names can conceal a shared track block. A schedule can satisfy
crew limits while still double-booking equipment. A saved result can become stale
when approved requests change. We addressed these with atomic blocks, independent
validation and publication checks against the current source revision.

## Accomplishments that we're proud of

We built a connected prototype with explicit review boundaries, reproducible
scheduling and immutable plan records. The recorded 14 September verification
passed 614 tests, hosted database parity checks and a controlled-provider journey
suite. These results support the implemented model; they are not operational
certification or evidence of measured planner-time savings.

## What we learned

A useful scheduling tool must explain its trade-offs and preserve the decision.
Feasibility depends on explicit rules and complete inputs. Generative AI can help
with intake and language, but it cannot supply missing operating rules or approve
railway work.

## What's next

Complete the remaining release checks, validate assumptions with operator-reviewed
rules and anonymised examples, and measure the workflow with representative
planners. Future roadmap candidates include consented audio intake, scoped imports
and solver benchmarking.

## Prototype scope

The baseline contains 22 fabricated requests over 12 atomic track blocks.
RailPlan is a non-operational prototype: its outputs are not track-access or safety
approval. Live provider success and planning-time savings have not been established.
Campaign images are conceptual illustrations, not application screenshots.

## Built with

Next.js, React, TypeScript, Tailwind CSS, Supabase, PostgreSQL, Zustand, Recharts,
Vitest. Optional integrations: Anthropic API and Telegram Bot API.

## Project links

- Repository: https://github.com/pavan2184/LTA-Hack
- Prototype: https://railplan-nine.vercel.app/login

## Before pasting

This draft describes the current local implementation. Confirm the demonstration
deployment includes the features being shown; the recorded hosted build predates
some local work. Supply the team's actual video URL and arrange judge access
privately. Do not paste credentials into the public entry.
