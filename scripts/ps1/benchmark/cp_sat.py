"""PS1 weekly CP-SAT model, matching represented local-checker constraints.

No global physical night is encoded by the published CSVs. This model therefore
cannot certify cross-possession buffer alignment or reference-validator parity.
Possession packing is exact locally: PM alone, at most one PC and four members.
"""
import datetime as dt
import json
import sys
import time

import ortools
from ortools.sat.python import cp_model


def solve(payload):
    if payload.get("schema") != "ps1-cpsat-v1":
        raise ValueError("Unsupported PS1 payload schema")
    workers = payload.get("workers", 1)
    if isinstance(workers, bool) or not isinstance(workers, int) or not 1 <= workers <= 8:
        raise ValueError("workers must be an integer from 1 to 8")
    started = time.perf_counter()
    instance, scenario = payload["instance"], payload["scenario"]
    if scenario not in ("A", "B", "C"):
        raise ValueError("Unknown scenario")
    horizon = instance["parameters"]["horizonWeeks"]
    origin = dt.date.fromisoformat(instance["parameters"]["horizonStart"])
    contracts = {c["contractNumber"]: c for c in instance["contracts"]}
    activities = {a["activityId"]: a for a in instance["activities"]}
    weeks = range(1, horizon + 1)
    model = cp_model.CpModel()
    x, e, first, last = {}, {}, {}, {}
    hints = {(r["activityId"], r["week"]): r for r in payload.get("incumbent", {}).get("access", [])}
    movable = set(payload.get("movableActivityIds", activities))
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
    solver.parameters.max_time_in_seconds = payload.get("seconds", 5)
    solver.parameters.num_search_workers = workers
    solver.parameters.random_seed = payload.get("seed", 1)
    status = solver.solve(model)
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
            "scope": "repair" if len(movable) < len(activities) else "full",
            "status": solver.status_name(status), "ortoolsVersion": ortools.__version__,
            "objective": solver.objective_value / 10 if found else None,
            "bound": solver.best_objective_bound / 10,
            "solveMs": solver.wall_time * 1000,
            "modelAndSolveMs": (time.perf_counter() - started) * 1000, "access": access}


if __name__ == "__main__":
    print(json.dumps(solve(json.load(sys.stdin))))
