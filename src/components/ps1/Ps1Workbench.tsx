"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { loadInstance, PS1_FILES, type Ps1FileName } from "@railplan/ps1/io/load";
import { writeSubmission } from "@railplan/ps1/io/write";
import { scheduleInstance } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import { buildNetwork } from "@railplan/ps1/engine/network";
import type {
  Ps1Instance,
  Scenario,
  Submission,
  ValidationReport,
} from "@railplan/ps1/types/ps1";

import { Button } from "@/components/ui/button";

const SCENARIOS: Scenario[] = ["A", "B", "C"];

const SCENARIO_BLURB: Record<Scenario, string> = {
  A: "Supply is rigid and ECLO is forbidden. The only lever is which contract's overrun to absorb.",
  B: "Dates are rigid. Overrun is a hard failure, so the cost is extra access-nights and ECLO.",
  C: "Neither is absolute. Scored on priority-weighted overrun and excess nights together.",
};

interface Solved {
  scenario: Scenario;
  submission: Submission;
  report: ValidationReport;
  solveMs: number;
}

/**
 * The judging surface: upload an instance, solve all three scenarios, read the
 * result, download the files.
 *
 * Everything runs in the browser. The hidden instance a judge uploads never
 * leaves their machine, there is no account to create and no server to be down
 * during judging — which matters more here than it would for an internal tool,
 * because the brief asks for a URL a panel can open cold and use immediately.
 */
export function Ps1Workbench({ publicInstance }: { publicInstance: Record<string, string> }) {
  const [files, setFiles] = useState<Record<string, string>>({});
  const [source, setSource] = useState<"none" | "public" | "upload">("none");
  const [solved, setSolved] = useState<Solved[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [active, setActive] = useState<Scenario>("A");
  const inputRef = useRef<HTMLInputElement>(null);

  const missing = useMemo(
    () => PS1_FILES.filter((name) => !(name in files)),
    [files],
  );

  // Parsing is a pure function of the files, so it belongs in a memo — but the
  // failure has to come back as a value rather than a setState during render.
  const parsed: { instance: Ps1Instance | null; error: string | null } = useMemo(() => {
    if (missing.length) return { instance: null, error: null };
    try {
      return { instance: loadInstance(files as Record<Ps1FileName, string>), error: null };
    } catch (cause) {
      return {
        instance: null,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }, [files, missing.length]);
  const instance = parsed.instance;

  const onUpload = useCallback(async (list: FileList | null) => {
    if (!list?.length) return;
    const next: Record<string, string> = {};
    for (const file of Array.from(list)) {
      // Accept the published names regardless of the folder a judge drags from.
      const name = PS1_FILES.find((candidate) => file.name.endsWith(candidate));
      if (name) next[name] = await file.text();
    }
    setSolved(null);
    setSource("upload");
    setFiles((current) => ({ ...current, ...next }));
  }, []);

  const run = useCallback(() => {
    if (!instance) return;
    try {
      const network = buildNetwork(instance);
      setSolved(
        SCENARIOS.map((scenario) => {
          const started = performance.now();
          const submission = scheduleInstance(instance, { scenario }, network);
          const solveMs = Math.round((performance.now() - started) * 100) / 100;
          return { scenario, submission, report: validate(instance, submission, network), solveMs };
        }),
      );
      setRunError(null);
    } catch (cause) {
      setRunError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [instance]);

  const download = useCallback((entry: Solved) => {
    for (const [name, text] of Object.entries(writeSubmission(entry.submission))) {
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${entry.scenario}_${name}`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const current = solved?.find((entry) => entry.scenario === active) ?? null;
  const error = parsed.error ?? runError;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-rule bg-surface p-4">
        <h2 className="text-[13px] font-semibold text-ink-900">1. Load an instance</h2>
        <p className="mt-1 text-[12px] text-ink-700">
          The eight instance CSVs. Everything runs in your browser; nothing is uploaded to a server.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => {
              setFiles(publicInstance);
              setSource("public");
              setSolved(null);
            }}
          >
            Load public instance
          </Button>
          <Button onClick={() => inputRef.current?.click()}>Upload instance files</Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv"
            className="sr-only"
            onChange={(event) => void onUpload(event.target.files)}
          />
          {source !== "none" && (
            <span className="text-[12px] text-ink-700">
              {source === "public" ? "Public instance loaded" : "Uploaded files"} —{" "}
              {PS1_FILES.length - missing.length}/{PS1_FILES.length} files
            </span>
          )}
        </div>

        {missing.length > 0 && source !== "none" && (
          <ul className="mt-3 grid gap-1 text-[12px] text-signal-amber">
            {missing.map((name) => (
              <li key={name}>Missing {name}</li>
            ))}
          </ul>
        )}

        {instance && (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
            <Stat label="Contracts" value={instance.contracts.length} />
            <Stat label="Activities" value={instance.activities.length} />
            <Stat label="Locations" value={instance.locationSupply.length} />
            <Stat label="Horizon" value={`${instance.parameters.horizonWeeks} weeks`} />
          </dl>
        )}
      </section>

      {error && (
        <p className="rounded-lg border border-signal-red bg-signal-red-soft p-3 text-[12px] text-signal-red">
          {error}
        </p>
      )}

      <section className="rounded-lg border border-rule bg-surface p-4">
        <h2 className="text-[13px] font-semibold text-ink-900">2. Schedule</h2>
        <p className="mt-1 text-[12px] text-ink-700">
          Solves all three scenarios and validates each against the nine hard rules.
        </p>
        <div className="mt-3">
          <Button variant="primary" disabled={!instance} onClick={run}>
            Run all three scenarios
          </Button>
        </div>
      </section>

      {solved && (
        <section className="rounded-lg border border-rule bg-surface p-4">
          <h2 className="text-[13px] font-semibold text-ink-900">3. Result</h2>

          <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Scenario">
            {solved.map((entry) => (
              <button
                key={entry.scenario}
                role="tab"
                aria-selected={entry.scenario === active}
                onClick={() => setActive(entry.scenario)}
                className={`rounded-md border px-3 py-1.5 text-[12px] ${
                  entry.scenario === active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-rule bg-surface text-ink-700 hover:bg-sunk"
                }`}
              >
                Scenario {entry.scenario}
                <span
                  className={`ml-2 ${
                    entry.report.feasible ? "text-signal-green" : "text-signal-red"
                  }`}
                >
                  {entry.report.feasible ? "feasible" : `${entry.report.hardViolations.length} violations`}
                </span>
              </button>
            ))}
          </div>

          {current && (
            <div className="mt-4">
              <p className="text-[12px] text-ink-700">{SCENARIO_BLURB[current.scenario]}</p>

              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3 lg:grid-cols-6">
                <Stat
                  label="Objective"
                  value={current.report.objectiveScore ?? "n/a"}
                  hint="lower is better"
                />
                <Stat label="Overrun days" value={current.report.softScores.overrunDaysTotal} />
                <Stat
                  label="Excess nights"
                  value={current.report.softScores.excessAccessNightsTotal}
                />
                <Stat label="ECLO nights" value={current.report.softScores.ecloNightsTotal} />
                <Stat label="Access-nights" value={current.report.detail.nightsScheduled} />
                <Stat label="Solved in" value={`${current.solveMs} ms`} />
              </dl>

              {current.report.hardViolations.length > 0 && (
                <ul className="mt-3 grid gap-1 rounded-md border border-signal-red bg-signal-red-soft p-3 text-[12px] text-signal-red">
                  {current.report.hardViolations.slice(0, 20).map((violation, index) => (
                    <li key={index}>
                      <span className="font-semibold">{violation.rule}</span> — {violation.detail}
                    </li>
                  ))}
                </ul>
              )}

              <ContractTable entry={current} />

              <div className="mt-4">
                <Button variant="primary" onClick={() => download(current)}>
                  Download scenario {current.scenario} CSVs
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-ink-700">
        {label}
        {hint && <span className="ml-1 text-ink-400">({hint})</span>}
      </dt>
      <dd className="font-semibold text-ink-900 tabular-nums">{value}</dd>
    </div>
  );
}

/** Per-contract completion, which is what a works controller actually reads. */
function ContractTable({ entry }: { entry: Solved }) {
  const rows = [...entry.submission.results].sort(
    (a, b) => b.overrunDays - a.overrunDays || a.contractNumber.localeCompare(b.contractNumber),
  );
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[12px]">
        <caption className="sr-only">
          Contract completion for scenario {entry.scenario}
        </caption>
        <thead>
          <tr className="border-b border-rule text-left text-ink-700">
            <th scope="col" className="py-1.5 pr-3 font-medium">Contract</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Completes</th>
            <th scope="col" className="py-1.5 font-medium">Overrun</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.contractNumber} className="border-b border-rule/60">
              <td className="py-1.5 pr-3 text-ink-900">{row.contractNumber}</td>
              <td className="py-1.5 pr-3 tabular-nums text-ink-700">
                {row.simulatedCompletionDate}
              </td>
              <td
                className={`py-1.5 tabular-nums ${
                  row.overrunDays > 0 ? "text-signal-amber" : "text-signal-green"
                }`}
              >
                {row.overrunDays > 0 ? `+${row.overrunDays} days` : "on time"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
