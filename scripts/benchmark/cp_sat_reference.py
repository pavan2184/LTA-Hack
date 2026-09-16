"""Small CP-SAT master model for the RailPlan reference benchmark.

The TypeScript validator remains the constraint authority. The caller supplies
candidate placements and validator-derived no-good cuts; this process optimizes
the remaining discrete choices and reports solver status/bounds as JSON.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from ortools.sat.python import cp_model


def solve(payload: dict[str, Any]) -> dict[str, Any]:
    model = cp_model.CpModel()
    by_key: dict[str, cp_model.IntVar] = {}
    by_request: dict[str, list[cp_model.IntVar]] = {}
    candidates: dict[str, dict[str, Any]] = {}

    for candidate in payload["candidates"]:
        key = candidate["key"]
        variable = model.new_bool_var(key)
        by_key[key] = variable
        by_request.setdefault(candidate["requestId"], []).append(variable)
        candidates[key] = candidate

    defer_vars: dict[str, cp_model.IntVar] = {}
    for request in payload["requests"]:
        request_id = request["id"]
        defer = model.new_bool_var(f"defer:{request_id}")
        defer_vars[request_id] = defer
        by_key[f"defer:{request_id}"] = defer
        choices = by_request.get(request_id, [])
        model.add(sum(choices) + defer == 1)
        if request["mandatory"]:
            model.add(defer == 0)

    for cut in payload.get("cuts", []):
        variables = [by_key[key] for key in cut if key in by_key]
        if len(variables) == len(cut) and variables:
            model.add(sum(variables) <= len(variables) - 1)

    # Lexicographic max-completion proxy: priority-weighted completion, then
    # number placed, then earlier aggregate start. The multipliers make each
    # tier dominate every possible contribution from lower tiers.
    objective_terms = []
    for candidate in payload["candidates"]:
        variable = by_key[candidate["key"]]
        objective_terms.append(variable * (
            candidate["priorityWeight"] * 1_000_000
            + 10_000
            - candidate["startMinute"]
        ))
    model.maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(payload.get("timeLimitSeconds", 10))
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.log_search_progress = False
    status = solver.solve(model)
    status_name = solver.status_name(status)
    has_solution = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    selected = [
        candidate
        for key, candidate in candidates.items()
        if has_solution and solver.value(by_key[key]) == 1
    ]
    deferred = [
        request_id
        for request_id, variable in defer_vars.items()
        if has_solution and solver.value(variable) == 1
    ]
    return {
        "status": status_name,
        "objectiveValue": solver.objective_value if has_solution else None,
        "bestObjectiveBound": solver.best_objective_bound,
        "wallTimeSeconds": solver.wall_time,
        "branches": solver.num_branches,
        "conflicts": solver.num_conflicts,
        "selected": selected,
        "deferred": deferred,
    }


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        print(json.dumps(solve(payload), separators=(",", ":")))
    except Exception as error:  # The caller turns this into a visible benchmark failure.
        print(json.dumps({"error": type(error).__name__, "message": str(error)}))
        raise


if __name__ == "__main__":
    main()
