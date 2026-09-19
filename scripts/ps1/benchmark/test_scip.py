"""Hand-calculated SCIP regressions, including every late activity's penalty."""
import copy
import unittest

import test_cp_sat
from cp_sat import solve as solve_cp_sat
from scip import solve
from test_cp_sat import payload


class ScipModelTests(unittest.TestCase):
    """Run the existing independent cases against the distinct MIP engine."""

    test_four_way_sharing = test_cp_sat.ModelTests.test_four_way_sharing
    test_pm_alone_and_single_pc = test_cp_sat.ModelTests.test_pm_alone_and_single_pc
    test_physical_disruption_cannot_be_bought_back = test_cp_sat.ModelTests.test_physical_disruption_cannot_be_bought_back
    test_deadline_is_a_date_not_just_a_week = test_cp_sat.ModelTests.test_deadline_is_a_date_not_just_a_week
    test_strict_precedence = test_cp_sat.ModelTests.test_strict_precedence
    test_on_time_activity_is_not_charged_for_contract_delay = test_cp_sat.ModelTests.test_on_time_activity_is_not_charged_for_contract_delay
    fixed_activity_weeks = test_cp_sat.ModelTests.fixed_activity_weeks
    test_all_late_activities_are_charged_at_their_own_completion = test_cp_sat.ModelTests.test_all_late_activities_are_charged_at_their_own_completion
    test_delaying_an_activity_cannot_erase_another_activitys_penalty = test_cp_sat.ModelTests.test_delaying_an_activity_cannot_erase_another_activitys_penalty
    test_midweek_deadline_uses_each_activitys_own_day_difference = test_cp_sat.ModelTests.test_midweek_deadline_uses_each_activitys_own_day_difference
    test_unknown_movable_ids_cannot_create_a_false_full_model_proof = test_cp_sat.ModelTests.test_unknown_movable_ids_cannot_create_a_false_full_model_proof
    test_repair_requires_an_incumbent = test_cp_sat.ModelTests.test_repair_requires_an_incumbent
    test_all_known_activities_movable_has_a_full_model_bound = test_cp_sat.ModelTests.test_all_known_activities_movable_has_a_full_model_bound
    test_live_window_couples_both_lines = test_cp_sat.ModelTests.test_live_window_couples_both_lines
    test_repair_freezes_unselected_work = test_cp_sat.ModelTests.test_repair_freezes_unselected_work

    def setUp(self):
        self.original_solve = test_cp_sat.solve
        test_cp_sat.solve = solve

    def tearDown(self):
        test_cp_sat.solve = self.original_solve

    def test_all_activities_sharing_a_late_finish_are_charged(self):
        p = payload(["C", "C"], horizon=2)
        p["instance"]["activities"][1]["contractNumber"] = "0"
        p["instance"]["activities"][1]["activityPriority"] = 3
        p["pins"] = [{"activityId": "0", "week": 2}, {"activityId": "1", "week": 2}]
        self.assertEqual(solve(p)["objective"], 1610)

    def test_first_week_minimum_is_exact(self):
        p = payload(["C", "C"], horizon=3)
        p["instance"]["activities"][1]["predecessorActivityId"] = "0"
        p["pins"] = [{"activityId": "0", "week": 2}, {"activityId": "1", "week": 1}]
        self.assertEqual(solve(p)["status"], "INFEASIBLE")

    def test_surplus_supply_has_no_negative_penalty(self):
        for scenario in ("A", "B", "C"):
            result = solve(payload(["C"], scenario, capacity=10))
            self.assertEqual(result["objective"], 0)
            self.assertEqual(result["bound"], 0)

    def test_fractional_work_yield_and_future_due_date(self):
        p = payload(["C"], "B", horizon=2, work=3)
        p["instance"]["contracts"][0]["plannedCompletionDate"] = "2028-01-01"
        result = solve(p)
        self.assertEqual(result["objective"], 10)
        self.assertEqual(sum(1 + r["eclo"] / 2 for r in result["access"]), 3)

    def test_night_assignment_respects_workfront_cap(self):
        p = payload(["C"] * 5, capacity=2)
        p["instance"]["contracts"][0]["numberOfWorkfronts"] = 2
        for activity in p["instance"]["activities"]:
            activity["contractNumber"] = "0"
        result = solve(p)
        self.assertEqual(sorted(r["accessNight"] for r in result["access"]), [1, 1, 2, 2, 3])
        p["instance"]["contracts"][0]["numberOfMaximumAccessPerWeek"] = 2
        self.assertEqual(solve(p)["status"], "INFEASIBLE")

    def test_workers_and_hints_are_reported_without_becoming_pins(self):
        p = payload(["C"], horizon=2)
        p["workers"] = 2
        p["seed"] = 3
        p["incumbent"] = {"access": [{"activityId": "0", "week": 2, "eclo": 0}]}
        result = solve(p)
        self.assertEqual(result["objective"], 0)
        self.assertEqual(result["workers"], 2)
        self.assertEqual(result["seed"], 3)
        self.assertIn("SCIP", result["solverVersion"])
        self.assertGreaterEqual(result["modelAndSolveMs"], result["buildMs"] + result["solveMs"])
        self.assertIsNone(result["firstSolutionMs"])
        self.assertEqual(result["solutionTrace"], [])

    def test_small_exhaustive_parameter_grid_matches_cp_sat(self):
        for scenario in ("A", "B", "C"):
            for kinds in (["PM", "C"], ["PC", "C", "C"], ["PC", "PC"]):
                for capacity in (1, 2):
                    p = payload(kinds, scenario, horizon=2, capacity=capacity)
                    scip_result = solve(copy.deepcopy(p))
                    cp_result = solve_cp_sat(copy.deepcopy(p))
                    self.assertEqual(scip_result["status"], cp_result["status"])
                    self.assertEqual(scip_result["objective"], cp_result["objective"])

    def test_invalid_search_parameters(self):
        for key, value in (("workers", 0), ("workers", True), ("seconds", 0),
                           ("seconds", float("nan")), ("seconds", 10 ** 1000),
                           ("seed", -1), ("profile", "no_lp")):
            p = payload(["C"])
            p[key] = value
            with self.assertRaises(ValueError):
                solve(p)


if __name__ == "__main__":
    unittest.main()
