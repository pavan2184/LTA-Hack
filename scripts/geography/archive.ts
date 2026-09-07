import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { read } from "shapefile";
import {
  GEOGRAPHY_METADATA,
  parseGeoSnapshot,
  type GeoSnapshot,
} from "../../src/lib/geography/schema";
import { SVY21_WKT, transformFeatures } from "./transform";

const runFile = promisify(execFile);
/** Read only fixed members into memory: no extraction, network, or raw persistence. */
export async function snapshotFromArchive(
  sourcePath: string,
): Promise<GeoSnapshot> {
  const archive = resolve(sourcePath);
  const info = await stat(archive);
  if (!info.isFile() || info.size > 2 * 1024 * 1024)
    throw new Error(
      "Source archive must be a regular file no larger than 2 MiB.",
    );
  const hash = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  if (hash !== GEOGRAPHY_METADATA.sourceSha256)
    throw new Error(
      "Source archive SHA-256 differs from the reviewed March 2026 archive.",
    );
  const member = async (extension: "shp" | "dbf" | "prj" | "cpg") =>
    (
      await runFile(
        "unzip",
        [
          "-p",
          archive,
          `TrainStation_Mar2026/RapidTransitSystemStation.${extension}`,
        ],
        { encoding: "buffer", maxBuffer: 2 * 1024 * 1024, timeout: 10_000 },
      )
    ).stdout;
  const [shp, dbf, prj, cpg] = await Promise.all([
    member("shp"),
    member("dbf"),
    member("prj"),
    member("cpg"),
  ]);
  if (
    prj.toString("utf8").trim() !== SVY21_WKT ||
    cpg.toString("utf8").trim() !== "UTF-8"
  )
    throw new Error(
      "Source CRS or character encoding differs from the reviewed archive.",
    );
  if (
    shp.length < 100 ||
    shp.readInt32BE(0) !== 9994 ||
    shp.readInt32LE(28) !== 1000 ||
    shp.readInt32LE(32) !== 5
  )
    throw new Error("Expected an ESRI polygon shapefile.");
  const collection = await read(shp, dbf, { encoding: "utf-8" });
  return parseGeoSnapshot({
    version: 1,
    metadata: GEOGRAPHY_METADATA,
    stations: transformFeatures(collection.features),
  });
}
