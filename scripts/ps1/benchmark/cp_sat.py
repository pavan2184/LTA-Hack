"""PS1 weekly CP-SAT with explicit possessions and closure components.

Local co-sharing groups induce actual connected components. A rooted forest
certifies that closure exemptions have a real path through those groups.
No global physical-night identity is inferred from contract access-night labels.
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
    formulation = payload.get("formulation", "baseline")
    if formulation not in ("baseline", "tight"):
        raise ValueError("formulation must be baseline or tight")
    config = {"seconds": seconds, "workers": workers, "seed": seed, "profile": profile,
              "hinted": "incumbent" in payload}
    if "formulation" in payload:
        config["formulation"] = formulation
    return config


class ImprovementTrace(cp_model.CpSolverSolutionCallback):
    """Native solve-clock observations; model construction is not included."""

    def __init__(self):
        super().__init__()
        self.points = []

    def on_solution_callback(self):
        objective = round(self.objective_value / 10, 1)
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
    if payload.get("closureModelVersion") != "ps1-closure-v1":
        raise ValueError("Unsupported or missing closureModelVersion")
    started = time.perf_counter()
    config = search_config(payload)
    tight = config.get("formulation", "baseline") == "tight"
    instance, scenario = payload["instance"], payload["scenario"]
    if scenario not in ("A", "B", "C"):
        raise ValueError("Unknown scenario")
    horizon = instance["parameters"]["horizonWeeks"]
    origin = dt.date.fromisoformat(instance["parameters"]["horizonStart"])
    contracts = {c["contractNumber"]: c for c in instance["contracts"]}
    activities = {a["activityId"]: a for a in instance["activities"]}
    pairs = payload.get("closurePairs")
    if not isinstance(pairs, list) or any(not isinstance(pair, list) or len(pair) != 2 or
            any(not isinstance(aid, str) or aid not in activities for aid in pair) or pair[0] == pair[1]
            for pair in pairs):
        raise ValueError("closurePairs must contain pairs of distinct known activity IDs")
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
        if tight:
            # Implied by full yield, at most one access per activity/week, and
            # C's two-week ECLO window. Keep the original exact constraints.
            workload = activity["totalAccesses"]
            minimum_accesses = workload if scenario == "A" else (2 * workload + 2) // 3
            if scenario == "C":
                model.add(sum(e[aid, w] for w in weeks) <= 2)
                minimum_accesses = max(minimum_accesses, workload - 1)
            model.add(sum(x[aid, w] for w in weeks) >= minimum_accesses)
            model.add(last[aid] - first[aid] >= minimum_accesses - 1)
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
    # One local group is anchored by its PC, by its sole PM, or by the smallest
    # C member. This represents every legal local partition without group-label
    # permutation symmetry. Nonself C assignments form a star for that group.
    activity_order = {aid: index + 1 for index, aid in enumerate(sorted(activities))}
    assignment, sharing_assignments = {}, {}
    incumbent_groups = {}
    for row in payload.get("incumbent", {}).get("occupancy", []):
        key = row["locationId"], row["week"], row["coShareGroup"]
        incumbent_groups.setdefault(key, []).append(row["activityId"])
    incumbent_anchor = {}
    for (loc, week, _), members in incumbent_groups.items():
        hosts = [aid for aid in members if contracts[activities[aid]["contractNumber"]]["accessType"] != "C"]
        anchor = hosts[0] if hosts else min(members, key=lambda aid: activity_order[aid])
        for aid in members:
            incumbent_anchor[loc, week, aid] = anchor
    objective = []
    for location in instance["locationSupply"]:
        loc = location["locationId"]
        ids = sorted(aid for aid in activities if loc in payload["spans"][aid])
        if not ids:
            continue
        pm = [aid for aid in ids if contracts[activities[aid]["contractNumber"]]["accessType"] == "PM"]
        pc = [aid for aid in ids if contracts[activities[aid]["contractNumber"]]["accessType"] == "PC"]
        co_workers = [aid for aid in ids if aid not in pm and aid not in pc]
        shared = pc + co_workers
        for week in weeks:
            for aid in ids:
                assignment[loc, week, aid, aid] = (model.new_bool_var(f"group_{loc}_{week}_{aid}")
                                                   if aid in co_workers else x[aid, week])
            members_by_anchor = {aid: [assignment[loc, week, aid, aid]] for aid in ids}
            for aid in co_workers:
                choices = [assignment[loc, week, aid, aid]]
                for anchor in pc + [other for other in co_workers if activity_order[other] < activity_order[aid]]:
                    variable = model.new_bool_var(f"join_{loc}_{week}_{aid}_{anchor}")
                    assignment[loc, week, aid, anchor] = variable
                    members_by_anchor[anchor].append(variable)
                    model.add(variable <= assignment[loc, week, anchor, anchor])
                    choices.append(variable)
                    edge = tuple(sorted((aid, anchor))) + (week,)
                    sharing_assignments.setdefault(edge, []).append(variable)
                model.add(sum(choices) == x[aid, week])
            for anchor in pc + co_workers:
                model.add(sum(members_by_anchor[anchor]) <= 4 * assignment[loc, week, anchor, anchor])
            count = sum(assignment[loc, week, aid, aid] for aid in ids)
            supply = payload["capacity"][loc][week - 1]
            allowance = 0 if payload["disrupted"][loc][week - 1] or scenario == "A" else (1 if scenario == "C" else len(ids))
            model.add(count <= supply + allowance)
            if tight:
                # Redundant linear consequences of the exact possession count:
                # every PM needs its own group; a shared group hosts <=1 PC
                # and <=4 total PC/C members.
                limit = supply + allowance
                pm_count = sum(x[aid, week] for aid in pm)
                model.add(pm_count + sum(x[aid, week] for aid in pc) <= limit)
                model.add(4 * pm_count + sum(x[aid, week] for aid in shared) <= 4 * limit)
            excess = model.new_int_var(0, len(ids), f"excess_{loc}_{week}")
            model.add_max_equality(excess, [0, count - supply])
            if scenario != "A":
                objective.append(70 * excess)
    if incumbent_groups:
        for (loc, week, aid, anchor), variable in assignment.items():
            if contracts[activities[aid]["contractNumber"]]["accessType"] == "C":
                model.add_hint(variable, int(incumbent_anchor.get((loc, week, aid)) == anchor))

    # Equal component labels alone could invent exemptions between disconnected
    # spans. Every active vertex therefore selects itself as a unique root or
    # a parent along an actual sharing edge, with strictly decreasing depth.
    size = len(activities)
    component, depth, root, parents = {}, {}, {}, {}
    for aid in activities:
        for week in weeks:
            key = aid, week
            component[key] = model.new_int_var(0, activity_order[aid], f"component_{aid}_{week}")
            depth[key] = model.new_int_var(0, max(0, size - 1), f"depth_{aid}_{week}")
            root[key] = model.new_bool_var(f"root_{aid}_{week}")
            parents[key] = []
            model.add(component[key] >= x[key])
            model.add(component[key] <= size * x[key])
            model.add(root[key] <= x[key])
            model.add(component[key] == activity_order[aid]).only_enforce_if(root[key])
            model.add(depth[key] <= max(0, size - 1) * (x[key] - root[key]))
    for (first_id, second_id, week), choices in sharing_assignments.items():
        shared_edge = model.new_bool_var(f"shared_{first_id}_{second_id}_{week}")
        model.add_max_equality(shared_edge, choices)
        model.add(component[first_id, week] == component[second_id, week]).only_enforce_if(shared_edge)
        for child, parent in ((first_id, second_id), (second_id, first_id)):
            variable = model.new_bool_var(f"parent_{child}_{parent}_{week}")
            model.add(variable <= shared_edge)
            model.add(depth[child, week] >= depth[parent, week] + 1).only_enforce_if(variable)
            parents[child, week].append(variable)
    for key in x:
        model.add(root[key] + sum(parents[key]) == x[key])
    for source, target in pairs:
        for week in weeks:
            model.add(component[source, week] == component[target, week]).only_enforce_if(
                [x[source, week], x[target, week]])
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
    access, occupancy = [], []
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
        occupancy = [{"activityId": aid, "week": week, "locationId": loc, "coShareGroup": "g:" + anchor}
                     for (loc, week, aid, anchor), variable in assignment.items() if solver.value(variable)]
    return {"schema": "ps1-cpsat-v1", "digest": payload["digest"], "scenario": scenario,
            "closureModelVersion": payload["closureModelVersion"],
            "formulaVersion": "ps1-objective-v2",
            "scope": "repair" if has_frozen_work else "full",
            "boundScope": "conditional_on_frozen_activities" if has_frozen_work else "encoded_full_model",
            "status": solver.status_name(status), "ortoolsVersion": ortools.__version__,
            "config": config,
            "objective": round(solver.objective_value / 10, 1) if found else None,
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
            "access": access, "occupancy": occupancy}


if __name__ == "__main__":
    print(json.dumps(solve(json.load(sys.stdin))))
