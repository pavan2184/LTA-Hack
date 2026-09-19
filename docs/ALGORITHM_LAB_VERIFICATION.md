# Algorithm Lab verification — 2026-09-19

Scope: the standalone `demos/algorithm-lab` service, three-step explanation and
`assets/submission/algorithm-lab-2026-09-19` pack. The production Next.js app and
PS1 solver were not changed. Local preview: <http://127.0.0.1:8088>.

## Functional evidence

- Python 3.12, OR-Tools 9.15.6755: **21 tests passed**, including all 54 control
  configurations compared with an independent exact dynamic-programming solver.
  API tests cover strict inputs, unsupported methods, request limits, duplicate
  keys, caching, concurrency and safe failure responses.
- Default result: OPTIMAL, cost/bound 5, six jobs and nine accesses. Closing week
  two with capacity two and predecessors enabled: OPTIMAL, cost/bound 19, four
  jobs change weeks and all nine accesses remain. Capacity one is infeasible
  within eight weeks; the response never presents a partial schedule as valid.
- `scripts/algorithm-lab/verify-and-capture.mjs`: **14 browser scenario groups
  passed**, no page errors. Includes real API solves, settings/result separation,
  proof disclosure, JSON download, infeasibility, capacity/predecessor controls,
  injected HTTP 503 recovery, pending controls, keyboard order, row inspection,
  narrow layouts and reduced motion. All three explanation buttons work and
  their examples use actual result state.
- `npm run lint` and `npm run typecheck` passed. Python compilation, `pip check`,
  Gunicorn configuration, `bash -n` and ShellCheck passed. The app ran through
  its production Gunicorn entry point. A new Next.js production build and PS1
  regression suite were not rerun for this isolated Python companion.
- Premium UI strict audit: zero findings. DESIGN.md lint: zero errors, twelve
  existing unused-token warnings. Static checks supplement actual browser QA.
- Read-only security review found no actionable issue: fixed input space,
  bounded single-worker solves, request cap, nonblocking solve gate, finite
  cache, safe text rendering, self-only CSP and deployment source allowlist.

The browser results and captures are in Git-ignored `output/algorithm-lab/`.
Reproduction commands are in [TESTING.md](TESTING.md) and the
[lab README](../demos/algorithm-lab/README.md).

## Visual fidelity and interaction review

Design concept: `output/algorithm-lab/design-concept.png`, 1536 × 1024. The
concept and current implementation capture were inspected together using
`view_image`. Chrome through the Browser/CUA tool verified desktop and mobile
interactions. Bundled Playwright produced file-backed, repeatable screenshots
because the Browser tool's screenshot bytes were not exposed as durable file
exports. Default desktop captures match the concept's native 1536 × 1024 size;
additional checks covered 1280 × 800, 768 × 1024 and 390 × 844.

| Comparison | Evidence and disposition |
| --- | --- |
| Layout and hierarchy | Preserved broad schedule at left and compact controls/inspector at right; mobile stacks these with horizontal scrolling owned by the table. No document-width overflow. |
| Typography | IBM Plex Sans/Mono, explicit control sizes and strong headline preserved; local fonts avoid external font requests. |
| Palette | True white, teal `#006b83`, ink `#14161a` and fine gray rules retained; amber denotes late accesses, with a textual legend. |
| Container/spacing | Open workstation layout retained; no decorative card grid added. Document scrolling accommodates the expanded explanation without clipping controls. |
| Copy and data | Headline, navigation, introduction and primary solve action follow the concept. Actual counts, result status, timing/cache disclosure, legend, settings basis and model boundary intentionally replace illustrative data. |
| Explanation | User-requested three-step explanation supersedes the concept's shorter four-part strip. Formula, contextual example and proof disclosure support the learning task. |
| Icons and assets | Navigation uses a simple outlined external-link icon; schedule remains semantic HTML. Generated cover is conceptual artwork; screenshot slides contain unmodified application captures. |

The implementation was faithfully verified against the chosen concept with the
intentional data/copy and three-step changes above. No material unaddressed
visual mismatch remains. The above-the-fold copy comparison records only these
functional additions; no promotional badge or unrelated marketing section was
introduced. The sibling `/ps1` workstation was inspected for brand language and
schedule/inspector conventions, while the companion deliberately owns a separate
native-control runtime as recorded in DESIGN.md and UX-CONTRACT.md.

All four gallery slides were rendered at **1920 × 1080** and visually inspected.
The first draft's three-step content sat too close to its footer; header/grid
spacing was reduced before export. Automated render checks confirm fonts and
screenshots load, the canvas dimensions match and the content clears the footer.
Source and render measurements are included with the pack.

## Limits and publication

Cloud Run is **prepared, not deployed**. No authenticated Google Cloud CLI or
selected project was available. Remote image build, public URL, cold starts and
hosted parity remain unverified. The script requires explicit project, region
and runtime identity; no hosting claim appears in the assets.

This is a six-job teaching model, not the full PS1 constraint system. Its result
checks are not the organiser's reference validator, and the explanation is not
a live search trace. The full PS1 planner uses its separate native CP-SAT service with a
checked TypeScript warm start, merged upstream in PR #47. No real railway operation should use the educational output.

Native selects use platform menus; selection and Escape/focus behavior were
exercised, but their OS popup painting was not visible in captured browser
frames. Native screen-reader speech, physical-device touch and a full 200% zoom
matrix were not tested. There are no auth, saved-data or multi-user mutation
flows in this companion; corresponding session/conflict tests do not apply.

## Main-branch integration

Before merging, rebased the companion onto native-solver PR #47 (`9bfaf26`).
Preserved the full PS1 service and its current documentation, and corrected the
lab/footer/narration copy to reflect native PS1 rather than the superseded
browser-only execution choice. The lab remains its own simplified model.

Ruff 0.15.14 lint and formatting, all 21 backend tests and all 14 browser scenario
groups passed again on the integrated tree. Refreshed the screenshots, gallery,
manifest and ZIP. An independent read-only review found no blocking model, API
or deployment-script issue. The new `algorithm-lab-checks` CI job runs Python
format/lint, model/API tests and deployment-script syntax on future changes; the
existing application CI job remains intact. Cloud publication is still pending.
