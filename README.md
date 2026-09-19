<a id="readme-top"></a>

<div align="center">
  <h1>RailPlan</h1>
  <p><strong>Railway access planning, explained.</strong></p>
  <p>A browser-based railway maintenance scheduling prototype for Nebula X PS1.</p>
  <p>
    <a href="docs/README.md"><strong>Explore the documentation »</strong></a>
    <br /><br />
    <a href="https://railplan-nine.vercel.app/ps1">View demo</a>
    &middot;
    <a href="https://github.com/pavan2184/LTA-Hack/issues/new">Report a bug</a>
    &middot;
    <a href="https://github.com/pavan2184/LTA-Hack/issues/new">Request a feature</a>
  </p>
</div>

<p align="center">
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&amp;logoColor=white" alt="Next.js" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-20232A?logo=react&amp;logoColor=61DAFB" alt="React" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&amp;logoColor=white" alt="TypeScript" /></a>
  <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&amp;logoColor=white" alt="Vitest" /></a>
</p>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a>
      <ul><li><a href="#built-with">Built With</a></li></ul>
    </li>
    <li><a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#verification">Verification</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

## About The Project

[![RailPlan's weekly schedule with expandable contracts, activity access blocks and a horizon navigator](docs/design-evidence/railplan-compact-schedule.png)](docs/design-evidence/railplan-compact-schedule.png)

Railway maintenance activities compete for limited track access. Their locations,
dependencies and completion targets interact: moving one activity can affect the
rest of the plan. RailPlan brings those decisions into one schedule workspace.

The public **`/ps1`** application accepts the challenge's eight CSV files, builds
three planning scenarios in the browser, and connects the weekly schedule to
placement explanations and reviewed changes. The published example contains
**54 activities, 14 contracts and a 30-week horizon**.

| Planner task | RailPlan workflow |
| --- | --- |
| See the work | Expand contracts into activities; inspect weekly access blocks, planned starts and completion targets. |
| Understand a placement | Open the shared inspector for dependencies, constraints, locations and deterministic answers. |
| Compare policies | Inspect A/B/C delay, excess capacity and early closure/late opening (ECLO) metrics. |
| Test a disruption | Reduce location capacity, inspect the proposed impact, then Apply or keep the current schedule. |
| Hand over results | Check local conformance and export nine official CSVs across the three scenarios. |

The dense desktop workspace includes a horizon navigator, linked location
occupancy, an attention queue and a low-glare mode. Narrow screens support triage,
inspection, review and export. Uploaded instance data and planning results stay
on the device; the PS1 workflow needs no account.

**Prototype boundary:** the published PS1 instance is challenge data, not a live
railway. Our local checker is not the organiser's reference validator or an
operational approval. The separate authenticated workspace uses its own
fabricated demonstration data.

### Built With

| Layer | Technology |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript 6 |
| Interface | Tailwind CSS 4, Radix UI, Zustand |
| PS1 planning | Pure TypeScript `@railplan/ps1`, deterministic heuristic search, browser Web Workers |
| Verification | Vitest, Testing Library, typechecking and browser checks |
| Separate authenticated workspace | `@railplan/core`, Supabase Auth and PostgreSQL with row-level security |
| Optional authenticated integrations | Anthropic SDK for language/extraction; Telegram Bot API for delivery |

<p align="right"><a href="#readme-top">Back to top</a></p>

## Getting Started

### Prerequisites

- Node.js **22.13+ on the 22.x line**, or **24.x**, with npm.
- A modern browser.

The public PS1 scheduler requires **no database, API keys or environment variables**.
The app runs directly in Node.js; Docker is not required.

### Installation

```bash
git clone https://github.com/pavan2184/LTA-Hack.git
cd LTA-Hack
npm ci
npm run dev
```

Open [http://localhost:3000/ps1](http://localhost:3000/ps1) and select
**Load the public instance and run**. To use your own instance, upload all eight
files listed under [Usage](#usage).

<details>
  <summary>Optional: set up the authenticated contractor/planner workspace</summary>

The separate `/contractor`, `/requests`, `/plans` and `/sandbox` routes need a
dedicated development database, Supabase Auth and a confirmed, provisioned user.
There is no automatic public signup or default online password.

```bash
cp .env.example .env.local
chmod 600 .env.local
```

Use only the settings documented in [.env.example](.env.example):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Server connection to the dedicated development database |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth endpoint for that same project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key; never a service-role key |
| `ANTHROPIC_API_KEY` | Optional assistant and meeting-text extraction |
| `TELEGRAM_BOT_TOKEN` | Optional server-side notification delivery |

Follow the [teammate handoff](docs/TEAM_HANDOFF.md) for migrations and account
provisioning. For a **new, dedicated empty development database**:

```bash
npm run db:migrate
npm run db:seed
npm run db:verify
```

Coordinate with the owner before changing an existing shared database; do not
reset or reseed it. Keep `.env.local` and credentials out of Git. Then use
[/login](http://localhost:3000/login) for the authenticated workspace.

</details>

### Verification

```bash
npx vitest run packages/ps1/
npm test
npm run typecheck
npm run lint
npm run build
```

Database tests can skip when a database is unavailable. Authenticated release
verification additionally requires `npm run test:db` and `npm run test:e2e`
against the dedicated development environment, run serially after reading the
[HTTP E2E preflight](scripts/e2e/README.md).

See [Testing](docs/TESTING.md), [design QA](design-qa.md) and
[Project Status](docs/PROJECT_STATUS.md) for required checks, dated results and
remaining gaps. A passing unit suite alone is not the full release gate.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Usage

The PS1 scheduler at `/ps1` is public and requires no account. It sends uploaded
instances to a native CP-SAT service, with local validation before display/export.
The [existing hosted demo](https://railplan-nine.vercel.app/ps1) is not assumed to
contain this change; deploy the Node/Python runtime using the
[native runbook](docs/PS1_NATIVE_DEPLOYMENT.md). The separate durable
[RailPlan workspace](https://railplan-nine.vercel.app/login) requires provisioned access.
See [current status](docs/PROJECT_STATUS.md) for differences between the hosted deployment,
GitHub and local work.

### Plan an instance

1. Open the [public scheduler](https://railplan-nine.vercel.app/ps1) or your local `/ps1`.
2. Load the public example, or upload the eight CSVs below together.
3. Let the same-origin native service solve A, B and C. A fresh instance opens Policy C's work schedule.
4. Expand a contract and select an activity to inspect why it was placed there.
5. Use **Test urgent maintenance** to preview a capacity reduction. Review its impact, then **Apply reviewed change** or **Keep current schedule**. Applied changes support Undo.
6. Open **Proof and export** to inspect local conformance and download the official results ZIP. Resolve a pending review before exporting.

```text
01_LINES.csv
02_STATIONS.csv
03_SECTORS.csv
04_LOCATION_SUPPLY.csv
05_BUFFER_LOCATION.csv
06_PARAMETERS.csv
07_PROJECT_DETAILS.csv
08_ACTIVITY_DETAILS.csv
```

The [public instance](packages/ps1/data/public/) and twelve
[synthetic examples](packages/ps1/data/synthetic/README.md) are included in this
repository. Synthetic examples are explicitly test data. The screenshot above
shows this branch's compact layout; hosted deployment freshness is tracked
separately in [Project Status](docs/PROJECT_STATUS.md).

### Understand the policies

| Policy | Main constraint | Trade-off |
| --- | --- | --- |
| A — Rigid supply | Fixed supply; ECLO forbidden | Absorb permitted contract overrun. |
| B — Rigid dates | Planned completion dates must hold | Use permitted excess capacity and ECLO. |
| C — Balanced trade-offs | At most one excess access-night per location-week; ECLO within one span of at most two weeks per line | Balance priority-weighted overrun, excess access and ECLO. |

Every activity must be scheduled in full. Hard constraints cannot be traded for a
better score. Each policy has its own objective, so raw A/B/C scores are **not a
ranking between policies**. The [official PS1 specification](docs/PS1_OFFICIAL_SPEC.md)
is authoritative for all constraints, penalties and deliverables.

The native service uses OR-Tools CP-SAT with a deterministic TypeScript warm start
from [`@railplan/ps1`](packages/ps1/README.md). Every returned candidate is checked
against the encoded constraints; a local proof does not establish reference-validator
parity. The timeline shows
weekly allocations: `access_night` is an accounting index, not a clock time.
The official schema cannot establish physical-night alignment between separate
possessions; the local checker exposes that limitation.

### Export and reproduce results

The official ZIP contains exactly these three CSVs under each of `A/`, `B/` and
`C/` — **nine files total**:

```text
SCHEDULE_ACCESS.csv
SCHEDULE_OCCUPANCY.csv
RESULTS.csv
```

Pre-computed public outputs are in [packages/ps1/data/results/](packages/ps1/data/results/).
To regenerate the public fixture outputs with the optimiser:

```bash
npm run ps1:solve
```

This command reads the vendored public fixture, runs the optimiser and validates
all three outcomes before replacing the A/B/C CSVs. It also writes diagnostic
`VALIDATION.json` files and `SUMMARY.json`, and creates
`output/PS1-public-results.zip`. The ZIP contains only the nine official CSVs.
The CLI writes results only after all three native outcomes pass local checking.

Run the repeatable benchmark across the public instance and twelve synthetic
inputs to check full workload, local conformance and exact CSV round-trips:

```bash
npm run ps1:benchmark:regression
```

The [measured solver comparison](docs/PS1_BENCHMARK.md) records the latest local
public scores: **A 25.2 / B 30 / C 25.2**. The
[submission checklist](docs/PS1_SUBMISSION_CHECKLIST.md),
[three-minute demo script](assets/submission/DEMO_SCRIPT.md) and
[PS1 write-up](assets/submission/PS1_WRITEUP.md) cover release evidence and
remaining publication steps. The script is not a recorded or uploaded video;
a merge does not establish a fresh hosted deployment.

### Other workspaces and documentation

The separate authenticated workflow supports contractor intake, planner approval,
saved versions and publication. `/sandbox` explores the minute-resolution
`@railplan/core` model; it is distinct from PS1's weekly model. Start with the
[project brief](docs/PROJECT_BRIEF.md) and [teammate handoff](docs/TEAM_HANDOFF.md).

For implementation details, see the [architecture](docs/ARCHITECTURE.md),
[data model](docs/DATA_MODEL.md), [API contract](docs/API_CONTRACT.md) and
[full documentation index](docs/README.md).

The [Devpost asset pack](assets/submission/devpost-2026-09-19/README.md) includes
cover and social artwork, four product gallery images, captions, submission copy
and editable sources.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Roadmap

- [x] Public, browser-local eight-file upload and A/B/C scheduling.
- [x] Weekly contract/activity schedule, occupancy view and contextual explanations.
- [x] Reviewed maintenance replanning, Apply/Discard/Undo and official CSV export.
- [x] Synthetic datasets for dependencies, capacity pressure and larger workloads.
- [x] Repeatable PS1 benchmark and measured solver-quality comparison.
- [ ] Continue improving heuristic schedule quality on varied workloads.
- [ ] Complete remaining manual accessibility checks and evaluate with planning practitioners.
- [ ] Complete and verify the remaining hackathon submission deliverables.

See [open issues](https://github.com/pavan2184/LTA-Hack/issues),
[Project Status](docs/PROJECT_STATUS.md) and the
[PS1 submission checklist](docs/PS1_SUBMISSION_CHECKLIST.md).
The official PS1 statement and generic participant pack differ on repository and
video requirements; the checklist records the remaining decisions and publication steps.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Contributing

1. Read [AGENTS.md](AGENTS.md), the [official PS1 specification](docs/PS1_OFFICIAL_SPEC.md) and the project contracts.
2. Discuss new scope in an issue, then create a focused branch, such as `codex/describe-the-change`.
3. Reuse existing patterns, preserve the complete-workload and export contracts, and add meaningful tests for changed behavior.
4. Run the appropriate checks and update the relevant documentation and project status.
5. Open a pull request describing the problem, resulting behavior and verification.

Keep credentials and private participant material out of commits. Coordinate
shared-database tests with the environment owner. Use `<area>(<type>): <summary>`
for commit and PR titles. View [contributors](https://github.com/pavan2184/LTA-Hack/graphs/contributors).

<p align="right"><a href="#readme-top">Back to top</a></p>

## License

This repository currently has no project licence file. The README template's
licence does not set RailPlan's licence. Third-party code and data retain their
own terms. The geographic snapshot has an unresolved source-permission conflict;
see the [security review](docs/SECURITY_REVIEW.md) before redistributing it.

<p align="right"><a href="#readme-top">Back to top</a></p>

## Contact

Use [GitHub Issues](https://github.com/pavan2184/LTA-Hack/issues) for project questions,
bugs and feature discussions.

Project: [pavan2184/LTA-Hack](https://github.com/pavan2184/LTA-Hack).

<p align="right"><a href="#readme-top">Back to top</a></p>

## Acknowledgments

- [Nebula X PS1](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/tree/main/PS1) for the challenge specification and published instance.
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) for this README's structure.
- [Siemens Opcenter Scheduling SMT](https://blogs.sw.siemens.com/opcenter/new-opcenter-scheduling-smt-2410/) for the industrial scheduling reference; no affiliation is implied.
- The open-source projects listed above and sources credited in [product research](docs/NEBULAX_PRODUCT_RESEARCH.md).

<p align="right"><a href="#readme-top">Back to top</a></p>
