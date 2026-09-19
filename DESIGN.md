---
version: alpha
name: RailPlan
description: A precise railway access-planning workstation with a dominant weekly schedule and contextual decision support.
colors:
  primary: "#006b83"
  surface: "#ffffff"
  sunk: "#f0f1f3"
  ink: "#14161a"
  secondary-ink: "#3a4048"
  muted-ink: "#505861"
  rule: "#d5d8dc"
  strong-rule: "#b9c0c9"
  danger: "#c42b1c"
  danger-soft: "#fce9e6"
  warning: "#8e5200"
  warning-soft: "#fdf1dc"
  success: "#0e7a45"
  success-soft: "#e2f4e9"
typography:
  sans:
    fontFamily: '"IBM Plex Sans", ui-sans-serif, -apple-system, "Segoe UI", sans-serif'
    fontSize: "13px"
    lineHeight: "1.5"
  mono:
    fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace'
rounded:
  xs: "2px"
  sm: "3px"
  md: "4px"
spacing:
  control-sm-height: "28px"
  control-md-height: "32px"
components:
  button:
    rounded: "2px"
  panel:
    backgroundColor: "#ffffff"
---

# RailPlan Design System

## Overview

### Creative North Star

The approved reference is the [Siemens Opcenter Scheduling SMT workstation](https://blogs.sw.siemens.com/opcenter/new-opcenter-scheduling-smt-2410/): compact teal application chrome, an orderly command ribbon, hierarchical rows and a timeline that occupies most of the workspace. RailPlan adapts that planning grammar to the PS1 weekly model. Siemens branding, production orders and hourly bars are not product content to copy.

### Product context and register

- **Audience and job:** access planners and works controllers inspecting complete railway-maintenance schedules, comparing constraints and reviewing changes under time pressure.
- **Market and evidence:** the Singapore LTA NebulaX PS1 challenge; the authoritative domain source is [PS1_OFFICIAL_SPEC.md](docs/PS1_OFFICIAL_SPEC.md). Alpha and Beta are challenge networks, not real MRT lines.
- **Language:** English product copy, sentence case, ISO source dates with readable date labels. No Japanese locale or Japan-market behavior is in scope.
- **Usage:** a desktop planning workstation, with narrow-screen inspection and decision support. The controller may be working at 2AM; low-glare presentation is optional.
- **Register:** a working application. `/ps1` should not resemble a marketing landing page or a report with a scheduling chart far below the fold.
- **Signature:** the expandable contract/activity schedule and its navigable horizon overview.
- **Restraint:** quiet controls and bounded support panels keep scheduled work dominant. Vertical space is reserved for planning; omit descriptive policy strips beneath the scenario selector. Color carries state, selection or identity, not decoration.
- **Anti-references:** oversized KPI-card dashboards, floating rounded islands, dark neon command centers and ornamental network diagrams.
- **Scope:** this decision covers the public `/ps1` workstation. Authenticated RailPlan routes retain their established shared identity and behavior unless separately redesigned.

### Token ownership and runtime mapping

**Model B: runtime CSS remains canonical.** This file documents accepted values and intent; it does not generate a second token system. Existing Tailwind v4 `@theme` values in `src/app/globals.css` feed semantic utilities and shared primitives. `src/app/layout.tsx` supplies self-hosted IBM Plex font variables. `src/components/ps1/ps1-workstation.css` scopes the accent and chrome; chart geometry belongs to `work-schedule.css`.

| Document role | Runtime owner | Consumers |
| --- | --- | --- |
| Primary teal | `src/components/ps1/ps1-workstation.css`, `--ps1-teal` and scoped accent mapping | PS1 chrome, selected navigation, schedule controls |
| Surface, sunk, ink, rules | `src/app/globals.css`, `--color-surface`, `--color-sunk`, `--color-ink-*`, `--color-rule*` | Shared controls, tables, panels, PS1 workspace |
| Danger, warning, success and soft variants | `src/app/globals.css`, `--color-signal-*` | Local-check states, capacity/late-work emphasis, notices |
| Sans and mono | `src/app/layout.tsx` → `--font-plex-*` → `src/app/globals.css` `--font-sans` / `--font-mono` | Body, controls, schedule identifiers and numeric columns |
| Radii | `src/app/globals.css`, `--radius-xs/sm/md`; `ps1-workstation.css` uses the 2px workstation button variant | Shared Button and PS1 controls |
| Control heights | `src/components/ui/button.tsx`, `sm` and `md` variants | Canonical actions |
| Schedule dimensions | `src/components/ps1/work-schedule.css` | WorkSchedule row headers, week columns and overview |

When the scoped runtime palette changes, update this document in the same change. Verify documented values against CSS and computed browser styles. Run `npx -p @google/design.md designmd lint DESIGN.md`; this project has no generated-token pipeline.

## Colors

The primary teal anchors application chrome and intentional selection. White and neutral gray form the working canvas. Border contrast should make rows readable without turning the schedule into a dark wireframe. Red, amber and green remain semantic status colors; always pair them with a label, icon, shape or pattern.

Alpha and Beta keep the quiet identity palette already defined in `globals.css`. Real MRT line colors must not be assigned to the fictional challenge lines. State colors must not imply that a locally checked plan has operational authorization.

Light mode is the default. Low-glare mode remaps surfaces, text, rules and semantic colors within PS1 while retaining meanings and contrast. Hatching denotes a named exclusion or unavailable state. Focus uses a visible two-pixel outline. Forced-color modes must preserve native focus and control affordances.

## Typography

IBM Plex Sans carries product titles, commands and explanatory text. IBM Plex Mono carries technical identifiers, week labels and comparable numeric values. Preserve tabular lining figures. The shared body baseline is 13px with 1.5 line height; compact data labels may be smaller when the same facts remain readable in the inspector.

Use weight and alignment before adding larger type. The primary schedule title is a working label, not a hero headline. Long identifiers may truncate in fixed row headers, but the complete value must remain available through selection, visible details or accessible names. Explanations wrap naturally. Controls use sentence case; uppercase is reserved for actual domain abbreviations and short metadata.

## Layout

The schedule-first desktop composition is: compact brand chrome, grouped commands, policy selection, a large working canvas, and a bottom horizon overview. Attention and selection details open when they support a decision. They must not permanently consume most of the width. Work schedule and location occupancy are two projections of one selection and one applied scenario.

The schedule owns intentional horizontal scrolling. Row labels and time headers remain aligned with it. The page itself must not overflow at 1280, 1440 or 1920 CSS pixels. Narrow screens must keep import, status, scenario choice, selected-work inspection, review and export reachable; a horizontally compressed desktop matrix is not the only route to core decisions.

Loading, errors and long names must not move commands unpredictably. A support form uses natural-height scrolling rather than inheriting the schedule's fixed canvas height. Keep all dialog actions reachable in short viewports. Scrollbars remain visible and usable; the horizon overview supplements ordinary scrolling.

## Elevation & Depth

Use one-pixel rules, surface changes and grouping to establish hierarchy. Avoid shadows around every chart, card or row. Elevation belongs to transient overlays. Sticky chrome and row headers must be opaque enough to keep their text legible over scrolling data. Low-glare mode preserves the same layering.

## Shapes

Use the shared 2–4px radius vocabulary and precise rectangular schedule cells. PS1's workstation button variant uses 2px corners; the shared Button remains 4px elsewhere. Do not use capsule controls for primary navigation or large rounded cards around every group. Data marks encode real scheduled accesses or exact boundaries; a continuous bar must never imply work between sparse access weeks.

## Components

### Foundational visual states

Every control needs a visible focus state and honest disabled/busy treatment. Selected views use both semantic state (`aria-pressed` or `aria-selected`) and a visible distinction. Busy solve feedback reports real completed-scenario progress from the native service without invented percentage precision. Error messages identify the failed input or action and provide a recovery step. Empty and filtered-empty views offer a useful next action.

### Buttons and actions

Reuse the shared Button. Primary emphasis belongs to the next consequential action, such as solving or applying a reviewed proposal. View controls remain quieter. Label actions with their result: load, inspect, preview, apply, discard, undo and export. Keep width stable during busy states. Destructive-looking emphasis must not be used merely to make a common action prominent.

### Navigation and data display

Scenario A/B/C are alternative policies, not a ranked podium. Keep the active policy and local revision explicit. Search, hierarchy expansion, scale controls and horizon navigation must affect the schedule. Activity selection links to the inspector and other representations by engine identity.

Workload and score figures come from the applied submission/report. Infeasible or invalid outcomes retain their explanations and do not impersonate feasible schedules. A proposed change is visibly separate until Apply; export eligibility must reflect the same state boundary.

### Forms and overlays

Reuse the existing Radix-backed Dialog for proof, urgent-maintenance and focused inspection overlays. Native selects remain appropriate for the current short view/filter/location choices, with platform-owned popup geometry explicitly accepted. Inputs need associated labels and text errors. Uploaded CSVs are data, never instructions. The file picker remains available alongside drag-and-drop.

### Iconography

Use the existing Lucide family for ordinary controls, with consistent stroke weight and compact optical size. Icons accompany visible action labels where space permits. Icon-only buttons need an accessible name. Network schematics and schedule marks are data graphics rather than brand artwork.

### Motion

Movement should communicate a changed state or reveal relevant context. Avoid animated chart decoration and entrance choreography. Preserve reduced-motion preferences. Scrolling and zooming must retain meaningful context instead of resetting the user's position without cause.

### Content and data visualization

Use plain planning language and concise facts. The weekly time scale is authoritative. `access_night` is a local accounting index, never a global timestamp. Distinguish scheduled accesses, deadline markers, ECLO, capacity, closures and proposals with labels and patterns. Explain engine limits in proof and near relevant decisions; do not fill the schedule with implementation commentary.

## Do's and Don'ts

- **Do:** let the work schedule carry the first view and reveal supporting facts in context.
- **Do:** keep every displayed total, warning and changed item traceable to current engine output.
- **Do:** preserve stable selection and recoverable actions across schedule, occupancy, review and proof.
- **Don't:** draw continuous occupation between intermittent weekly accesses.
- **Don't:** label local conformance as reference validation or planning output as operational approval.
- **Don't:** copy Siemens branding, ribbon commands or hourly semantics that RailPlan does not support.
