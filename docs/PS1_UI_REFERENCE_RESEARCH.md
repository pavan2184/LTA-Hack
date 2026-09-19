# PS1 interface references from adjacent industries

Researched 2026-09-19. Research and recommendations only; no implementation or accepted architecture change.

## Recommendation

Use an airport resource-allocation board as the main interaction model, a MaintainX-style work-detail panel for readability, Maximo's linked resource view for constraint inspection, and port-planning scenario workflows for alternatives. Use linear infrastructure planning to keep location visible alongside time.

The recommended product is a track-access planning workspace. The main question is: where can this work fit, what prevents it fitting elsewhere, and what changes when the planner chooses an alternative?

This is a fit-based recommendation for PS1, not a measured usability ranking of the products. Public documentation and vendor-published screenshots were inspected; authenticated applications were not tested.

## Ranked references and what transfers

### 1. Airport gate and stand allocation: INALIX X-RMS

[Product page](https://inalix.com/product-service/resource-management-system/)

[Published gate-management screenshot](https://wp.inalix.com/wp-content/uploads/2022/10/X-RMS-02.png)

Observed: the published screen places time across the top, gate resources down the side, and labelled flight allocations inside a large grid. A pool of flight blocks sits above the allocated resource rows. The vendor describes drag-and-drop resource allocation and separate planning/operational uses. The screenshot is historical (2022), not proof of the current deployed interface.

Transfer: let the allocation board dominate the screen. Keep location labels fixed, expose zoom and filters, and retain a visible list of work needing attention. Clicking a job should keep its context on the board.

Adaptation: use rail locations and the supported planning time scale. Avoid importing airport flight fields or assuming every allocation is exclusive; rail co-sharing needs its own representation.

### 2. Industrial maintenance: IBM Maximo Scheduler

[Official graphical-view documentation](https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=work-graphical-view)

[Scheduler overview](https://community.ibm.com/community/user/viewdocument/maximo-scheduler-overview?CommunityKey=3d7261ae-48f7-481d-b675-a40eb407e0fd&tab=librarydocuments)

Documented: linked activity table, activity timeline, resource table, and resource timeline; resizable panes; graphical scheduling and assignment.

Transfer: combine the work schedule with the resources that constrain it. A selected activity should expose its occupied locations, relevant limits, and dependencies in the same workspace. A collapsible capacity strip below the main board is more useful here than a separate dashboard of unrelated metrics.

Avoid reproducing the entire asset-management suite. Inventory, purchasing, asset hierarchies, and technician administration do not improve the core PS1 demonstration.

### 3. Port berth planning: Portchain Quay

[Product page](https://portchain.com/portchain-quay)

[South Carolina Ports case study](https://portchain.com/insights/south-carolina-ports-creates-a-step-change-in-customer-collaboration-by-digitizing-berth-planning-with-portchain)

Documented: scenario planning, crane and labour planning, delay warnings, and shared berth plans. The case study describes planners assessing alternative schedules and stakeholders consulting a graphical vessel lineup. The current product page uses simplified product illustrations, so it is stronger evidence for workflow than for exact screen layout.

Transfer: persistent scenario selection and a clear comparison of consequences. Let a planner inspect what changed before adopting a revised plan. Show affected contracts and completion dates alongside capacity and ECLO effects.

Do not infer that a raw lower score makes one PS1 policy universally preferable: scenarios have different constraints and objective terms.

### 4. Modern maintenance work orders: MaintainX

[Official view documentation](https://help.getmaintainx.com/view-and-filter-work-orders)

[Published list-and-detail screenshot](https://help.getmaintainx.com/assets/images/view-filter-work-order-split-8ae0adc6cc8ccd60630014ce76d1922a.png)

Observed: a narrow navigation column, work-order list, and selected-work detail pane. The detailed record uses labelled status, due date, priority, assignee, asset, and location fields. Documentation also describes table, calendar, workload, and saved-filter views.

Transfer: restrained visual styling, clear field labels, a persistent selected-work inspector, and saved filters. Use this as the strongest visual reference for readable supporting panels.

Adaptation: replace maintenance execution fields with the actual planning data. Use explicit completion workload and constraint evidence. A monthly calendar alone would hide the spatial relationships that matter here.

### 5. Linear infrastructure: TILOS

[Time-distance explanation](https://tiloshelp.trimble.com/Get-Started/Introduction-to-the-Tilos-Time-Distance-Diagram)

[Concept and illustrated interface](https://tiloshelp.trimble.com/Get-Started/The-Tilos-Concept)

Documented and illustrated: planning that connects activities to both time and physical location, with site context and linked views.

Transfer: preserve geographic ordering of track locations. Highlight a selected activity across its whole footprint and show protected neighbouring sectors separately from actual work.

Use its spatial model selectively; the dense desktop editor is not the recommended visual style. Trimble's [help homepage](https://tiloshelp.trimble.com/) states that its Tilos distribution entered end of maintenance on March 1, 2026. This recommendation concerns the planning pattern, not software procurement.

## Proposed RailPlan composition

These are design recommendations, not claims about existing features or vendor interfaces.

| Region | Proposed content | Purpose |
| --- | --- | --- |
| Compact command bar | Instance name, load data, solve/re-solve, export | Make the core journey obvious |
| Scenario strip | A/B/C, policy summary, completeness, local-check status, penalty breakdown | Explain which policy the user is inspecting |
| Left attention list | Delayed work, changed work, input issues; filter by contractor and priority | Give the planner a useful starting point |
| Main board | Locations by week, line/bound filters, selected-work footprint, capacity indicators | Answer where and when |
| Right inspector | Activity, contract, required/delivered workload, predecessor, relevant constraint, explanation | Answer why |
| Secondary linked view | Two-line schematic and selected-week capacity detail | Explain the spatial effect without losing the schedule |

Suggested starting proportions on a wide screen: attention list 20%, board 55%, inspector 25%. This needs testing with realistic data, long identifiers, keyboard navigation, and narrower desktops.

Use a light neutral working canvas, dark readable text, fine gridlines, compact rows, and one strong selection colour. Encode work category consistently; reserve red for a violation and amber for attention. Pair colour with text, borders, icons, or hatch patterns. Avoid letting a large collection of summary cards push the schedule below the fold.

## PS1-specific safeguards

[Official problem statement](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS1/PS1_README.md)

The public app must accept the hidden eight-file instance and preserve full workload. Its output must retain the prescribed three files per scenario. Keep local checking explicitly separate from the judges' reference validator.

Use weeks on the authoritative planning board. `access_night` is a local contract/type/week index, not a shared timestamp; do not turn matching indices into an invented Monday or 02:00 allocation. Use a selected-week spatial inspection to communicate possession relationships.

Show co-sharing, buffers, opposite-bound closure, interchange effects, and predecessor impacts explicitly when relevant. A move must be checked before it becomes an accepted schedule change.

## First design pass

Start with one consequential interaction: select a delayed activity, locate its footprint, inspect the binding constraint, compare an alternative, and review the resulting changes. Retain the existing `/ps1` attention-list/timeline/inspector structure described in project status; these references support refining it.

Defer decorative 3D scenes, a giant map as the default view, a chat-first entry screen, and broader asset-management modules. They consume the available screen and implementation time without answering the central planning questions.

## Evidence limits

- These are vendor descriptions, help pages, and published screenshots, not independent operator usability studies.
- The INALIX and MaintainX screenshots were opened and visually inspected. TILOS documentation illustrations were also inspected.
- Portchain's scenario workflow and IBM's panel structure are supported by documentation; their authenticated current UIs were not exercised.
- No claim is made that SMRT's actual control-room interface looks like these products.
- No app code was changed and no product tests were run for this research note.

## Expanded UI gallery — follow-up research

The following additional vendor-published screens were visually inspected on 2026-09-19. These show interface references, not proposed RailPlan designs. Publication dates and screenshot data may be older than the current product.

### Limble: workload planning

[Reference and screenshots](https://help.limblecmms.com/en/articles/12082843-how-to-use-resource-planning)

The Manage Work screenshot combines filters, an explicit colour key, unassigned/missed-work counts, total daily capacity, and individual resource rows. This is another strong modern visual reference. Adapt the resource rows and capacity units to the rail planning model. Its help-centre images use expiring links, so retain the source article as the durable reference.

### MaintainX: full capacity board

[Source](https://help.getmaintainx.com/schedule-work-in-the-workload-view)

![MaintainX workload view](https://help.getmaintainx.com/assets/images/workload-view-annotated-0d9f68c2e4f6803b4ef955b2bf90455b.png)

Borrow remaining-capacity indicators, explicit unavailable periods, and a shared date axis. This screen schedules people; the analogous PS1 screen would primarily schedule access to locations.

### Siemens Opcenter: industrial scheduling

[Source: Scheduling SMT 2410, November 2024](https://blogs.sw.siemens.com/opcenter/new-opcenter-scheduling-smt-2410/)

![Siemens Opcenter scheduling](https://blogs.sw.siemens.com/wp-content/uploads/sites/3/2024/10/OpcenterSchedulingSMT-_2410_ScheduleGanttChart--1024x589.png)

Borrow hierarchical rows, hatched non-working periods, and the overview navigator below the main schedule. Adapt the hatch treatment to exclusions while keeping work occupancy visually distinct.

### Veson IMOS: berth schedule with selected booking

[Source](https://veson.com/products/imos/berth-scheduling/)

![Veson berth scheduling](https://veson.com/wp-content/uploads/2024/01/IMOS-Berth-Scheduling-Gantt-Chart-01.png)

Borrow the visible relationship between allocated work, unallocated bookings, filters, and the selected record. For RailPlan, prefer a side inspector so details do not cover the schedule as they do in this published screenshot.

### INALIX: allocations spanning multiple resources

[Source](https://inalix.com/product-service/resource-management-system/)

![INALIX check-in allocation](https://wp.inalix.com/wp-content/uploads/2022/10/X-RMS-04.png)

The published 2022 check-in-counter screen shows a large allocation rectangle spanning several adjacent resource rows. This is useful inspiration for communicating that one activity occupies multiple contiguous track locations. Do not adopt its clock-time axis for the weekly PS1 data.

### MaintainX: scheduled and unscheduled work together

[Source](https://help.getmaintainx.com/schedule-work-in-the-workload-view)

![MaintainX unscheduled-work panel](https://help.getmaintainx.com/assets/images/workload-view-notification-work-order-overflow-2-d4183e62cd501391e085d0e505243644.png)

Borrow the compact, searchable side panel and the retained context of the current workload. Unscheduled work can be visible during preparation, but the final PS1 result must still schedule all required workload.

Research limitation: Optym's screenshot asset was blocked by browser site-safety policy and was excluded; no alternative access to that blocked asset was attempted. Several other rail/aviation pages offered illustrations or product descriptions without usable application screens.
