# RailPlan PS1 redesign QA — 2026-09-19

Final result: **passed**

This is an adaptation of the supplied Siemens industrial scheduling reference to
PS1's weekly railway model, rather than a pixel-identical reproduction. No
unresolved P0/P1/P2 visual issues remain in the tested states. Verification gaps
are listed explicitly below.

## Visual truth and evidence

- Source: user-provided Siemens screenshot (1024 × 589), with its [schedule detail retained in the repository](docs/design-evidence/reference-schedule-detail.png).
- Source context: [Siemens Opcenter Scheduling SMT](https://blogs.sw.siemens.com/opcenter/new-opcenter-scheduling-smt-2410/).
- Implementation: `http://127.0.0.1:3000/ps1`.
- Primary screenshot: [1440px schedule](docs/design-evidence/railplan-1440-schedule.png), 1440 × 1000 pixels, 1440 × 1000 CSS viewport; one captured pixel per CSS pixel.
- State: bundled public instance, Policy C, light theme, expanded contracts, A002 selected, inspector closed. Source is manufacturing/hourly scheduling; implementation is railway/weekly scheduling. Content, frame proportions and dates intentionally differ.
- Full-view comparison: source and rendered screenshot were opened together in one comparison tool input, with application content only and no surrounding browser window chrome.
- Focused comparison: [source schedule crop](docs/design-evidence/reference-schedule-detail.png) and [rendered schedule crop](docs/design-evidence/railplan-schedule-detail.png) were opened together. Source crop 1024 × 350; implementation crop 1440 × 490 downsampled to 1024 × 348 for equal-width comparison. No image generation or reconstructed UI used. Screenshot capture is JPEG-based; evidence files are converted to PNG containers without altering UI content.
- Baseline: original application captured before editing in the browser; its tall introduction, score cards and three fixed columns pushed the planning canvas below the fold. Baseline capture is in the task's tool history.

## Comparison history

1. Initial rendered schedule: the 58vh canvas pushed the overview navigator and status footer below the 1000px viewport. **P2** — the reference keeps navigation visible. Fixed with a bounded viewport-relative canvas height, keeping internal scroll for work rows. [Post-fix evidence](docs/design-evidence/railplan-1440-schedule.png); 1280 × 900 footer bottom measured at 894.5px.
2. Low-glare state initially left the new schedule on hardcoded white surfaces. **P2** — mixed themes impaired sustained use. Scoped semantic colors now cover the grid, headers, marks, selection, focus and navigator. [Post-fix evidence](docs/design-evidence/railplan-1920-low-glare.png).
3. Narrow-screen padding selector had an escaped-class parsing warning. **P2** — mobile spacing did not apply. Replaced it with the dedicated `ps1-mobile-workspace` class. Final production build completed without warnings.
4. Inspector IDs were shared between responsive copies. **P2 accessibility** — keyboard focus could move to a hidden copy. React `useId` now scopes panel/tab IDs; a dedicated regression verifies second-inspector arrow navigation remains in that inspector.

## Required fidelity surfaces

- **Typography:** existing IBM Plex Sans/Mono retained; numeric scores use the actual font token. Compact hierarchy, readable IDs, tabular yields and quiet secondary labels. Long IDs truncate within their row and retain their full accessible label/title. Deliberate modern typography replaces the source desktop application's legacy type.
- **Layout:** compact teal brand bar and command ribbon, narrow left navigation, frozen hierarchy, dominant horizontally scrollable weekly canvas, discrete marks, hatch regions and functional bottom overview. Policy strip is an intentional domain-specific addition; its detailed metrics collapse to preserve planning space. Supporting panes open on demand.
- **Colors/tokens:** teal accents; neutral grid; green access marks, blue ECLO, amber past-planned-date states. Labels, numeric yields, deadline markers and hatch patterns supplement color. Low-glare surfaces, including the proof and maintenance dialogs, are mapped to existing dark semantic variables. No decorative gradients or unrelated branding.
- **Assets:** no raster product art required. RailPlan name and standard Lucide icons replace Siemens branding as requested. Schedule geometry is actual data visualization, not screenshot facsimiles. The captured source remains evidence, never rendered behind controls.
- **Copy/content:** real public-instance IDs, dates, contract names and policy outcomes. Sparse accesses do not imply continuous occupation. Summary brackets explicitly describe intermittent spans. Weekly allocation and local conformance terminology are explicit; operational approval and judges' validation are not claimed.

## Browser verification

| Journey | Result |
| --- | --- |
| Public eight-file solve without account | Pass; 54 activities, 14 contracts, 30 weeks; A 25.2 / B 44 / C 39.2 |
| Upload all eight actual files through chooser, then solve | Pass; same policy outcomes; uploaded instance identified |
| Malformed activity CSV | Pass; explicit expected/received header error, recovery via public instance |
| A/B/C switching | Pass, including arrow-key A → B |
| Expand/collapse all, search empty state and Clear filters | Pass; 14 contract groups and all 54 activities recovered |
| Activity keyboard navigation | Pass; ArrowDown A001 → A002 updates selection |
| Bottom overview | Pass; final-week navigation updates first visible week and scrolls; return to week 1 works |
| Linked inspector | Pass; A004 explains A003 predecessor completion in week 15 |
| Location grid keyboard | Pass; ArrowRight updates active descendant to week 2 |
| Urgent maintenance | Pass; compute → adopt proposal → review; applied plan unchanged before Apply |
| Pending export block | Pass; official ZIP button disabled while proposal is pending |
| Apply / Undo | Pass; applied revision and reversible restoration through revision 3 |
| 1280/1440/1920 desktop | Pass; no document horizontal overflow; chart owns horizontal scroll |
| 390/768 smaller screens | Pass; Attention/Selected/Review/Proof triage replaces full desktop canvas |
| Low-glare | Pass; chart and chrome change together |
| Console | No browser warnings/errors in tested public/uploaded journeys |

Additional screenshots: [1280 schedule](docs/design-evidence/railplan-1280.png),
[occupancy](docs/design-evidence/railplan-1280-occupancy.png),
[inspector](docs/design-evidence/railplan-1440-inspector.png),
[1920](docs/design-evidence/railplan-1920.png),
[mobile](docs/design-evidence/railplan-390-attention.png),
[tablet](docs/design-evidence/railplan-768-selected.png),
[malformed upload](docs/design-evidence/railplan-malformed-upload.png).

## Automated verification

- `npm test`: **900 passed, 79 skipped**, 117 files. Skips are 74 tests in 13 database suites plus five database instance round-trip cases; this worktree has no database configured. No tests removed.
- Targeted UI rerun: **28 passed** across workbench, work schedule and policy comparison, including the additional inspector ID regression added after the full suite. After the final maintenance fix, **six affected regressions passed**, including two new cumulative-cut cases and strengthened ZIP byte/schema assertions; focused lint and full typecheck passed again.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed, clean final build after resolving the CSS selector warning. Initial sandboxed build stalled; normal network-enabled verification succeeded with existing Next font dependencies.
- Scoped premium UI audit: zero findings. Whole-project legacy findings remain documented in UX-CONTRACT.md, outside this route's redesign.
- DESIGN.md lint: zero errors, 12 documented orphan-token warnings for runtime-owned tokens.
- ZIP tests exercise exact A/B/C three-file manifest, official CSV bytes and system `unzip` extraction. Orchestration regressions cover upload replacement, incremental batches, stale file/worker results, disruption retention for rerun/pin/clear-pins, successive cuts and stale-preview invalidation. The UI export test reads the actual generated Blob and checks all nine paths, published CSV headers and isolated RESULTS scenarios.

## Remaining limitations

- The in-app browser's download event timed out after activating the enabled ZIP action. Its downloaded file was not captured for inspection. Export bytes/manifest and standard extraction pass automated checks; an actual desktop-browser download remains a manual verification gap.
- Native select interaction was exercised at 390px; its operating-system popup was not visible in the screenshot capture. Option selection and focus were tested through the browser.
- No assistive-technology speech test or literal browser 200% zoom run was performed; keyboard behavior, unique ARIA relationships, and narrow 768px reflow were verified.
- The new schedule renders the full filtered hierarchy. Very large hidden instances have not been browser stress-tested; the existing occupancy grid retains virtualization.
- Local checking cannot resolve cross-possession physical-night alignment because the official output has no global night identity.

Implementation checklist complete for the redesign. Follow-up polish: virtualize
activity rows if measured hidden-instance size requires it; retain the readable
small-screen triage workflow rather than shrinking the desktop board.

final result: passed

## Follow-up: vertical space — 2026-09-19

Per user direction, removed all policy-description strips and assigned the recovered
28px to schedule height. Browser verification at 1440×1000: no description strip,
538px schedule height, footer bottom 979px. Policy controls and reviewed-change
status remain available. Scoped ESLint/typecheck passed.
Evidence: [compact schedule](docs/design-evidence/railplan-compact-schedule.png).

final result: passed

PR preparation verification: after rebasing onto current main, all **205 tests
in 19 PS1 engine/dataset/UI files passed**. Typecheck and lint passed on the
rebased branch. Machine-specific audit roots were normalized for portability.
