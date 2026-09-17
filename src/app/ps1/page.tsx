import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Metadata } from "next";

import { PS1_FILES } from "@railplan/ps1/io/load";
import { Ps1Workbench } from "@/components/ps1/Ps1Workbench";

export const metadata: Metadata = {
  title: "PS1 track access scheduler",
  description:
    "Upload a NebulaX PS1 instance, schedule all three scenarios, validate against the nine hard rules, and download the submission files.",
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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-[12px] font-medium uppercase tracking-wide text-accent">
          NebulaX PS1
        </p>
        <h1 className="mt-1 text-[20px] font-semibold text-ink-900">
          Railway track access scheduler
        </h1>
        <p className="mt-2 max-w-3xl text-[13px] text-ink-700">
          Decides which contracted activities get the track, in which weeks, across Line Alpha
          and Line Beta — then checks its own answer against the nine hard rules and reports the
          scenario score. Every activity is scheduled in full; the schedule flexes on dates,
          capacity and early-closure instead of dropping work.
        </p>
      </header>

      <Ps1Workbench publicInstance={publicInstance} />

      <footer className="mt-8 border-t border-rule pt-4 text-[12px] text-ink-700">
        <p>
          Scoring follows the brief: penalties only, lower is better. Overrun is banded by
          contract priority (100x / 10x / 1x) with the activity priority nudging within its band;
          an excess access-night costs 7 and an ECLO night 5.
        </p>
      </footer>
    </main>
  );
}
