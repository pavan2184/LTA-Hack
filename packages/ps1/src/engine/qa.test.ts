// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { scheduleInstance } from "./schedule";
import { validate } from "./validate";
import { answerQuestion } from "./qa";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((name) => [name, readFileSync(resolve("packages/ps1/data/public", name), "utf8")]),
  ),
);
const submission = scheduleInstance(instance, { scenario: "A" });
const report = validate(instance, submission);

describe("deterministic PS1 Q&A", () => {
  it("grounds an activity answer in schedule facts", () => {
    const answer = answerQuestion("Why is A001 here?", { instance, submission, report });
    expect(answer.kind).toBe("activity-placement");
    expect(answer.activityIds).toEqual(["A001"]);
    expect(answer.facts.join(" ")).toContain("Contract C001");
  });

  it("answers bottleneck and lever questions without a model", () => {
    expect(answerQuestion("Where are the bottlenecks?", { instance, submission, report }).kind).toBe(
      "bottleneck",
    );
    expect(answerQuestion("How is ECLO used?", { instance, submission, report }).facts).toContain(
      "Each ECLO night costs 5; each excess access-night costs 7.",
    );
  });

  it("states the supported boundary for an unrelated question", () => {
    const answer = answerQuestion("What will the weather be?", { instance, submission, report });
    expect(answer.kind).toBe("unsupported");
    expect(answer.text).toMatch(/I can explain/);
  });
});
