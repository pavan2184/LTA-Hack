# Decisions

Last updated: 2026-07-15

## Log

### 2026-07-15 — Deterministic frontend simulation

Status: Accepted

- Use immutable preconfigured schedule variants and timed client transitions rather than a solver or API.
- This guarantees repeatable presentation behaviour; it does not claim operational feasibility.

### 2026-07-15 — Zustand as the single demo-state owner

Status: Accepted

- Centralise view, strategy, selection, locks, approvals, disruptions, overrides, and loading phases in one store.
- Persist only strategy and locked IDs to minimise hydration and privacy risk.

### 2026-07-15 — Custom CSS-grid timeline

Status: Accepted

- Use a fixed 00:00–04:00 grid with absolute job placements instead of a scheduling library.
- This keeps the visual dense, responsive, and fully controlled at the cost of general calendar support.

### 2026-07-15 — Tests and UAT as release gates

Status: Accepted

- Vitest/Testing Library cover domain transitions; browser UAT at three laptop widths covers the scripted demo and page overflow.
