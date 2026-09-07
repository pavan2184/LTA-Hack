import proj4 from "proj4";
import { z } from "zod";
import selection from "../../data/geography/station-selection.json";
import {
  GEOGRAPHY_METADATA,
  parseGeoSnapshot,
  type GeoStation,
} from "../../src/lib/geography/schema";

/** Zero-based feature indices and exact DBF station/attachment identities reviewed
 * for this archive. A blank DBF attachment is represented by an empty string. */
export const stationSelection = selection;
export const SVY21_WKT =
  'PROJCS["SVY21",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",28001.642],PARAMETER["False_Northing",38744.572],PARAMETER["Central_Meridian",103.8333333333333],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",1.366666666666667],UNIT["Meter",1.0]]';
const point = z.tuple([z.number().finite(), z.number().finite()]);
const ring = z.array(point).min(4).max(100_000);
const polygon = z.array(ring).min(1).max(1000);
const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygon }).strict(),
  z
    .object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(polygon).min(1).max(1000),
    })
    .strict(),
]);

/** Centroid in source metres. Ring zero is the exterior; later rings are holes.
 * Use absolute ring areas to avoid depending on shapefile winding convention. */
export function representativeCentroid(input: unknown): [number, number] {
  const geometry = geometrySchema.parse(input);
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let areaSum = 0,
    weightedX = 0,
    weightedY = 0;
  for (const rings of polygons) {
    let polygonArea = 0;
    for (const [index, points] of rings.entries()) {
      const origin = points[0],
        last = points[points.length - 1];
      if (origin[0] !== last[0] || origin[1] !== last[1])
        throw new Error("Source polygon ring is not closed.");
      let crossSum = 0,
        xSum = 0,
        ySum = 0;
      // Translate to a local origin to avoid cancellation with large SVY21 values.
      for (let i = 0; i < points.length - 1; i++) {
        const a = [points[i][0] - origin[0], points[i][1] - origin[1]],
          b = [points[i + 1][0] - origin[0], points[i + 1][1] - origin[1]];
        const cross = a[0] * b[1] - b[0] * a[1];
        crossSum += cross;
        xSum += (a[0] + b[0]) * cross;
        ySum += (a[1] + b[1]) * cross;
      }
      if (!Number.isFinite(crossSum) || Math.abs(crossSum) < 1e-8)
        throw new Error("Source polygon ring has no finite area.");
      const area = (Math.abs(crossSum) / 2) * (index === 0 ? 1 : -1);
      polygonArea += area;
      areaSum += area;
      weightedX += (origin[0] + xSum / (3 * crossSum)) * area;
      weightedY += (origin[1] + ySum / (3 * crossSum)) * area;
    }
    if (polygonArea <= 0)
      throw new Error("Source polygon holes exceed exterior area.");
  }
  const centroid: [number, number] = [weightedX / areaSum, weightedY / areaSum];
  if (!centroid.every(Number.isFinite))
    throw new Error("Source polygon centroid is not finite.");
  return centroid;
}
export function projectSvy21(coordinate: [number, number]): [number, number] {
  point.parse(coordinate);
  const result = proj4(SVY21_WKT, "EPSG:4326", coordinate);
  return point.parse(result);
}
const sourceIdentity = z.object({
  STN_NAM_DE: z.string().min(1).max(200),
  ATTACHEMEN: z.string().max(200).nullable(),
});
const featureSchema = z.object({
  type: z.literal("Feature"),
  properties: sourceIdentity,
  geometry: z.unknown(),
});
export function transformFeatures(input: unknown): GeoStation[] {
  const features = z.array(featureSchema).length(231).parse(input);
  const points = stationSelection.map((selected) => {
    const matches = features
      .map((feature, index) => ({ feature, index }))
      .filter(
        ({ feature }) =>
          feature.properties.STN_NAM_DE === selected.sourceName &&
          (feature.properties.ATTACHEMEN ?? "") === selected.sourceAttachment,
      );
    if (
      matches.length !== 1 ||
      matches[0].index !== selected.sourceFeatureIndex
    )
      throw new Error(`Source selection mismatch for ${selected.code}.`);
    const [longitude, latitude] = projectSvy21(
      representativeCentroid(matches[0].feature.geometry),
    );
    return {
      code: selected.code,
      name: selected.name,
      longitude: Number(longitude.toFixed(7)),
      latitude: Number(latitude.toFixed(7)),
      sourceFeatureIndex: selected.sourceFeatureIndex,
      sourceAttachment: selected.sourceAttachment,
    };
  });
  return parseGeoSnapshot({
    version: 1,
    metadata: GEOGRAPHY_METADATA,
    stations: points,
  }).stations;
}
