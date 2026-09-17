"""Small CP-SAT master model for the RailPlan reference benchmark.

The TypeScript validator remains the constraint authority. The caller supplies
candidate placements and validator-derived no-good cuts; this process optimizes
the remaining discrete choices and reports solver status/bounds as JSON.

This process deliberately does NOT re-model track, crew, equipment, workforce or
dependency rules. Re-expressing them here would create a second validator that
could disagree with `validate()` in a way nothing detects, which is exactly the
drift the instance-digest handshake below exists to prevent.

The handshake: the caller sends the digest of the planning instance it built its
candidates from, plus the constraint version those candidates were cut against.
This process echoes both back verbatim alongside its own model and library
versions, and the caller refuses any result whose echo does not match what it
sent. A payload written against a different schema fails here instead of being
silently half-read.
"""

from __future__ import annotations

import json
import platform
import sys
from typing import Any

import ortools
from ortools.sat.python import cp_model

PAYLOAD_SCHEMA = "railplan-cp-sat-payload-v2"
RESULT_SCHEMA = "railplan-cp-sat-result-v2"
MODEL_VERSION = "cp-sat-master-v2"

REQUIRED_KEYS = {
    "schemaVersion",
    "provenance",
    "requests",
    "candidates",
    "cuts",
    "timeLimitSeconds",
    "randomSeed",
}
REQUIRED_PROVENANCE_KEYS = {"instanceDigest", "constraintVersion", "fixture"}


class SchemaDrift(ValueError):
    """The payload is not the shape this model version was written against."""


def check_schema(payload: dict[str, Any]) -> None:
    """Fail loudly on drift rather than optimizing a half-understood payload."""
    if not isinstance(payload, dict):
        raise SchemaDrift("payload must be a JSON object")
    if payload.get("schemaVersion") != PAYLOAD_SCHEMA:
        raise SchemaDrift(
            f"expected schemaVersion {PAYLOAD_SCHEMA!r}, "
            f"received {payload.get('schemaVersion')!r}"
        )
    keys = set(payload)
    if missing := REQUIRED_KEYS - keys:
        raise SchemaDrift(f"missing payload keys: {sorted(missing)}")
    if unknown := keys - REQUIRED_KEYS:
        raise SchemaDrift(f"unknown payload keys: {sorted(unknown)}")

    provenance = payload["provenance"]
    if not isinstance(provenance, dict):
        raise SchemaDrift("provenance must be a JSON object")
    if missing := REQUIRED_PROVENANCE_KEYS - set(provenance):
        raise SchemaDrift(f"missing provenance keys: {sorted(missing)}")
    for key in REQUIRED_PROVENANCE_KEYS:
        if not isinstance(provenance[key], str) or not provenance[key]:
            raise SchemaDrift(f"provenance.{key} must be a non-empty string")

    for candidate in payload["candidates"]:
        if missing := {"key", "requestId", "startMinute", "priorityWeight"} - set(candidate):
            raise SchemaDrift(f"candidate missing keys: {sorted(missing)}")


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
    solver.parameters.max_time_in_seconds = float(payload["timeLimitSeconds"])
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = int(payload["randomSeed"])
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
        "schemaVersion": RESULT_SCHEMA,
        # Echoed verbatim. The caller compares this with what it sent and
        # refuses the result on any mismatch.
        "provenance": {
            **payload["provenance"],
            "modelVersion": MODEL_VERSION,
            "ortoolsVersion": ortools.__version__,
            "pythonVersion": platform.python_version(),
        },
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
        check_schema(payload)
        print(json.dumps(solve(payload), separators=(",", ":")))
    except Exception as error:  # The caller turns this into a visible benchmark failure.
        print(json.dumps({"error": type(error).__name__, "message": str(error)}))
        raise


if __name__ == "__main__":
    main()
