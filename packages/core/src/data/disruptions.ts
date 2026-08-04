import { requests } from "../data/requests";
import { expandSector } from "../domain/network";
import type { ValidationContext } from "../engine/validate";
import type { DisruptionScenario, MaintenanceRequest, Placement } from "../types/railplan";

/**
 * Disruptions are changes to the *inputs*, not to the output.
 *
 * Each scenario below rewrites the request set, the validation context or both,
 * and the plan is then solved again from scratch. Nothing is pre-baked: if a
 * scenario turns out to have no feasible answer, the solver says so.
 */

export const emergencyInsertion: MaintenanceRequest = {
  id: "EM-001",
  title: "Emergency track fault inspection",
  shortTitle: "Emergency fault",
  workType: "Emergency inspection",
  workClass: "track-possession",
  blockIds: expandSector("NS12-NS14"),
  sector: "NS12-NS14",
  durationMinutes: 60,
  clearanceMinutes: 0,
  priority: "critical",
  teamId: "T-RRT",
  requiredSkills: ["emergency"],
  equipment: [{ equipmentId: "E-RIV", units: 1 }],
  preferredStart: 120,
  earliestStart: 120,
  latestEnd: 180,
  mandatory: true,
  dependencies: [],
  dependencyLagMinutes: 0,
  description:
    "Urgent inspection raised by a track circuit fault indication. Must run between 02:00 and 03:00.",
};

export const disruptionScenarios: DisruptionScenario[] = [
  {
    id: "track-fault",
    title: "Emergency track fault",
    description:
      "A track circuit fault forces a 60-minute emergency inspection into NS12-NS14 between 02:00 and 03:00.",
    kind: "block-closure",
    blockIds: expandSector("NS12-NS14"),
    fromMinute: 120,
    toMinute: 180,
    insertRequestId: "EM-001",
  },
  {
    id: "team-unavailable",
    title: "Crew withdrawn",
    description: "Team Alpha is withdrawn from 01:30. Work assigned to it must finish first or move.",
    kind: "team-unavailable",
    teamId: "T-ALP",
    fromMinute: 90,
    toMinute: 240,
  },
  {
    id: "work-overrun",
    title: "Work overrun",
    description: "Rail grinding on M-008 runs 45 minutes beyond its planned duration.",
    kind: "overrun",
    requestId: "M-008",
    overrunMinutes: 45,
    fromMinute: 0,
    toMinute: 240,
  },
  {
    id: "window-shortened",
    title: "Engineering window shortened",
    description: "Handback is brought forward to 03:30. Everything must be clear 30 minutes early.",
    kind: "window-shortened",
    windowEnd: 210,
    fromMinute: 210,
    toMinute: 240,
  },
];

export const disruptionById: Record<string, DisruptionScenario> = Object.fromEntries(
  disruptionScenarios.map((scenario) => [scenario.id, scenario]),
);

export interface DisruptionInputs {
  requests: MaintenanceRequest[];
  context: ValidationContext;
  locked: Placement[];
}

/**
 * Translate a scenario into solver inputs.
 *
 * `basePlan` is only used to pin work that the disruption does not get to move,
 * such as the job that is already overrunning.
 */
export function buildDisruptionInputs(
  scenario: DisruptionScenario,
  basePlacements: Placement[],
): DisruptionInputs {
  switch (scenario.kind) {
    case "block-closure": {
      // The emergency job joins the request set as mandatory work and is pinned
      // to its window. Everything else has to fit around it.
      const pool = [...requests, emergencyInsertion];
      return {
        requests: pool,
        context: { extraRequests: { [emergencyInsertion.id]: emergencyInsertion } },
        locked: [
          {
            requestId: emergencyInsertion.id,
            startMinute: emergencyInsertion.preferredStart,
            endMinute: emergencyInsertion.preferredStart + emergencyInsertion.durationMinutes,
            teamId: emergencyInsertion.teamId,
            locked: true,
          },
        ],
      };
    }

    case "team-unavailable":
      return {
        requests,
        context: {
          unavailableTeams: [{ teamId: scenario.teamId!, fromMinute: scenario.fromMinute }],
        },
        locked: [],
      };

    case "overrun": {
      // The overrun is carried by the placement itself: the job keeps its start
      // and simply occupies more of the window. Pinning it that way means the
      // validator sees the longer footprint without any special case, and the
      // solver has to fit the rest of the night around the real end time.
      const target = requests.find((request) => request.id === scenario.requestId);
      const existing = basePlacements.find((placement) => placement.requestId === scenario.requestId);
      if (!target || !existing) return { requests, context: {}, locked: [] };
      return {
        requests,
        context: {},
        locked: [
          {
            ...existing,
            endMinute: existing.startMinute + target.durationMinutes + (scenario.overrunMinutes ?? 0),
            locked: true,
          },
        ],
      };
    }

    case "window-shortened":
      return { requests, context: { windowEnd: scenario.windowEnd }, locked: [] };

    default:
      return { requests, context: {}, locked: [] };
  }
}
