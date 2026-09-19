import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Metadata } from "next";

import { PS1_FILES } from "@railplan/ps1/io/load";
import { SUBMISSION_FILES } from "@railplan/ps1/io/submission";
import { Ps1Workbench } from "@/components/ps1/Ps1Workbench";
import "@/components/ps1/ps1-workstation.css";

export const metadata: Metadata = {
  title: "PS1 track access scheduler",
  description:
    "Upload a NebulaX PS1 instance, optimise all three scenarios locally, review changes, validate the official CSVs, and download the submission archive.",
};

/**
 * Deliberately public and deliberately unauthenticated.
 *
 * The brief asks for a URL where a judging panel can upload a hidden instance
 * and run the scheduler. An account gate would make that impossible, so this
 * route sits outside the planner workspace entirely: no session, no database,
 * no planning facts. The instance is read and solved in the browser.
 */
export default function Ps1Page() {
  const publicInstance = Object.fromEntries(
    PS1_FILES.map((name) => [
      name,
      readFileSync(resolve(process.cwd(), "packages/ps1/data/public", name), "utf8"),
    ]),
  );
  // The organisers' own answer, shipped so the validator can be pointed at
  // something this tool did not write.
  const referenceSubmission = Object.fromEntries(
    SUBMISSION_FILES.map((name) => [
      name,
      readFileSync(resolve(process.cwd(), "packages/ps1/data/sample-submission", name), "utf8"),
    ]),
  );

  return (
    <main className="ps1-application">
      <Ps1Workbench publicInstance={publicInstance} referenceSubmission={referenceSubmission} />
    </main>
  );
}
