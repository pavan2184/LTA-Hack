import { z } from "zod";
import { stations } from "@railplan/core/domain/network";
import selection from "../../../data/geography/station-selection.json";

export const GEOGRAPHY_METADATA = {
  dataset: "LTA DataMall Train Station (March 2026)",
  sourceUrl:
    "https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/TrainStation_Mar2026.zip",
  catalogueUrl:
    "https://datamall.lta.gov.sg/content/datamall/en/static-data.html",
  accessedAt: "2026-09-07",
  sourceSha256:
    "7a7c6730ce7a9092b38d095ef7b663e8281ae612b1c9477449ea7c215b477e09",
  transformVersion: "svy21-area-centroid-v1",
  licenceName: "Singapore Open Data Licence v1.0 (conflicting archive notice)",
  licenceUrl:
    "https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html",
  licenceStatus: "conflicting",
  licenceNote:
    'DataMall publishes the Singapore Open Data Licence v1.0, but the archive XML says "The data is for internal use only". Older archive metadata does not establish that this restriction was superseded. Source-publication permission remains unresolved; confirm with LTA before public deployment or redistribution.',
  attribution:
    "Station reference points derived from Land Transport Authority, LTA DataMall Train Station (March 2026), accessed 7 September 2026. No LTA endorsement. Area-weighted polygon centroids transformed from archive SVY21 to WGS84; not entrances, surveyed track geometry or operational authority.",
} as const;

const stationSchema = z
  .object({
    code: z.string().min(1).max(8),
    name: z.string().min(1).max(80),
    longitude: z.number().finite().min(103.5).max(104.2),
    latitude: z.number().finite().min(1.1).max(1.5),
    sourceFeatureIndex: z.number().int().min(0).max(230),
    sourceAttachment: z.string().max(120),
  })
  .strict();
const metadataSchema = z
  .object({
    dataset: z.literal(GEOGRAPHY_METADATA.dataset),
    sourceUrl: z.literal(GEOGRAPHY_METADATA.sourceUrl),
    catalogueUrl: z.literal(GEOGRAPHY_METADATA.catalogueUrl),
    accessedAt: z.literal(GEOGRAPHY_METADATA.accessedAt),
    sourceSha256: z.literal(GEOGRAPHY_METADATA.sourceSha256),
    transformVersion: z.literal(GEOGRAPHY_METADATA.transformVersion),
    licenceName: z.literal(GEOGRAPHY_METADATA.licenceName),
    licenceUrl: z.literal(GEOGRAPHY_METADATA.licenceUrl),
    licenceStatus: z.literal("conflicting"),
    licenceNote: z.literal(GEOGRAPHY_METADATA.licenceNote),
    attribution: z.literal(GEOGRAPHY_METADATA.attribution),
  })
  .strict();
const geoSnapshotSchema = z
  .object({
    version: z.literal(1),
    metadata: metadataSchema,
    stations: z.array(stationSchema).length(15),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const ids = new Set<string>(),
      coordinates = new Set<string>();
    for (const [index, station] of snapshot.stations.entries()) {
      const known = stations.find((s) => s.code === station.code);
      const expected = selection.find((s) => s.code === station.code);
      const coordinate = `${station.longitude},${station.latitude}`;
      if (
        !known ||
        known.name !== station.name ||
        !expected ||
        expected.sourceFeatureIndex !== station.sourceFeatureIndex ||
        expected.sourceAttachment !== station.sourceAttachment ||
        ids.has(station.code) ||
        coordinates.has(coordinate)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["stations", index],
          message:
            "Station identity, source selection or coordinates are invalid or duplicated.",
        });
      }
      ids.add(station.code);
      coordinates.add(coordinate);
    }
    if (stations.some((s) => !ids.has(s.code)))
      ctx.addIssue({
        code: "custom",
        path: ["stations"],
        message: "Snapshot must cover every current network station.",
      });
  });
export type GeoSnapshot = z.infer<typeof geoSnapshotSchema>;
export type GeoStation = GeoSnapshot["stations"][number];
export function parseGeoSnapshot(value: unknown): GeoSnapshot {
  return geoSnapshotSchema.parse(value);
}
