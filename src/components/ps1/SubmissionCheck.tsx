"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { summariseByCategory } from "@railplan/ps1/engine/categories";
import type { Network } from "@railplan/ps1/engine/network";
import { validate } from "@railplan/ps1/engine/validate";
import {
  parseAccess,
  parseOccupancy,
  parseResults,
  SUBMISSION_FILES,
} from "@railplan/ps1/io/submission";
import type {
  Ps1Instance,
  Scenario,
  Submission,
  ValidationReport,
} from "@railplan/ps1/types/ps1";

import { ActionNote } from "@/components/ps1/ActionNote";
import { Button } from "@/components/ui/button";

interface Checked {
  label: string;
  scenario: Scenario;
  report: ValidationReport;
  activities: number;
  accesses: number;
}

/**
 * Validate a submission this tool did not produce.
 *
 * The validator was always here — the scheduler submits its own output to it
 * before returning — but it could only ever be pointed at our own answer, which
 * is the one thing it proves least about. A checker that will accept or reject
 * *anyone's* file is what makes "we check our own work" mean something: the
 * organisers publish a reference submission they state is feasible, so an
 * interpretation of the rules that rejects it is provably stricter than the one
 * the judges run, and this is where that can be seen rather than asserted.
 *
 * The scenario is taken from the submission's own RESULTS.csv rather than from
 * whichever tab happens to be open. A file declaring Scenario A is a Scenario A
 * answer, and judging it under B's rules would manufacture failures.
 */
export function SubmissionCheck({
  instance,
  network,
  reference,
  ours,
}: {
  instance: Ps1Instance;
  network: Network;
  reference: Record<string, string>;
  ours: { scenario: Scenario; objective: number | null }[];
}) {
  const [checked, setChecked] = useState<Checked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const check = useCallback(
    (label: string, files: Record<string, string>) => {
      const missing = SUBMISSION_FILES.filter((name) => !files[name]);
      if (missing.length) {
        setChecked(null);
        setError(
          `Missing ${missing.join(", ")} — a submission is all three files.`,
        );
        return;
      }
      try {
        const results = parseResults(files["RESULTS.csv"]);
        const scenarios = new Set(results.map((row) => row.scenario));
        if (scenarios.size !== 1) {
          throw new Error(
            `RESULTS.csv declares ${scenarios.size} scenarios (${[...scenarios].join(", ")}); a submission is one scenario.`,
          );
        }
        const scenario = results[0].scenario;
        const submission: Submission = {
          scenario,
          results,
          access: parseAccess(files["SCHEDULE_ACCESS.csv"]),
          occupancy: parseOccupancy(files["SCHEDULE_OCCUPANCY.csv"]),
        };
        setChecked({
          label,
          scenario,
          report: validate(instance, submission, network),
          activities: new Set(submission.access.map((row) => row.activityId))
            .size,
          accesses: submission.access.length,
        });
        setError(null);
      } catch (cause) {
        setChecked(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [instance, network],
  );

  const onFiles = useCallback(
    async (list: File[]) => {
      if (!list.length) return;
      const files: Record<string, string> = {};
      const skipped: string[] = [];
      for (const file of list) {
        // Matching on the tail accepts this tool's own `A_RESULTS.csv` naming
        // as readily as a bare `RESULTS.csv`, so a downloaded answer can be fed
        // straight back in.
        const name = SUBMISSION_FILES.find((candidate) =>
          file.name.endsWith(candidate),
        );
        if (name) files[name] = await file.text();
        else skipped.push(file.name);
      }
      check(
        list.length === 1
          ? list[0].name
          : `${Object.keys(files).length} uploaded files`,
        files,
      );
      if (skipped.length) {
        setError(
          (current) =>
            `${current ? `${current} ` : ""}Ignored ${skipped.join(", ")} — a submission is RESULTS.csv, SCHEDULE_ACCESS.csv and SCHEDULE_OCCUPANCY.csv.`,
        );
      }
    },
    [check],
  );

  const categories = useMemo(
    () => (checked ? summariseByCategory(checked.report.hardViolations) : []),
    [checked],
  );
  const mine = checked
    ? ours.find((entry) => entry.scenario === checked.scenario)
    : undefined;

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void onFiles(Array.from(event.dataTransfer.files));
      }}
      className="ps1-panel transition-colors"
      data-dropping={dragging || undefined}
    >
      <h2>Check an external submission</h2>
      <p className="mt-1 text-[12px] text-ink-700">
        Runs the local conformance validator over a submission this tool did not
        produce, against the instance loaded above. It checks every rule
        decidable from the CSVs; global physical night alignment across separate
        possessions is not represented by the format.
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="primary"
            aria-describedby="ps1-note-check-reference"
            onClick={() => check("Published reference submission", reference)}
          >
            Check the published reference
          </Button>
          <ActionNote id="ps1-note-check-reference">
            The organisers&apos; own sample answer, which the brief states is
            feasible. A validator that rejects it would be stricter than the one
            the judges run.
          </ActionNote>
        </div>
        <div className="flex flex-col items-start gap-1">
          <Button
            aria-describedby="ps1-note-check-upload"
            onClick={() => uploadRef.current?.click()}
          >
            Upload a submission
          </Button>
          <input
            ref={uploadRef}
            type="file"
            multiple
            accept=".csv"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose the submission CSV files to check"
            onChange={(event) => {
              void onFiles(Array.from(event.target.files ?? []));
              // Let the same file be chosen twice; without this a re-pick of an
              // identical path fires no change event and looks like a dead button.
              event.target.value = "";
            }}
          />
          <ActionNote id="ps1-note-check-upload">
            Any three submission CSVs, including ones downloaded from this page.
            The scenario is read from RESULTS.csv, not from the tab above.
          </ActionNote>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-signal-amber bg-signal-amber-soft p-3 text-[12px] text-ink-900">
          {error}
        </p>
      )}

      {checked && (
        <div className="mt-4 rounded-md border border-rule bg-sunk p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] font-semibold text-ink-900">
              {checked.label} · Scenario {checked.scenario}
            </p>
            <p
              className={`text-[12px] font-semibold ${
                checked.report.feasible
                  ? "text-signal-green"
                  : "text-signal-red"
              }`}
            >
              {checked.report.feasible
                ? "Feasible — zero hard violations (local conformance)"
                : `${checked.report.hardViolations.length} hard violations`}
            </p>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3 lg:grid-cols-6">
            <Cell
              label="Objective"
              value={checked.report.objectiveScore ?? "n/a"}
            />
            <Cell
              label="Overrun days"
              value={checked.report.softScores.overrunDaysTotal}
            />
            <Cell
              label="Excess nights"
              value={checked.report.softScores.excessAccessNightsTotal}
            />
            <Cell
              label="ECLO nights"
              value={checked.report.softScores.ecloNightsTotal}
            />
            <Cell label="Activities" value={checked.activities} />
            <Cell label="Access-nights" value={checked.accesses} />
          </dl>

          {mine?.objective != null && checked.report.objectiveScore != null && (
            <p className="mt-3 border-t border-rule pt-2 text-[12px] text-ink-900">
              Our scenario {checked.scenario} answer scores{" "}
              <span className="font-semibold tabular-nums">
                {mine.objective}
              </span>{" "}
              against this submission&apos;s{" "}
              <span className="font-semibold tabular-nums">
                {checked.report.objectiveScore}
              </span>
              {mine.objective < checked.report.objectiveScore
                ? " — lower is better, so ours costs less under the same rules."
                : mine.objective > checked.report.objectiveScore
                  ? " — lower is better, so this one costs less under the same rules."
                  : " — the same score under the same rules."}
            </p>
          )}

          {categories.length > 0 && (
            <ul className="mt-3 grid gap-2">
              {categories.map((entry) => (
                <li
                  key={entry.category.id}
                  className="rounded-md border border-signal-red bg-signal-red-soft p-3"
                >
                  <p className="text-[12px] font-semibold text-signal-red">
                    {entry.category.label} — {entry.count}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-700">
                    {entry.category.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-ink-700">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink-900">{value}</dd>
    </div>
  );
}
