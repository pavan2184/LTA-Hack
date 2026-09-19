"""PS1 weekly CP-SAT model, matching represented local-checker constraints.

No global physical night is encoded by the published CSVs. This model therefore
cannot certify cross-possession buffer alignment or reference-validator parity.
Possession packing is exact locally: PM alone, at most one PC and four members.
"""
import datetime as dt
import json
import math
import os
import platform
import sys
import time

import ortools
from ortools.sat.python import cp_model


def search_config(payload):
    """Reject ambiguous or unsafe controls before constructing a model."""
    seconds = payload.get("seconds", 5)
    try:
        valid_seconds = not isinstance(seconds, bool) and isinstance(seconds, (int, float)) and math.isfinite(seconds) and seconds > 0
    except OverflowError:
        valid_seconds = False
    if not valid_seconds:
        raise ValueError("seconds must be a finite positive number")
    workers = payload.get("workers", 1)
    if isinstance(workers, bool) or not isinstance(workers, int) or not 1 <= workers <= 256:
        raise ValueError("workers must be an integer between 1 and 256")
    seed = payload.get("seed", 1)
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 2**31 - 1:
        raise ValueError("seed must be an integer between 0 and 2147483647")
    profile = payload.get("profile", "default")
    if profile not in ("default", "no_lp", "lns"):
        raise ValueError("profile must be default, no_lp, or lns")
    return {"seconds": seconds, "workers": workers, "seed": seed, "profile": profile,
            "hinted": "incumbent" in payload}


class ImprovementTrace(cp_model.CpSolverSolutionCallback):
    """Native solve-clock observations; model construction is not included."""

    def __init__(self):
        super().__init__()
        self.points = []

    def on_solution_callback(self):
        objective = self.objective_value / 10
        if not self.points or objective < self.points[-1]["objective"]:
            self.points.append({"timeMs": self.wall_time * 1000,
                                "objective": objective,
                                "bound": self.best_objective_bound / 10})


def process_peak_rss_mib():
    """Process-lifetime high-water mark, including imports and earlier solves."""
    if sys.platform not in ("darwin", "linux"):
        return None
    import resource
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak / (1024 * 1024 if sys.platform == "darwin" else 1024)


def solve(payload):
    if payload.get("schema") != "ps1-cpsat-v1":
        raise ValueError("Unsupported PS1 payload schema")
    started = time.perf_counter()
    config = search_config(payload)
    instance, scenario = payload["instance"], payload["scenario"]
    if scenario not in ("A", "B", "C"):
        raise ValueError("Unknown scenario")
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
    model = cp_model.CpModel()
    x, e, first, last = {}, {}, {}, {}
    hints = {(r["activityId"], r["week"]): r for r in payload.get("incumbent", {}).get("access", [])}
    windows = {line["lineCode"]: model.new_int_var(1, max(1, horizon - 1), "window_" + line["lineCode"])
               for line in instance["lines"]} if scenario == "C" else {}
    for aid, activity in activities.items():
        contract = contracts[activity["contractNumber"]]
        release = (dt.date.fromisoformat(activity["plannedStartDate"]) - origin).days // 7 + 1
        due_days = (dt.date.fromisoformat(contract["plannedCompletionDate"]) - origin).days
        starts, ends = [], []
        for week in weeks:
            key = aid, week
            x[key] = model.new_bool_var(f"x_{aid}_{week}")
            e[key] = model.new_bool_var(f"e_{aid}_{week}")
            model.add(e[key] <= x[key])
            if week < release or (scenario == "B" and week * 7 - 1 > due_days):
                model.add(x[key] == 0)
            if scenario == "A":
                model.add(e[key] == 0)
            if scenario == "C":
                for line in payload["affectedLines"][aid]:
                    model.add(windows[line] <= week).only_enforce_if(e[key])
                    model.add(windows[line] >= week - 1).only_enforce_if(e[key])
            hint = hints.get(key)
            if "incumbent" in payload:
                model.add_hint(x[key], int(hint is not None))
                model.add_hint(e[key], hint["eclo"] if hint else 0)
            if aid not in movable:
                model.add(x[key] == int(hint is not None))
                model.add(e[key] == (hint["eclo"] if hint else 0))
            starts.append(week * x[key] + (horizon + 1) * (1 - x[key]))
            ends.append(week * x[key])
        model.add(sum(2 * x[aid, w] + e[aid, w] for w in weeks) >= 2 * activity["totalAccesses"])
        first[aid] = model.new_int_var(1, horizon, "first_" + aid)
        last[aid] = model.new_int_var(1, horizon, "last_" + aid)
        model.add_min_equality(first[aid], starts)
        model.add_max_equality(last[aid], ends)
    for aid, activity in activities.items():
        predecessor = activity["predecessorActivityId"]
        if predecessor:
            model.add(first[aid] > last[predecessor])
    for pin in payload.get("pins", []):
        model.add(x[pin["activityId"], pin["week"]] == 1)
        model.add(e[pin["activityId"], pin["week"]] == pin.get("eclo", 0))
    for number, contract in contracts.items():
        types = {a["activityType"] for a in activities.values() if a["contractNumber"] == number}
        for kind in types:
            ids = [aid for aid, a in activities.items() if a["contractNumber"] == number and a["activityType"] == kind]
            for week in weeks:
                model.add(sum(x[aid, week] for aid in ids) <=
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
            groups = model.new_int_var(0, len(ids), f"groups_{loc}_{week}")
            rounded = model.new_int_var(0, len(ids), f"rounded_{loc}_{week}")
            # Minimal number of non-PM possessions: max(PC, ceil((PC+C)/4)).
            model.add_division_equality(rounded, sum(x[aid, week] for aid in shared) + 3, 4)
            model.add_max_equality(groups, [sum(x[aid, week] for aid in pc), rounded])
            count = groups + sum(x[aid, week] for aid in pm)
            supply = payload["capacity"][loc][week - 1]
            allowance = 0 if payload["disrupted"][loc][week - 1] or scenario == "A" else (1 if scenario == "C" else len(ids))
            model.add(count <= supply + allowance)
            excess = model.new_int_var(0, len(ids), f"excess_{loc}_{week}")
            model.add_max_equality(excess, [0, count - supply])
            if scenario != "A":
                objective.append(70 * excess)
    if scenario != "B":
        # PS1 §2.7 charges each late activity against its contract's planned
        # date, including activities that finish before the contract's last one.
        for aid, activity in activities.items():
            contract = contracts[activity["contractNumber"]]
            due_days = (dt.date.fromisoformat(contract["plannedCompletionDate"]) - origin).days
            limit = max(0, horizon * 7 - 1 - due_days)
            late = model.new_int_var(0, limit, "late_" + aid)
            model.add_max_equality(late, [0, 7 * last[aid] - 1 - due_days])
            weight = {1: 100, 2: 10, 3: 1}[contract["contractPriority"]]
            nudge = {1: 13, 2: 12, 3: 10}[activity["activityPriority"]]
            objective.append(weight * nudge * late)
    if scenario != "A":
        objective.extend(50 * var for var in e.values())
    model.minimize(sum(objective))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = config["seconds"]
    solver.parameters.num_search_workers = config["workers"]
    solver.parameters.random_seed = config["seed"]
    if config["profile"] == "no_lp":
        solver.parameters.linearization_level = 0
    elif config["profile"] == "lns":
        solver.parameters.use_lns_only = True
    trace = ImprovementTrace()
    model_stats = {"variables": len(model.proto.variables), "constraints": len(model.proto.constraints)}
    built = time.perf_counter()
    status = solver.solve(model, trace)
    solved = time.perf_counter()
    found = status in (cp_model.FEASIBLE, cp_model.OPTIMAL)
    access = []
    if found:
        for aid in activities:
            seq = 0
            for week in weeks:
                if solver.value(x[aid, week]):
                    seq += 1
                    access.append({"activityId": aid, "accessSeq": seq, "week": week,
                                   "eclo": solver.value(e[aid, week]), "accessNight": 1})
        for number, contract in contracts.items():
            for week in weeks:
                kinds = {}
                for row in access:
                    a = activities[row["activityId"]]
                    if a["contractNumber"] == number and row["week"] == week:
                        count = kinds.get(a["activityType"], 0)
                        row["accessNight"] = count // contract["numberOfWorkfronts"] + 1
                        kinds[a["activityType"]] = count + 1
    return {"schema": "ps1-cpsat-v1", "digest": payload["digest"], "scenario": scenario,
            "formulaVersion": "ps1-objective-v2",
            "scope": "repair" if has_frozen_work else "full",
            "boundScope": "conditional_on_frozen_activities" if has_frozen_work else "encoded_full_model",
            "status": solver.status_name(status), "ortoolsVersion": ortools.__version__,
            "config": config,
            "objective": solver.objective_value / 10 if found else None,
            "bound": solver.best_objective_bound / 10,
            "buildMs": (built - started) * 1000,
            "solveMs": solver.wall_time * 1000,
            "solveCallMs": (solved - built) * 1000,
            "modelAndSolveMs": (solved - started) * 1000,
            "postprocessMs": (time.perf_counter() - solved) * 1000,
            "firstSolutionMs": trace.points[0]["timeMs"] if trace.points else None,
            "solutionTrace": trace.points,
            "traceClock": "native_solve_wall_time_excluding_model_build",
            "modelStats": model_stats,
            "searchStats": {"branches": solver.num_branches, "conflicts": solver.num_conflicts,
                            "deterministicTime": solver.response_proto.deterministic_time},
            "host": {"system": platform.system(), "architecture": platform.machine(),
                     "logicalCpuCount": os.cpu_count(), "pythonVersion": platform.python_version()},
            "peakRssMiB": process_peak_rss_mib(), "peakRssScope": "process_lifetime",
            "access": access}


if __name__ == "__main__":
    print(json.dumps(solve(json.load(sys.stdin))))
