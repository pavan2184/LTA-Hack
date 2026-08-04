import { literalWorld, type PlanningWorld } from "../domain/world";
import { ruleCatalogue } from "../engine/validate";
import type { Violation, ViolationRuleId } from "../types/railplan";

/**
 * The planner's vocabulary for a conflict.
 *
 * The validator reports twelve rules because twelve distinct things can be
 * wrong. A planner asks a shorter question: *what kind* of problem is this, and
 * therefore who do I have to talk to — the possession desk, the roster, the
 * asset controller? These categories are that question, and nothing more: they
 * are a fixed projection of the rule ids, never a second opinion about them.
 */
export type ConflictCategory =
  | "sector"
  | "engineer"
  | "compatibility"
  | "equipment"
  | "sequencing"
  | "window";

export interface ConflictCategoryProfile {
  id: ConflictCategory;
  /** Singular label, used on a badge. */
  label: string;
  /** How the count reads in the summary line, e.g. "10 sector overlaps". */
  plural: string;
  description: string;
  ruleIds: ViolationRuleId[];
  /** Tailwind token stem. Each category owns one hue across the whole UI. */
  tone: string;
}

export const conflictCategories: ConflictCategoryProfile[] = [
  {
    id: "sector",
    label: "Sector overlap",
    plural: "sector overlaps",
    description:
      "Two jobs hold the same track at the same time, or both hold an isolation area that permits only one.",
    ruleIds: ["BLOCK_CAPACITY", "CONFLICT_ZONE"],
    tone: "sector",
  },
  {
    id: "engineer",
    label: "Engineer availability",
    plural: "engineer conflicts",
    description:
      "The assigned team is committed elsewhere, off shift, unqualified, or cannot travel between two jobs in the gap left.",
    ruleIds: ["TEAM_CAPACITY", "SHIFT_AVAILABILITY", "SKILL_COVERAGE", "TRAVEL_TIME"],
    tone: "engineer",
  },
  {
    id: "compatibility",
    label: "Incompatible work",
    plural: "incompatible jobs",
    description:
      "Two work types that cannot share an isolation — or run beside one — are scheduled together.",
    ruleIds: ["WORK_COMPATIBILITY", "ADJACENT_WORK"],
    tone: "compatibility",
  },
  {
    id: "equipment",
    label: "Equipment availability",
    plural: "equipment clashes",
    description: "Concurrent demand for an asset exceeds the number of serviceable units.",
    ruleIds: ["EQUIPMENT_CAPACITY"],
    tone: "equipment",
  },
  {
    id: "sequencing",
    label: "Sequencing",
    plural: "sequencing breaches",
    description: "A job starts before the work it depends on has finished and been handed back.",
    ruleIds: ["DEPENDENCY_ORDER"],
    tone: "sequencing",
  },
  {
    id: "window",
    label: "Engineering hours",
    plural: "engineering-hours breaches",
    description:
      "Work falls outside its permitted window, or runs past handback once its clearance time is added.",
    ruleIds: ["TIME_WINDOW", "HANDBACK"],
    tone: "window",
  },
];

const categoryByRule = new Map<ViolationRuleId, ConflictCategory>(
  conflictCategories.flatMap((profile) => profile.ruleIds.map((ruleId) => [ruleId, profile.id])),
);

export const categoryProfile: Record<ConflictCategory, ConflictCategoryProfile> = Object.fromEntries(
  conflictCategories.map((profile) => [profile.id, profile]),
) as Record<ConflictCategory, ConflictCategoryProfile>;

export function categoryOf(ruleId: ViolationRuleId): ConflictCategory {
  return categoryByRule.get(ruleId) ?? "sector";
}

export function categoryOfViolation(violation: Violation): ConflictCategory {
  return categoryOf(violation.ruleId);
}

export interface ConflictSummary {
  total: number;
  /** Distinct requests named by at least one conflict. */
  requestIds: string[];
  byCategory: {
    profile: ConflictCategoryProfile;
    count: number;
    requestIds: string[];
  }[];
}

/**
 * Count conflicts by category. Categories with nothing in them are dropped, so
 * the summary line never pads itself out with zeroes.
 */
export function summariseConflicts(violations: Violation[]): ConflictSummary {
  const byCategory = conflictCategories
    .map((profile) => {
      const matching = violations.filter((violation) => categoryOf(violation.ruleId) === profile.id);
      return {
        profile,
        count: matching.length,
        requestIds: [...new Set(matching.flatMap((violation) => violation.requestIds))].sort(),
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.profile.id.localeCompare(b.profile.id));

  return {
    total: violations.length,
    requestIds: [...new Set(violations.flatMap((violation) => violation.requestIds))].sort(),
    byCategory,
  };
}

/** "10 sector overlaps · 5 engineer conflicts · 3 incompatible jobs" */
export function summaryLine(summary: ConflictSummary): string {
  return summary.byCategory
    .map((entry) => `${entry.count} ${entry.count === 1 ? entry.profile.label.toLowerCase() : entry.profile.plural}`)
    .join(" · ");
}

/**
 * Conflicts a single request is named in, newest problem first.
 */
export function conflictsFor(violations: Violation[], requestId: string): Violation[] {
  return violations.filter((violation) => violation.requestIds.includes(requestId));
}

/**
 * The categories a request is in trouble for, for the badges on its card.
 */
export function categoriesFor(violations: Violation[], requestId: string): ConflictCategory[] {
  const seen = new Set<ConflictCategory>();
  conflictsFor(violations, requestId).forEach((violation) =>
    seen.add(categoryOf(violation.ruleId)),
  );
  return conflictCategories.filter((profile) => seen.has(profile.id)).map((profile) => profile.id);
}

/**
 * A one-line statement of a conflict in the planner's terms, assembled from the
 * violation's own numbers rather than its engineering prose.
 *
 * "M-014 and M-017 both require NS12-NS13 from 01:00-01:30" is what the rule
 * found; `ruleCatalogue[...].label` is why it is a rule. Both come from the
 * engine, neither is authored per job.
 */
export function headline(violation: Violation): string {
  const ids = violation.requestIds;
  // A conflict zone carries its id first and its name second; the name is the
  // half a planner recognises. A possession overlap can name several blocks, and
  // naming only the first contradicts the detail sentence underneath it.
  const subject =
    (violation.ruleId === "CONFLICT_ZONE"
      ? violation.subjects[violation.subjects.length - 1]
      : violation.ruleId === "BLOCK_CAPACITY" || violation.ruleId === "ADJACENT_WORK"
        ? joinList(violation.subjects)
        : violation.subjects[0]) ?? ruleCatalogue[violation.ruleId].label;
  const names = ids.length > 1 ? `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}` : ids[0];
  const all = ids.length > 2 ? "all" : "both";
  const span = violation.window
    ? `${clock(violation.window.start)}-${clock(violation.window.end)}`
    : null;

  switch (categoryOf(violation.ruleId)) {
    case "sector":
      return span
        ? `${names} ${all} require ${subject} from ${span}.`
        : `${names} ${all} require ${subject}.`;
    case "engineer":
      return span
        ? `${names} ${all} need ${subject} from ${span}.`
        : `${names} cannot be covered by ${subject}.`;
    case "equipment":
      return span
        ? `${names} ${all} need the ${subject} from ${span}.`
        : `${names} ${all} need the ${subject}.`;
    case "compatibility":
      return span
        ? `${names} run incompatible work together from ${span}.`
        : `${names} run incompatible work together.`;
    case "sequencing":
      return `${ids[ids.length - 1]} starts before ${ids[0]} has been handed back.`;
    default:
      return violation.title;
  }
}

/** Priority order for fixing: worst overlap first, mandatory work weighted up. */
export function severityRank(
  violation: Violation,
  world: PlanningWorld = literalWorld(),
): number {
  const mandatory = violation.requestIds.some((id) => world.requestById[id]?.mandatory);
  return violation.shortfallMinutes + (mandatory ? 1000 : 0);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function clock(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
