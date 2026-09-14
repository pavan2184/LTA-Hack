# RailPlan: maintenance scheduling and product priorities

Research baseline: checkout `aa7395f`, reviewed 2026-09-09. The first priority
was subsequently implemented locally; see [current status](PROJECT_STATUS.md) for
verification. The implementation review below retains its original baseline.

Participant-pack update (2026-09-15): [event context](NEBULAX_PARTICIPANT_CONTEXT.md)
now supplies attendance and PS1 submission requirements. The required video is
2–3 minutes; the five-minute narrative below is an internal rehearsal, not the
submission format. This dated research does not override those requirements.

## Recommendation

RailPlan should concentrate on one complete planner decision: identify why requested work cannot coexist, compare feasible changes, preserve commitments, and publish the chosen version to the people affected. Its strongest near-term opportunity is to connect its existing conflict-resolution engine to its durable planning workflow.

The credible pilot path is to validate the operating model and input data with an operator, then measure performance in shadow planning. A larger language model, a more elaborate map, or a replacement solver cannot compensate for incorrect possession boundaries or unavailable resources.

This is a product recommendation, not evidence that Singapore operators will adopt the tool. The comparison below supports the importance of coordination, resource constraints and traceable decisions; interviews and replay data must establish the local opportunity. Recommendations are proposals and do not change the accepted architecture or existing numbered issue order.

## 1. NebulaX challenge index

The user-supplied [challenge framing and PS1 excerpt](NEBULAX_PARTICIPANT_CONTEXT.md#challenge-framing-and-ps1-source-excerpt)
is preserved separately, including ageing assets, workforce change and the manual
coordination problem. Added 2026-09-15; distinct from the dated site research below.

The official site identifies PS1 as maintenance scheduling. Its problem is competition for limited engineering access, with sector availability, work compatibility and engineer availability creating coordination work. The requested capabilities are conflict detection, clear warnings, alternatives and automated scheduling. The listed possible inputs are “MRT stations locations API” and “Key Considerations for Planning.” Neither label links to a dataset or document in the inspected page HTML.[^1]

| Site section | Relevant information | Product implication |
| --- | --- | --- |
| PS1, `#ps-1` | Maintenance request scheduling | Make the request-to-resolution journey the demonstration |
| PS2 | Commuter disruption support | Passenger routing is a separate challenge |
| PS3 | Predictive fault detection | Asset prediction is a separate upstream problem |
| FAQ | Technical execution, problem fit, ease of use and real-world impact are judging criteria | Demonstrate a working decision and measurable evidence |
| Event schedule | Event: 18–20 September 2026; submission: 19 September, 16:00 | Prepare a reproducible demo and failure case |

Source: official event page; checked 9 September 2026. No numerical judging weights or detailed PS1 planning rules were provided in the inspected page.[^1]

The missing planning considerations are the most valuable next organizer input. They could materially change the meaning of a conflict, permitted alternatives and the demonstration dataset. The public wording does not establish a universal overnight window, a safety separation distance, or whether jobs may share a possession.

## 2. The problem to model

The scheduling unit is a maintenance activity consuming specific resources over time within an authorized access arrangement. A station name is insufficient. Two requests with different endpoint labels may share a track segment; jobs on separate segments may still compete for an isolation, machine or specialist team.

Network Rail describes engineering access in terms of location, dates and duration. Its separate access-efficiency challenge also identifies access points, setup and pack-up as material to useful possession time. These are useful domain precedents, not Singapore operating rules.[^2][^3] Locally, LTA's February 2026 reliability announcement identifies the need for additional engineering access, including longer closures when required. Therefore, optimizing existing time cannot be assumed to eliminate every capacity shortage.[^4]

### Working user and workflow hypotheses

| Actor | Decision or responsibility to validate |
| --- | --- |
| Maintenance requester or contractor | Describe the work, acceptable windows, dependencies and required resources |
| Access planner | Reconcile competing requests and choose a feasible plan |
| Resource owner | Confirm actual availability and permitted substitutions |
| Access or isolation authority | Confirm relevant access conditions and release requirements |
| Delivery lead | Report readiness, actual progress and expected completion |

These roles may be combined or named differently by the participating operator. RailPlan currently implements planner and contractor roles; a pilot should discover responsibilities before introducing more permissions.

The proposed workflow is:

`Request → completeness review → conflict assessment → compare fixes → planner decision → published version → acknowledgement → progress and handback feedback`

Completeness and feasibility are different. An incomplete isolation requirement is an unknown, not evidence that no isolation conflict exists. A complete, valid request may still be impossible to schedule. A published plan records a planning decision; operational permission to enter or start work belongs to the operator's separate process.

### Constraint checklist for operator validation

| Constraint | Example of the question the model must answer | Treatment |
| --- | --- | --- |
| Spatial occupancy | Do requests occupy the same physical track, direction or protected area? | Hard constraint using authoritative boundaries |
| Work compatibility | Can the specific methods coexist under these conditions? | Explicit rules, including conditional permissions |
| Access and isolation | Are the required protection and power states compatible? | Hard conditions and relevant time intervals |
| Workforce | Are enough appropriately capable crews available throughout the job? | Capacity, skills and assignment constraints |
| Equipment | Is the required machine available, including transfer and turnaround? | Capacity and transition constraints |
| Sequence | Must another activity finish, clear or be inspected first? | Dependencies and minimum lags |
| Time | Does the complete access/work/release envelope fit? | Hard bounds; distinguish work duration from occupation |
| Commitment | Which approved placements may move, and until when? | Locks or an agreed freeze policy |
| Prioritization | Which optional task should be deferred if all work cannot fit? | Explicit soft objective and visible consequences |

This checklist is a proposed discovery instrument. Its detailed parameters are not established by the event website.

### Illustrative planning example

Assume a fabricated access window of 01:00–04:00. Job A requires 15 minutes of setup, 60 minutes of work and 15 minutes to clear. Its resource occupation is 90 minutes even though its productive work is 60 minutes. Job B requiring the same resource cannot simply begin when A's productive work ends.

If A runs late, a useful response identifies the affected jobs, tests a revised schedule, preserves unaffected commitments and shows any resulting deferral. A warning alone leaves the planner with the coordination work. These times illustrate the model only; they are neither measured RailPlan output nor an LTA rule.

## 3. What RailPlan already does

The assessment uses local checkout `aa7395f`, the current project brief/status and selected implementation paths. It is a source review, not a fresh runtime acceptance test. Older audit documents contain historical statements such as “no export”; those are superseded by the current implementation and status.[^R]

| Capability | Evidence in the current project | Assessment |
| --- | --- | --- |
| Detect spatial and resource conflicts | `packages/core/src/engine/validate.ts`; atomic blocks and resource facts | Already central to the product |
| Generate and validate plans | `packages/core/src/engine/solve.ts` | Deterministic insertion with bounded repair; retain the validator |
| Explain and offer repairs | `engine/explain.ts`, `alternatives.ts`, `resolutions.ts` | Reuse this work instead of designing another suggestion engine |
| Anonymous staffing | Workforce demand/supply model and assessment | Already implemented; not equivalent to individual crew assignment |
| Contractor intake and review | Request revisions, planner approval and private proposals | Already provides a foundation for collaboration |
| Durable planning | `src/lib/plans`, immutable snapshots and publication checks | Strong basis for reproducible decisions |
| Exports and scoped delivery | Saved JSON/CSV and notification workflow | Already implemented; delivery is distinct from acknowledgement |
| Geography | Local station snapshot, explicitly presentation-only | Useful orientation, not operational topology |
| Verification | Current status records 582 tests, DB/concurrency and HTTP checks | Historical recorded results, not tests rerun for this report |

### The most actionable gap: decision tools and publication are separated

The saved workspace generates from approved inputs, reviews immutable plans and publishes them. However, its generation call in `SavedPlansWorkspace.tsx:65` sends `locked: []`. The durable API and service already support pins, while interactive repairs and alternatives remain in the sandbox workflow.[^R]

That means the prototype has valuable capabilities on both sides of a missing product connection. The recommended improvement is a saved planning journey where a planner can inspect a conflict, compare validated proposals, commit a choice and create a new immutable version. It should operate on the approved database instance, not accidentally fall back to the sandbox's literals.

### Limits that matter to a pilot

The current request model fixes the team assignment; it does not choose substitute crews. Travel validation explicitly applies only to teams with capacity one. Aggregate capacity therefore cannot prove that each crew can physically reach its next job. Anonymous crew identifiers could eventually support routes without collecting named-worker records, if the operator needs that level of assignment.[^R]

The model has work duration and post-work clearance, but does not separately represent a complete setup, isolation and release lifecycle. Its conflict zones enforce a simple capacity rule; operator-approved shared access and power-state compatibility may need richer facts. Whether that extra model is necessary depends on actual planning rules.

Two output labels need scrutiny before a stronger product claim. The heuristic can emit `OPTIMAL` when all considered jobs receive first-choice slots; this is not a general solver optimality certificate. It also emits `INFEASIBLE` when mandatory work remains unplaced after bounded search, which need not prove no feasible plan exists. Distinguish an invalid candidate, no feasible plan found by this search, and proven infeasibility. Likewise, the current “minimum risk” profile expresses buffer preferences, not an independently calibrated safety-risk estimate.[^R]

The project already records unresolved geography permission concerns, incomplete actual spoken-screen-reader/200% workflow verification, and unverified live AI/Telegram provider success. These are existing release evidence limits, not newly discovered legal conclusions.[^R]

## 4. Industry comparison

The comparison separates direct rail access systems, general maintenance software and adjacent port coordination. A vendor's public feature description establishes what it advertises; it does not establish implementation quality or Singapore adoption.

| System | Publicly supported capabilities | Lesson for RailPlan | Evidence limit |
| --- | --- | --- | --- |
| **Tracsis / NR RailHub** | Work packs, line blockage tooling and a shared access register | Access context and consistent information belong beside the schedule | Vendor account of a named Network Rail implementation; not proof of autonomous optimization[^5] |
| **Network Rail PodFlo and Railworks** | Possession delivery workflows, offline capability, field access to project data, end-of-shift reporting and change requests | Close the loop between planning and delivery | Operator-published regional programme; some progress features are described as forthcoming[^6] |
| **IBM Maximo Manage / Optimizer** | Resource availability, scenario comparison, resource leveling, short-term labor/crew and spatial assignment | Work readiness and resource constraints are established product expectations | Official documentation; capabilities vary with application and optimizer installation[^7][^8] |
| **Portchain Quay** | Berth, crane and gang planning; scenarios; delay warnings; sharing and integration | Compare changes with their resource consequences, and keep stakeholders on the same plan | Vendor product description; no RailPlan benefit estimate can be inferred[^9] |
| **PortXchange Synchronizer** | Shared port-call schedules, milestone notifications and warnings about expected delays | Treat progress changes as planning inputs, not merely notification messages | Vendor case study for Algeciras[^10] |
| **Singapore digitalPORT@SG JIT platform** | Port-resource coordination; MPA reports more than 150 participating users/providers in its March 2026 announcement | A locally relevant example of coordinating multiple resource owners | Authority report, but marine workflows differ from rail possessions[^11] |
| **KONUX Network** | Network usage insights to inform inspection and maintenance-access planning | Condition and usage intelligence can feed request prioritization upstream | Does not establish a direct replacement for short-horizon conflict scheduling[^12] |
| **Trimble Tilos** | A combined time-and-distance representation for linear infrastructure planning | Consider a time–location view only if it explains conflicts better than the existing block Gantt | Official help says maintenance ended 1 March 2026; a design reference, not a new dependency recommendation[^13] |

There is no supported basis here for claiming RailPlan is the first rail scheduler or that incumbents lack conflict detection. The proposed differentiation is narrower: explain a specific conflict and its trade-offs clearly, then carry the agreed change through the existing approval/publication workflow with little planner effort.

Vendor outcome percentages were deliberately excluded from the product business case. Different baselines, implementation scope and work practices make them unsuitable forecasts for RailPlan.

## 5. What to borrow from ports and shipping

### Shared time semantics

DCSA Port Call 2.0 distinguishes estimated, requested, planned and actual event times, including negotiation between parties before a time is confirmed. It is an interoperability standard, not scheduling software.[^14]

For RailPlan, the transferable principle is to distinguish what a contractor requested, what the planner proposed, what the relevant party confirmed, and what happened. This is an adaptation: RailPlan's existing use of “requested” need not match DCSA's actor-specific definition. Do not implement the entire maritime standard to obtain clearer state semantics.

### Resource coordination

| Port planning concept | Rail planning analogue | Important difference |
| --- | --- | --- |
| Berth location and occupancy | Worksite/track access and occupation | Rail protection boundaries may extend beyond the worksite |
| Crane and gang availability | Equipment and maintenance crews | Railway competencies and access permissions require their own rules |
| Readiness of pilotage/towage services | Readiness of access arrangements and supporting teams | An accepted schedule cannot grant rail access authority |
| Estimated completion updates | Job overrun and predicted clearance | Handback conditions may require verification beyond completion |
| Revised berth plan | New maintenance plan version | Existing accepted or active work may be immovable |

The analogy supports shared status and coupled resources. It does not justify copying port constraints or claiming that berth optimization automatically solves rail scheduling.

### Progress and acknowledgement

Separate “published,” “notification delivered,” “contractor acknowledged” and “work authorized.” A successful Telegram send proves none of the latter two. For a pilot, a version-specific acknowledgement and a structured inability-to-comply response may remove more coordination work than another chat interface.

Collect actual start, completion, clearance and reasons for deviation only where the delivery process supports reliable entry. PortXchange illustrates milestone-based warning and coordination, while Network Rail's programme illustrates field workflows and reporting.[^10][^6] Start with a few useful events; add offline synchronization only if field use is in scope.

## 6. Data needed

LTA DataMall lists a Train Station location dataset, station exits, train line codes and a GTFS train schedule API. Its station-location catalogue entry describes geographic points; it does not promise maintenance possessions or isolation boundaries.[^15] Public geography is appropriate for orientation and identifiers. It cannot establish engineering access merely because passenger service is absent.

| Input | Minimum useful content | Likely source / current position |
| --- | --- | --- |
| Request set | IDs, work methods, duration, allowed window, priority/deadline, dependencies and revision | Existing intake plus anonymized operator examples |
| Access windows | Night/date, allowed track limits, start, required release time and exceptions | Organizer planning notes or operator; demo is fabricated |
| Topology | Directed track/block identities, boundaries, access points and relevant adjacency | Operator-approved extract; station coordinates are insufficient |
| Compatibility | Allowed/prohibited combinations and conditional requirements | Engineer-reviewed rule table |
| Isolation/protection | Required states, affected areas, establishment and release durations | Relevant authority; not present in public station data |
| Workforce | Team/crew capabilities, availability and transition requirements | Aggregate supply exists; assignment detail must be validated |
| Equipment | Units, reservations, location and turnaround | Resource owner |
| Commitments | Accepted version, movable/fixed jobs and change deadline | Existing versions/pins plus an agreed workflow |
| Execution evidence | Actual times, overruns, cancellation and deferral reasons | Shadow-pilot records; unavailable as a validated training set |

The first request to the domain mentor should be a small anonymized planning pack: requests, the final agreed schedule, the reasons for its major changes, and the relevant constraint definitions. Several nights with different bottlenecks are more informative than a large unlabelled station dataset.

Keep source owner, revision, effective period and known gaps with the inputs. Missing hard facts should produce “needs clarification,” not be silently filled by AI. Use fabricated inputs visibly until a domain owner validates them. The existing geographic-source permission issue must be settled separately before treating that snapshot as cleared for redistribution.[^R]

## 7. Scheduling approach

Keep the present separation between factual inputs, deterministic validation, search and language explanation. Cillie and Bekker's 2023 study models microscopic possession scheduling with mixed-integer programming over a 24-hour horizon, supporting the relevance of explicit constrained optimization. Its published abstract describes a specific South African case; neither its runtime nor its results predict RailPlan performance.[^16]

A CP-SAT benchmark is useful as an experiment, not a prerequisite for the next UI improvement. Compare it with the current heuristic on exactly the same inputs and independently validate both outputs. Use the same candidate-time resolution and constraints first; otherwise an apparent quality improvement may simply be a different problem definition.

Measure mandatory work placed, priority-weighted completion, changes relative to the agreed baseline, runtime and unresolved work. Record solver bounds and termination reasons where available. A timeout with a valid incumbent is different from proof of infeasibility. Keep the existing heuristic unless the benchmark finds a material benefit worth the additional deployment burden.

For replanning, the baseline matters: today's “minimum changes” strategy penalizes movement from request preferences. A stable repair of a published schedule needs to penalize movement from that published version and preserve appropriate commitments. Those are different optimization questions.[^R]

Generative AI remains useful for reviewed request extraction and readable explanations. It should not infer undocumented operating rules, relax constraints or assign authority. The existing numeric grounding check is useful but cannot establish the semantic truth of every sentence; rule-backed explanations should remain inspectable.[^R]

## 8. Prioritized product work

Priority is an analytical judgment based on challenge fit, the existing implementation and the evidence above. These are proposed focus areas, not newly authorized implementation issues.

| Priority | Improvement | Smallest complete result | Acceptance evidence |
| --- | --- | --- | --- |
| **1** | Connect conflict resolution to saved planning | Inspect approved inputs, request validated alternatives, preserve chosen pins and save a successor version | Contractor revision → conflict → accepted alternative → saved version → publication → reload retains the exact choice |
| **2** | Explain the whole change | Before/after times, binding rule, affected requests, displaced work and remaining blockers | A locally attractive move that creates a remote resource conflict is rejected; an impossible case remains explicit |
| **3** | Establish model credibility | Obtain planning notes, validate one corridor's rule/data pack and make unknowns visible | Engineer-reviewed examples agree with the validator; missing critical data blocks a complete assessment |
| **4** | Demonstrate stable disruption repair | Replan one late job or unavailable resource against a prior version | Locked work remains fixed; all changes and deferrals are named; result is revalidated |
| **5** | Close acknowledgement and feedback | Version-specific response plus a few actual progress events | Superseded acknowledgements cannot imply acceptance of the current version |
| **6** | Benchmark search and assignment | Compare existing solver with CP-SAT; assess anonymous crew routing if needed | Shared test instances, equal constraints, objective comparison and explicit search status |

Priorities 1–2 form the strongest demonstration improvement. Priority 3 is essential to a credible pilot and should proceed as domain discovery alongside demonstration preparation. Priority 4 can use a clearly fabricated scenario first; live execution is a separate scope. Preserve the existing #17 release gates and bring any proposed reordering of #18–#21 to the next product decision.

Do not expand into predictive fault detection, a national digital twin, a large connector catalogue or named-worker management without evidence that it unblocks the core journey. Grouping compatible jobs into shared possessions may eventually save setup effort, but requires explicit operator-approved compatibility and protection semantics first.

## 9. Demonstration and evaluation

### Proposed five-minute internal rehearsal

1. Present a small fabricated request set with a shared block, a scarce equipment conflict and a workforce shortage.
2. Select a conflict; show the exact interval, affected work and violated rule.
3. Compare two feasible changes, including movement and any displaced optional work. Show a rejected candidate and its reason.
4. Preserve a planner commitment, create the chosen saved version and reload it.
5. Publish and show the contractor's scoped schedule for that same version.
6. Introduce one disruption and explain what can be repaired and what cannot.

This is a target narrative. The saved repair connection and any new stable-replanning behavior must be implemented and verified before being presented as working. The existing sandbox can demonstrate its own capabilities, provided it is identified as separate from persisted approvals.

### Evidence to collect

| Measure | Definition and interpretation |
| --- | --- |
| Missed material conflicts | Engineer-labelled conflicts absent from system output; investigate every miss |
| Unhelpful alerts | Alerts judged irrelevant or duplicated, divided by reviewed alerts; group by underlying cause |
| Time to agreed plan | Active planner time plus separately reported coordination waiting time |
| Mandatory completion | Mandatory requests scheduled / mandatory requests submitted; never omit deferred work |
| Schedule churn | Number of changed placements and total absolute movement from the agreed baseline |
| Useful work / access occupation | Productive duration and reserved occupation reported separately; avoid double-counting shared access |
| Replanning performance | Feasibility, changes, remaining blockers and latency on the same disruption cases |
| Planner acceptance | Accepted proposals / reviewed proposals, with rejection reasons |

The current “planner time saved” metric assumes 12 minutes per manually resolved conflict. Retain its estimate label until observed sessions support a measured comparison.[^R] Do not translate “zero violations against demo rules” into “safe for operational use.”

For a shadow pilot, use a small set of anonymized historical nights plus held-out cases. Freeze each case's information to what was known at planning time to avoid hindsight advantages. Compare manual planning and RailPlan on the same facts, include difficult and impossible cases, and have planners review disagreements. A proposed pilot gate is zero unexplained misses in the agreed hard-rule cases, faster observed reconciliation, and complete decision traceability; this is a target, not an achieved result or safety certification.

## 10. Questions that determine the next build

| Ask the domain mentor | Why the answer changes the product |
| --- | --- |
| Can we obtain the “Key Considerations for Planning” and one anonymized request-to-final-plan example? | Establishes the actual rules and workflow |
| What are the three most common reasons a request gets moved or rejected? | Selects the highest-value constraints and demo cases |
| Is access described by stations, chainage, track direction, electrical sections or worksite boundaries? | Determines the correct scheduling unit |
| Can compatible work share access or isolation, and under whose approval? | Determines whether the current zone capacity model is sufficient |
| Which preparation and release activities consume crews, equipment and access time? | Determines whether phase-specific resource intervals are necessary |
| Are crews assigned by the scheduler or confirmed by another team? | Determines whether crew substitution/routing belongs in scope |
| What becomes fixed after agreement, and how are urgent changes handled? | Determines locks, baseline stability and acknowledgements |
| Which input systems and exports are actually used? | Avoids building unsupported integrations |
| What is the current elapsed and active planning time? | Establishes a defensible benefit baseline |
| Can the prototype run in shadow mode against several real planning nights? | Establishes a practical validation path |

A good focus decision after these answers is specific: one corridor, one planning horizon, a named set of resource/compatibility rules, one agreed handoff and an observable reduction in reconciliation effort.

## Sources and evidence notes

External sources were checked on 9 September 2026. Undated pages are marked accordingly. Public product descriptions do not establish current deployment inside LTA, SMRT or SBS Transit. No operator interview, commercial trial, pricing comparison or procurement assessment is represented here. IBM's indexed official documentation was available, but the direct optimizer-page fetch returned 403; no claims beyond the retrieved documentation are used. The academic source below was verified at publisher-abstract level, not independently reproduced. Existing literature references were not treated as automatically verified sources for this report.

[^1]: NEBULA X / LTA Rail Digitalisation and Guild. [The Living Railway — Future of Mobility](https://nebulax.com.sg/), event page, undated. PS1, tracks, FAQ and schedule; dataset labels also inspected in public HTML.
[^2]: Network Rail. [Operational Rules](https://www.networkrail.co.uk/industry-and-commercial/information-for-operators/operational-rules/), undated. Engineering Access Statement scope; UK context.
[^3]: Network Rail. [Access, Set up, pack up and possession](https://www.networkrail.co.uk/wp-content/uploads/2019/12/Access-Set-Up-Pack-Up-Possessions.pdf), undated document, hosted in December 2019 path. Access and setup/pack-up problem framing, not a current Singapore rulebook.
[^4]: LTA, SMRT and SBS Transit. [Progressive implementation of Rail Reliability Taskforce recommendations](https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/2/news-releases/lta-rail-operators-progressively-implement-rail-reliability-taskforce-to-strengthen-network-reliability.html), February 2026. Engineering access and renewal context.
[^5]: Tracsis. [Everyone Home Safe Every Day: How Tracsis Helped Transform Rail Safety for Network Rail](https://tracsis.com/news/how-tracsis-helped-transform-rail-safety-for-network-rail), 21 January 2026. Vendor deployment account and named components.
[^6]: Network Rail Safety Central. [Wales and Western — Possession Optimisation](https://safety.networkrail.co.uk/safety/industry-groups/wales-and-western-possession-optimisation/), undated. Operator account of PodFlo and Railworks; distinguishes current and forthcoming functions.
[^7]: IBM. [Scheduling work based on resource availability](https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=view-scheduling-work-based-resource-availability), continuous-delivery documentation, undated. Craft, asset, location, item and tool availability.
[^8]: IBM. [Maximo Optimizer optimization models](https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=schedules-maximo-optimizer-optimization-models), continuous-delivery documentation, undated. Scenario comparison, resource leveling and assignment; indexed official text.
[^9]: Portchain. [Portchain Quay](https://portchain.com/portchain-quay), undated. Public product capabilities, not independently tested.
[^10]: PortXchange. [How the Port of Algeciras reduced idle times and vessel delays](https://port-xchange.com/case-studies/how-the-port-of-algeciras-reduced-idle-times-and-vessel-delays/), undated. Vendor case study describing adoption beginning in 2020, shared schedules and milestone warnings.
[^11]: Maritime and Port Authority of Singapore. [Strengthening Maritime Competitiveness and Operational Excellence](https://www.mpa.gov.sg/media-centre/details/strengthening-maritime-competitiveness-and-operational-excellence), 4 March 2026, paragraph 13. Participation and resource-coordination context; future trial statements are not treated as completed deployments.
[^12]: KONUX. [Introducing KONUX Network: network usage insights to optimise inspections & resources](https://konux.com/introducing-konux-network-network-usage-insights-to-optimise-inspections-resources/), undated. Upstream inspection and access-planning support.
[^13]: Trimble. [Tilos Help](https://tiloshelp.trimble.com/), undated live page. Time–distance visualization and explicit end-of-maintenance notice effective 1 March 2026.
[^14]: Digital Container Shipping Association. [Port Call 2.0.0 — Purpose & Scope](https://reference.dcsa.org/content/standards/releases/port-call/v2-0-0/port-call-v2-0-0-purpose-and-scope), version 2.0.0. E-R-P-A event semantics and ownership; maritime standard, not a rail requirement.
[^15]: LTA DataMall. [Search Datasets](https://datamall.lta.gov.sg/content/datamall/en/search_datasets.html), live catalogue. Train Station entry updated March 2026; exit points July 2026; GTFS Schedule (Train) listing. Catalogue presence does not establish dataset rights clearance or access to private engineering data.
[^16]: Dewald Cillie and James Bekker. [Development of a maintenance possession scheduler for a railway](https://sajie.journals.ac.za/pub/article/view/2750), *South African Journal of Industrial Engineering* 34(2), 1–21, 25 August 2023. DOI: 10.7166/34-2-2750. Publisher abstract establishes model, horizon and case context.
[^R]: RailPlan repository, checkout `aa7395f`. [Project brief](PROJECT_BRIEF.md), [architecture](ARCHITECTURE.md), [data model](DATA_MODEL.md), [API contract](API_CONTRACT.md), [testing](TESTING.md), [decisions](DECISIONS.md), [current status](PROJECT_STATUS.md), and inspected source: [saved workspace](../src/components/plans/SavedPlansWorkspace.tsx), [solver](../packages/core/src/engine/solve.ts), [validator](../packages/core/src/engine/validate.ts), [strategies](../packages/core/src/engine/strategies.ts), [metrics](../packages/core/src/engine/metrics.ts), [request types](../packages/core/src/types/railplan.ts), [geographic snapshot loader](../src/lib/geography/snapshot.ts). Repository evidence is distinct from external operational validation.
