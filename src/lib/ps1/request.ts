import { z } from "zod";
import { validateInstance } from "@railplan/ps1/io/load";
import { buildNetwork, expandSpan } from "@railplan/ps1/engine/network";

// Deployment admission limits, not changes to the scheduling rules. Oversized
// instances are rejected explicitly; no activities are removed to fit a limit.
export const PS1_MAX_BODY_BYTES = 4 * 1024 * 1024;
const id = z.string().min(1).max(256);
const positive = z.number().int().min(1).max(100_000);
const priority = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const nature = z.enum(["Live", "Non-live (Consist)", "Non-live (Others)"]);
const pin = z.strictObject({ activityId: id, week: positive, eclo: z.union([z.literal(0), z.literal(1)]).optional() });
const disruption = z.strictObject({ locationId: id, fromWeek: positive, toWeek: positive.optional(), capacity: z.number().int().min(0).max(100_000) });

const instance = z.strictObject({
  lines: z.array(z.strictObject({ lineCode: id, lineName: id })).min(1).max(16),
  stations: z.array(z.strictObject({ stationId: id, lineCode: id, seq: positive, isInterchange: z.boolean() })).min(1).max(1000),
  sectors: z.array(z.strictObject({ sectorId: id, lineCode: id, fromStationId: id, toStationId: id, seq: positive, isShared: z.boolean() })).max(1000),
  locationSupply: z.array(z.strictObject({
    locationId: id, locationKind: z.enum(["tunnel sector", "platform sector"]), lineCode: id,
    bound: z.enum(["EB", "WB"]), supplyCapacity: z.number().int().min(0).max(100_000),
  })).min(1).max(2000),
  bufferRules: z.array(z.strictObject({ natureOfWorks: nature, upToBufferSectors: z.number().int().min(0).max(1000), oppositeBoundRequired: z.boolean() })).min(1).max(3),
  parameters: z.strictObject({ horizonStart: z.iso.date(), horizonWeeks: z.number().int().min(1).max(260) }),
  contracts: z.array(z.strictObject({
    contractNumber: id, contractDescription: z.string().min(1).max(10_000), contractAwardDate: z.iso.date(),
    activityType: id, natureOfActivity: nature, contractPriority: priority,
    contractCompletionDate: z.iso.date(), plannedCompletionDate: z.iso.date(),
    numberOfWorkfronts: positive, accessType: z.enum(["PM", "PC", "C"]), numberOfMaximumAccessPerWeek: positive,
  })).min(1).max(2000),
  activities: z.array(z.strictObject({
    activityId: id, contractNumber: id, activityType: id, startLocationId: id, endLocationId: id,
    totalAccesses: positive, plannedStartDate: z.iso.date(), predecessorActivityId: id.nullable(), activityPriority: priority,
  })).min(1).max(2000),
});

export const ps1SolveRequestSchema = z.strictObject({
  instance, scenario: z.enum(["A", "B", "C"]), pins: z.array(pin).max(60_000).default([]),
  disruptions: z.array(disruption).max(2000).default([]),
});
export type Ps1SolveRequest = z.infer<typeof ps1SolveRequestSchema>;

export function parseSolveRequest(value: unknown): Ps1SolveRequest {
  const request = ps1SolveRequestSchema.parse(value);
  const { instance: input, pins, disruptions } = request;
  const horizon = input.parameters.horizonWeeks;
  if (input.activities.length * horizon > 60_000 || input.locationSupply.length * horizon > 120_000) {
    throw new Error("The instance exceeds this server's model size limit; use a larger offline solve configuration.");
  }
  validateInstance(input);
  const network = buildNetwork(input);
  let spanWeeks = 0;
  for (const activity of input.activities) {
    const span = expandSpan(network, activity.startLocationId, activity.endLocationId);
    if (!span.length) throw new Error(`Activity ${activity.activityId} has no valid work span.`);
    spanWeeks += span.length * horizon;
  }
  if (spanWeeks > 200_000) throw new Error("The instance exceeds this server's location-workload limit.");
  const activityIds = new Set(input.activities.map((a) => a.activityId));
  const seenPins = new Set<string>();
  for (const pin of pins) {
    const key = `${pin.activityId}|${pin.week}`;
    if (!activityIds.has(pin.activityId) || pin.week > horizon || seenPins.has(key)) {
      throw new Error("Pins must name distinct activity-weeks within this instance's horizon.");
    }
    seenPins.add(key);
  }
  for (const cut of disruptions) {
    if (!network.supply.has(cut.locationId) || cut.fromWeek > horizon ||
      (cut.toWeek !== undefined && (cut.toWeek < cut.fromWeek || cut.toWeek > horizon))) {
      throw new Error("Capacity cuts must name a supplied location and a valid horizon interval.");
    }
  }
  return request;
}
