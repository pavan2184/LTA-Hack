"""A bounded teaching model, separate from RailPlan's complete PS1 solver."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any

import ortools
from ortools.sat.python import cp_model

HORIZON = 8
MODEL_VERSION = "railplan-weekly-teaching-v1"
ENGINE = "Google OR-Tools CP-SAT"
SCOPE = (
    "Educational weekly scheduling model. This is not RailPlan's full PS1 "
    "planner, the organiser's reference validator, or operational safety approval."
)
ASSUMPTIONS = [
    "Six fixed, mandatory jobs; all nine required accesses must be scheduled.",
    "Eight fixed weeks, with at most one access per job per week.",
    "Accesses for the same job need not be consecutive.",
    "Capacity is one shared weekly pool; a closed week has zero capacity.",
    "When enabled, a predecessor must finish before any successor access.",
    "The objective is job-weighted weeks late, not the official PS1 score.",
    "Track geometry, buffers, Live mirroring, co-sharing and ECLO are not modelled.",
    "An infeasible result concerns only this fixed eight-week teaching model.",
]
JOBS = (
    {
        "id": "A01",
        "name": "Inspect track",
        "accesses": 1,
        "dueWeek": 1,
        "weight": 3,
        "predecessor": None,
    },
    {
        "id": "A02",
        "name": "Replace rail",
        "accesses": 2,
        "dueWeek": 3,
        "weight": 5,
        "predecessor": "A01",
    },
    {
        "id": "A03",
        "name": "Test signals",
        "accesses": 1,
        "dueWeek": 4,
        "weight": 4,
        "predecessor": "A02",
    },
    {
        "id": "A04",
        "name": "Service switches",
        "accesses": 2,
        "dueWeek": 2,
        "weight": 2,
        "predecessor": None,
    },
    {
        "id": "A05",
        "name": "Check power",
        "accesses": 1,
        "dueWeek": 2,
        "weight": 2,
        "predecessor": None,
    },
    {
        "id": "A06",
        "name": "Verify route",
        "accesses": 2,
        "dueWeek": 5,
        "weight": 3,
        "predecessor": "A03",
    },
)


class InvalidSettings(ValueError):
    """A public request is outside the deliberately small input contract."""


class InvalidSolution(RuntimeError):
    """A returned schedule failed validation independent of CP-SAT."""


@dataclass(frozen=True)
class Settings:
    capacity: int = 2
    closed_week: int | None = None
    enforce_predecessors: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "capacity": self.capacity,
            "closedWeek": self.closed_week,
            "enforcePredecessors": self.enforce_predecessors,
        }


def parse_settings(value: Any) -> Settings:
    if not isinstance(value, dict) or set(value) != {
        "capacity",
        "closedWeek",
        "enforcePredecessors",
    }:
        raise InvalidSettings(
            "Provide exactly capacity, closedWeek and enforcePredecessors."
        )
    capacity = value["capacity"]
    closed = value["closedWeek"]
    precedence = value["enforcePredecessors"]
    if type(capacity) is not int or not 1 <= capacity <= 3:
        raise InvalidSettings("capacity must be an integer from 1 to 3.")
    if closed is not None and (type(closed) is not int or not 1 <= closed <= HORIZON):
        raise InvalidSettings("closedWeek must be null or an integer from 1 to 8.")
    if type(precedence) is not bool:
        raise InvalidSettings("enforcePredecessors must be a boolean.")
    return Settings(capacity, closed, precedence)


def metadata() -> dict[str, Any]:
    return {
        "modelVersion": MODEL_VERSION,
        "engine": ENGINE,
        "engineVersion": ortools.__version__,
        "scope": SCOPE,
        "assumptions": list(ASSUMPTIONS),
    }


def model_description() -> dict[str, Any]:
    return {
        **metadata(),
        "jobs": deepcopy(list(JOBS)),
        "horizon": HORIZON,
        "defaults": Settings().as_dict(),
    }


def capacities(settings: Settings) -> list[int]:
    return [
        0 if week == settings.closed_week else settings.capacity
        for week in range(1, HORIZON + 1)
    ]


def validate_solution(
    settings: Settings, rows: list[dict[str, Any]], objective: int
) -> tuple[list[dict[str, Any]], list[int]]:
    """Recompute every rule from plain output values, without CP-SAT variables."""
    expected = {job["id"]: job for job in JOBS}
    if len(rows) != len(JOBS) or {row.get("id") for row in rows} != set(expected):
        raise InvalidSolution("Schedule does not contain exactly the required jobs.")
    usage = [0] * HORIZON
    by_id = {row["id"]: row for row in rows}
    penalty = 0
    for row in rows:
        job = expected[row["id"]]
        if any(row.get(key) != value for key, value in job.items()):
            raise InvalidSolution("Fixed job facts changed in the result.")
        weeks = row.get("weeks")
        if not isinstance(weeks, list) or len(weeks) != job["accesses"]:
            raise InvalidSolution("A required access is missing or duplicated.")
        if any(type(week) is not int or not 1 <= week <= HORIZON for week in weeks):
            raise InvalidSolution("A selected week is outside the model horizon.")
        if weeks != sorted(set(weeks)):
            raise InvalidSolution("A job has repeated or unordered access weeks.")
        completion = max(weeks)
        tardiness = max(0, completion - job["dueWeek"])
        weighted = tardiness * job["weight"]
        if (row.get("completion"), row.get("tardiness"), row.get("penalty")) != (
            completion,
            tardiness,
            weighted,
        ):
            raise InvalidSolution("Completion or penalty does not match the schedule.")
        penalty += weighted
        for week in weeks:
            usage[week - 1] += 1
    available = capacities(settings)
    if any(used > limit for used, limit in zip(usage, available)):
        raise InvalidSolution("Weekly capacity or the closed week was breached.")
    if settings.enforce_predecessors:
        for row in rows:
            predecessor = row["predecessor"]
            if predecessor and min(row["weeks"]) <= by_id[predecessor]["completion"]:
                raise InvalidSolution(
                    "A successor starts before its predecessor finishes."
                )
    if type(objective) is not int or objective != penalty:
        raise InvalidSolution("The displayed objective differs from the schedule.")
    checks = [
        {
            "label": "Full workload",
            "passed": True,
            "detail": "All 6 jobs and all 9 required accesses are scheduled.",
        },
        {
            "label": "Weekly job limit",
            "passed": True,
            "detail": "Every job uses at most one access per week, within weeks 1–8.",
        },
        {
            "label": "Shared capacity",
            "passed": True,
            "detail": "Every week's total is within its capacity, including any closure.",
        },
        {
            "label": "Predecessors",
            "passed": True,
            "detail": (
                "All successors start in a later week than their predecessor finishes."
                if settings.enforce_predecessors
                else "Predecessor enforcement is disabled for this experiment."
            ),
        },
        {
            "label": "Objective arithmetic",
            "passed": True,
            "detail": f"Recalculated weighted lateness is {penalty}.",
        },
    ]
    return checks, usage


def solve_demo(payload: Any) -> dict[str, Any]:
    settings = parse_settings(payload)
    model = cp_model.CpModel()
    accesses: dict[str, list[cp_model.IntVar]] = {}
    completion: dict[str, cp_model.IntVar] = {}
    tardiness: dict[str, cp_model.IntVar] = {}
    for job in JOBS:
        job_id = job["id"]
        variables = [
            model.new_bool_var(f"{job_id}_week_{week}")
            for week in range(1, HORIZON + 1)
        ]
        accesses[job_id] = variables
        model.add(sum(variables) == job["accesses"])
        completion[job_id] = model.new_int_var(1, HORIZON, f"{job_id}_completion")
        model.add_max_equality(
            completion[job_id],
            [(index + 1) * value for index, value in enumerate(variables)],
        )
        tardiness[job_id] = model.new_int_var(0, HORIZON, f"{job_id}_late")
        model.add_max_equality(
            tardiness[job_id], [0, completion[job_id] - job["dueWeek"]]
        )
    weekly_capacity = capacities(settings)
    for index, limit in enumerate(weekly_capacity):
        model.add(sum(values[index] for values in accesses.values()) <= limit)
    if settings.enforce_predecessors:
        for job in JOBS:
            if job["predecessor"]:
                for index, selected in enumerate(accesses[job["id"]]):
                    model.add(
                        completion[job["predecessor"]] < index + 1
                    ).only_enforce_if(selected)
    model.minimize(sum(job["weight"] * tardiness[job["id"]] for job in JOBS))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2.0
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.log_search_progress = False
    result_status = solver.solve(model)
    if result_status == cp_model.MODEL_INVALID:
        raise InvalidSolution("The fixed teaching model is invalid.")
    result: dict[str, Any] = {
        **metadata(),
        "status": solver.status_name(result_status),
        "settings": settings.as_dict(),
        "jobs": [],
        "objective": None,
        "bestBound": None,
        "solverMs": round(solver.wall_time * 1000, 3),
        "checks": [],
        "capacityByWeek": weekly_capacity,
        "usageByWeek": [],
    }
    if result_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return result
    rows = []
    for job in JOBS:
        weeks = [
            index + 1
            for index, variable in enumerate(accesses[job["id"]])
            if solver.value(variable)
        ]
        end = max(weeks)
        late = max(0, end - job["dueWeek"])
        selected_weeks = (
            f"week {weeks[0]}"
            if len(weeks) == 1
            else "weeks " + " and ".join(str(week) for week in weeks)
        )
        explanation = f"Scheduled in {selected_weeks}"
        if job["predecessor"] and settings.enforce_predecessors:
            predecessor_end = solver.value(completion[job["predecessor"]])
            explanation += (
                f", after {job['predecessor']} finishes in week {predecessor_end}"
            )
        timing = (
            "on time"
            if late == 0
            else ("one week late" if late == 1 else f"{late} weeks late")
        )
        explanation += f". Due in week {job['dueWeek']}; completion is {timing}."
        if job["predecessor"] and not settings.enforce_predecessors:
            explanation += " Predecessor enforcement is disabled in this experiment."
        rows.append(
            {
                **job,
                "weeks": weeks,
                "completion": end,
                "tardiness": late,
                "penalty": late * job["weight"],
                "explanation": explanation,
            }
        )
    objective = round(solver.objective_value)
    checks, usage = validate_solution(settings, rows, objective)
    return {
        **result,
        "jobs": rows,
        "objective": objective,
        "bestBound": solver.best_objective_bound,
        "checks": checks,
        "usageByWeek": usage,
    }
