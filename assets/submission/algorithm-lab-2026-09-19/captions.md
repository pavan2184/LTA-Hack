# RailPlan Algorithm Lab — captions and narration

Use these in the same order as the images. Product screenshots show the locally
verified application; no public Google Cloud Run deployment is claimed. Values
belong to the Algorithm Lab's fictional eight-week model, not the PS1 benchmark.

## 1. Cover

**File:** `images/01-algorithm-lab-cover.jpg`

**Caption:** RailPlan Algorithm Lab — constraint optimisation, explained.

**Alt text:** RailPlan title beside a conceptual miniature rail grid with teal
blocks. Text reads “Constraint optimisation, explained” and “Algorithm Lab ·
Google OR-Tools CP-SAT.”

**Asset note:** Generated conceptual illustration, not an application screenshot
or a real railway map.

## 2. How CP-SAT works

**File:** `images/02-how-cp-sat-works.png`

**Caption:** Model the work. Search within the rules. Prove and explain the answer.

**Alt text:** Three steps show 48 binary placement choices, a conceptual search
tree, and the default cost and best bound both equal to 5. A separate checker
verifies the schedule.

**Asset note:** Native diagrams explain the method; the search diagram is not a
recorded solver trace. CP means constraint programming; SAT means satisfiability.

## 3. Every access accounted for

**File:** `images/03-interactive-demo.png`

**Caption:** Six jobs, nine required accesses, and a proved minimum weighted
lateness of 5 in the default model.

**Alt text:** RailPlan Algorithm Lab's default weekly schedule includes all six
jobs and all nine accesses. The solver reports OPTIMAL with cost 5.

**Capture settings:** Capacity 2, no closed week, predecessor enforcement on.
Captured locally.

## 4. Close a week

**File:** `images/04-close-a-week.png`

**Caption:** Closing week two raises the minimum cost from 5 to 19. Four jobs
change access weeks; all nine accesses remain scheduled.

**Alt text:** The week-two closure leaves that column empty and shifts four jobs
from the default schedule. Weighted lateness rises to 19 while all work is retained.

**Capture settings:** Capacity 2, week 2 closed, predecessor enforcement on.
Captured locally. The four-job change count describes this captured comparison.

## 5. A result you can inspect

**File:** `images/05-proof.png`

**Caption:** For the week-two closure, cost 19 meets best bound 19. CP-SAT proves
optimality for this model; a separate checker verifies the returned schedule.

**Alt text:** The model and proof view shows objective 19, best bound 19 and
OPTIMAL status, alongside checks for complete work, capacity, precedence and score.

**Capture settings:** Capacity 2, week 2 closed, predecessor enforcement on.
Captured locally. Independent schedule checks establish rule conformance and
arithmetic; the solver status supplies the optimality conclusion.

## 60-second demo narration

Approximately one minute at a conversational pace; timing must be measured after
recording. Show the default schedule, the three-step explanation, the week-two
closure and the result details as they are mentioned.

> This is RailPlan Algorithm Lab, an interactive explanation of constraint
> optimisation. Six jobs need nine accesses across eight weeks.
>
> First, we model the work as forty-eight yes-or-no placement choices. Every
> access is required. Capacity, closures and dependencies define what is allowed.
>
> Next, Google OR-Tools CP-SAT searches within those rules, keeping better
> schedules and narrowing the bound on the lowest possible cost.
>
> Here, all work is scheduled at a minimum weighted lateness of five. Close week
> two, and the cost rises to nineteen. Four jobs move, but no work disappears.
>
> Finally, the cost matches the best bound: optimal for this model. A separate
> checker verifies the work, rules and arithmetic, while each job explains its
> completion and penalty.
>
> This is a locally demonstrated educational companion. RailPlan's full PS1
> planner uses a separate full-instance native CP-SAT service.

## Short accompanying post

RailPlan Algorithm Lab makes constraint optimisation visible: change the rules,
solve the schedule, and inspect the proof. Real CP-SAT solves over a small
educational model. The current gallery shows our local demonstration; public
Google Cloud Run deployment is pending.
