import type { TimelineRow } from "@railplan/ps1/engine/timeline";

/**
 * One way of naming a location, used everywhere it is named.
 *
 * The grid used to say `ALP S01 EB · platform · cap 2` while the panel directly
 * underneath it and the disruption picker beside it both said
 * `PLAT:ALP:S01:EB`. Two vocabularies for the same place, on one screen, forces
 * the reader to hold a translation table that the interface should be holding
 * for them. The raw id stays available where it is genuinely needed — it is
 * what the CSVs carry — but it is shown as the secondary form, not the primary.
 */
export function locationName(row: TimelineRow): string {
  return `${row.lineCode} ${row.label} ${row.bound}`;
}

/** The name, plus what kind of place it is and how many possessions it holds. */
export function locationDetail(row: TimelineRow): string {
  return `${locationName(row)} · ${row.kind === "SEC" ? "sector" : "platform"} · cap ${row.capacity}`;
}
