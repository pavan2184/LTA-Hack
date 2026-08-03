import { expandSector } from "@/domain/network";

/**
 * The versioned emergency scenario set.
 *
 * "Emergency capacity" is meaningless as a bare score, so it is defined as the
 * proportion of these scenarios that can be inserted into a finished plan
 * without displacing any mandatory work. Change this list and the number
 * changes; that is the point.
 */
export interface EmergencyScenario {
  id: string;
  label: string;
  blockIds: string[];
  durationMinutes: number;
  teamId: string;
  equipmentId: string;
  /** Earliest the emergency crew could be on site. */
  earliestStart: number;
}

export const EMERGENCY_SET_VERSION = "emergency-set-v1";

export const emergencyScenarios: EmergencyScenario[] = [
  {
    id: "EM-A",
    label: "Track circuit fault, Canberra to Khatib",
    blockIds: expandSector("NS12-NS14"),
    durationMinutes: 60,
    teamId: "T-RRT",
    equipmentId: "E-RIV",
    earliestStart: 90,
  },
  {
    id: "EM-B",
    label: "Broken rail report, Admiralty to Canberra",
    blockIds: expandSector("NS10-NS12"),
    durationMinutes: 45,
    teamId: "T-RRT",
    equipmentId: "E-TRL",
    earliestStart: 60,
  },
  {
    id: "EM-C",
    label: "Traction supply alarm, Redhill to Commonwealth",
    blockIds: expandSector("EW18-EW20"),
    durationMinutes: 60,
    teamId: "T-RRT",
    equipmentId: "E-CIT",
    earliestStart: 90,
  },
  {
    id: "EM-D",
    label: "Platform door failure, MacPherson to Bartley",
    blockIds: expandSector("CC10-CC12"),
    durationMinutes: 45,
    teamId: "T-RRT",
    equipmentId: "E-DFG",
    earliestStart: 120,
  },
];
