# Algorithm Lab public release — 2026-09-19

The CP-SAT explanation is public at
<https://railplan-theta.vercel.app/algorithm-lab>. The homepage introduces its
three steps and links into the interactive lab. The scheduler title bar opens
the explanation in a separate tab, preserving the current planning session.

## Deployed identity and scope

- Vercel project: `railplan`, scope `ducksss-projects`.
- Deployment: `dpl_59NhKKk9Nt8AftwbcBQHd7tHUJqM`.
- Immutable URL: <https://railplan-lti7mxw55-ducksss-projects.vercel.app>.
- Release source: `ff05848`, branch `codex/algorithm-lab-vercel-release`.
- Production baseline: `e4ae8c6`, plus the isolated companion and navigation.
- Current-main integration: branch `codex/publish-algorithm-lab`; its PR records
  the source merge separately from this already-published release.

The release deliberately retains the working browser PS1 scheduler. It does not
publish current main's separate Node/Python full-instance native service. The
Algorithm Lab is a six-job teaching model with a real Python OR-Tools solver,
not the complete PS1 model or the organiser's reference validator. It is hosted
on Vercel; no Google Cloud deployment of this lab is claimed.

## Verification

The candidate was built using Vercel's Next.js and Python 3.12 runtimes, then
promoted after real endpoint checks and a scheduler smoke. The stable public
domain was checked again after promotion, without authentication.

| Check | Observed result |
| --- | --- |
| Homepage | HTTP 200; three-step explanation and working lab link |
| `/algorithm-lab` | HTTP 200; shared UI and expected self-only CSP |
| Both bundled fonts | HTTP 200 under `/algorithm-lab/static/fonts/` |
| Model endpoint | Public HTTP 200 JSON; `Cache-Control: no-store` |
| Default solve | OPTIMAL, objective/bound 5, all nine accesses and checks pass |
| Week 2 closed | OPTIMAL, objective/bound 19, all nine accesses and checks pass |
| Public browser suite | 14 scenarios passed; no JavaScript errors |
| Browser scenarios | Three teaching steps, changed rules, infeasibility, row inspection, dirty/pending state, simulated 503 recovery, JSON download, keyboard use, narrow widths and reduced motion |
| Existing browser scheduler | Published eight-file instance loaded; 54 activities shown; A 25.2 / B 44 / C 25.2, all locally feasible |
| Python | 31 tests passed, including all 54 settings against an independent exact enumeration and ten WSGI adapter boundary tests; Ruff passed |
| Current-main application | Lint/typecheck passed; 1,079 tests passed, 79 database-dependent skips; webpack production build passed |
| Isolated release | Locked dependency install, three homepage tests and typecheck passed; actual Vercel production build passed |

The first deployment configuration exceeded Vercel's 256-character exclusion
pattern limit; it was corrected before any deployment was published. An initial
local build could not reach Google Fonts inside the network sandbox; the build
passed with normal network access. Protected preview URLs require Vercel access:
the app intentionally omits cookies from its teaching API requests, so browser
interactivity was finally certified on the public stable domain. Protection was
not disabled.

Local evidence and seven actual public screenshots are in ignored
`output/algorithm-lab-vercel/`, including `browser-qa.json`, downloaded result JSON
and deployment identity. The earlier Devpost pack retains its accurate local
capture provenance. This publication does not rerun database/provider workflows,
hidden-instance exhaustiveness, native-cloud load tests or reference-validator
certification.

## Reproduction

Run the shared frontend export with `npm run build`. Python dependencies are
declared at the repository root for Vercel's `/api/algorithm-lab` function.
`next dev` alone does not run that Python function; use `vercel dev` for the
combined local deployment or the standalone lab's documented Flask/Gunicorn flow.

The browser verification script accepts the Playwright module path, public lab
URL, output directory and `/api/algorithm-lab` as its four arguments. A source
merge never implies publication because automatic Git deployments are disabled.
Inspect the deployment and test the actual stable URL after every promotion.
