import { deepStrictEqual } from "node:assert";
import { readFile } from "node:fs/promises";
import { parseGeoSnapshot } from "../../src/lib/geography/schema";
import { snapshotFromArchive } from "./archive";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--source"))
    throw new Error(
      "Usage: npm run geo:verify -- [--source /absolute/path/TrainStation_Mar2026.zip]",
    );
  const snapshot = parseGeoSnapshot(
    JSON.parse(
      await readFile(
        new URL("../../data/geography/stations.v1.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  if (args.length)
    deepStrictEqual(
      await snapshotFromArchive(args[1]),
      snapshot,
      "Bundled geography differs from the reviewed source transformation.",
    );
  console.log(
    `Verified ${snapshot.stations.length} station points${args.length ? " and source reproducibility" : " (bundled snapshot; no network)"}. Licence conflict remains unresolved.`,
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Geography verification failed.",
  );
  process.exitCode = 1;
});
