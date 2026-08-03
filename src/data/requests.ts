import { expandSector, sectorLabel } from "@/domain/network";
import type { WorkClass } from "@/domain/resources";
import type { EquipmentDemand, MaintenanceRequest, Priority } from "@/types/railplan";

/**
 * The 22 maintenance requests for the planning night.
 *
 * Fabricated data. Every field here is an *input* to the planner: nothing in
 * this file states where a job ends up, whether it conflicts with anything, or
 * what any KPI is. Those are computed by the engine from these inputs.
 */

interface Seed {
  id: string;
  title: string;
  shortTitle: string;
  workType: string;
  workClass: WorkClass;
  /** Requested span. Expanded into atomic blocks at module load. */
  sector: string;
  durationMinutes: number;
  priority: Priority;
  teamId: string;
  skill: string;
  equipment: string;
  equipmentUnits?: number;
  /** "HH:MM" within the 00:00-04:00 engineering window. */
  preferredStart: string;
  earliestStart?: string;
  latestEnd?: string;
  clearanceMinutes?: number;
  dependencies?: string[];
  dependencyLagMinutes?: number;
  description: string;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

const seeds: Seed[] = [
  {
    id: "M-001", title: "Ultrasonic rail inspection", shortTitle: "Ultrasonic inspection",
    workType: "Track inspection", workClass: "track-possession", sector: "NS10-NS12",
    durationMinutes: 60, priority: "high", teamId: "T-TRK", skill: "track-inspection",
    equipment: "E-RIV", preferredStart: "00:00",
    description: "Ultrasonic sweep for internal rail defects across the Admiralty to Canberra section.",
  },
  {
    id: "M-002", title: "Switch point lubrication", shortTitle: "Point lubrication",
    workType: "Track maintenance", workClass: "track-possession", sector: "NS13-NS14",
    durationMinutes: 45, priority: "medium", teamId: "T-BRV", skill: "track-maintenance",
    equipment: "E-TRL", preferredStart: "03:00",
    description: "Scheduled lubrication of switch points approaching Khatib.",
  },
  {
    id: "M-003", title: "Signal interlocking test", shortTitle: "Interlocking test",
    workType: "Signalling inspection", workClass: "signalling", sector: "NS14-NS16",
    durationMinutes: 75, priority: "critical", teamId: "T-SIG", skill: "signalling",
    equipment: "E-SIG", preferredStart: "02:00",
    description: "Full interlocking proving test. Overdue against its inspection interval.",
  },
  {
    id: "M-004", title: "Third rail thermal scan", shortTitle: "Third rail scan",
    workType: "Power-system maintenance", workClass: "traction-power", sector: "NS14-NS16",
    durationMinutes: 60, priority: "high", teamId: "T-PWR", skill: "traction-power",
    equipment: "E-THM", preferredStart: "00:00", clearanceMinutes: 15,
    description: "Thermographic survey of third rail joints. Requires traction current isolation.",
  },
  {
    id: "M-005", title: "Tunnel ventilation inspection", shortTitle: "Ventilation inspection",
    workType: "Tunnel systems", workClass: "tunnel-systems", sector: "EW18-EW20",
    durationMinutes: 45, priority: "medium", teamId: "T-TUN", skill: "ventilation",
    equipment: "E-AIR", preferredStart: "00:00",
    description: "Airflow measurement across the Redhill to Commonwealth ventilation shafts.",
  },
  {
    id: "M-006", title: "Drainage channel clearance", shortTitle: "Drainage clearance",
    workType: "Drainage inspection", workClass: "track-possession", sector: "EW20-EW21",
    durationMinutes: 60, priority: "medium", teamId: "T-CHR", skill: "drainage",
    equipment: "E-TRL", preferredStart: "00:45",
    description: "Clear silt from the cess drainage channel ahead of the monsoon period.",
  },
  {
    id: "M-007", title: "Platform screen door test", shortTitle: "PSD testing",
    workType: "Platform systems", workClass: "platform-systems", sector: "CC10-CC12",
    durationMinutes: 45, priority: "high", teamId: "T-SYS", skill: "platform-doors",
    equipment: "E-DTC", preferredStart: "00:00",
    description: "Obstruction-detection and force testing on platform screen doors.",
  },
  {
    id: "M-008", title: "Rail grinding and profile correction", shortTitle: "Rail grinding",
    workType: "Rail grinding", workClass: "track-possession", sector: "NS12-NS14",
    durationMinutes: 90, priority: "critical", teamId: "T-ALP", skill: "grinding",
    equipment: "E-GRD", preferredStart: "00:45", clearanceMinutes: 15,
    description: "Corrective grinding to remove rolling contact fatigue. Deferral raises rail break risk.",
  },
  {
    id: "M-009", title: "Communications repeater maintenance", shortTitle: "Repeater maintenance",
    workType: "Communications maintenance", workClass: "communications", sector: "CC10-CC11",
    durationMinutes: 45, priority: "medium", teamId: "T-COM", skill: "radio",
    equipment: "E-RFA", preferredStart: "02:30",
    description: "Tunnel radio repeater service between MacPherson and Tai Seng.",
  },
  {
    id: "M-010", title: "Track geometry survey", shortTitle: "Geometry survey",
    workType: "Track inspection", workClass: "track-possession", sector: "NS10-NS12",
    durationMinutes: 75, priority: "high", teamId: "T-TRK", skill: "geometry",
    equipment: "E-RIV", preferredStart: "02:00",
    description: "Recording car run to measure twist, cant and gauge.",
  },
  {
    id: "M-011", title: "Substation protection relay test", shortTitle: "Relay testing",
    workType: "Power-system maintenance", workClass: "traction-power", sector: "EW18-EW20",
    durationMinutes: 60, priority: "critical", teamId: "T-PWR", skill: "relay-testing",
    equipment: "E-THM", preferredStart: "00:30", clearanceMinutes: 15,
    description: "Protection relay proving at substation SS-4. Mandatory before the next traction load test.",
  },
  {
    id: "M-012", title: "Tunnel lighting maintenance", shortTitle: "Tunnel lighting",
    workType: "Electrical maintenance", workClass: "tunnel-systems", sector: "EW21-EW22",
    durationMinutes: 60, priority: "low", teamId: "T-CHR", skill: "electrical",
    equipment: "E-MEP", preferredStart: "03:00",
    description: "Replace failed luminaires along the Commonwealth to Dover tunnel walkway.",
  },
  {
    id: "M-013", title: "Rolling-stock interface test", shortTitle: "Interface testing",
    workType: "Rolling-stock interface testing", workClass: "platform-systems", sector: "CC10-CC12",
    durationMinutes: 75, priority: "high", teamId: "T-SYS", skill: "rolling-stock-interface",
    equipment: "E-DTC", preferredStart: "00:30", dependencies: ["M-007"], dependencyLagMinutes: 15,
    description: "Train-to-platform door alignment test. Cannot start until PSD testing is handed back.",
  },
  {
    id: "M-014", title: "Signalling equipment inspection", shortTitle: "Signal inspection",
    workType: "Signalling inspection", workClass: "signalling", sector: "NS12-NS14",
    durationMinutes: 75, priority: "critical", teamId: "T-ALP", skill: "signalling",
    equipment: "E-SIG", preferredStart: "01:00", earliestStart: "00:30",
    description: "Axle counter and lineside signalling inspection between Canberra and Khatib.",
  },
  {
    id: "M-015", title: "Cross-passage fire door test", shortTitle: "Fire door testing",
    workType: "Fire safety systems", workClass: "civil", sector: "EW19-EW20",
    durationMinutes: 45, priority: "medium", teamId: "T-SAF", skill: "fire-systems",
    equipment: "E-DFG", preferredStart: "02:00",
    description: "Closing-force and seal integrity test on cross-passage fire doors.",
  },
  {
    id: "M-016", title: "Axle counter calibration", shortTitle: "Axle calibration",
    workType: "Signalling inspection", workClass: "signalling", sector: "NS14-NS16",
    durationMinutes: 60, priority: "high", teamId: "T-SIG", skill: "axle-counters",
    equipment: "E-SIG", preferredStart: "00:45",
    description: "Recalibrate axle counter heads after reported intermittent occupancy.",
  },
  {
    id: "M-017", title: "Expansion joint inspection", shortTitle: "Joint inspection",
    workType: "Track inspection", workClass: "track-possession", sector: "NS11-NS13",
    durationMinutes: 45, priority: "medium", teamId: "T-BRV", skill: "track-maintenance",
    equipment: "E-TRL", preferredStart: "00:45",
    description: "Measure expansion joint gaps. Spans the Sembawang to Yishun section, crossing two request sectors.",
  },
  {
    id: "M-018", title: "Traction return circuit test", shortTitle: "Return circuit test",
    workType: "Power-system maintenance", workClass: "traction-power", sector: "EW20-EW22",
    durationMinutes: 60, priority: "high", teamId: "T-PWR", skill: "traction-power",
    equipment: "E-CIT", preferredStart: "01:30", clearanceMinutes: 15,
    description: "Current injection test on the traction return path.",
  },
  {
    id: "M-019", title: "CCTV analytics calibration", shortTitle: "CCTV calibration",
    workType: "Communications maintenance", workClass: "communications", sector: "CC11-CC12",
    durationMinutes: 45, priority: "low", teamId: "T-COM", skill: "cctv",
    equipment: "E-CAL", preferredStart: "03:00",
    description: "Re-aim and recalibrate platform analytics cameras.",
  },
  {
    id: "M-020", title: "Emergency walkway inspection", shortTitle: "Walkway inspection",
    workType: "Civil inspection", workClass: "civil", sector: "EW18-EW19",
    durationMinutes: 45, priority: "medium", teamId: "T-SAF", skill: "civil-inspection",
    equipment: "E-MLT", preferredStart: "03:00",
    description: "Structural check of the emergency egress walkway and handrail continuity.",
  },
  {
    id: "M-021", title: "Point machine overhaul", shortTitle: "Point machine overhaul",
    workType: "Track equipment", workClass: "track-possession", sector: "EW20-EW22",
    durationMinutes: 60, priority: "critical", teamId: "T-BRV", skill: "point-machines",
    equipment: "E-PMT", preferredStart: "03:00",
    description: "Overhaul of the Dover crossover point machine following two failures this quarter.",
  },
  {
    id: "M-022", title: "Radio blackspot survey", shortTitle: "Radio survey",
    workType: "Communications maintenance", workClass: "communications", sector: "CC10-CC12",
    durationMinutes: 45, priority: "low", teamId: "T-COM", skill: "radio",
    equipment: "E-RFA", preferredStart: "03:15",
    description: "Signal strength walk-through to locate reported radio blackspots.",
  },
];

function build(seed: Seed): MaintenanceRequest {
  const blockIds = expandSector(seed.sector);
  const equipment: EquipmentDemand[] = [
    { equipmentId: seed.equipment, units: seed.equipmentUnits ?? 1 },
  ];
  return {
    id: seed.id,
    title: seed.title,
    shortTitle: seed.shortTitle,
    workType: seed.workType,
    workClass: seed.workClass,
    blockIds,
    sector: sectorLabel(blockIds),
    durationMinutes: seed.durationMinutes,
    clearanceMinutes: seed.clearanceMinutes ?? 0,
    priority: seed.priority,
    teamId: seed.teamId,
    requiredSkills: [seed.skill],
    equipment,
    preferredStart: toMinutes(seed.preferredStart),
    earliestStart: toMinutes(seed.earliestStart ?? "00:00"),
    latestEnd: toMinutes(seed.latestEnd ?? "04:00"),
    mandatory: seed.priority === "critical",
    dependencies: seed.dependencies ?? [],
    dependencyLagMinutes: seed.dependencyLagMinutes ?? 0,
    description: seed.description,
  };
}

export const requests: MaintenanceRequest[] = seeds.map(build);

export const requestById: Record<string, MaintenanceRequest> = Object.fromEntries(
  requests.map((request) => [request.id, request]),
);

/** The engineering window every request must fit inside, in minutes from midnight. */
export const WINDOW_START = 0;
export const WINDOW_END = 240;
/** Planning resolution. Every candidate start is a multiple of this. */
export const SLOT_MINUTES = 15;
/** Calendar date of the planning night. Display only. */
export const PLANNING_NIGHT = "2026-09-16";
