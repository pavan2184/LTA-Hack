# Native PS1 deployment

Use Google Compute Engine for the first release. A single host runs Next.js and
native Python OR-Tools, with nginx and a Google Cloud HTTPS load balancer in front.
No Docker, database, service token or new application environment variable is
required for `/ps1`. Existing authenticated workflows still need their existing
configuration. This runbook is prepared; durable cloud deployment is not completed.
A separate temporary GCE benchmark, including its unresolved results and VM
termination, is recorded in PROJECT_STATUS. It is not the local algorithm
comparison or a running judge-facing deployment.

The selected target is **32 vCPUs / 64 GiB RAM**, for example
`c4-highcpu-32` in a region where it is available. The checked-in service starts
with **16 CP-SAT workers and a 60-second search budget per scenario**. Compare
8, 16 and 32 workers on the actual host before changing the default; more workers
do not guarantee a better schedule in a fixed wall-time budget. A vCPU is not a
promise of one dedicated physical core. The systemd template caps the entire
Node/Python service at 48 GiB and 3,200% CPU (32 logical CPUs), leaving memory for
the OS and ingress. This is a prepared configuration, not a cloud performance
measurement. [Google machine types](https://docs.cloud.google.com/compute/docs/general-purpose-machines).

Cloud Run services can also host a packaged Node/Python runtime, but need a
container deployment and matching CPU/concurrency settings. HTTP Cloud Run
functions permit up to 60 minutes; timeout alone is not the reason to prefer a
VM. This implementation uses a native child process inside a self-hosted Next
server and is ready for that model. A Functions adapter has not been implemented.
[Function limits](https://docs.cloud.google.com/functions/quotas),
[Cloud Run CPU configuration](https://docs.cloud.google.com/run/docs/configuring/services/cpu).

## Install and run

On a Linux host with Node 22, Python 3.11+ with venv, git and nginx installed:

1. Create a non-root `railplan` service user and place this checkout at
   `/opt/railplan`, owned by that user. Preserve the repository paths: the service
   executes `scripts/ps1/benchmark/cp_sat.py` from the checkout. Do not deploy
   `.next` alone or a static export.
2. As the service user, install and verify:

```sh
npm ci
python3 -m venv .venv-cpsat
.venv-cpsat/bin/pip install -r scripts/ps1/requirements.txt
.venv-cpsat/bin/python scripts/ps1/benchmark/test_cp_sat.py
npm run build -- --webpack
PATH="$PWD/.venv-cpsat/bin:$PATH" npm run ps1:solve
npm run ps1:start
```

The startup script verifies the pinned OR-Tools version and listens on loopback
port 3000. Native search defaults to 60 seconds per scenario and up to 16
available CPU workers. A separate 75-second child wall limit includes Python
startup/model construction. The warm heuristic has a cooperative one-second
budget; one construction may overrun it. The browser waits at most 90 seconds
for each scenario request; nginx and the HTTPS load balancer allow 100 seconds.
Those outer limits are separate from the solver's 60-second search budget.
Three UI requests solve A/B/C sequentially, so their combined search budget is
up to 180 seconds plus setup and validation. The UI does not yet run three
scenarios concurrently or stream improving incumbents during a solve.
Do not run multiple Node workers on this VM: each process has its own admission
gate and could allocate another full CPU portfolio.

3. Stop the foreground preview. Install `deploy/ps1/railplan.service` in
   `/etc/systemd/system/`, then run `systemctl daemon-reload` and
   `systemctl enable --now railplan` with administrator privileges. The unit
   stops native child processes with the service and restarts on failure.
4. Install `deploy/ps1/nginx.conf` inside nginx's `http` configuration, validate
   with `nginx -t`, and reload nginx. The template listens on 8080 behind an HTTPS
   load balancer. Preserve Host and have the trusted load balancer set
   X-Forwarded-Proto. Set the load balancer backend timeout to at least 100 seconds.
   Firewall the backend so 8080 is reachable only from the load balancer and its
   health checks; never expose Node's loopback listener. Configure a `/ps1` health
   check. TLS/domain/project selection is deployment-specific and is not supplied
   by this repository.
5. Open the actual HTTPS `/ps1` URL, load public data, and confirm API requests
   return native proof metadata. Then upload a different complete eight-file
   instance, replan a cut, Apply/Undo and download the nine-file ZIP. Run this on
   the deployment host; local macOS proof does not validate nginx/systemd or TLS.

## Runtime behavior

The API admits one solve at a time per process; concurrent callers receive 429
with Retry-After. There is no persistent job queue. Uploads are held in request
memory and passed over stdin; neither the endpoint nor the native runner saves
them or logs their content. The nginx template buffers request bodies and may
briefly spool uploads into its temporary directory; this is not a promise of
end-to-end memory-only handling. The UI explicitly says data is sent to the server.
Nginx enforces body/time/rate limits; the application additionally checks streamed
bytes, typed input, references and model size. An oversize response means the
server declined the instance, never that it dropped work.

Native results echo an input digest and pass an independent official-CSV
round-trip, score check and pin check. The browser validates them again. UNKNOWN
or a child timeout can retain a complete checked incumbent. Missing Python or
OR-Tools yields 503; invalid output yields 502. CPU search can be cancelled when
the request abort signal reaches the server; a dropped network is additionally
bounded by the native wall timeout. No OPTIMAL claim applies beyond the encoded
local model; physical-night alignment remains outside the published CSV fields.

For longer experiments use the offline benchmark and record hardware, thread
count, seed, search and end-to-end time, score, bound and feasibility. Do not expose
unbounded runtime/worker controls through the public endpoint. The deployment
budget lives in `src/lib/ps1/server-solver.ts` and the API admission limits in
`src/lib/ps1/request.ts`. The internal service configuration permits 1–32 workers
and up to 60 search seconds; longer benchmark experiments run outside that HTTP
boundary. Request-size, activity-week, location-week and span-week limits remain
in place until cloud memory measurements support any increase. No extra CPU
or memory is allocated merely by changing these input limits.
