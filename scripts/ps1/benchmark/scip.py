"""Independent SCIP MIP formulation of the represented PS1 weekly model.

Uses the SCIP backend shipped with OR-Tools, not the CP-SAT search engine.
As with the local checker, physical alignment between separate possessions is
not encoded by the CSV format. A bound proves only this model, or its frozen
repair subproblem. Python model construction is outside the search limit.
"""
import datetime as dt
import json
import math
import os
import platform
import sys
import time

import ortools
from ortools.linear_solver import pywraplp


def solve(payload):
    if payload.get("schema") != "ps1-cpsat-v1":
        raise ValueError("Unsupported PS1 payload schema")
    scenario = payload["scenario"]
    if scenario not in ("A", "B", "C"):
        raise ValueError("Unknown scenario")
    seconds = payload.get("seconds", 60)
    workers = payload.get("workers", 1)
    seed = payload.get("seed", 1)
    try:
        valid_seconds = not isinstance(seconds, bool) and isinstance(seconds, (int, float)) and math.isfinite(seconds) and 0 < seconds <= 2147483647
    except OverflowError:
        valid_seconds = False
    if not valid_seconds:
        raise ValueError("seconds must be positive and finite")
    if isinstance(workers, bool) or not isinstance(workers, int) or not 1 <= workers <= 256:
        raise ValueError("workers must be an integer from 1 to 256")
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 2147483647:
        raise ValueError("seed must be a nonnegative 32-bit integer")
    if payload.get("profile", "default") != "default":
        raise ValueError("SCIP supports only the default profile")
    started = time.perf_counter()
    solver = pywraplp.Solver.CreateSolver("SCIP")
    if solver is None:
        raise RuntimeError("This OR-Tools build does not include SCIP")
    if not solver.SetNumThreads(workers):
        raise RuntimeError("SCIP rejected the requested worker count")
    if not solver.SetSolverSpecificParametersAsString(f"randomization/randomseedshift = {seed}\nlimits/gap = 0"):
        raise RuntimeError("SCIP rejected search parameters")
    solver.SetTimeLimit(max(1, round(seconds * 1000)))

    instance = payload["instance"]
    horizon = instance["parameters"]["horizonWeeks"]
    origin = dt.date.fromisoformat(instance["parameters"]["horizonStart"])
    contracts = {c["contractNumber"]: c for c in instance["contracts"]}
    activities = {a["activityId"]: a for a in instance["activities"]}
    movable = set(activities)
    if "movableActivityIds" in payload:
        requested = payload["movableActivityIds"]
        if not isinstance(requested, list) or any(not isinstance(aid, str) for aid in requested):
            raise ValueError("movableActivityIds must be a list of known activity IDs")
        movable = set(requested)
        if movable - set(activities):
            raise ValueError("movableActivityIds contains unknown activity IDs")
        incumbent = payload.get("incumbent")
        if not isinstance(incumbent, dict) or not isinstance(incumbent.get("access"), list):
            raise ValueError("Repair requires an incumbent with an access list")
    has_frozen_work = bool(set(activities) - movable)
    weeks = range(1, horizon + 1)
    hints = {(r["activityId"], r["week"]): r for r in payload.get("incumbent", {}).get("access", [])}
    x, e, first, last = {}, {}, {}, {}
    hint_vars, hint_values = [], []
    windows = {line["lineCode"]: solver.IntVar(1, max(1, horizon - 1), "window_" + line["lineCode"])
               for line in instance["lines"]} if scenario == "C" else {}

    def positive_part(expression, low, high, name):
        """Exact max(0, expression), even when it has no objective weight."""
        value = solver.IntVar(0, max(0, high), name)
        positive = solver.BoolVar(name + "_positive")
        solver.Add(value >= expression)
        solver.Add(value <= expression + max(0, -low) * (1 - positive))
        solver.Add(value <= max(0, high) * positive)
        return value

    for aid, activity in activities.items():
        contract = contracts[activity["contractNumber"]]
        release = (dt.date.fromisoformat(activity["plannedStartDate"]) - origin).days // 7 + 1
        due_days = (dt.date.fromisoformat(contract["plannedCompletionDate"]) - origin).days
        first[aid] = solver.IntVar(1, horizon, "first_" + aid)
        last[aid] = solver.IntVar(1, horizon, "last_" + aid)
        start_selectors, end_selectors = [], []
        for week in weeks:
            key = aid, week
            x[key] = solver.BoolVar(f"x_{aid}_{week}")
            e[key] = solver.BoolVar(f"e_{aid}_{week}")
            solver.Add(e[key] <= x[key])
            if week < release or (scenario == "B" and week * 7 - 1 > due_days):
                solver.Add(x[key] == 0)
            if scenario == "A":
                solver.Add(e[key] == 0)
            if scenario == "C":
                for line in payload["affectedLines"][aid]:
                    solver.Add(windows[line] <= week + horizon * (1 - e[key]))
                    solver.Add(windows[line] >= week - 1 - horizon * (1 - e[key]))
            hint = hints.get(key)
            if "incumbent" in payload:
                hint_vars.extend([x[key], e[key]])
                hint_values.extend([int(hint is not None), hint["eclo"] if hint else 0])
            if aid not in movable:
                solver.Add(x[key] == int(hint is not None))
                solver.Add(e[key] == (hint["eclo"] if hint else 0))
            start = solver.BoolVar(f"first_at_{aid}_{week}")
            end = solver.BoolVar(f"last_at_{aid}_{week}")
            start_selectors.append(start)
            end_selectors.append(end)
            solver.Add(start <= x[key])
            solver.Add(end <= x[key])
            solver.Add(first[aid] <= week + horizon * (1 - x[key]))
            solver.Add(last[aid] >= week * x[key])
        solver.Add(solver.Sum(start_selectors) == 1)
        solver.Add(solver.Sum(end_selectors) == 1)
        solver.Add(first[aid] == solver.Sum(w * start_selectors[w - 1] for w in weeks))
        solver.Add(last[aid] == solver.Sum(w * end_selectors[w - 1] for w in weeks))
        solver.Add(solver.Sum(2 * x[aid, w] + e[aid, w] for w in weeks) >= 2 * activity["totalAccesses"])

    for aid, activity in activities.items():
        predecessor = activity["predecessorActivityId"]
        if predecessor:
            solver.Add(first[aid] >= last[predecessor] + 1)
    for pin in payload.get("pins", []):
        solver.Add(x[pin["activityId"], pin["week"]] == 1)
        solver.Add(e[pin["activityId"], pin["week"]] == pin.get("eclo", 0))
    for number, contract in contracts.items():
        types = {a["activityType"] for a in activities.values() if a["contractNumber"] == number}
        for kind in types:
            ids = [aid for aid, a in activities.items() if a["contractNumber"] == number and a["activityType"] == kind]
            for week in weeks:
                solver.Add(solver.Sum(x[aid, week] for aid in ids) <=
                           contract["numberOfWorkfronts"] * contract["numberOfMaximumAccessPerWeek"])

    objective = []
    for location in instance["locationSupply"]:
        loc = location["locationId"]
        ids = [aid for aid in activities if loc in payload["spans"][aid]]
        if not ids:
            continue
        pm = [aid for aid in ids if contracts[activities[aid]["contractNumber"]]["accessType"] == "PM"]
        pc = [aid for aid in ids if contracts[activities[aid]["contractNumber"]]["accessType"] == "PC"]
        shared = [aid for aid in ids if aid not in pm]
        for week in weeks:
            groups = solver.IntVar(0, len(ids), f"groups_{loc}_{week}")
            pc_branch = solver.BoolVar(f"pc_branch_{loc}_{week}")
            pc_count = solver.Sum(x[aid, week] for aid in pc)
            shared_count = solver.Sum(x[aid, week] for aid in shared)
            # Exact max(PC, ceil((PC+C)/4)); the selected branch attains equality.
            solver.Add(groups >= pc_count)
            solver.Add(4 * groups >= shared_count)
            solver.Add(groups <= pc_count + len(ids) * (1 - pc_branch))
            solver.Add(4 * groups <= shared_count + 3 + 4 * len(ids) * pc_branch)
            count = groups + solver.Sum(x[aid, week] for aid in pm)
            supply = payload["capacity"][loc][week - 1]
            allowance = 0 if payload["disrupted"][loc][week - 1] or scenario == "A" else (1 if scenario == "C" else len(ids))
            solver.Add(count <= supply + allowance)
            if scenario != "A":
                excess = positive_part(count - supply, -supply, len(ids) - supply, f"excess_{loc}_{week}")
                objective.append(70 * excess)

    if scenario != "B":
        # Every late activity is charged at its own last access week, including
        # activities that complete before their contract's final activity.
        for aid, activity in activities.items():
            contract = contracts[activity["contractNumber"]]
            due_days = (dt.date.fromisoformat(contract["plannedCompletionDate"]) - origin).days
            late = positive_part(7 * last[aid] - 1 - due_days, 6 - due_days,
                                 horizon * 7 - 1 - due_days, "late_" + aid)
            weight = {1: 100, 2: 10, 3: 1}[contract["contractPriority"]]
            nudge = {1: 13, 2: 12, 3: 10}[activity["activityPriority"]]
            objective.append(weight * nudge * late)
    if scenario != "A":
        objective.extend(50 * var for var in e.values())
    solver.Minimize(solver.Sum(objective))
    if hint_vars:
        # SCIP may reject or fail to complete a partial hint; it is never a pin.
        solver.SetHint(hint_vars, hint_values)
    build_ms = (time.perf_counter() - started) * 1000
    solve_started = time.perf_counter()
    status_code = solver.Solve()
    solved = time.perf_counter()
    solve_ms = (solved - solve_started) * 1000
    status = {pywraplp.Solver.OPTIMAL: "OPTIMAL", pywraplp.Solver.FEASIBLE: "FEASIBLE",
              pywraplp.Solver.INFEASIBLE: "INFEASIBLE", pywraplp.Solver.UNBOUNDED: "UNBOUNDED",
              pywraplp.Solver.ABNORMAL: "ABNORMAL", pywraplp.Solver.MODEL_INVALID: "MODEL_INVALID",
              pywraplp.Solver.NOT_SOLVED: "UNKNOWN"}.get(status_code, "UNKNOWN")
    found = status in ("FEASIBLE", "OPTIMAL")
    if found and not solver.VerifySolution(1e-6, False):
        raise RuntimeError("SCIP returned a solution failing its numerical verification")
    access = []
    if found:
        for aid in activities:
            seq = 0
            for week in weeks:
                if x[aid, week].solution_value() > 0.5:
                    seq += 1
                    access.append({"activityId": aid, "accessSeq": seq, "week": week,
                                   "eclo": round(e[aid, week].solution_value()), "accessNight": 1})
        for number, contract in contracts.items():
            for week in weeks:
                kinds = {}
                for row in access:
                    activity = activities[row["activityId"]]
                    if activity["contractNumber"] == number and row["week"] == week:
                        count = kinds.get(activity["activityType"], 0)
                        row["accessNight"] = count // contract["numberOfWorkfronts"] + 1
                        kinds[activity["activityType"]] = count + 1
    bound = solver.Objective().BestBound() / 10
    # All penalty terms are nonnegative, so zero remains a valid trivial bound.
    if not math.isfinite(bound) or abs(bound) >= 1e19:
        bound = 0
    peak_rss = None
    if sys.platform in ("darwin", "linux"):
        import resource
        peak_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024 if sys.platform == "darwin" else 1024)
    return {"schema": "ps1-cpsat-v1", "digest": payload["digest"], "scenario": scenario,
            "formulaVersion": "ps1-objective-v2",
            "scope": "repair" if has_frozen_work else "full", "status": status,
            "boundScope": "conditional_on_frozen_activities" if has_frozen_work else "encoded_full_model",
            "solver": "scip", "solverVersion": solver.SolverVersion(), "ortoolsVersion": ortools.__version__,
            "workers": workers, "seed": seed, "seconds": seconds,
            "config": {"seconds": seconds, "workers": workers, "seed": seed, "profile": "default",
                       "hinted": "incumbent" in payload},
            "objective": round(solver.Objective().Value() / 10, 1) if found else None,
            "bound": max(0, bound), "buildMs": build_ms, "solveMs": solve_ms,
            "solveCallMs": solve_ms, "modelAndSolveMs": (solved - started) * 1000,
            "postprocessMs": (time.perf_counter() - solved) * 1000,
            "firstSolutionMs": None, "solutionTrace": [],
            "traceClock": "unavailable_in_pywraplp_scip_interface",
            "modelStats": {"variables": solver.NumVariables(), "constraints": solver.NumConstraints()},
            "host": {"system": platform.system(), "architecture": platform.machine(),
                     "logicalCpuCount": os.cpu_count(), "pythonVersion": platform.python_version()},
            "peakRssMiB": peak_rss, "peakRssScope": "process_lifetime", "access": access}


if __name__ == "__main__":
    print(json.dumps(solve(json.load(sys.stdin)), allow_nan=False))
