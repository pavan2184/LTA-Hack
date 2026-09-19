# RailPlan Algorithm Lab

**Railway access planning, explained.** A standalone, interactive explanation of
constraint programming with real Google OR-Tools CP-SAT solves over six fictional
jobs. The web page and its bounded Python API can run together on Google Cloud
Run. No project credentials belong in the application.

**Deployment status:** prepared for Cloud Run; no public Google Cloud URL has
been verified. Building this lab does not update the main RailPlan deployment.

## What this demo demonstrates

Change the supplied planning controls, run a solve, and inspect how constraints
and objective terms change a small weekly schedule. The backend runs CP-SAT; the
illustration is not a prerecorded claim of a live solve. Only the lab's fixed
input space is accepted. It is not an arbitrary model or file-upload service.

The three controls cover 54 combinations: weekly capacity 1–3, no closure or one
closed week out of eight, and predecessor enforcement on/off. Requests are
limited to 4 KiB; only one solve runs at a time per process, using one search
worker with a two-second CP-SAT search limit. Repeated proven results are cached
in memory and identified in the response. A returned schedule is checked again
with ordinary Python arithmetic independently of the CP-SAT model.

Keep these three systems distinct when writing Devpost copy:

| System | Solver and scope |
| --- | --- |
| This Algorithm Lab | Python OR-Tools CP-SAT 9.15.6755; six fictional jobs, simplified weekly constraints; intended for teaching |
| RailPlan `/ps1` | Same-origin native Python OR-Tools CP-SAT, seeded by a checked TypeScript heuristic; uploaded eight-file PS1 instances, complete workload, A/B/C and official-shaped CSV exports |
| Legacy nightly-planner CP-SAT benchmark | Offline reference comparison for the separate nightly planner; validator-derived cuts, seven recorded fixtures |

The lab does not implement every PS1 rule, establish reference-validator parity,
or produce an operationally approved railway possession plan. Its scores and
timings must not be presented as PS1 benchmark results. This companion does not change the main application's
upload, native-solve or export paths. See the
[official PS1 requirements](../../docs/PS1_OFFICIAL_SPEC.md),
[production solver decision](../../docs/DECISIONS.md#2026-09-19--native-cp-sat-is-the-primary-ps1-solver)
and [offline benchmark](../../scripts/benchmark/README.md).

## Run locally

From the repository root, using Python 3.12:

```sh
python3.12 -m venv output/algorithm-lab-venv
output/algorithm-lab-venv/bin/python -m pip install -r demos/algorithm-lab/requirements.txt
output/algorithm-lab-venv/bin/gunicorn --chdir demos/algorithm-lab --bind 127.0.0.1:8080 --workers 1 --threads 4 --timeout 30 main:app
```

Open <http://127.0.0.1:8080>. The environment lives under the repository's
Git-ignored `output/` directory. This service needs no `.env` file, database,
Google API key, or local Docker daemon.

Run its focused tests from the repository root:

```sh
output/algorithm-lab-venv/bin/python -m unittest discover -s demos/algorithm-lab -p 'test_*.py'
bash -n demos/algorithm-lab/deploy.sh
```

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Interactive educational page |
| `GET /api/model` | Fixed model facts and supported controls |
| `POST /api/solve` | Validate bounded controls and solve the educational model |
| `GET /healthz` | Service health response |

Use the page to construct requests; do not expose additional arbitrary data,
file paths, Python execution, or user-specified solver settings through the API.

## Deploy to Google Cloud Run

Use an existing team-controlled Google Cloud project and select its intended
authenticated account in Google Cloud CLI or Cloud Shell. **No account, project,
billing setup, or runtime identity is selected automatically.**

The project administrator must prepare:

- Billing and the Cloud Run, Cloud Build, and Artifact Registry APIs.
- A dedicated runtime service account in that project, with no application
  permissions. Do not use the default Compute Engine or App Engine identity.
  Check project, inherited, and individual-resource grants. The app calls no
  Google Cloud APIs, so it needs no Editor, storage, database, or secret access.
- The deployer's source-deployment permissions and permission to use this runtime
  identity. Public access also needs permission to change the service's invoker
  policy. Keep the build identity separate: the project's existing Cloud Build
  account needs the documented build permissions.
- Read access for the script's account/project, billing, enabled-API,
  service-account, project-IAM-policy, and Cloud Run service preflight checks.

The script checks those resources; it does not log in, create projects or service
accounts, enable APIs, or grant project roles. Its project-policy check cannot
prove that inherited or individual-resource grants are absent. See Google's
[source deployment prerequisites](https://docs.cloud.google.com/run/docs/deploying-source-code)
and [service identity guide](https://docs.cloud.google.com/run/docs/configuring/services/service-identity).

From the repository root, replace each placeholder with your selected values:

```sh
gcloud auth list --filter=status:ACTIVE --format='value(account)'
bash demos/algorithm-lab/deploy.sh PROJECT_ID REGION RUNTIME_SERVICE_ACCOUNT_EMAIL
```

For example, the region can be `asia-southeast1` when that is appropriate for the
team's project. The script requires all three arguments and prints the selected
account and target before deployment. It creates or updates the public service
`railplan-algorithm-lab`; an existing service must carry its ownership label.
Deployment publishes the page and API for unauthenticated access.

Source is built remotely using Google's Python buildpack. `.python-version`
selects Python 3.12 and `Procfile` starts one Gunicorn worker with four threads.
The platform supplies `PORT`; it is not a credential or a new app configuration
requirement. The `.gcloudignore` allowlist and the script's upload check restrict
the build to `main.py`, `model.py`, pinned requirements, runtime configuration,
the three page assets, the icon, WOFF2 fonts, and their `static/fonts/OFL.txt`
licence. Tests, docs, virtual environments,
the rest of the repository, and local secrets are excluded. See the
[Python buildpack guide](https://docs.cloud.google.com/docs/buildpacks/python) and
[upload ignore rules](https://docs.cloud.google.com/sdk/gcloud/reference/topic/gcloudignore).

Both `plex-sans-latin.woff2` and `plex-mono-latin.woff2`, plus `OFL.txt`, must be
present in `static/fonts/` and included in the upload; otherwise preflight stops.

### Resource settings and costs

| Setting | Value |
| --- | --- |
| Billing | Request-based, CPU throttled while idle |
| Minimum instances | 0 |
| Maximum instances | 1 at both service and revision levels |
| CPU / memory | 1 vCPU / 512 MiB |
| Concurrent requests per instance | 4 |
| Request timeout | 30 seconds |
| Startup CPU boost | Disabled |

These settings limit routine resource use, with cold-start latency and limited
throughput as the trade-off. They do **not** guarantee free hosting or a strict
spending cap. Cloud Run requests, remote builds, artifact storage, and network
traffic can incur charges; instance limits can be briefly exceeded by platform
behavior. The project owner should monitor costs and choose a billing budget.
See the [deployment flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy),
[instance-limit behavior](https://docs.cloud.google.com/run/docs/configuring/max-instances-limits),
and [Cloud Run pricing](https://cloud.google.com/run/pricing).

## Verify and capture assets

Use the HTTPS URL printed by the successful deployment, then:

1. Open it signed out, including in a fresh browser session.
2. Check `/healthz` and `/api/model`, then run the default solve from the page.
3. Change each provided control, inspect the returned solver status and schedule,
   and verify infeasible/error states are explained clearly.
4. Test narrow-screen layout and keyboard access. Confirm no private project data
   or credentials appear in page source, API responses, or assets.
5. Record the deployed revision and capture the live page for Devpost.

Describe it as **“RailPlan Algorithm Lab — an interactive CP-SAT explainer”**.
Only add **“hosted on Google Cloud Run”** after the public deployment has been
verified. A local capture may be labelled as a local preview. Keep the production
RailPlan URL separate so judges can still upload their complete PS1 instance.
