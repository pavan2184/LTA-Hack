/** Configurable anonymous role categories; never individual qualifications. */
export interface WorkforceRole {
  id: string;
  name: string;
}
/** Absolute people supply during [startMinute,endMinute), not additional crews.
 * Windows for the same planningNight/teamId/roleId cannot overlap. Missing
 * windows mean no declared availability; zero explicitly records no supply. */
export interface WorkforceAvailability {
  planningNight: string;
  teamId: string;
  roleId: string;
  startMinute: number;
  endMinute: number;
  count: number;
}
/** People of one role required within a request's assigned crew. */
export interface WorkforceDemand {
  requestId: string;
  roleId: string;
  count: number;
}
export const MAX_WORKFORCE_COUNT = 10000;
