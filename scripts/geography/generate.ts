import { writeFile } from "node:fs/promises";
import { snapshotFromArchive } from "./archive";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1)
    throw new Error(
      "Usage: node --import tsx scripts/geography/generate.ts /absolute/path/TrainStation_Mar2026.zip",
    );
  const snapshot = await snapshotFromArchive(args[0]);
  await writeFile(
    new URL("../../data/geography/stations.v1.json", import.meta.url),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  console.log(
    `Generated ${snapshot.stations.length} reviewed station reference points; licence conflict remains unresolved.`,
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Geography generation failed.",
  );
  process.exitCode = 1;
});
