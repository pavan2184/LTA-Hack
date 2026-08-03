import { describe, expect, it } from "vitest";

import { requestById } from "@/data/requests";
import { findOverloads, overlapMinutes } from "@/engine/intervals";
import { buildSubmittedPlan, reviewSubmittedPlan } from "@/engine/solve";
import { clusterViolations, validate, type ValidationContext } from "@/engine/validate";
import type { Plan, Placement, ViolationRuleId } from "@/types/railplan";

function place(requestId: string, startMinute: number, teamId?: string): Placement {
  const request = requestById[requestId];
  return {
    requestId,
    startMinute,
    endMinute: startMinute + request.durationMinutes,
    teamId: teamId ?? request.teamId,
    locked: false,
  };
}

function planOf(...placements: Placement[]): Plan {
  return { placements, deferred: [] };
}

function rules(plan: Plan, context?: ValidationContext): ViolationRuleId[] {
  return validate(plan, context).map((violation) => violation.ruleId);
}

describe("interval arithmetic", () => {
  it("treats touching intervals as not overlapping", () => {
    const a = { requestId: "a", start: 0, end: 60 };
    const b = { requestId: "b", start: 60, end: 120 };
    expect(overlapMinutes(a, b)).toBe(0);
    expect(findOverloads([a, b], 1)).toEqual([]);
  });

  it("counts a one-minute overlap", () => {
    expect(overlapMinutes({ requestId: "a", start: 0, end: 61 }, { requestId: "b", start: 60, end: 120 })).toBe(1);
  });

  it("finds an overload only when capacity is genuinely exceeded", () => {
    const three = [
      { requestId: "a", start: 0, end: 60 },
      { requestId: "b", start: 10, end: 70 },
      { requestId: "c", start: 20, end: 80 },
    ];
    // With two units, no pair is a problem but the three-way window is.
    expect(findOverloads(three, 2)).toHaveLength(1);
    expect(findOverloads(three, 2)[0].requestIds).toEqual(["a", "b", "c"]);
    expect(findOverloads(three, 3)).toEqual([]);
  });

  it("merges a contiguous overload into one finding", () => {
    const overlaps = findOverloads(
      [
        { requestId: "a", start: 0, end: 100 },
        { requestId: "b", start: 20, end: 80 },
      ],
      1,
    );
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].end - overlaps[0].start).toBe(60);
  });
});

describe("constraint rules", () => {
  it("finds a track block overlap between two jobs that share only one block", () => {
    // M-001 covers NS10-NS12; M-017 covers NS11-NS13. Their labels differ.
    const violations = validate(planOf(place("M-001", 0), place("M-017", 45)));
    const block = violations.find((item) => item.ruleId === "BLOCK_CAPACITY");
    expect(block).toBeDefined();
    expect(block!.subjects).toContain("NS11-NS12");
    expect(block!.shortfallMinutes).toBe(15);
  });

  it("finds the single-unit equipment collision behind M-004 and M-011", () => {
    const violations = validate(planOf(place("M-004", 0), place("M-011", 30)));
    const equipment = violations.find((item) => item.ruleId === "EQUIPMENT_CAPACITY");
    expect(equipment).toBeDefined();
    expect(equipment!.subjects).toContain("Thermal imaging unit");
    expect(equipment!.requestIds).toEqual(["M-004", "M-011"]);
  });

  it("finds the traction isolation zone even though the two jobs are on different lines", () => {
    const zone = validate(planOf(place("M-004", 0), place("M-011", 30))).find(
      (item) => item.ruleId === "CONFLICT_ZONE",
    );
    expect(zone).toBeDefined();
    expect(zone!.subjects).toContain("Z-SS4");
  });

  it("does not fire the equipment rule once the two are sequenced apart", () => {
    // M-004 runs 00:00-01:00 with 15 minutes of turnaround on the thermal unit.
    expect(rules(planOf(place("M-004", 0), place("M-011", 75)))).not.toContain("EQUIPMENT_CAPACITY");
  });

  it("respects team capacity greater than one", () => {
    // Power Systems has two crews, so two concurrent jobs are legal for the team
    // even though the shared asset is not.
    const violations = validate(planOf(place("M-004", 0), place("M-011", 30)));
    expect(violations.map((item) => item.ruleId)).not.toContain("TEAM_CAPACITY");
  });

  it("finds a double-booked single crew", () => {
    const team = validate(planOf(place("M-008", 45), place("M-014", 60))).find(
      (item) => item.ruleId === "TEAM_CAPACITY",
    );
    expect(team).toBeDefined();
    expect(team!.subjects).toContain("Team Alpha");
  });

  it("enforces dependency order including the predecessor's clearance and lag", () => {
    const early = validate(planOf(place("M-007", 0), place("M-013", 30))).find(
      (item) => item.ruleId === "DEPENDENCY_ORDER",
    );
    expect(early).toBeDefined();
    // M-007 ends at 00:45 and M-013 requires a further 15 minutes.
    expect(early!.shortfallMinutes).toBe(30);
    expect(rules(planOf(place("M-007", 0), place("M-013", 60)))).not.toContain("DEPENDENCY_ORDER");
  });

  it("flags a dependency whose predecessor was deferred", () => {
    const plan: Plan = {
      placements: [place("M-013", 60)],
      deferred: [{ requestId: "M-007", bindingRuleIds: [], reason: "no slot" }],
    };
    expect(rules(plan)).toContain("DEPENDENCY_ORDER");
  });

  it("enforces the handback deadline including clearance time", () => {
    // M-004 is 60 minutes of work plus 15 minutes of clearance.
    expect(rules(planOf(place("M-004", 180)))).toContain("HANDBACK");
    expect(rules(planOf(place("M-004", 165)))).not.toContain("HANDBACK");
  });

  it("enforces a request's own permitted window", () => {
    // M-014 may not start before 00:30.
    expect(rules(planOf(place("M-014", 0)))).toContain("TIME_WINDOW");
    expect(rules(planOf(place("M-014", 30)))).not.toContain("TIME_WINDOW");
  });

  it("flags a crew that cannot travel between two jobs in time", () => {
    // Team Bravo crosses from the NS line to the EW line: a 20-minute transfer.
    const travel = validate(planOf(place("M-002", 0), place("M-021", 50))).find(
      (item) => item.ruleId === "TRAVEL_TIME",
    );
    expect(travel).toBeDefined();
    expect(travel!.shortfallMinutes).toBe(15);
    expect(rules(planOf(place("M-002", 0), place("M-021", 65)))).not.toContain("TRAVEL_TIME");
  });

  it("does not raise a travel finding on top of an outright overlap", () => {
    // Overlapping jobs are a capacity problem; reporting travel too is noise.
    const violations = rules(planOf(place("M-002", 0), place("M-021", 0)));
    expect(violations).toContain("TEAM_CAPACITY");
    expect(violations).not.toContain("TRAVEL_TIME");
  });

  it("rejects an unqualified crew", () => {
    const skill = validate(planOf(place("M-008", 0, "T-COM"))).find(
      (item) => item.ruleId === "SKILL_COVERAGE",
    );
    expect(skill).toBeDefined();
  });

  it("honours a closed block from the validation context", () => {
    const violations = validate(planOf(place("M-008", 0)), { closedBlockIds: ["NS12-NS13"] });
    expect(violations.map((item) => item.ruleId)).toContain("BLOCK_CAPACITY");
  });

  it("honours a shortened engineering window", () => {
    expect(rules(planOf(place("M-021", 165)))).not.toContain("HANDBACK");
    expect(rules(planOf(place("M-021", 165)), { windowEnd: 210 })).toContain("HANDBACK");
  });

  it("reports one finding per rule and request pair, not one per block", () => {
    // M-008 and M-014 share two blocks; the overlap is a single decision.
    const blockFindings = validate(planOf(place("M-008", 45), place("M-014", 60))).filter(
      (item) => item.ruleId === "BLOCK_CAPACITY",
    );
    expect(blockFindings).toHaveLength(1);
    expect(blockFindings[0].subjects.sort()).toEqual(["NS12-NS13", "NS13-NS14"]);
  });

  it("returns nothing for an empty plan", () => {
    expect(validate({ placements: [], deferred: [] })).toEqual([]);
  });

  it("is stable: the same plan yields the same findings in the same order", () => {
    const plan = planOf(place("M-008", 45), place("M-014", 60), place("M-004", 0), place("M-011", 30));
    expect(validate(plan).map((v) => v.id)).toEqual(validate(plan).map((v) => v.id));
  });
});

describe("the submitted plan", () => {
  it("is infeasible, and every finding is derived rather than declared", () => {
    const result = reviewSubmittedPlan();
    expect(result.status).toBe("INFEASIBLE");
    expect(result.violations.length).toBeGreaterThan(10);
    expect(result.plan.placements).toHaveLength(22);
  });

  it("places every request at exactly the time its requester asked for", () => {
    buildSubmittedPlan().placements.forEach((placement) => {
      expect(placement.startMinute).toBe(requestById[placement.requestId].preferredStart);
    });
  });

  it("groups its findings into connected clusters", () => {
    const clusters = clusterViolations(reviewSubmittedPlan().violations);
    expect(clusters.length).toBeGreaterThan(1);
    // Every violation belongs to exactly one cluster.
    const total = clusters.reduce((sum, cluster) => sum + cluster.violations.length, 0);
    expect(total).toBe(reviewSubmittedPlan().violations.length);
  });
});
