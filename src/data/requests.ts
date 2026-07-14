import type { MaintenanceRequest } from "@/types/railplan";

type RequestSeed = Omit<
  MaintenanceRequest,
  | "equipment"
  | "earliestStart"
  | "latestEnd"
  | "status"
  | "conflictIds"
  | "dependencies"
  | "description"
> &
  Partial<
    Pick<
      MaintenanceRequest,
      | "equipment"
      | "earliestStart"
      | "latestEnd"
      | "status"
      | "conflictIds"
      | "dependencies"
      | "description"
    >
  >;

function request(seed: RequestSeed): MaintenanceRequest {
  return {
    equipment: [],
    earliestStart: "00:00",
    latestEnd: "04:00",
    status: "scheduled",
    conflictIds: [],
    dependencies: [],
    description: `${seed.title} is planned within the overnight engineering access window.`,
    ...seed,
  };
}

export const requests: MaintenanceRequest[] = [
  request({ id: "M-001", title: "Ultrasonic Rail Inspection", shortTitle: "Ultrasonic inspection", workType: "Track inspection", sector: "NS10–NS12", durationMinutes: 60, priority: "high", team: "Track Engineering Team", equipment: ["Rail inspection vehicle"], preferredStart: "00:00", conflictIds: ["C-01"] }),
  request({ id: "M-002", title: "Switch Point Lubrication", shortTitle: "Point lubrication", workType: "Track maintenance", sector: "NS12–NS14", durationMinutes: 45, priority: "medium", team: "Team Bravo", equipment: ["Track trolley"], preferredStart: "03:00", status: "unscheduled" }),
  request({ id: "M-003", title: "Signal Interlocking Test", shortTitle: "Interlocking test", workType: "Signalling inspection", sector: "NS14–NS16", durationMinutes: 90, priority: "critical", team: "Signalling Unit", equipment: ["Signal testing kit"], preferredStart: "02:00", conflictIds: ["C-06"] }),
  request({ id: "M-004", title: "Third Rail Thermal Scan", shortTitle: "Third rail scan", workType: "Power-system maintenance", sector: "NS14–NS16", durationMinutes: 60, priority: "high", team: "Power Systems Unit", equipment: ["Thermal imaging unit"], preferredStart: "00:00", conflictIds: ["C-04"] }),
  request({ id: "M-005", title: "Tunnel Ventilation Inspection", shortTitle: "Ventilation inspection", workType: "Tunnel systems", sector: "EW18–EW20", durationMinutes: 60, priority: "medium", team: "Systems Integration Team", equipment: ["Airflow meter"], preferredStart: "00:00", conflictIds: ["C-05"] }),
  request({ id: "M-006", title: "Drainage Channel Clearance", shortTitle: "Drainage clearance", workType: "Drainage inspection", sector: "EW20–EW22", durationMinutes: 60, priority: "medium", team: "Team Bravo", equipment: ["Track trolley"], preferredStart: "00:45" }),
  request({ id: "M-007", title: "Platform Screen Door Test", shortTitle: "PSD testing", workType: "Platform systems", sector: "CC10–CC12", durationMinutes: 45, priority: "high", team: "Systems Integration Team", equipment: ["Door test console"], preferredStart: "00:00", conflictIds: ["C-06"] }),
  request({ id: "M-008", title: "Rail Grinding and Profile Correction", shortTitle: "Rail grinding", workType: "Rail grinding", sector: "NS12–NS14", durationMinutes: 90, priority: "critical", team: "Team Alpha", equipment: ["Rail grinding vehicle"], preferredStart: "00:45", conflictIds: ["C-02", "C-03"] }),
  request({ id: "M-009", title: "Communications Repeater Maintenance", shortTitle: "Repeater maintenance", workType: "Communications maintenance", sector: "CC10–CC12", durationMinutes: 60, priority: "medium", team: "Communications Unit", equipment: ["RF spectrum analyser"], preferredStart: "02:30" }),
  request({ id: "M-010", title: "Track Geometry Survey", shortTitle: "Geometry survey", workType: "Track inspection", sector: "NS10–NS12", durationMinutes: 90, priority: "high", team: "Track Engineering Team", equipment: ["Rail inspection vehicle"], preferredStart: "02:00" }),
  request({ id: "M-011", title: "Substation Protection Relay Test", shortTitle: "Relay testing", workType: "Power-system maintenance", sector: "EW18–EW20", durationMinutes: 60, priority: "critical", team: "Power Systems Unit", equipment: ["Thermal imaging unit"], preferredStart: "00:30", conflictIds: ["C-04", "C-05"] }),
  request({ id: "M-012", title: "Tunnel Lighting Maintenance", shortTitle: "Tunnel lighting", workType: "Electrical maintenance", sector: "EW20–EW22", durationMinutes: 60, priority: "low", team: "Team Charlie", equipment: ["Mobile elevated platform"], preferredStart: "03:00", status: "unscheduled" }),
  request({ id: "M-013", title: "Rolling-stock Interface Test", shortTitle: "Interface testing", workType: "Rolling-stock interface testing", sector: "CC10–CC12", durationMinutes: 90, priority: "high", team: "Systems Integration Team", equipment: ["Door test console"], preferredStart: "00:30", dependencies: ["M-007"], conflictIds: ["C-06"] }),
  request({ id: "M-014", title: "Signalling Equipment Inspection", shortTitle: "Signal inspection", workType: "Signalling inspection", sector: "NS12–NS14", durationMinutes: 90, priority: "critical", team: "Team Alpha", equipment: ["Signal testing kit"], preferredStart: "01:00", earliestStart: "00:30", latestEnd: "04:00", conflictIds: ["C-02", "C-03"], description: "Critical inspection of axle counters and lineside signalling equipment between NS12 and NS14." }),
  request({ id: "M-015", title: "Cross-passage Fire Door Test", shortTitle: "Fire door testing", workType: "Fire safety systems", sector: "EW18–EW20", durationMinutes: 45, priority: "medium", team: "Safety Systems Team", equipment: ["Door force gauge"], preferredStart: "02:00" }),
  request({ id: "M-016", title: "Axle Counter Calibration", shortTitle: "Axle calibration", workType: "Signalling inspection", sector: "NS14–NS16", durationMinutes: 60, priority: "high", team: "Signalling Unit", equipment: ["Signal testing kit"], preferredStart: "00:45" }),
  request({ id: "M-017", title: "Expansion Joint Inspection", shortTitle: "Joint inspection", workType: "Track inspection", sector: "NS10–NS12", durationMinutes: 45, priority: "medium", team: "Team Bravo", equipment: ["Track trolley"], preferredStart: "00:45", conflictIds: ["C-01"] }),
  request({ id: "M-018", title: "Traction Return Circuit Test", shortTitle: "Return circuit test", workType: "Power-system maintenance", sector: "EW20–EW22", durationMinutes: 60, priority: "high", team: "Power Systems Unit", equipment: ["Current injection tester"], preferredStart: "01:30" }),
  request({ id: "M-019", title: "CCTV Analytics Calibration", shortTitle: "CCTV calibration", workType: "Communications maintenance", sector: "CC10–CC12", durationMinutes: 45, priority: "low", team: "Communications Unit", equipment: ["Camera calibration kit"], preferredStart: "03:00", status: "unscheduled" }),
  request({ id: "M-020", title: "Emergency Walkway Inspection", shortTitle: "Walkway inspection", workType: "Civil inspection", sector: "EW18–EW20", durationMinutes: 60, priority: "medium", team: "Safety Systems Team", equipment: ["Mobile lighting tower"], preferredStart: "03:00" }),
  request({ id: "M-021", title: "Point Machine Overhaul", shortTitle: "Point machine overhaul", workType: "Track equipment", sector: "EW20–EW22", durationMinutes: 60, priority: "critical", team: "Team Bravo", equipment: ["Point machine test kit"], preferredStart: "03:00" }),
  request({ id: "M-022", title: "Radio Blackspot Survey", shortTitle: "Radio survey", workType: "Communications maintenance", sector: "CC10–CC12", durationMinutes: 45, priority: "low", team: "Communications Unit", equipment: ["RF spectrum analyser"], preferredStart: "03:15", status: "unscheduled" }),
];

export const requestById = Object.fromEntries(
  requests.map((item) => [item.id, item]),
) as Record<string, MaintenanceRequest>;
