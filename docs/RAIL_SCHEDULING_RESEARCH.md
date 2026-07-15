# Research Papers for Deterministic Rail Maintenance Scheduling

Last updated: 2026-07-15

Status: Research evidence for proposed work. This document does not change the accepted frontend-only architecture or claim that any cited model is implemented.

## Purpose

This is an implementation-oriented research survey for RailPlan. It focuses on original research that can inform:

- conflict detection;
- possession and maintenance-window scheduling;
- engineer, crew, and equipment allocation;
- graph-based routing and map calculations;
- disruption replanning and robustness statistics;
- longer-term maintenance prioritisation.

The papers support a deterministic operations-research approach. None of the core RailPlan scheduling features requires generative AI.

## Recommended Reading Order

If the team only has time to read six papers, use this order:

1. [Railway track possession assignment using constraint satisfaction](https://doi.org/10.1016/S0952-1976(99)00025-1) — closest conceptual match to conflict handling, scarce resources, and hard versus relaxable constraints.
2. [Development of a maintenance possession scheduler for a railway](https://doi.org/10.7166/34-2-2750) — a recent, concrete mixed-integer model for microscopic short-horizon possession scheduling.
3. [Resource considerations for integrated planning of railway traffic and maintenance windows](https://doi.org/10.1016/j.jrtpm.2018.02.001) — crew bases, availability, maximum working hours, and rest constraints.
4. [Track maintenance production team scheduling in railroad networks](https://doi.org/10.1016/j.trb.2012.07.004) — time-space network modelling, crew travel, specialisation, and real-world side constraints.
5. [Integrated condition-based track maintenance planning and crew scheduling of railway networks](https://doi.org/10.1016/j.trc.2019.05.045) — graph routing, crew scheduling, chance constraints, and long-/short-term integration.
6. [Dynamic and robust timetable rescheduling for uncertain railway disruptions](https://doi.org/10.1016/j.jrtpm.2020.100196) — rolling-horizon stochastic replanning for uncertain disruption duration.

## Directly Applicable to the RailPlan MVP

### 1. Constraint satisfaction for track possessions

**Paper:** Cheung et al. (1999), [Railway track possession assignment using constraint satisfaction](https://doi.org/10.1016/S0952-1976(99)00025-1), *Engineering Applications of Artificial Intelligence*, 12(5), 599–611.

**Problem studied:** assigning railway tracks and scarce resources to scheduled maintenance tasks when the manual process relies heavily on experienced planners.

**Method:** constraint satisfaction with hard and relaxable constraints.

**Why it matters for RailPlan:**

- It is a direct precedent for separating non-negotiable safety rules from preferences that may be relaxed at a cost.
- It treats “no fully feasible answer” as a valid system outcome and searches for a useful best-available answer rather than hiding infeasibility.
- It supports structured conflict reasons, which map well to the existing conflict inspector.

**Implementation takeaway:** build the independent constraint validator first. Give every rule a stable ID, severity, observed value, required value, and relaxability flag.

### 2. Microscopic maintenance possession scheduling

**Paper:** Cillie and Bekker (2023), [Development of a maintenance possession scheduler for a railway](https://doi.org/10.7166/34-2-2750), *South African Journal of Industrial Engineering*, 34(2), 1–21.

**Problem studied:** scheduling maintenance possessions over a 24-hour microscopic railway model while limiting deviation to train services.

**Method:** mixed-integer linear programming, implemented and validated with CPLEX.

**Why it matters for RailPlan:**

- It validates MILP as a credible exact modelling family for short-horizon possession scheduling.
- The microscopic representation supports RailPlan's need to replace broad sector strings with atomic blocks.
- The objective of limiting service deviation is a model for future passenger or service-impact costs.

**Implementation takeaway:** use this paper to define block occupancy, possession timing, and service-impact terms. RailPlan can implement the equivalent logical model in CP-SAT or MILP.

### 3. Maximum satisfiability at national scale

**Paper:** Reisch, Großmann, and Weiß (2026), [A MaxSAT model for solving the track maintenance possession problem for the railway network in Germany](https://doi.org/10.1016/j.jrtpm.2026.100569), *Journal of Rail Transport Planning & Management*, 37, 100569.

**Problem studied:** assigning maintenance demands to predefined possession containers across Germany for a year while considering maintenance machines and traffic restrictions.

**Method:** a MIP formulation, an NP-hardness result, and a MaxSAT encoding for large instances.

**Why it matters for RailPlan:**

- It shows that predefined time containers, machines, and traffic restrictions can be encoded as weighted logical constraints.
- MaxSAT is a serious scaling alternative if the model becomes dominated by yes/no placement and compatibility decisions.
- It reinforces the need to report fulfilled demand against an upper bound rather than only a polished schedule.

**Implementation takeaway:** do not begin with MaxSAT for 22 jobs, but preserve clear Boolean constraint semantics so a future MaxSAT benchmark is possible.

### 4. Real deployment focused on worker safety

**Paper:** van Zante-de Fokkert et al. (2007), [The Netherlands Schedules Track Maintenance to Improve Track Workers' Safety](https://doi.org/10.1287/inte.1060.0246), *Interfaces*, 37(2), 133–142.

**Problem studied:** constructing a four-week schedule of working-zone closures with acceptable train changes and manageable nightly workload.

**Method:** a two-step mathematical scheduling process deployed by ProRail.

**Why it matters for RailPlan:**

- It treats working zones as the operational unit, which supports RailPlan's proposed `ConflictZone` model.
- It adds workforce safety and maximum nightly workload to the objective, not just asset completion.
- It is a useful example of human acceptance and operational deployment rather than only a synthetic experiment.

**Implementation takeaway:** include working-zone capacity and maximum workload per team/night as explicit constraints and metrics.

### 5. Maintenance resources, working hours, and rest

**Paper:** Lidén, Kalinowski, and Waterer (2018), [Resource considerations for integrated planning of railway traffic and maintenance windows](https://doi.org/10.1016/j.jrtpm.2018.02.001), *Journal of Rail Transport Planning & Management*, 8(1), 1–15.

**Problem studied:** coordinating train-free maintenance windows with crews assigned to bases, maximum daily work, and minimum rest.

**Method:** mixed-integer linear programming.

**Why it matters for RailPlan:**

- It provides direct modelling ideas for the problem statement's engineer-availability requirement.
- Crew bases connect the scheduler to the network graph and travel-time matrix.
- Working-hour and rest rules prevent “available” from being represented as a single Boolean.

**Implementation takeaway:** model availability as capacity across time, then add maximum shift duration, minimum rest, skill, base, and travel constraints.

### 6. Combined maintenance works and crews

**Paper:** [Combined Optimization of Maintenance Works and Crews in Railway Networks](https://doi.org/10.3390/app131810503) (2023), *Applied Sciences*, 13(18), 10503.

**Problem studied:** jointly selecting/scheduling maintenance works and allocating crews on a railway network.

**Method:** mathematical optimisation combining the possession and crew decisions.

**Why it matters for RailPlan:** it supports solving placement and crew allocation together. A schedule that places work first and assigns engineers afterward can be infeasible even when every track interval looks valid.

**Implementation takeaway:** include crew assignment inside the solver model or use a decomposition loop that rejects a work plan when the crew subproblem is infeasible.

## Integrated Train Traffic and Maintenance Windows

RailPlan's current overnight prototype assumes service has stopped. These papers become important if the product later models partial closures, late-night trains, test trains, or service impact.

### 7. Integrated traffic and network maintenance

**Paper:** Lidén and Joborn (2017), [An optimization model for integrated planning of railway traffic and network maintenance](https://doi.org/10.1016/j.trc.2016.11.016), *Transportation Research Part C*, 74, 327–347.

**Method:** a mixed-integer model with spatial and temporal aggregation.

**RailPlan takeaway:** treat trains and maintenance as competing for the same capacity. Spatial/temporal aggregation is a practical way to control model size before moving to microscopic detail.

### 8. Maintenance slots represented as virtual trains

**Paper:** Luan et al. (2017), [Integrated optimization on train scheduling and preventive maintenance time slots planning](https://doi.org/10.1016/j.trc.2017.04.010), *Transportation Research Part C*, 80, 329–359.

**Method:** a network flow formulation that represents preventive maintenance slots as virtual trains, solved through Lagrangian relaxation.

**RailPlan takeaway:** a possession can be modelled as another capacity-consuming path through the time-space network. This unifies map blocks, train capacity, and maintenance occupancy.

### 9. Real-line case study and sensitivity analysis

**Paper:** Lidén (2020), [Coordinating maintenance windows and train traffic: a case study](https://doi.org/10.1007/s12469-020-00232-2), *Public Transport*, 12, 261–298.

**Method:** MILP applied to a 913 km single-track line with real traffic patterns, followed by cost-sensitivity analysis.

**RailPlan takeaway:** strategy comparisons should include sensitivity to cost/weight settings. A “balanced” solution is not universal; the UI should show when small weight changes materially change the plan.

### 10. Stochastic, bi-objective traffic and maintenance scheduling

**Paper:** [Integrated stochastic optimization approaches for tactical scheduling of trains and railway infrastructure maintenance](https://doi.org/10.1016/j.cie.2017.12.010) (2019), *Computers & Industrial Engineering*, 127, 1315–1335.

**Method:** stochastic MILP, bi-objective optimisation, and Pareto-solution comparison.

**RailPlan takeaway:** the five strategy presets can be generated from a non-dominated set rather than arbitrary weight bundles. This directly supports a professional Pareto comparison chart.

## Crew Routing, Geography, and Map Mathematics

### 11. Time-space network for production teams

**Paper:** Peng et al. (2012), [Track maintenance production team scheduling in railroad networks](https://doi.org/10.1016/j.trb.2012.07.004), *Transportation Research Part B*, 46(10), 1474–1488.

**Problem studied:** assigning specialised maintenance teams to projects across a network while considering travel, seasonal effects, mutual exclusion, precedence, and other real-world side constraints.

**Method:** a time-space network plus multi-neighbourhood search and MIP subproblems.

**Why it matters for RailPlan:**

- It connects time, geography, team skill, and job sequencing.
- It treats team travel as an important cost and feasibility condition.
- It demonstrates why the map should be an input to scheduling rather than a decorative output.

**Implementation takeaway:** precompute block-to-block travel times and represent a team's possible transitions as time-space arcs.

### 12. Arc routing for maintenance crews

**Paper:** [Optimal scheduling of track maintenance activities for railway networks](https://doi.org/10.1016/j.ifacol.2018.07.063) (2018), *IFAC-PapersOnLine*, 51(9), 386–391.

**Method:** variants of the Capacitated Arc Routing Problem with fixed costs.

**RailPlan takeaway:** track work occurs on edges, not just at station points. This is a strong mathematical reason to model track blocks as graph edges and crew movement as an arc-routing problem.

### 13. Job clustering before detailed scheduling

**Paper:** Peng et al. (2014), [Optimal Clustering of Railroad Track Maintenance Jobs](https://doi.org/10.1111/mice.12036), *Computer-Aided Civil and Infrastructure Engineering*, 29(4), 235–247.

**Method:** mixed-integer programming with vehicle-routing-style side constraints and integrated heuristics.

**RailPlan takeaway:** large sets of nearby compatible jobs can be grouped before detailed nightly scheduling. The map can explain clusters through shared corridor, crew, and setup savings.

## Long-Term Preventive and Condition-Based Planning

These papers answer “which jobs should be requested?” The short-horizon RailPlan solver then answers “where and when can they be performed?”

### 14. Grouping routine work and unique projects

**Paper:** Budai, Huisman, and Dekker (2006), [Scheduling preventive railway maintenance activities](https://doi.org/10.1057/palgrave.jors.2602085), *Journal of the Operational Research Society*, 57(9), 1035–1044.

**Method:** mathematical programming plus fast greedy heuristics for routine activities and unique projects.

**RailPlan takeaway:** combine compatible tasks to reduce repeated possession cost, while preserving maximum intervals between routine maintenance actions.

### 15. Limited possession time

**Paper:** Dao, Basten, and Hartmann (2018), [Maintenance scheduling for railway tracks under limited possession time](https://doi.org/10.1061/JTEPBS.0000163), *Journal of Transportation Engineering, Part A: Systems*, 144(8), 04018039.

**Method:** optimisation of maintenance timing under explicit track-access limits.

**RailPlan takeaway:** possession minutes are a scarce capacity budget. The KPI layer should report both work completion and consumed/remaining block-minutes.

### 16. Deterioration, safety, and network cost

**Paper:** Zhang, Andrews, and Wang (2013), [Optimal Scheduling of Railway Track Maintenance on a Railway Network](https://doi.org/10.1002/qre.1381), *Quality and Reliability Engineering International*, 29, 285–297.

**Method:** network maintenance optimisation considering uncertain deterioration, safety, replacement life loss, maintenance cost, and travel cost, solved with an enhanced genetic algorithm.

**RailPlan takeaway:** priority should eventually be derived from asset risk and lifecycle impact rather than manually labelled `low` through `critical` alone.

### 17. Tamping as a binary optimisation problem

**Paper:** Vale, Ribeiro, and Calçada (2012), [Integer Programming to Optimize Tamping in Railway Tracks as Preventive Maintenance](https://doi.org/10.1061/%28ASCE%29TE.1943-5436.0000296), *Journal of Transportation Engineering*, 138(1).

**Method:** mixed 0–1 linear programming with technical track-maintenance constraints.

**RailPlan takeaway:** work-type-specific engineering rules should live in versioned constraint templates rather than generic UI copy.

### 18. Predicted condition feeding the schedule

**Paper:** Sedghi et al. (2022), [Data-driven maintenance planning and scheduling based on predicted railway track condition](https://doi.org/10.1002/qre.3166), *Quality and Reliability Engineering International*, 38, 3689–3709.

**Method:** condition prediction connected to planning and scheduling.

**RailPlan takeaway:** maintain a clean boundary between risk/condition scoring and the exact scheduler. Predicted condition proposes urgency; it does not waive hard possession and resource constraints.

## Robustness and Disruption Replanning

### 19. Buffer allocation against stochastic disturbances

**Paper:** [Stochastic improvement of cyclic railway timetables](https://doi.org/10.1016/j.trb.2007.11.002) (2008), *Transportation Research Part B*.

**Method:** stochastic optimisation of time supplements and buffer allocation.

**RailPlan takeaway:** buffer time is an allocatable resilience resource. Robustness should therefore be calculated from where slack exists and what disturbances it can absorb, not entered as a hand-authored score.

### 20. Rolling-horizon replanning under uncertain duration

**Paper:** Zhu and Goverde (2020), [Dynamic and robust timetable rescheduling for uncertain railway disruptions](https://doi.org/10.1016/j.jrtpm.2020.100196), *Journal of Rail Transport Planning & Management*, 15, 100196.

**Method:** rolling-horizon two-stage stochastic rescheduling.

**RailPlan takeaway:** disruption response should re-solve as information changes. Keep a frozen near-term horizon and a flexible later horizon, rather than repeatedly moving every job.

### 21. Condition planning and crew scheduling with probabilistic guarantees

**Paper:** Su et al. (2019), [Integrated condition-based track maintenance planning and crew scheduling of railway networks](https://doi.org/10.1016/j.trc.2019.05.045), *Transportation Research Part C*.

**Method:** chance-constrained model predictive control at the planning layer, decomposition for scale, and a capacitated arc-routing crew subproblem.

**RailPlan takeaway:** this is the strongest single reference for a future multi-layer system: risk determines desired interventions, then the crew/possession layer proves whether they are executable and feeds infeasibility back to planning.

## Research-to-Feature Matrix

| RailPlan feature | Most useful papers | Mathematical idea |
| --- | --- | --- |
| Detect and explain conflicts | Cheung et al. (1999); Cillie & Bekker (2023) | Constraint provenance, interval/block capacity, hard versus relaxable rules |
| Five schedule strategies | Cillie & Bekker (2023); integrated stochastic optimisation (2019) | Lexicographic MILP/CP-SAT and Pareto solutions |
| Engineer availability | Lidén et al. (2018); Peng et al. (2012) | Shift/rest constraints, skill assignment, time-space network |
| Equipment conflicts | Reisch et al. (2026); Peng et al. (2012) | Machine assignment and capacity constraints |
| Map and team travel | Peng et al. (2012); optimal arc routing (2018); Su et al. (2019) | Weighted rail graph, time-space arcs, capacitated arc routing |
| Work compatibility and zones | Cheung et al. (1999); van Zante-de Fokkert et al. (2007) | Conflict zones, hard/soft compatibility rules |
| Validated alternatives | Cheung et al. (1999); CP/MILP possession models | Re-solve with exclusions and ranked soft costs |
| Disruption response | Zhu & Goverde (2020); Su et al. (2019) | Rolling horizon, scenarios, chance constraints |
| Robustness KPI | stochastic timetable improvement (2008); integrated stochastic optimisation (2019) | Buffer allocation, scenario loss, Pareto robustness |
| Long-term request priority | Budai et al. (2006); Zhang et al. (2013); Sedghi et al. (2022) | Preventive intervals, deterioration risk, lifecycle cost |

## Suggested RailPlan Experiments Based on the Literature

### Experiment 1: solver comparison

Compare three implementations on the same 22-request input:

- stable priority greedy plus repair;
- CP-SAT;
- MILP or MaxSAT only if time permits.

Measure feasibility, weighted completion, moved minutes, emergency insertability, solve time, status/bound, and repeated-run determinism.

### Experiment 2: hard and relaxable rules

Create instances where no perfect schedule exists. Compare:

- mandatory hard safety rules;
- deferrable work;
- preferred versus prohibited resource assignments;
- maximum acceptable schedule movement.

The UI should report which soft rule was relaxed and why.

### Experiment 3: graph-aware resources

Replace sector-string equality with atomic blocks and team travel. Test whether schedules that appeared valid become infeasible when:

- sectors partially overlap;
- adjacent isolation zones interact;
- one team cannot reach the next job in time;
- one maintenance vehicle must traverse the network.

### Experiment 4: Pareto strategies

Generate a set of non-dominated schedules using completion, movement, and emergency capacity. Check whether the current five hand-authored strategies correspond to genuinely different Pareto points.

### Experiment 5: robustness calibration

Run the four current disruptions as a fixed scenario set. Calculate:

- scenarios absorbed without moving critical work;
- expected and worst-case moved minutes;
- deferred priority value;
- P95 or scenario-maximum handback overrun;
- resource bottlenecks.

Compare these outputs with the current hand-authored robustness values.

## Evidence Boundaries

- Most papers use freight, national, high-speed, or regional rail cases. Their mathematical structures transfer, but their parameter values and safety rules do not.
- No paper replaces LTA-specific possession, isolation, competency, and engineering-hour rules.
- Some links expose abstracts while full text may require institutional access. The DOI is included so the team can retrieve the version of record through a library.
- Published performance results are not promises for RailPlan. Benchmark the actual 22-request model and any later LTA-scale instance.
- “AI” in an older journal title does not imply that the paper uses generative AI; the 1999 constraint-satisfaction work is symbolic and rule-based.

## Recommended Research Decision

Use CP-SAT as the first strong implementation, but design the domain model around solver-independent constraint facts. Benchmark against a simple greedy baseline, and retain the independent TypeScript validator.

That recommendation synthesises the most transferable findings from the papers:

- hard and relaxable rules must be explicit;
- track blocks, crews, equipment, time, and travel should be modelled together;
- infeasibility is a legitimate result that needs an explanation;
- exact methods are suitable at small scale, while decomposition, MaxSAT, and neighbourhood search are scaling options;
- resilience should be measured through buffers and scenarios;
- maps become operational when requests and resources use the same network graph.
