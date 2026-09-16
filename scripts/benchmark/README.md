# CP-SAT reference benchmark

This is an offline comparison, not a production solver or service. The Python
master chooses one 15-minute candidate slot (or deferral) per request. RailPlan's
TypeScript `validate()` remains the constraint authority. The harness derives
single-placement and relevant pair cuts through that validator first; any remaining
invalid CP-SAT incumbents produce lazy no-good cuts until the best remaining
solution validates, or the model is proven infeasible. Deferral choices are included
in those cuts, so dependency cuts reject only the invalid placement/deferral
combination rather than banning the dependent request outright.

The v1 objective compares the production `max-completion` heuristic with a
lexicographic proxy: priority-weighted completion, placed request count, then
earlier aggregate start. It runs the fabricated baseline, a deliberately impossible
mandatory-block closure, and a shortened-window disruption. Every returned plan is
independently validated before metrics are reported.

Install the pinned Python dependency into an isolated environment, then pass that
environment's Python executable:

```powershell
python -m venv .venv-cpsat
.venv-cpsat\Scripts\python -m pip install -r scripts/benchmark/requirements.txt
npm exec -- tsx scripts/benchmark/cp-sat.ts .venv-cpsat\Scripts\python.exe
```

Do not infer production superiority from one fabricated night. Record solver
status, bound, validator-cut count, end-to-end runtime and independently validated
quality. Retain the TypeScript heuristic unless repeated representative instances
show a material benefit worth a Python service and its failure modes.
