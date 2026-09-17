// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "./load";
import { parseSubmission } from "./submission";
import { writeSubmission } from "./write";
import { scheduleInstance } from "../engine/schedule";
import { validate } from "../engine/validate";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((n) => [n, readFileSync(resolve("packages/ps1/data/public", n), "utf8")]),
  ),
);

describe("submission serialisation", () => {
  const submission = scheduleInstance(instance, { scenario: "A" });
  const files = writeSubmission(submission);

  it("writes the three files the brief names, with its column order", () => {
    expect(Object.keys(files).sort()).toEqual([
      "RESULTS.csv",
      "SCHEDULE_ACCESS.csv",
      "SCHEDULE_OCCUPANCY.csv",
    ]);
    expect(files["SCHEDULE_ACCESS.csv"].split("\n")[0]).toBe(
      "activity_id,access_seq,week,eclo,access_night",
    );
    expect(files["SCHEDULE_OCCUPANCY.csv"].split("\n")[0]).toBe(
      "activity_id,week,location_id,co_share_group",
    );
    expect(files["RESULTS.csv"].split("\n")[0]).toBe(
      "scenario,contract_number,simulated_completion_date,overrun_days",
    );
  });

  /**
   * Writing then reading must land back on the same verdict. A serialisation bug
   * that silently drops or reorders rows would otherwise only surface when the
   * judges ran their own validator over the submitted files.
   */
  it("round-trips through CSV without changing the verdict", () => {
    const reparsed = parseSubmission({
      access: files["SCHEDULE_ACCESS.csv"],
      occupancy: files["SCHEDULE_OCCUPANCY.csv"],
      results: files["RESULTS.csv"],
    });
    expect(reparsed.access).toHaveLength(submission.access.length);
    expect(reparsed.occupancy).toHaveLength(submission.occupancy.length);

    const before = validate(instance, submission);
    const after = validate(instance, reparsed);
    expect(after.feasible).toBe(before.feasible);
    expect(after.objectiveScore).toBe(before.objectiveScore);
    expect(after.softScores).toEqual(before.softScores);
  });

  it("ends every file with a trailing newline", () => {
    for (const text of Object.values(files)) expect(text.endsWith("\n")).toBe(true);
  });
});
