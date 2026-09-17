import type { HardViolation, ViolationRule } from "../types/ps1";

/**
 * Violation rules grouped into the things a works controller can act on.
 *
 * The validator reports eleven rule tags because that is what the brief names,
 * but "weekly_allocation" and "workfront" are the same conversation with a
 * contractor, and "capacity" and "mix" are the same conversation about a
 * location. Grouping them is what turns a list of failures into a list of
 * decisions.
 */
export type ConflictCategory =
  | "delivery"
  | "capacity"
  | "allocation"
  | "early-closure"
  | "schedule"
  | "data";

export interface CategoryProfile {
  id: ConflictCategory;
  label: string;
  /** What this category means in operational terms, not rule terms. */
  description: string;
  /** The lever that resolves it, so the panel suggests an action not a fact. */
  lever: string;
  rules: ViolationRule[];
}

export const conflictCategories: CategoryProfile[] = [
  {
    id: "delivery",
    label: "Delivery",
    description:
      "Work is missing or short. The full workload of every activity is the mandatory gate before any quality score counts.",
    lever: "Schedule the remaining accesses, extending past the planned date if that is the only way.",
    rules: ["workload", "start_date"],
  },
  {
    id: "capacity",
    label: "Location capacity",
    description:
      "A location is holding more possessions than it has nights, or an illegal mix of possession types.",
    lever: "Move a possession to another week, or co-share it into an existing slot.",
    rules: ["closure", "capacity", "mix"],
  },
  {
    id: "allocation",
    label: "Contract allocation",
    description:
      "A contract is using more access-nights in a week than it was granted, or running more concurrent workfronts than it has teams.",
    lever: "Spread the contract's activities across more weeks, or reduce concurrency.",
    rules: ["weekly_allocation", "workfront"],
  },
  {
    id: "early-closure",
    label: "Early closure",
    description:
      "ECLO used where the scenario forbids it, or spread wider than the two-week continuity window a line is allowed.",
    lever: "Drop the ECLO nights, or pull them into one fortnight per line.",
    rules: ["eclo", "eclo_window"],
  },
  {
    id: "schedule",
    label: "Completion dates",
    description: "A contract finishes after its planned completion date.",
    lever: "Compress with ECLO or extra nights, or accept the overrun on a lower-priority contract.",
    rules: ["planned_date"],
  },
  {
    id: "data",
    label: "Submission shape",
    description:
      "The submission references something the instance does not define, or omits part of an activity's declared span.",
    lever: "Regenerate the submission; this is a tool fault rather than a planning one.",
    rules: ["schema"],
  },
];

const byRule = new Map<ViolationRule, CategoryProfile>();
for (const profile of conflictCategories) {
  for (const rule of profile.rules) byRule.set(rule, profile);
}

export function categoryOf(rule: ViolationRule): CategoryProfile {
  const profile = byRule.get(rule);
  // A new rule tag should surface as unclassified rather than silently vanish
  // into whichever category happened to be first.
  return profile ?? conflictCategories[conflictCategories.length - 1];
}

export interface CategorySummary {
  category: CategoryProfile;
  count: number;
  violations: HardViolation[];
}

/** Group violations by category, worst first, so the panel leads with the pile. */
export function summariseByCategory(violations: HardViolation[]): CategorySummary[] {
  const grouped = new Map<ConflictCategory, HardViolation[]>();
  for (const violation of violations) {
    const id = categoryOf(violation.rule).id;
    grouped.set(id, [...(grouped.get(id) ?? []), violation]);
  }
  return [...grouped]
    .map(([id, list]) => ({
      category: conflictCategories.find((profile) => profile.id === id)!,
      count: list.length,
      violations: list,
    }))
    .sort((a, b) => b.count - a.count || a.category.label.localeCompare(b.category.label));
}
