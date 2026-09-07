import { PLANNING_NIGHT, requests, WINDOW_START, WINDOW_END } from "./requests";
import type {
  WorkforceRole,
  WorkforceAvailability,
  WorkforceDemand,
} from "../types/workforce";
/** Fabricated role labels and people counts, independent of Team.capacity. */
export const workforceRoles: WorkforceRole[] = [
  { id: "technician", name: "Technician" },
  { id: "supervisor", name: "Supervisor" },
];
const supply: { teamId: string; technicians: number; supervisors: number }[] = [
  { teamId: "T-TRK", technicians: 4, supervisors: 1 },
  { teamId: "T-ALP", technicians: 6, supervisors: 1 },
  { teamId: "T-BRV", technicians: 4, supervisors: 1 },
  { teamId: "T-CHR", technicians: 3, supervisors: 1 },
  { teamId: "T-SIG", technicians: 4, supervisors: 1 },
  { teamId: "T-PWR", technicians: 6, supervisors: 2 },
  { teamId: "T-SYS", technicians: 3, supervisors: 1 },
  { teamId: "T-TUN", technicians: 3, supervisors: 1 },
  { teamId: "T-COM", technicians: 3, supervisors: 1 },
  { teamId: "T-SAF", technicians: 3, supervisors: 1 },
  { teamId: "T-RRT", technicians: 4, supervisors: 1 },
];
export const workforceAvailability: WorkforceAvailability[] = supply.flatMap(
  (row) => [
    {
      planningNight: PLANNING_NIGHT,
      teamId: row.teamId,
      roleId: "technician",
      startMinute: WINDOW_START,
      endMinute: WINDOW_END,
      count: row.technicians,
    },
    {
      planningNight: PLANNING_NIGHT,
      teamId: row.teamId,
      roleId: "supervisor",
      startMinute: WINDOW_START,
      endMinute: WINDOW_END,
      count: row.supervisors,
    },
  ],
);
/** Demo assumption: two technicians and one supervisor for each baseline job.
 * These are input fixtures, not an operational staffing standard. */
export const workforceDemand: WorkforceDemand[] = requests.flatMap(
  (request) => [
    { requestId: request.id, roleId: "technician", count: 2 },
    { requestId: request.id, roleId: "supervisor", count: 1 },
  ],
);
