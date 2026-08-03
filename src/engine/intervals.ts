/** Half-open interval arithmetic. Touching intervals do not overlap. */

export interface Interval {
  requestId: string;
  start: number;
  end: number;
}

export function overlapMinutes(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export interface Overload {
  start: number;
  end: number;
  /** Requests active during the whole overloaded window. */
  requestIds: string[];
  peak: number;
}

/**
 * Sweep-line over-capacity detection.
 *
 * Returns the maximal windows in which more than `capacity` intervals are
 * simultaneously active, together with the requests responsible. Pairwise
 * comparison cannot express this: with capacity 2, three overlapping jobs are a
 * violation even though no single pair is.
 */
export function findOverloads(intervals: Interval[], capacity: number): Overload[] {
  if (intervals.length <= capacity) return [];

  const boundaries = [...new Set(intervals.flatMap((i) => [i.start, i.end]))].sort((a, b) => a - b);
  const overloads: Overload[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) continue;

    const active = intervals.filter((i) => i.start < end && i.end > start);
    if (active.length <= capacity) continue;

    const previous = overloads[overloads.length - 1];
    const ids = active.map((i) => i.requestId).sort();
    // Merge with the preceding segment when it is contiguous and identical, so
    // one long overload reads as one finding rather than several.
    if (previous && previous.end === start && sameIds(previous.requestIds, ids)) {
      previous.end = end;
      previous.peak = Math.max(previous.peak, active.length);
      continue;
    }
    overloads.push({ start, end, requestIds: ids, peak: active.length });
  }

  return overloads;
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** All unordered pairs of intervals that overlap, with the overlap duration. */
export function overlappingPairs(intervals: Interval[]): { a: Interval; b: Interval; minutes: number }[] {
  const sorted = [...intervals].sort((x, y) => x.start - y.start || x.requestId.localeCompare(y.requestId));
  const result: { a: Interval; b: Interval; minutes: number }[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[j].start >= sorted[i].end) break;
      const minutes = overlapMinutes(sorted[i], sorted[j]);
      if (minutes > 0) result.push({ a: sorted[i], b: sorted[j], minutes });
    }
  }
  return result;
}

export function formatClock(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function formatSpan(start: number, end: number): string {
  return `${formatClock(start)}-${formatClock(end)}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
