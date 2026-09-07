# Deterministic Scheduling, Mapping, and Decision Analytics

Last updated: 2026-07-15

Status: Historical design and remaining roadmap. The TypeScript engine and v0.4 input contract are now implemented; CP-SAT, public geography and other later sections remain proposals. Present-tense descriptions of the old simulation below are historical context; see PROJECT_STATUS.md for current truth.

See `README.md` in this directory for documentation status/precedence and `RAIL_SCHEDULING_RESEARCH.md` for the annotated research survey and paper-to-feature mapping behind these recommendations.

## Executive Recommendation

RailPlan should be positioned as an operations-research decision-support tool, not an AI scheduler. The core planning result should come from five deterministic layers:

1. A rail-network graph that turns station ranges into exact track blocks.
2. A rule engine that detects and explains every constraint violation.
3. A constraint solver that produces feasible schedules for the five existing strategies.
4. A statistics engine that calculates every KPI from schedule data and reproducible scenarios.
5. A map and timeline that visualise the same underlying blocks, conflicts, resources, and trade-offs.

An LLM is not required for any of these layers. If one is added later, it should only rewrite already-computed explanations into plainer language. It must never decide feasibility, priority, safety, or resource allocation.

For this codebase, the best target is:

- **Now, while remaining frontend-only:** implement a pure TypeScript conflict checker, rail graph, calculated KPIs, and a deterministic priority-based scheduler in a Web Worker.
- **Strong technical version:** add a small FastAPI optimisation service using Google OR-Tools CP-SAT. The existing `ScheduleVariant` boundary is already a useful starting point for this future service.
- **Keep the current UI structure:** improve its information precision and map behaviour rather than redesigning the entire dashboard.

## What the Current Code Does

The current prototype has a clean presentation architecture but does not yet compute a schedule:

- `src/data/originalSchedule.ts` declares six conflicts manually.
- The five files ending in `Schedule.ts` declare hand-authored placements and KPI values.
- `src/data/scheduleBuilder.ts` creates three alternatives without checking whether the alternatives are feasible.
- `src/data/disruptionResponseSchedules.ts` declares response plans and robustness values manually.
- `src/components/network/RailNetworkMap.tsx` is a useful schematic, but it uses a small fixed list of station codes and counts only exact sector-string matches.
- The v0.1 `src/store/useRailPlanStore.ts` selected fixtures; the current store runs the shared constraint engine.
- The automated data test proves that optimised jobs do not overlap on the same exact sector. It does not yet prove team, equipment, compatibility, dependency, adjacent-sector, travel-time, safety-buffer, or permitted-window feasibility.
- A read-only resource audit confirms that every current strategy retains at least the `M-004`/`M-011` shared thermal imaging unit conflict even while its metric reports zero active conflicts.

This is appropriate for a presentation prototype. It should not be described as real optimisation until the validation and solver layers below exist.

## Determinism Standard

For a given input dataset, strategy, constraint version, and set of planner locks, the system should return the same result and the same reasons.

A solver can have several equally optimal answers, so reproducibility requires more than a fixed random seed. Use all of the following:

- integer time slots and integer objective coefficients;
- a fixed ordering of requests, resources, blocks, and candidate starts;
- a fixed solver seed and, where necessary, a single search worker;
- lexicographic tie-breakers such as request ID and earliest start;
- a versioned input hash and constraint-set version;
- an exact optimal result when the time limit permits;
- an explicit `FEASIBLE`, `OPTIMAL`, `INFEASIBLE`, or `TIME_LIMIT` status when it does not.

Never label a merely feasible result as optimal. If a time-limited solver returns different equally good schedules, canonicalise the output with a final tie-break objective.

## Required Data Model

The present `MaintenanceRequest` is a good demo model. Real deterministic planning needs the following additional data.

### Network entities

- `Station`: code, name, line codes, latitude, longitude, interchange flag.
- `TrackBlock`: atomic directed or undirected segment between adjacent operational nodes.
- `ConflictZone`: junction, crossover, siding, substation isolation zone, or other area whose blocks cannot be occupied together.
- `BlockAdjacency`: graph edges and safety distance in hops or metres.
- `EngineeringWindow`: date, start, handback deadline, available blocks, and capacity per block.

A request such as `NS10–NS12` must expand to atomic blocks such as `NS10–NS11` and `NS11–NS12`. String equality is not enough: `NS10–NS12` and `NS11–NS13` share a real block even though their labels differ.

### Request parameters

- planning night and permitted start/end window;
- expected duration plus P50, P80, and P95 durations when historical data exists;
- occupied track blocks and isolation/conflict zones;
- work type and work-compatibility class;
- required skills, team count, equipment count, and alternative qualified resources;
- setup, access, travel, testing, handback, and safety-buffer durations;
- predecessors and maximum/minimum lag rules;
- priority, criticality, due date, overdue days, and deferral cost;
- whether the work is mandatory, splittable, pre-emptible, or can move to another night;
- current approved placement and planner lock state.

### Resource parameters

- team and engineer skills;
- equipment capacities rather than only equipment names;
- shift availability and breaks;
- home/depot block and travel speed or a travel-time matrix;
- setup and reset time between work types;
- substitutions and qualification expiry.

### Historical parameters

- planned and actual start/end times;
- cancellation and overrun reason codes;
- actual resource use;
- work-type, location, contractor, and condition features;
- disruptions and recovery outcomes.

These records allow ordinary descriptive statistics and simulation. They do not require machine learning.

## Public Map Data

Useful public sources include:

- [LTA DataMall static datasets](https://datamall.lta.gov.sg/content/datamall/en/static-data.html), which list Train Station, Train Station Exit Point, Train Station Codes and Chinese Names, and Train Line Codes datasets.
- [LTA MRT Station Exit GeoJSON on data.gov.sg](https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view), which supplies named station-exit points and coordinates.
- [Master Plan 2025 Rail Line Layer](https://data.gov.sg/datasets/d_1c6365f0cad13a77bd79bdbb499131bf/view), which can provide indicative rail geometry for a geographic presentation layer.
- [OneMap APIs](https://www.onemap.gov.sg/apidocs/), Singapore's authoritative national map service, for basemaps, coordinate conversion, and optional routing.
- [LTA DataMall dynamic datasets](https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html), which include passenger volumes, station crowd levels, and train service alerts that may inform impact scoring or scenarios.

Public station coordinates are suitable for visualisation. They do **not** define operational track blocks, possessions, isolation zones, engineer qualifications, or work compatibility. Those constraints must come from an authoritative internal source or remain explicitly labelled as fabricated hackathon data.

For a reliable demo, download and normalise the relevant public GeoJSON during development, store a small attributed snapshot in the repository, and avoid making the dashboard depend on a live API.

## Core Mathematical Model

The current timeline already uses 15-minute resolution, so a discrete-time model is the clearest first implementation.

### Sets and parameters

Let:

- \(I\) be maintenance requests;
- \(N\) be engineering nights;
- \(T\) be 15-minute start slots;
- \(B\) be atomic track blocks or conflict zones;
- \(R\) be teams, skills, and equipment resources;
- \(d_i\) be the duration of request \(i\) in slots;
- \([E_i,L_i]\) be its permitted start range;
- \(p_i\) be its preferred start slot;
- \(w_i\) be its approved priority or business-value score;
- \(A_{ib}\) be 1 when request \(i\) occupies block \(b\);
- \(Q_{ir}\) be the units of resource \(r\) required by request \(i\);
- \(C_{bnt}\) and \(C_{rnt}\) be available block and resource capacities;
- \(g_{ij}\) be the required separation between requests \(i\) and \(j\);
- \(D\) be precedence or dependency relationships.

### Decision variables

- \(x_{int}=1\) when request \(i\) starts on night \(n\) at slot \(t\).
- \(y_i=1\) when request \(i\) is scheduled at all.
- \(u_i=1-y_i\) when it is deferred or unscheduled.
- Optional assignment variables select one qualified team or equipment unit.
- Optional ordering variables decide which of two incompatible jobs runs first.

The scheduled start is:

\[
s_i = \sum_{n \in N}\sum_{t \in T} t\,x_{int}
\]

### Hard constraints

Safety and operational feasibility should be hard constraints. A strategy may trade completion against stability or spare capacity, but it must not trade away safety.

#### 1. Start once or defer

\[
\sum_{n \in N}\sum_{t \in T} x_{int}=y_i \qquad \forall i\in I
\]

Mandatory critical work fixes \(y_i=1\). Other work may be deferred with an explicit penalty and reason.

#### 2. Permitted window and handback

Create start variables only where:

\[
E_i \le t \quad\text{and}\quad t+d_i \le L_i
\]

This removes impossible placements before solving and guarantees the handback deadline.

#### 3. Block occupancy

For a slot \(\tau\), request \(i\) is active if it started in one of the preceding \(d_i\) slots. Let this derived value be \(o_{in\tau}\). Then:

\[
\sum_i A_{ib}o_{in\tau}\le C_{bn\tau}
\qquad \forall b,n,\tau
\]

For an exclusively possessed block, capacity is 1. A larger capacity is allowed only where operational rules explicitly permit compatible concurrent work.

#### 4. Teams, skills, and equipment

\[
\sum_i Q_{ir}o_{in\tau}\le C_{rn\tau}
\qquad \forall r,n,\tau
\]

When named engineers or equipment units can be substituted, add assignment variables and require exactly the requested skill/capability coverage.

#### 5. Work compatibility

Maintain a symmetric compatibility matrix by work class and isolation type. If two works are incompatible and share a block, adjacent block, or conflict zone, they must not overlap even if the nominal block capacity is greater than 1.

#### 6. Safety and handback buffers

The simplest formulation expands a job's occupancy interval by its required setup and handback buffer. A pairwise form is:

\[
s_i+d_i+g_{ij}\le s_j
\quad\text{or}\quad
s_j+d_j+g_{ji}\le s_i
\]

The solver encodes the `or` using an ordering Boolean or a `NoOverlap` constraint.

#### 7. Dependencies

For every dependency \((i,j)\in D\):

\[
s_j \ge s_i+d_i+g_{ij}
\]

Conditional forms apply when either job may be deferred. Maximum-lag constraints can also prevent a dependent test from being separated too far from its predecessor.

#### 8. Travel and setup time

If the same team performs \(i\) then \(j\):

\[
s_j \ge s_i+d_i+\operatorname{travel}(i,j)+\operatorname{setup}(i,j)
\]

Travel time should come from graph distance between blocks, not straight-line map distance alone.

#### 9. Planner locks

A locked placement is a constraint, not a post-processing override:

\[
x_{in^*t^*}=1
\]

The v0.1 store merged locked jobs after selecting a fixture. A real solver must include locks before it solves so it can prove whether the remaining plan is feasible.

#### 10. Emergency reserve

Reserve may be represented in one of three ways:

- leave a fixed protected time block unused;
- require at least \(H\) unused block-minutes per corridor;
- require a predefined set of emergency scenarios to remain insertable.

The third definition is the strongest and makes the UI's “emergency capacity” measurable.

## Objective Functions

Use lexicographic optimisation so lower-value preferences can never compensate for a safety or critical-work failure.

Recommended priority order:

1. satisfy all hard constraints;
2. schedule all mandatory and critical work;
3. maximise approved work value;
4. minimise deferral and priority-weighted lateness;
5. minimise movement from submitted placements;
6. minimise resource changes and travel;
7. maximise buffer, flexibility, and emergency capacity;
8. apply a canonical request-ID/start-time tie-break.

A normalised soft-cost model can be written as:

\[
\min
\alpha\sum_i w_i u_i
+\beta\sum_i w_i|s_i-p_i|
+\gamma\,\text{resourceChanges}
+\delta\,\text{riskPenalty}
-\epsilon\,\text{reserveCapacity}
\]

The weights must be visible, versioned, and applied only after hard constraints. Never use unnormalised raw metrics in one weighted sum; minutes, job counts, percentages, and costs otherwise produce misleading trade-offs.

### Mapping the five current strategies to real mathematics

| Existing strategy | Primary objective | Secondary objectives | What the UI should show |
| --- | --- | --- | --- |
| Balanced | Maximise priority-weighted completion | Minimise movement and risk; preserve reserve | Pareto-balanced rank and exact trade-offs |
| Maximum Work Completion | Maximise scheduled value, then job count | Minimise overtime and movement | Jobs and weighted value added; reserve consumed |
| Minimum Operational Risk | Maximise minimum slack or minimise worst-case scenario loss | Preserve critical completion | P95 handback, minimum buffer, CVaR or worst-case loss |
| Minimum Schedule Changes | Minimise weighted absolute movement and assignment changes | Maximise completion | Jobs moved, total moved minutes, team changes |
| Maximum Emergency Buffer | Maximise feasible emergency insertions or largest contiguous reserve | Preserve critical completion | Insertable scenarios, blocks, and reserve duration |

Each strategy should return its objective vector. Avoid copy such as “+13%” unless the delta was calculated from the currently selected baseline.

## Deterministic Conflict Detection

Conflict detection should be a separate pure function from optimisation. It validates submitted plans, solver results, planner overrides, imports, and disruption responses using the same rule definitions.

### Interval overlap

For intervals \([s_i,e_i)\) and \([s_j,e_j)\), overlap minutes are:

\[
\operatorname{overlap}(i,j)=
\max\left(0,\min(e_i,e_j)-\max(s_i,s_j)\right)
\]

A sweep-line algorithm detects overlaps in \(O(n\log n+k)\), where \(k\) is the number of reported overlaps. An interval tree is useful for interactive planner moves.

### Conflict rules

- **Track conflict:** positive overlap on any shared atomic block or exclusive conflict zone.
- **Adjacent-work conflict:** positive overlap on blocks within the configured graph distance.
- **Team conflict:** simultaneous assignments exceed qualified team capacity.
- **Equipment conflict:** simultaneous use exceeds the count of available units.
- **Safety-buffer conflict:** actual separation is below the required pairwise buffer.
- **Compatibility conflict:** concurrent work classes are forbidden by the compatibility matrix.
- **Dependency conflict:** predecessor order or lag is violated.
- **Time-window conflict:** start or end falls outside the permitted interval.
- **Travel conflict:** a shared team or asset cannot reach the next location in time.
- **Handback conflict:** the job, test, or clearance buffer exceeds the engineering window.

Each conflict record should include rule ID, affected requests, blocks/resources, observed value, required value, overlap or shortfall minutes, severity, and remediation hints. Explanations can then be rendered from templates without an LLM.

### Conflict graph

Represent the submitted plan as a labelled graph:

- a node is a request;
- an edge is a potential or active incompatibility;
- edge labels contain track, team, equipment, buffer, dependency, and travel rules.

This supports connected conflict clusters, graph colouring heuristics, maximum compatible subsets, and a much clearer network-map overlay.

## Generating Alternative Slots

The present Option A/B/C alternatives are not validated. Real alternatives should be the next best feasible solutions.

1. Solve the best schedule.
2. Add a no-good cut that excludes that exact placement for the selected request or entire solution.
3. Re-solve for the second- and third-best answers.
4. Require diversity, such as a different start by at least 30 minutes or a different night.
5. Calculate deltas against the selected plan.

An alternative card should display:

- feasibility status;
- start/end and assigned resources;
- jobs displaced or moved;
- total movement minutes;
- priority-weighted completion delta;
- buffer and emergency-capacity delta;
- the binding constraint that prevents an even closer placement.

This is more defensible than labels such as “may reduce buffer” without a calculation.

## Relevant Mathematical and Algorithmic Families

No finite document can list every scheduling algorithm ever published. The following covers the practical families relevant to this problem and explains where each belongs.

### Core scheduling methods

| Method | Best use here | Strengths | Limits | Recommendation |
| --- | --- | --- | --- | --- |
| Rule engine plus sweep line | Detecting submitted-plan conflicts | Fast, transparent, easy to test | Does not repair the plan | Essential |
| Priority greedy / earliest feasible start | Instant frontend-only baseline | Simple and deterministic | Can miss much better schedules | Build as fallback and benchmark |
| Backtracking with constraint propagation | Small 22-job demo | Can find feasible schedules without a backend | Worst-case search grows quickly | Viable frontend prototype |
| Weighted interval scheduling / dynamic programming | Selecting work for one exclusive block | Exact for simplified single-resource cases | Does not model the full network alone | Useful subproblem |
| Bipartite matching / Hungarian algorithm | Assigning jobs to equally capable teams or slots | Fast and exact assignment | Weak for variable durations and multiple resources | Supporting step |
| Min-cost max-flow | Time-expanded resource or crew allocation | Clear costs and capacities | Awkward for rich logical constraints | Useful decomposition |
| Mixed-integer linear programming | Full possession scheduling with linear constraints and costs | Optimality bounds; mature theory | Pairwise sequencing can create large models | Strong option |
| Constraint programming / CP-SAT | Variable durations, alternatives, no-overlap, resources, dependencies | Expressive scheduling constraints and good practical performance | Requires careful integer modelling | **Recommended solver** |
| Resource-constrained project scheduling (RCPSP) | Dependencies plus limited teams/equipment | Direct match for project/resource logic | Geography and compatibility still need extensions | Useful model framing |
| Job-shop / flexible job-shop scheduling | Jobs use sequences of track, team, and equipment resources | Natural precedence and exclusivity model | Standard makespan objective is too narrow | Useful model framing |
| SAT / MaxSAT | Hard logical compatibility and soft-rule penalties | Strong infeasibility reasoning | Time and cumulative capacity need careful encoding | Specialist alternative |
| Graph colouring | Assigning incompatible work to time buckets | Very intuitive conflict-graph view | Durations, windows, and resources require extensions | Heuristic/visual aid |
| Maximum independent set / maximum weight independent set | Selecting a compatible subset for one slot/window | Explains which requests can coexist | Does not place multi-slot work by itself | Useful subproblem |

Google's [OR-Tools scheduling documentation](https://developers.google.com/optimization/scheduling) demonstrates employee and job-shop scheduling, including precedence and machine exclusivity. CP-SAT operates on integers, which fits the existing 15-minute slot model. A published rail possession scheduler has also used a mixed-integer linear model for microscopic possession planning: [Cillie and Bekker (2023)](https://doi.org/10.7166/34-2-2750).

### Network and movement methods

| Method | Use |
| --- | --- |
| Breadth-first search | Count block hops for adjacent-work exclusion on an unweighted graph. |
| Dijkstra's algorithm | Find minimum team/equipment transfer time on weighted track or road links. |
| A* | Speed up repeated point-to-point routes when geographic coordinates provide a valid heuristic. |
| Floyd-Warshall or repeated Dijkstra | Precompute a small all-pairs travel-time matrix for every operational block. |
| Minimum spanning tree | Data QA and simplified schematic construction; not the scheduler itself. |
| Betweenness centrality | Identify blocks whose loss affects many network paths; useful as an impact feature. |
| Max-flow/min-cut | Quantify corridor capacity and identify bottleneck cuts in simplified network models. |
| Vehicle routing / travelling repairperson | Sequence a mobile crew or unique maintenance machine across locations. |

### Robustness and uncertainty methods

| Method | Use | Deterministic output? |
| --- | --- | --- |
| Scenario enumeration | Re-solve fixed overrun, absence, fault, and shortened-window cases | Yes |
| Robust optimisation | Protect against all durations/resources within defined uncertainty bounds | Yes |
| Budgeted robust optimisation | Limit how many adverse events are assumed simultaneously | Yes |
| Chance-constrained optimisation | Require a target probability of handback or resource feasibility | Reproducible from fixed distributions |
| Two-stage stochastic programming | Choose a base plan, then minimise expected recovery cost across scenarios | Yes for fixed scenarios/probabilities |
| Monte Carlo simulation | Estimate handback probability, conflicts, and expected/CVaR delay | Reproducible with fixed seed and sample set |
| Discrete-event simulation | Model cascading overruns, travel, and resource queues | Reproducible with fixed inputs/seed |
| Queueing models | Diagnose long-run team/equipment bottlenecks | Analytical for simplified assumptions |
| Sensitivity analysis | Show how the answer changes when durations, weights, or availability change | Yes |

Robust optimisation is preferable when historical data is weak. Monte Carlo or stochastic optimisation becomes defensible only after distributions are estimated from enough comparable work records. Railway research commonly treats buffer allocation and stochastic simulation as robustness tools; for example, [Kroon et al.'s stochastic timetable improvement model](https://doi.org/10.1016/j.trb.2007.11.002) allocates supplements and buffer times against disturbances.

### Long-term maintenance prioritisation methods

These do not replace the nightly scheduler, but they can decide which jobs should enter it:

- criticality-weighted scoring;
- knapsack models for annual budget and possession limits;
- Weibull or survival models for time-to-failure;
- Markov decision processes for asset-condition transitions;
- renewal-reward models for preventive replacement intervals;
- multi-period MILP for maintenance and renewal programmes;
- genetic algorithms or other metaheuristics for very large non-linear planning models.

Research examples include [maintenance scheduling under limited possession time](https://doi.org/10.1061/JTEPBS.0000163) and [network track-maintenance scheduling with deterioration and cost uncertainty](https://doi.org/10.1002/qre.1381).

### Large-scale decomposition and search

These are future options if the model grows from one night and 22 requests to a network-wide multi-week calendar:

- rolling-horizon optimisation;
- Benders or logic-based Benders decomposition;
- Dantzig-Wolfe decomposition and column generation;
- Lagrangian relaxation by corridor, night, or resource;
- large-neighbourhood search;
- tabu search;
- simulated annealing;
- genetic algorithms;
- hybrid exact-plus-heuristic methods.

Heuristics can be valuable for warm starts and rapid alternatives, but they should always be followed by the deterministic validator. They must not report optimality without a valid bound.

### Methods not recommended for the MVP

- **Reinforcement learning:** hard to validate, unnecessary for 22 deterministic requests, and weak at providing feasibility guarantees.
- **Neural schedule generation:** can produce invalid placements and adds no value over a constraint solver here.
- **QUBO/quantum optimisation:** adds complexity without a practical advantage at this scale.
- **Unexplained weighted scores:** easy to make attractive dashboards, but not defensible unless every term and denominator is defined.
- **A single genetic algorithm:** useful for some large non-linear cases, but CP-SAT/MILP offers clearer constraints and optimality information for the current problem.

## Map and Graph Calculations

### Build one authoritative topology

Use a graph \(G=(V,E)\):

- station, junction, crossover, depot, and boundary nodes are \(V\);
- atomic track blocks are \(E\);
- each edge stores line, length, direction, possession capacity, isolation zone, and display geometry;
- each request points to edge IDs rather than only a display string.

The timeline, conflict checker, solver, and map must all use the same edge IDs. This prevents the map from becoming decorative or disagreeing with the schedule.

### Location and travel calculations

For visual distances between public coordinates, the Haversine formula is sufficient:

\[
d=2R\arcsin\left(\sqrt{\sin^2\frac{\Delta\phi}{2}+
\cos\phi_1\cos\phi_2\sin^2\frac{\Delta\lambda}{2}}\right)
\]

Operational travel time should instead use a weighted shortest path or an approved transfer-time matrix:

\[
\operatorname{travelSlots}(i,j)=
\left\lceil\frac{\operatorname{shortestPathMinutes}(i,j)+\operatorname{setupMinutes}(i,j)}{15}\right\rceil
\]

### Map metrics

- **Block utilisation:** occupied block-minutes divided by available block-minutes.
- **Conflict minutes:** sum of minutes where demand exceeds allowed block capacity.
- **Resource pressure:** peak or average concurrent demand divided by capacity.
- **Work density:** job count or weighted duration per block/night.
- **Criticality exposure:** priority-weighted work affected by a block closure.
- **Bottleneck score:** centrality combined with utilisation and lack of alternatives.
- **Disruption radius:** affected blocks within a configured graph distance or isolation zone.

### Professional map presentation

Use an operational schematic as the default because planners think in line, block, and possession relationships. Offer a geographic mode only when it adds location context.

Recommended layers:

- scheduled work blocks;
- active conflict blocks;
- possession and isolation boundaries;
- team/equipment transfer paths;
- disruption area;
- utilisation or risk heat layer;
- available alternative blocks or nights.

Selecting a timeline job should highlight the exact same atomic edges on the map. Selecting a map block should filter the queue and timeline. Include a compact legend, data timestamp, source, and a “simulated operational topology” label where internal geometry is fabricated.

## Statistics and KPI Definitions

Every metric should have a formula, numerator, denominator, unit, version, and tooltip. Do not store the final metric value in a schedule fixture.

### Completion

\[
\text{Completion rate}=
\frac{\sum_i y_i}{|I|}
\]

Also report priority-weighted completion:

\[
\text{Weighted completion}=
\frac{\sum_i w_i y_i}{\sum_i w_i}
\]

This prevents a schedule containing many low-priority short jobs from appearing better than one protecting fewer critical works.

### Utilisation

For resource \(r\):

\[
U_r=
\frac{\sum_{i,n,t} Q_{ir}d_i x_{int}}
{\sum_{n,t}C_{rnt}}
\]

Report block, team, and equipment utilisation separately. If the UI needs one headline number, use a published capacity-weighted average and let the user inspect its components. Do not add unlike resource-minutes together without documenting the weighting.

### Schedule movement

\[
\text{Weighted movement}=
\sum_i w_i|s_i-p_i|
\]

Also report jobs moved, median moved minutes, maximum moved minutes, reassigned teams, and deferred jobs.

### Buffer compliance

For constrained consecutive pairs \(P\):

\[
\text{Buffer score}=
100\times\frac{1}{|P|}
\sum_{(i,j)\in P}
\min\left(1,\frac{\text{actualBuffer}_{ij}}{\text{requiredBuffer}_{ij}}\right)
\]

Any safety buffer below the requirement remains a hard conflict, even if the average score looks high.

### Resource headroom

\[
\text{Headroom}_r=1-\max_t\left(
\frac{\text{demand}_{rt}}{\text{capacity}_{rt}}
\right)
\]

Display the minimum headroom across critical resources and the resource that causes it.

### Emergency insertability

Define a versioned emergency scenario set \(S\). For each scenario, test whether it can be inserted without moving critical work or violating constraints:

\[
\text{Emergency capacity}=100\times
\frac{\sum_{s\in S}\mathbf{1}(s\text{ is insertable})}{|S|}
\]

This turns the current 100-point value into an auditable measure.

### Flexibility

Let \(F_i\) be the number of feasible alternative starts for request \(i\) after fixing the rest of the schedule:

\[
\text{Flexibility}=100\times
\frac{\sum_i \min(F_i,F_{\max})}
{|I|F_{\max}}
\]

An alternative is counted only after the validator confirms it.

### Robustness score

Keep component metrics visible and use a simple versioned formula:

\[
R=0.30B+0.25H+0.25E+0.20F
\]

where \(B\) is buffer score, \(H\) is resource headroom, \(E\) is emergency insertability, and \(F\) is flexibility. These weights are a product choice, not a discovered truth. The UI should expose them and compare the raw components.

For operational use, supplement this descriptive score with scenario results rather than relying on the score alone.

### Historical duration statistics

Group comparable records by work type, location class, contractor/team, and access conditions. Calculate:

- actual/planned duration ratio;
- median, P80, P90, and P95 overrun;
- mean absolute error and bias of planned durations;
- on-time-start and on-time-handback rates;
- cancellation and rework rates;
- sample size and recency window.

Do not display percentiles for tiny groups without a warning or pooled fallback. Always show sample size and last-updated date.

### Reproducible risk statistics

For a fixed scenario set or random sample set, report:

- probability of meeting handback;
- expected jobs affected;
- expected recovery movement minutes;
- P95 handback overrun;
- expected loss;
- Conditional Value at Risk at 95% (CVaR95);
- probability each critical resource becomes infeasible.

If Monte Carlo is used, store the seed, simulation count, distribution version, and input hash. If strict determinism is required, persist the generated scenario sample or use a fixed enumerated scenario library.

## Explainability Without AI

Every explanation should be generated from constraint provenance.

Example:

> M-014 moved from 01:00 to 02:30 because Team Alpha was assigned to M-008 until 01:30, both jobs occupy block NS13–NS14, and a 15-minute handback buffer is required. 02:30 is the earliest feasible start that preserves all locked critical work.

The data behind that sentence is:

- original and proposed start;
- resource interval;
- shared atomic block;
- required and observed buffer;
- earliest feasible alternative;
- set of locked critical requests.

Use templates by rule type. Add an optional LLM only after this structured explanation exists, and validate that it cannot alter numbers or claim constraints the engine did not report.

## Recommended Result Contract

A future solver response should include:

```json
{
  "status": "OPTIMAL",
  "inputHash": "sha256:...",
  "modelVersion": "railplan-cp-sat-v1",
  "constraintVersion": "constraints-v1",
  "strategy": "balanced",
  "solveMs": 184,
  "optimalityGap": 0,
  "objective": {
    "criticalScheduled": 8,
    "weightedCompletion": 0.96,
    "movementMinutes": 255,
    "emergencyInsertability": 0.75
  },
  "jobs": [],
  "unscheduled": [],
  "conflictsBefore": [],
  "conflictsAfter": [],
  "metrics": {},
  "alternatives": {},
  "explanations": []
}
```

Metric objects should include value, unit, numerator, denominator, and formula version. An unscheduled item should include the binding constraints or a minimum conflict set rather than only “no slot available.”

## Implementation Paths

### Path A: frontend-only mathematical MVP

This path preserves the accepted architecture.

1. Add immutable station, block, conflict-zone, resource-capacity, and compatibility data.
2. Expand every request sector into atomic block IDs.
3. Implement pure TypeScript interval, resource, window, dependency, travel, and buffer validators.
4. Derive the original conflict list and all metrics from data.
5. Implement stable priority ordering plus earliest-feasible insertion.
6. Add deterministic backtracking or local repair for the requests the greedy pass cannot place.
7. Run solving in a Web Worker so the dashboard remains responsive.
8. Validate the result independently before displaying it.
9. Generate alternatives by excluding the selected placement and re-running.

This is credible for a 22-request hackathon demo. It should be described as a deterministic heuristic unless the search proves optimality.

### Path B: CP-SAT optimisation service

This is the recommended strong version if a backend is approved.

1. Add a FastAPI service with Pydantic request and response models.
2. Model intervals, no-overlap, cumulative resource capacity, dependencies, optional jobs, and locks in OR-Tools CP-SAT.
3. Keep the independent TypeScript validator as a client-side and test oracle.
4. Solve the five strategies through versioned lexicographic objective profiles.
5. Return k-best diverse alternatives and structured explanation facts.
6. Cache by input hash, strategy, locks, and model version.
7. Enforce a solve time limit and return honest status/bound information.

This path changes the currently accepted frontend-only architecture and therefore requires an explicit decision plus updates to `ARCHITECTURE.md`, `API_CONTRACT.md`, `DATA_MODEL.md`, `TESTING.md`, `SECURITY_REVIEW.md`, and `DECISIONS.md` before implementation.

### Path C: MILP service

Use a MILP solver if cost accounting, linear penalties, and optimality gaps are more important than CP scheduling primitives. The data and UI contracts can remain the same. Benchmark CP-SAT and MILP on the same instance set rather than choosing by preference alone.

## Professional UI Direction

The current page already has a sensible hierarchy: plan context, strategy controls, four KPIs, request queue, timeline, and inspector. Keep that structure and improve evidence density.

### Add calculated trust signals

- Solver status: feasible, optimal, infeasible, or time-limited.
- Solve time, model version, and data timestamp.
- “Validated: 0 hard violations” from the independent checker.
- Objective values and exact delta from the original plan.
- A clear “simulated data” label until authoritative operational data exists.

### Make the map operational

- Add `Timeline` and `Network` views in the centre workspace rather than squeezing a tiny map below the request queue.
- Keep a small selection-context schematic in the inspector.
- Highlight exact blocks, adjacent exclusion zones, resources moving between jobs, and disruption reach.
- Use line colour only for rail identity; use red/amber for status overlays.
- Make map, request queue, timeline, and conflict inspector cross-filter one another.

### Show strategy trade-offs

Add a comparison drawer with a compact Pareto scatter plot:

- x-axis: weighted schedule movement;
- y-axis: weighted completion or risk;
- point size: emergency capacity;
- colour: strategy;
- label dominated schedules clearly.

The five strategy presets should remain because they are faster to understand than a wall of sliders. Advanced users can open a secondary panel to inspect weights and constraint versions.

### Improve the decision inspector

For a selected request, show:

1. requested and proposed placement;
2. feasibility badge from the validator;
3. exact binding constraints;
4. quantified impact deltas;
5. up to three validated alternatives;
6. lock, accept, reject, and audit history.

### Avoid “vibe-coded” presentation patterns

- Do not hardcode KPI deltas or claims such as “all constraints preserved.”
- Do not use a fake export success; either export a real JSON/CSV/PDF artefact or label it unavailable.
- Avoid unexplained precision such as a robustness value of 93 with no formula.
- Avoid 8px and 9px essential labels; use readable minimum text sizes and accessible tooltips.
- Avoid excessive badges, rounded containers, decorative gradients, and competing accent colours.
- Do not use colour as the only conflict signal.
- Keep one primary action per state: optimise, validate override, or replan.
- Show empty, infeasible, partial, time-limit, stale-data, and solver-error states explicitly.
- Keep planner overrides reversible and display when an override has made the plan invalid.

## Verification Plan

### Unit and property tests

- interval overlap boundary cases, including touching intervals;
- sector expansion into atomic blocks;
- adjacent-block exclusion;
- team and equipment capacity greater than one;
- safety buffers and dependencies;
- travel and setup time;
- time windows and handback;
- calculated KPI numerators and denominators;
- fixed-seed scenario reproducibility;
- explanation facts matching the detected rule.

Use generated/property tests to assert that any returned schedule has zero hard violations.

### Solver tests

- reproduce the six current original conflicts from raw placements;
- schedule all eight critical requests when feasible;
- preserve every locked placement or report infeasibility;
- return the same canonical result for the same input hash;
- report honest solver status and optimality gap;
- return a valid reason for every deferred request;
- ensure k-best alternatives are feasible and meaningfully different;
- validate every solver result with the independent rule engine.

### Scenario tests

- emergency fault insertion;
- named engineer/team unavailable;
- 45-minute overrun;
- shortened handback window;
- equipment failure;
- multiple simultaneous disruptions within the chosen robustness budget.

### UI tests

- changing strategy updates calculated, not hardcoded, deltas;
- selecting a block filters and highlights the same jobs everywhere;
- an invalid manual alternative is blocked and explained;
- lock changes are included in the next solve;
- metrics show formula/source tooltips;
- responsive UAT at 1280, 1440, and 1920 px;
- keyboard, focus, contrast, and non-colour status checks.

## Prioritised Delivery Plan

### P0 — Make the current demo mathematically honest

- atomic network graph for the six demo sectors;
- deterministic conflict engine;
- calculated conflicts and metrics;
- independent validation of every existing schedule fixture;
- dynamic KPI deltas and real export;
- tests for every hard constraint.

### P1 — Generate schedules

- CP-SAT service if backend approval is available, otherwise a frontend heuristic plus backtracking;
- five versioned objective profiles;
- solver status and audit metadata;
- real locks and validated alternatives;
- infeasibility explanations.

### P2 — Make geography and resilience real

- attributed station/rail GeoJSON snapshot;
- block-level network view and cross-filtering;
- team/equipment travel times;
- fixed disruption scenarios;
- calculated emergency insertability and robustness components.

### P3 — Add historical statistics

- planned-versus-actual history;
- duration percentiles by work type;
- P95 handback and CVaR metrics;
- reproducible Monte Carlo or scenario sampling;
- data quality, sample-size, and calibration views.

## Acceptance Criteria for Claiming “Automated Scheduling”

RailPlan may credibly claim automated deterministic scheduling when:

- conflicts are derived from raw requests and constraints;
- the tool produces at least one new feasible placement rather than selecting a hand-authored fixture;
- every returned schedule passes an independent validator;
- every KPI is calculated from documented formulas;
- locks participate in the solve;
- alternatives are verified feasible;
- infeasible and time-limited outcomes are represented honestly;
- the map uses the same block IDs as the solver;
- repeated identical inputs produce the canonical same result;
- automated tests cover all hard constraint classes.

Until then, the accurate product description remains “deterministic scheduling simulation.”

## Recommended First Implementation Decision

Start with P0 before adding a backend. It delivers the largest credibility gain with the least architectural disruption:

1. replace sector strings with atomic block references;
2. implement the pure conflict validator;
3. calculate the four headline KPIs and robustness components;
4. validate the current five fixture schedules and correct any hidden violations;
5. connect timeline and network-map highlights to the same block graph.

After P0 is green, benchmark a frontend heuristic against a small CP-SAT service on the 22-request dataset. Choose the solver deployment only after comparing feasibility, repeatability, solve time, and implementation cost.
