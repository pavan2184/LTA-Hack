"""Cross-check the entire small public input space against an independent DP."""

from copy import deepcopy
from itertools import combinations, product
import unittest
from unittest.mock import patch

from ortools.sat.python import cp_model

from model import (
    HORIZON,
    JOBS,
    InvalidSettings,
    InvalidSolution,
    Settings,
    parse_settings,
    solve_demo,
    validate_solution,
)


def enumerated_optimum(capacity, closed_week, precedence):
    """Enumerate weekly work subsets; no CP-SAT or production validation code."""
    target = tuple(job["accesses"] for job in JOBS)
    predecessor = [
        next(
            (
                index
                for index, other in enumerate(JOBS)
                if other["id"] == job["predecessor"]
            ),
            None,
        )
        for job in JOBS
    ]
    frontier = {tuple(0 for _ in JOBS): 0}
    for week in range(1, HORIZON + 1):
        capacity_this_week = 0 if week == closed_week else capacity
        following = {}
        for delivered, score in frontier.items():
            eligible = [
                index
                for index, count in enumerate(delivered)
                if count < target[index]
                and (
                    not precedence
                    or predecessor[index] is None
                    or delivered[predecessor[index]] == target[predecessor[index]]
                )
            ]
            for size in range(min(capacity_this_week, len(eligible)) + 1):
                for selection in combinations(eligible, size):
                    updated = list(delivered)
                    total = score
                    for index in selection:
                        updated[index] += 1
                        if updated[index] == target[index]:
                            total += (
                                max(week - JOBS[index]["dueWeek"], 0)
                                * JOBS[index]["weight"]
                            )
                    state = tuple(updated)
                    following[state] = min(total, following.get(state, float("inf")))
        frontier = following
    return frontier.get(target)


class ModelTests(unittest.TestCase):
    def test_all_54_settings_match_independent_exact_enumeration(self):
        for capacity, closed, precedence in product(
            range(1, 4), [None, *range(1, 9)], [False, True]
        ):
            with self.subTest(capacity=capacity, closed=closed, precedence=precedence):
                settings = Settings(capacity, closed, precedence)
                result = solve_demo(settings.as_dict())
                expected = enumerated_optimum(capacity, closed, precedence)
                if expected is None:
                    self.assertEqual(result["status"], "INFEASIBLE")
                    self.assertIsNone(result["objective"])
                    self.assertIsNone(result["bestBound"])
                    self.assertEqual(result["jobs"], [])
                    self.assertEqual(result["checks"], [])
                    self.assertEqual(result["usageByWeek"], [])
                else:
                    self.assertEqual(result["status"], "OPTIMAL")
                    self.assertEqual(result["objective"], expected)
                    self.assertEqual(result["bestBound"], expected)
                    self.assertEqual(sum(result["usageByWeek"]), 9)
                    self.assertTrue(all(check["passed"] for check in result["checks"]))
                    validate_solution(settings, result["jobs"], expected)

    def test_default_repeats_return_same_schedule_and_objective(self):
        first = solve_demo(Settings().as_dict())
        second = solve_demo(Settings().as_dict())
        self.assertEqual(first["jobs"], second["jobs"])
        self.assertEqual(first["objective"], second["objective"])

    def test_capacity_one_never_drops_work_to_fit(self):
        result = solve_demo(Settings(capacity=1).as_dict())
        self.assertEqual(result["status"], "INFEASIBLE")
        self.assertEqual(result["jobs"], [])

    def test_explanation_reports_schedule_facts_and_actual_predecessor_finish(self):
        result = solve_demo(Settings().as_dict())
        by_id = {job["id"]: job for job in result["jobs"]}
        for job in result["jobs"]:
            self.assertIn(f"Due in week {job['dueWeek']}", job["explanation"])
            self.assertNotIn("(s)", job["explanation"])
            self.assertNotIn("×", job["explanation"])
            if job["predecessor"]:
                previous = by_id[job["predecessor"]]
                self.assertIn(
                    f"after {previous['id']} finishes in week {previous['completion']}",
                    job["explanation"],
                )
        self.assertEqual(
            by_id["A06"]["explanation"],
            "Scheduled in weeks 5 and 6, after A03 finishes in week 4. "
            "Due in week 5; completion is one week late.",
        )
        relaxed = solve_demo(Settings(enforce_predecessors=False).as_dict())
        for job in relaxed["jobs"]:
            if job["predecessor"]:
                self.assertIn("Predecessor enforcement is disabled", job["explanation"])
                self.assertNotIn(", after", job["explanation"])

    def test_settings_reject_coercion_and_unbounded_inputs(self):
        invalid = [None, [], {}, {**Settings().as_dict(), "upload": "file"}]
        for field, values in {
            "capacity": [True, False, "2", 2.0, None, 0, 4, [], {}],
            "closedWeek": [False, True, "1", 1.0, 0, 9, [], {}],
            "enforcePredecessors": [0, 1, "true", None, [], {}],
        }.items():
            invalid.extend({**Settings().as_dict(), field: value} for value in values)
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(InvalidSettings):
                parse_settings(value)

    def test_independent_validator_rejects_missing_and_forged_work(self):
        result = solve_demo(Settings().as_dict())
        for mutation in (
            "missing_job",
            "missing_access",
            "duplicate_week",
            "out_of_horizon",
            "penalty",
            "fixed_facts",
            "objective",
        ):
            rows = deepcopy(result["jobs"])
            score = result["objective"]
            if mutation == "missing_job":
                rows.pop()
            elif mutation == "missing_access":
                rows[1]["weeks"].pop()
            elif mutation == "duplicate_week":
                rows[1]["weeks"] = [2, 2]
            elif mutation == "out_of_horizon":
                rows[0]["weeks"] = [9]
            elif mutation == "penalty":
                rows[0]["penalty"] += 1
            elif mutation == "fixed_facts":
                rows[0]["weight"] = 1000
            else:
                score += 1
            with self.subTest(mutation=mutation), self.assertRaises(InvalidSolution):
                validate_solution(Settings(), rows, score)

    def test_independent_validator_rejects_closed_week_and_capacity(self):
        result = solve_demo(Settings().as_dict())
        for settings in (
            Settings(1),
            Settings(closed_week=result["jobs"][0]["weeks"][0]),
        ):
            with self.subTest(settings=settings), self.assertRaises(InvalidSolution):
                validate_solution(settings, result["jobs"], result["objective"])

    def test_independent_validator_rejects_disabled_predecessor_plan_when_enabled(self):
        settings = Settings(capacity=3, enforce_predecessors=False)
        result = solve_demo(settings.as_dict())
        with self.assertRaises(InvalidSolution):
            validate_solution(Settings(capacity=3), result["jobs"], result["objective"])

    def test_unknown_does_not_publish_plan_or_optimality(self):
        class UnknownSolver:
            def __init__(self):
                self.parameters = type("Parameters", (), {})()
                self.wall_time = 2.0

            def solve(self, _model):
                return cp_model.UNKNOWN

            def status_name(self, _status):
                return "UNKNOWN"

        with patch("model.cp_model.CpSolver", UnknownSolver):
            result = solve_demo(Settings().as_dict())
        self.assertEqual(result["status"], "UNKNOWN")
        self.assertIsNone(result["objective"])
        self.assertIsNone(result["bestBound"])
        self.assertEqual(result["jobs"], [])
        self.assertEqual(result["checks"], [])


if __name__ == "__main__":
    unittest.main()
