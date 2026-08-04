/**
 * Teams, equipment and work classification.
 *
 * The distinction that matters: a resource is a *capacity*, not a name. Two jobs
 * that both list "Thermal imaging unit" are only in conflict because exactly one
 * calibrated unit exists. Modelling that as a count is what lets the validator
 * find the collision instead of a human having to notice it.
 *
 * Fabricated for a prototype. No LTA competency, roster or asset data is used.
 */

export type WorkClass =
  | "track-possession"
  | "traction-power"
  | "signalling"
  | "communications"
  | "tunnel-systems"
  | "civil"
  | "platform-systems";

export interface Team {
  id: string;
  name: string;
  /** Crews available under this name. 1 = the crew can only be in one place. */
  capacity: number;
  skills: string[];
  /** Block the crew starts from; drives travel time to its first job. */
  depotBlockId: string;
  shiftStart: number;
  shiftEnd: number;
}

export interface EquipmentType {
  id: string;
  name: string;
  /** Serviceable units available on the planning night. */
  units: number;
  /** Minutes needed to move and re-rig the asset between jobs. */
  turnaroundMinutes: number;
}

export const workClasses: Record<WorkClass, { label: string; isolation: string }> = {
  "track-possession": { label: "Track possession", isolation: "Track access" },
  "traction-power": { label: "Traction power", isolation: "Traction current off" },
  signalling: { label: "Signalling", isolation: "Signalling system offline" },
  communications: { label: "Communications", isolation: "None" },
  "tunnel-systems": { label: "Tunnel systems", isolation: "Ventilation override" },
  civil: { label: "Civil", isolation: "Walkway access" },
  "platform-systems": { label: "Platform systems", isolation: "Platform door override" },
};

/**
 * Pairs of work classes that must not run concurrently.
 *
 * `extendsToAdjacent` is the important field. Most incompatibilities only bite
 * when two jobs share a block, which exclusive possession already prevents.
 * A small number reach one block further, because the hazard travels: an
 * energised section does not stop at the block boundary. Marking every pair as
 * adjacent would be safer-sounding and wrong — it would forbid ordinary
 * concurrent work along a whole corridor.
 */
export interface WorkClassIncompatibility {
  a: WorkClass;
  b: WorkClass;
  reason: string;
  extendsToAdjacent: boolean;
}

export const incompatiblePairs: WorkClassIncompatibility[] = [
  {
    a: "traction-power",
    b: "track-possession",
    reason:
      "Staff cannot occupy the running line in or beside a section whose traction current is being isolated or restored.",
    extendsToAdjacent: true,
  },
  {
    a: "traction-power",
    b: "civil",
    reason:
      "Walkway access requires a confirmed dead section, which cannot be guaranteed beside live isolation testing.",
    extendsToAdjacent: true,
  },
  {
    a: "traction-power",
    b: "tunnel-systems",
    reason: "Ventilation control shares the traction supply and cannot be worked during an isolation.",
    extendsToAdjacent: false,
  },
  {
    a: "signalling",
    b: "track-possession",
    reason:
      "A signalling wrong-side failure during testing is unsafe while a possession crew is on the same line.",
    extendsToAdjacent: false,
  },
];

export function areWorkClassesCompatible(
  a: WorkClass,
  b: WorkClass,
): { compatible: boolean; reason?: string; extendsToAdjacent: boolean } {
  const match = incompatiblePairs.find(
    (pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a),
  );
  return match
    ? { compatible: false, reason: match.reason, extendsToAdjacent: match.extendsToAdjacent }
    : { compatible: true, extendsToAdjacent: false };
}

export const teams: Team[] = [
  { id: "T-TRK", name: "Track Engineering", capacity: 1, skills: ["track-inspection", "geometry"], depotBlockId: "NS10-NS11", shiftStart: 0, shiftEnd: 240 },
  { id: "T-ALP", name: "Team Alpha", capacity: 1, skills: ["grinding", "signalling", "track-inspection"], depotBlockId: "NS12-NS13", shiftStart: 0, shiftEnd: 240 },
  { id: "T-BRV", name: "Team Bravo", capacity: 1, skills: ["track-maintenance", "drainage", "point-machines"], depotBlockId: "NS11-NS12", shiftStart: 0, shiftEnd: 240 },
  { id: "T-CHR", name: "Team Charlie", capacity: 1, skills: ["electrical", "drainage"], depotBlockId: "EW20-EW21", shiftStart: 0, shiftEnd: 240 },
  { id: "T-SIG", name: "Signalling Unit", capacity: 1, skills: ["signalling", "axle-counters"], depotBlockId: "NS14-NS15", shiftStart: 0, shiftEnd: 240 },
  // Two crews. Worth noting in the demo: doubling the crew does not resolve the
  // M-004 / M-011 collision, because the single thermal imaging unit and the
  // SS-4 isolation zone still allow only one of them at a time.
  { id: "T-PWR", name: "Power Systems Unit", capacity: 2, skills: ["traction-power", "relay-testing"], depotBlockId: "EW19-EW20", shiftStart: 0, shiftEnd: 240 },
  { id: "T-SYS", name: "Systems Integration", capacity: 1, skills: ["platform-doors", "rolling-stock-interface"], depotBlockId: "CC10-CC11", shiftStart: 0, shiftEnd: 240 },
  { id: "T-TUN", name: "Tunnel Systems", capacity: 1, skills: ["ventilation", "tunnel-systems"], depotBlockId: "EW18-EW19", shiftStart: 0, shiftEnd: 240 },
  { id: "T-COM", name: "Communications Unit", capacity: 1, skills: ["radio", "cctv"], depotBlockId: "CC11-CC12", shiftStart: 0, shiftEnd: 240 },
  { id: "T-SAF", name: "Safety Systems", capacity: 1, skills: ["fire-systems", "civil-inspection"], depotBlockId: "EW18-EW19", shiftStart: 0, shiftEnd: 240 },
  { id: "T-RRT", name: "Rapid Response", capacity: 1, skills: ["track-inspection", "emergency"], depotBlockId: "NS13-NS14", shiftStart: 0, shiftEnd: 240 },
];

export const teamById: Record<string, Team> = Object.fromEntries(teams.map((team) => [team.id, team]));

export const equipmentTypes: EquipmentType[] = [
  { id: "E-RIV", name: "Rail inspection vehicle", units: 1, turnaroundMinutes: 15 },
  { id: "E-TRL", name: "Track trolley", units: 2, turnaroundMinutes: 0 },
  { id: "E-SIG", name: "Signal testing kit", units: 2, turnaroundMinutes: 0 },
  { id: "E-THM", name: "Thermal imaging unit", units: 1, turnaroundMinutes: 15 },
  { id: "E-AIR", name: "Airflow meter", units: 1, turnaroundMinutes: 0 },
  { id: "E-DTC", name: "Door test console", units: 1, turnaroundMinutes: 0 },
  { id: "E-RFA", name: "RF spectrum analyser", units: 1, turnaroundMinutes: 0 },
  { id: "E-GRD", name: "Rail grinding vehicle", units: 1, turnaroundMinutes: 30 },
  { id: "E-MEP", name: "Mobile elevated platform", units: 1, turnaroundMinutes: 15 },
  { id: "E-DFG", name: "Door force gauge", units: 1, turnaroundMinutes: 0 },
  { id: "E-CIT", name: "Current injection tester", units: 1, turnaroundMinutes: 0 },
  { id: "E-MLT", name: "Mobile lighting tower", units: 1, turnaroundMinutes: 15 },
  { id: "E-CAL", name: "Camera calibration kit", units: 1, turnaroundMinutes: 0 },
  { id: "E-PMT", name: "Point machine test kit", units: 1, turnaroundMinutes: 0 },
];

export const equipmentById: Record<string, EquipmentType> = Object.fromEntries(
  equipmentTypes.map((item) => [item.id, item]),
);

/** Minutes a crew needs to travel one block hop. Coarse, but derived, not guessed. */
export const MINUTES_PER_BLOCK_HOP = 5;

/**
 * The three lines are not connected in the block graph, so a crew moving
 * between them travels by road. Flat estimate rather than a fake rail path.
 */
export const INTER_LINE_TRANSFER_MINUTES = 20;
