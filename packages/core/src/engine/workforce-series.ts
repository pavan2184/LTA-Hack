import type { WorkforceAssessment, WorkforceInterval } from "./workforce";

export type WorkforceSeriesInterval = WorkforceInterval & { remaining: number };

/** Project the validator's exact intervals onto a plotting grid. Event boundaries
 * are retained between slots; never average away a short shortage. This function
 * does not recalculate staffing rules. Missing demand stays in the assessment and
 * must be surfaced by consumers rather than described as known zero demand. */
export function buildWorkforceSeries(
  assessment: WorkforceAssessment,
  options: {
    teamId: string;
    roleId: string;
    start: number;
    end: number;
    slotMinutes: number;
  },
): WorkforceSeriesInterval[] {
  const { teamId, roleId, start, end, slotMinutes } = options;
  if (
    ![start, end, slotMinutes].every(Number.isSafeInteger) ||
    slotMinutes < 1 ||
    end <= start ||
    (end - start) / slotMinutes > 10000
  )
    throw new Error("Invalid workforce timeline bounds.");
  const intervals = assessment.intervals.filter(
    (row) => row.teamId === teamId && row.roleId === roleId,
  );
  const points = new Set([start, end]);
  for (let time = start + slotMinutes; time < end; time += slotMinutes)
    points.add(time);
  for (const row of intervals)
    for (const time of [row.start, row.end])
      if (time > start && time < end) points.add(time);
  const ordered = [...points].sort((a, b) => a - b);
  return ordered.slice(0, -1).map((time, index) => {
    const row = intervals.find((item) => item.start <= time && item.end > time);
    const demand = row?.demand ?? 0;
    const available = row?.available ?? 0;
    return {
      teamId,
      roleId,
      start: time,
      end: ordered[index + 1],
      requestIds: [...(row?.requestIds ?? [])],
      demand,
      available,
      shortfall: row?.shortfall ?? 0,
      remaining: available - demand,
    };
  });
}
