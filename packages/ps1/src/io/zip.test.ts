// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { crc32, zipArchive } from "./zip";

/** Whether a real extractor is on this machine to check the format against. */
function hasUnzip(): boolean {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("zip archive", () => {
  const files = {
    "A/RESULTS.csv": "scenario,contract_number\nA,C001\n",
    "A/SCHEDULE_ACCESS.csv": "activity_id,week\nA001,3\n",
    "B/RESULTS.csv": "scenario,contract_number\nB,C001\n",
  };

  it("matches the CRC-32 of a known string", () => {
    // The standard check value for "123456789", so a broken table is caught
    // here rather than by an extractor refusing the archive.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes the local header, directory and end record signatures", () => {
    const archive = zipArchive(files);
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(archive.length - 22 + 10, true)).toBe(Object.keys(files).length);
  });

  it("is byte-identical for identical contents", () => {
    expect(Array.from(zipArchive(files))).toEqual(Array.from(zipArchive({ ...files })));
  });

  it("produces an empty but valid archive for no files", () => {
    const archive = zipArchive({});
    expect(archive.length).toBe(22);
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    expect(view.getUint32(0, true)).toBe(0x06054b50);
  });

  /**
   * The format is only worth anything if the tool a judge actually uses accepts
   * it, so this checks against a real extractor rather than against our own
   * reading of our own bytes.
   */
  it.skipIf(!hasUnzip())("extracts with the system unzip, contents intact", () => {
    const dir = mkdtempSync(join(tmpdir(), "ps1-zip-"));
    const path = join(dir, "submission.zip");
    writeFileSync(path, zipArchive(files));

    expect(() => execFileSync("unzip", ["-t", path], { stdio: "ignore" })).not.toThrow();
    execFileSync("unzip", ["-q", "-o", path, "-d", join(dir, "out")], { stdio: "ignore" });

    for (const [name, contents] of Object.entries(files)) {
      expect(readFileSync(join(dir, "out", name), "utf8"), name).toBe(contents);
    }
  });
});
