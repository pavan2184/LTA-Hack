"""Small, independently calculated conformance cases for the PS1 model."""
import copy
import unittest
from cp_sat import solve


def payload(types, scenario="A", horizon=1, capacity=1, work=1):
    return {"schema": "ps1-cpsat-v1", "digest": "test", "scenario": scenario, "seconds": 2,
            "instance": {"parameters": {"horizonWeeks": horizon, "horizonStart": "2027-01-04"},
                         "lines": [{"lineCode": "ALP"}, {"lineCode": "BET"}],
                         "contracts": [{"contractNumber": str(i), "numberOfWorkfronts": 1,
                                        "numberOfMaximumAccessPerWeek": 3, "accessType": kind,
                                        "contractPriority": 1, "plannedCompletionDate": "2027-01-10"}
                                       for i, kind in enumerate(types)],
                         "activities": [{"activityId": str(i), "contractNumber": str(i), "activityType": "work",
                                         "plannedStartDate": "2027-01-04", "predecessorActivityId": None,
                                         "totalAccesses": work, "activityPriority": 1} for i in range(len(types))],
                         "locationSupply": [{"locationId": "L"}]},
            "spans": {str(i): ["L"] for i in range(len(types))},
            "affectedLines": {str(i): ["ALP"] for i in range(len(types))},
            "capacity": {"L": [capacity] * horizon}, "disrupted": {"L": [False] * horizon}}


class ModelTests(unittest.TestCase):
    def test_invalid_search_controls_are_rejected(self):
        invalid = {"seconds": [0, -1, float("inf"), float("nan"), 10**1000, "60", None, True],
                   "workers": [0, -1, 257, 1.5, "8", None, True],
                   "seed": [-1, 2**31, 1.5, "1", None, True],
                   "profile": ["", "unknown", None, []],
                   "formulation": ["", "unknown", None, [], True]}
        for field, values in invalid.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    p = payload(["C"])
                    p[field] = value
                    with self.assertRaisesRegex(ValueError, field):
                        solve(p)

    def test_parallel_profiles_preserve_nonzero_objective_and_report_trace(self):
        for profile in ["default", "no_lp", "lns"]:
            with self.subTest(profile=profile):
                p = payload(["PM", "C"], "B")
                p.update({"workers": 2, "seed": 17, "profile": profile})
                result = solve(p)
                self.assertEqual(result["status"], "OPTIMAL")
                self.assertEqual(result["objective"], 7)
                self.assertEqual(result["bound"], 7)
                self.assertEqual(result["config"], {"seconds": 2, "workers": 2, "seed": 17,
                                                     "profile": profile, "hinted": False})
                self.assertEqual(result["boundScope"], "encoded_full_model")
                points = result["solutionTrace"]
                self.assertGreater(len(points), 0)
                self.assertEqual(result["firstSolutionMs"], points[0]["timeMs"])
                self.assertEqual(points[-1]["objective"], 7)
                self.assertLessEqual(points[0]["timeMs"], result["solveMs"])
                self.assertEqual(result["traceClock"], "native_solve_wall_time_excluding_model_build")
                self.assertGreaterEqual(result["buildMs"], 0)
                self.assertAlmostEqual(result["buildMs"] + result["solveCallMs"],
                                       result["modelAndSolveMs"])
                self.assertGreater(result["modelStats"]["variables"], 0)
                self.assertEqual(result["peakRssScope"], "process_lifetime")

    def test_unsatisfiable_model_has_no_solution_trace(self):
        result = solve(payload(["PM", "PM"]))
        self.assertEqual(result["status"], "INFEASIBLE")
        self.assertIsNone(result["objective"])
        self.assertIsNone(result["firstSolutionMs"])
        self.assertEqual(result["solutionTrace"], [])
        self.assertEqual(result["config"]["workers"], 1)
        self.assertEqual(result["config"]["seed"], 1)
        self.assertEqual(result["config"]["profile"], "default")

    def test_four_way_sharing(self):
        for kinds in [["PC", "C", "C", "C"], ["C"] * 4]:
            result = solve(payload(kinds))
            self.assertEqual(result["status"], "OPTIMAL")
            self.assertEqual(result["objective"], 0)

    def test_pm_alone_and_single_pc(self):
        for kinds in [["PM", "C"], ["PC", "PC"], ["C"] * 5]:
            self.assertEqual(solve(payload(kinds))["status"], "INFEASIBLE")
            for scenario in ["B", "C"]:
                self.assertEqual(solve(payload(kinds, scenario))["objective"], 7)

    def test_physical_disruption_cannot_be_bought_back(self):
        p = payload(["PM"], "B", capacity=0)
        p["disrupted"]["L"] = [True]
        self.assertEqual(solve(p)["status"], "INFEASIBLE")

    def test_deadline_is_a_date_not_just_a_week(self):
        p = payload(["PM"], "B")
        p["instance"]["contracts"][0]["plannedCompletionDate"] = "2027-01-06"
        self.assertEqual(solve(p)["status"], "INFEASIBLE")

    def test_strict_precedence(self):
        p = payload(["C", "C"], horizon=2)
        p["instance"]["activities"][1]["predecessorActivityId"] = "0"
        result = solve(p)
        self.assertEqual(result["objective"], 910)
        self.assertGreater(min(r["week"] for r in result["access"] if r["activityId"] == "1"),
                           max(r["week"] for r in result["access"] if r["activityId"] == "0"))

    def test_on_time_activity_is_not_charged_for_contract_delay(self):
        p = payload(["C", "C"], horizon=2)
        p["instance"]["activities"][0]["totalAccesses"] = 2
        p["instance"]["activities"][1]["contractNumber"] = "0"
        p["instance"]["activities"][1]["activityPriority"] = 3
        self.assertEqual(solve(p)["objective"], 910)

    def fixed_activity_weeks(self, weeks, scenario="A", due="2027-01-10"):
        p = payload(["C", "C"], scenario, horizon=3)
        p["instance"]["contracts"][0]["contractPriority"] = 3
        p["instance"]["contracts"][0]["plannedCompletionDate"] = due
        p["instance"]["activities"][1]["contractNumber"] = "0"
        p["instance"]["activities"][1]["activityPriority"] = 3
        p["movableActivityIds"] = []
        p["incumbent"] = {"access": [{"activityId": str(i), "week": w, "eclo": 0}
                                      for i, w in enumerate(weeks)]}
        result = solve(p)
        self.assertEqual(result["status"], "OPTIMAL")
        return result["objective"]

    def test_all_late_activities_are_charged_at_their_own_completion(self):
        for scenario in ["A", "C"]:
            # Jan 17 is seven days late at 1.3/day; Jan 24 is 14 at 1/day.
            self.assertEqual(self.fixed_activity_weeks([2, 3], scenario), 23.1)

    def test_delaying_an_activity_cannot_erase_another_activitys_penalty(self):
        self.assertEqual(self.fixed_activity_weeks([2, 2]), 16.1)
        self.assertEqual(self.fixed_activity_weeks([2, 3]), 23.1)

    def test_midweek_deadline_uses_each_activitys_own_day_difference(self):
        self.assertEqual(self.fixed_activity_weeks([2, 3], due="2027-01-13"), 16.2)

    def test_worker_count_is_bounded_and_defaults_to_one(self):
        self.assertEqual(solve(payload(["C"]))["objective"], 0)
        p = payload(["C"])
        for workers in [2, 16, 32]:
            p["workers"] = workers
            self.assertEqual(solve(p)["objective"], 0)
        for workers in [0, 257, 1.5, "2", True]:
            p["workers"] = workers
            with self.assertRaisesRegex(ValueError, "workers"):
                solve(p)

    def test_unknown_movable_ids_cannot_create_a_false_full_model_proof(self):
        for requested in [["missing"], ["0", "missing"], None, "0", [1]]:
            p = payload(["C"], horizon=2)
            p["incumbent"] = {"access": [{"activityId": "0", "week": 2, "eclo": 0}]}
            p["movableActivityIds"] = requested
            with self.subTest(requested=requested), self.assertRaisesRegex(ValueError, "movableActivityIds"):
                solve(p)

    def test_repair_requires_an_incumbent(self):
        for incumbent in [None, {}, {"access": None}]:
            p = payload(["C"])
            p["movableActivityIds"] = []
            if incumbent is not None:
                p["incumbent"] = incumbent
            with self.subTest(incumbent=incumbent), self.assertRaisesRegex(ValueError, "incumbent"):
                solve(p)

    def test_all_known_activities_movable_has_a_full_model_bound(self):
        p = payload(["C"], horizon=2)
        p["incumbent"] = {"access": [{"activityId": "0", "week": 2, "eclo": 0}]}
        p["movableActivityIds"] = ["0"]
        result = solve(p)
        self.assertEqual(result["scope"], "full")
        self.assertEqual(result["boundScope"], "encoded_full_model")
        self.assertEqual(result["formulaVersion"], "ps1-objective-v2")
        self.assertEqual(result["objective"], 0)

    def test_live_window_couples_both_lines(self):
        p = payload(["C", "C"], "C", horizon=4, work=2)
        p["affectedLines"]["0"] = ["ALP", "BET"]
        p["affectedLines"]["1"] = ["BET"]
        p["pins"] = [{"activityId": "0", "week": 1, "eclo": 1},
                     {"activityId": "1", "week": 4, "eclo": 1}]
        self.assertEqual(solve(p)["status"], "INFEASIBLE")

    def test_repair_freezes_unselected_work(self):
        p = payload(["C"], horizon=2)
        p["incumbent"] = {"access": [{"activityId": "0", "week": 2, "eclo": 0}]}
        p["movableActivityIds"] = []
        result = solve(p)
        self.assertEqual(result["scope"], "repair")
        self.assertEqual(result["boundScope"], "conditional_on_frozen_activities")
        self.assertTrue(result["config"]["hinted"])
        self.assertEqual(result["objective"], 910)
        self.assertEqual([r["week"] for r in result["access"]], [2])


class TightFormulationTests(unittest.TestCase):
    """Both formulations must retain the hand-calculated feasible set/optimum."""

    def assert_formulations(self, p, objective, scope="full"):
        results = []
        for formulation in ("baseline", "tight"):
            with self.subTest(formulation=formulation):
                candidate = copy.deepcopy(p)
                candidate["formulation"] = formulation
                result = solve(candidate)
                self.assertEqual(result["config"]["formulation"], formulation)
                self.assertEqual(result["scope"], scope)
                self.assertEqual(result["boundScope"], "encoded_full_model" if scope == "full"
                                 else "conditional_on_frozen_activities")
                self.assertEqual(result["status"], "INFEASIBLE" if objective is None else "OPTIMAL")
                self.assertEqual(result["objective"], objective)
                if objective is not None:
                    self.assertEqual(result["bound"], objective)
                    for activity in p["instance"]["activities"]:
                        rows = [r for r in result["access"] if r["activityId"] == activity["activityId"]]
                        self.assertGreaterEqual(sum(1 + r["eclo"] / 2 for r in rows), activity["totalAccesses"])
                        self.assertEqual(len({r["week"] for r in rows}), len(rows))
                    for pin in p.get("pins", []):
                        self.assertTrue(any(r["activityId"] == pin["activityId"] and r["week"] == pin["week"]
                                            and r["eclo"] == pin.get("eclo", 0) for r in result["access"]))
                results.append(result)
        return results

    def test_formulation_is_opt_in_and_preserves_default_config(self):
        default = solve(payload(["C"]))
        self.assertNotIn("formulation", default["config"])
        baseline, tight = self.assert_formulations(payload(["C"]), 0)
        self.assertEqual(default["modelStats"], baseline["modelStats"])
        self.assertGreater(tight["modelStats"]["constraints"], baseline["modelStats"]["constraints"])

    def test_workload_and_eclo_window_bounds_preserve_independent_optima(self):
        # Three standard nights finish two weeks late: 14 days * 100 * 1.3.
        self.assert_formulations(payload(["C"], "A", horizon=3, work=3), 1820)
        # Two ECLO nights deliver three accesses a week earlier: 910 + 2*5.
        self.assert_formulations(payload(["C"], "C", horizon=3, work=3), 920)
        # B can use four ECLO nights to deliver six accesses in four weeks;
        # C's two ECLO nights can deliver only five in that same horizon.
        for scenario, expected in (("B", 20), ("C", None)):
            p = payload(["C"], scenario, horizon=4, work=6)
            p["instance"]["contracts"][0]["plannedCompletionDate"] = "2027-01-31"
            self.assert_formulations(p, expected)
        # No relaxation can create a second distinct activity-week in a
        # one-week horizon, even when its yield would exceed a standard night.
        self.assert_formulations(payload(["C"], "C", horizon=1, work=2), None)

    def test_capacity_cuts_preserve_each_legal_mix_and_excess_cost(self):
        # The required counts follow by explicitly packing the listed members.
        # PM+C needs two groups; two PCs need two; PC+3C fits one; five Cs need two.
        for kinds, groups in ((["PM", "C"], 2), (["PC", "PC"], 2),
                              (["PC", "C", "C", "C"], 1), (["C"] * 5, 2),
                              (["PM", "PM", "PC", "C"], 3)):
            for scenario in ("A", "B", "C"):
                with self.subTest(kinds=kinds, scenario=scenario):
                    excess = groups - 1
                    expected = None if (scenario == "A" and excess > 0) or (scenario == "C" and excess > 1) else 7 * excess
                    self.assert_formulations(payload(kinds, scenario), expected)
        p = payload(["PM", "C"], "B")
        p["disrupted"]["L"] = [True]
        self.assert_formulations(p, None)

    def test_precedence_and_exact_pins_survive_tightening(self):
        p = payload(["C", "C"], horizon=4, work=2)
        p["instance"]["activities"][1]["predecessorActivityId"] = "0"
        # Earliest completions are weeks 2 and 4: (7+21)*130.
        self.assert_formulations(p, 3640)
        p = payload(["C"], "C", horizon=3, work=3)
        p["pins"] = [{"activityId": "0", "week": w, "eclo": 0} for w in (1, 2, 3)]
        self.assert_formulations(p, 1820)
        p["pins"] = [{"activityId": "0", "week": w, "eclo": 1} for w in (1, 3)]
        self.assert_formulations(p, None)

    def test_frozen_repair_preserves_accesses_and_conditional_proof_scope(self):
        p = payload(["C", "C"], horizon=3)
        p["instance"]["activities"][1]["predecessorActivityId"] = "0"
        p["incumbent"] = {"access": [{"activityId": "0", "week": 2, "eclo": 0},
                                      {"activityId": "1", "week": 3, "eclo": 0}]}
        p["movableActivityIds"] = ["1"]
        for result in self.assert_formulations(p, 2730, "repair"):
            self.assertEqual([(r["week"], r["eclo"]) for r in result["access"] if r["activityId"] == "0"], [(2, 0)])
        # Full delivery is a lower bound, not an exact count: frozen surplus
        # standard nights must remain legal under the redundant constraints.
        p = payload(["C"], horizon=3)
        p["incumbent"] = {"access": [{"activityId": "0", "week": w, "eclo": 0} for w in (1, 2, 3)]}
        p["movableActivityIds"] = []
        for result in self.assert_formulations(p, 1820, "repair"):
            self.assertEqual([r["week"] for r in result["access"]], [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
