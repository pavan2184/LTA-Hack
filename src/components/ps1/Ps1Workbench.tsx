"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadInstance, PS1_FILES, type Ps1FileName } from "@railplan/ps1/io/load";
import { writeSubmission } from "@railplan/ps1/io/write";
import { zipArchive } from "@railplan/ps1/io/zip";
import { solveInstance, type Pin, type RejectedPin } from "@railplan/ps1/engine/schedule";
import type { Disruption, ReplanOutcome } from "@railplan/ps1/engine/disruption";
import { validate } from "@railplan/ps1/engine/validate";
import { comparePlans, planningLogJson } from "@railplan/ps1/engine/revision";
import { buildNetwork, type Network as Ps1Network } from "@railplan/ps1/engine/network";
import type {
  Ps1Instance,
  PlanDiff,
  Scenario,
  SolveOutcome,
  Submission,
  ValidationReport,
} from "@railplan/ps1/types/ps1";

import { Button } from "@/components/ui/button";
import { ActionNote } from "@/components/ps1/ActionNote";
import { ExplainPanel } from "@/components/ps1/ExplainPanel";
import { PossessionTimeline } from "@/components/ps1/PossessionTimeline";
import { DisruptionPanel } from "@/components/ps1/DisruptionPanel";
import { SubmissionCheck } from "@/components/ps1/SubmissionCheck";
import { OperationsOverview } from "@/components/ps1/OperationsOverview";
import type {
  Ps1WorkerRequest,
  Ps1WorkerResponse,
} from "@/workers/ps1.worker";

const SCENARIOS: Scenario[] = ["A", "B", "C"];

/** Hand the browser a file. Nothing leaves the machine; the blob is local. */
function save(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

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
  network: Ps1Network;
  rejectedPins: RejectedPin[];
  startsTried: number;
  candidatesEvaluated: number;
  disruptions: Disruption[];
}

interface PendingChange {
  label: string;
  solved: Solved[];
  pins: Pin[];
  diff: PlanDiff;
}

interface SessionEntry {
  id: number;
  at: string;
  action: string;
  scenario: Scenario;
  diff: PlanDiff;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_ROWS = 50_000;

/**
 * The judging surface: upload an instance, solve all three scenarios, read the
 * result, download the files.
 *
 * Everything runs in the browser. The hidden instance a judge uploads never
 * leaves their machine, there is no account to create and no server to be down
 * during judging — which matters more here than it would for an internal tool,
 * because the brief asks for a URL a panel can open cold and use immediately.
 */
export function Ps1Workbench({
  publicInstance,
  referenceSubmission,
}: {
  publicInstance: Record<string, string>;
  referenceSubmission: Record<string, string>;
}) {
  const [files, setFiles] = useState<Record<string, string>>({});
  const [source, setSource] = useState<"none" | "public" | "upload">("none");
  const [solved, setSolved] = useState<Solved[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [active, setActive] = useState<Scenario>("A");
  const [pins, setPins] = useState<Pin[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [cutTarget, setCutTarget] = useState<{ locationId: string; week: number } | null>(null);
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState("");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [history, setHistory] = useState<{ solved: Solved[]; pins: Pin[] }[]>([]);
  const [sessionLog, setSessionLog] = useState<SessionEntry[]>([]);
  const [lastDiff, setLastDiff] = useState<PlanDiff | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => () => workerRef.current?.terminate(), []);

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

  /**
   * Take whatever was dropped or picked, and say what was left out.
   *
   * Files are matched on the published names, which is the only thing a hidden
   * instance can be relied on to share. Anything unrecognised used to be
   * dropped in silence, so a judge whose folder used different names saw eight
   * "missing file" lines and nothing to connect them to the twelve files they
   * had just selected. Naming the rejects is the difference between a dead end
   * and a rename.
   */
  const acceptFiles = useCallback(async (list: File[]) => {
    if (!list.length) return;
    const next: Record<string, string> = {};
    const skipped: string[] = [];
    let totalRows = 0;
    for (const file of list) {
      // Accept the published names regardless of the folder a judge drags from.
      const name = PS1_FILES.find((candidate) => file.name.endsWith(candidate));
      if (name) {
        if (file.size > MAX_FILE_BYTES) {
          setRunError(`${file.name} exceeds the 5 MB browser-safety limit.`);
          return;
        }
        const text = await file.text();
        totalRows += Math.max(0, text.split(/\r\n|\n|\r/).length - 1);
        next[name] = text;
      }
      else skipped.push(file.name);
    }
    if (totalRows > MAX_TOTAL_ROWS) {
      setRunError(`The selected files contain about ${totalRows} rows; the limit is ${MAX_TOTAL_ROWS}.`);
      return;
    }
    setSolved(null);
    setSource("upload");
    // Pins name activity ids from the instance they were set against, so they
    // cannot survive a different one being loaded over the top.
    setPins([]);
    setPending(null);
    setHistory([]);
    setSessionLog([]);
    setLastDiff(null);
    setSelectedActivityId(null);
    setIgnored(skipped);
    setFiles((current) => ({ ...current, ...next }));
  }, []);

  /**
   * `override` exists so loading an instance can solve it in the same click.
   * `instance` is derived by a memo, so it is still the previous value during
   * the handler that sets the files — the freshly parsed one has to be passed
   * in rather than read off state that has not caught up yet.
   */
  const solveScenarios = useCallback(
    async (target: Ps1Instance, withPins: Pin[]): Promise<Solved[]> => {
      const network = buildNetwork(target);
      const id = ++runIdRef.current;
      const toSolved = (outcomes: SolveOutcome[]): Solved[] =>
        outcomes.map((outcome, index) => {
          const scenario = SCENARIOS[index];
          if (!outcome.submission || !outcome.validation) {
            throw new Error(outcome.diagnostics.warnings[0] ?? `Scenario ${scenario} produced no schedule.`);
          }
          return {
            scenario,
            submission: outcome.submission,
            report: outcome.validation,
            solveMs: outcome.diagnostics.elapsedMs,
            network,
            rejectedPins: outcome.diagnostics.rejectedPins,
            startsTried: outcome.diagnostics.startsTried,
            candidatesEvaluated: outcome.diagnostics.candidatesEvaluated,
            disruptions: [],
          };
        });

      if (typeof Worker === "undefined") {
        return toSolved(
          SCENARIOS.map((scenario) => solveInstance(target, { scenario, pins: withPins }, network)),
        );
      }

      workerRef.current?.terminate();
      const worker = new Worker(new URL("../../workers/ps1.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      return await new Promise<Solved[]>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<Ps1WorkerResponse>) => {
          const message = event.data;
          if (message.id !== id) return;
          if (message.type === "progress") {
            setRunProgress(`Scenario ${message.scenario} complete · ${message.completed}/${message.total}`);
            return;
          }
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          if (message.type === "error") reject(new Error(message.message));
          else resolve(toSolved(message.outcomes));
        };
        worker.onerror = (event) => {
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          reject(new Error(event.message || "The browser optimisation worker failed."));
        };
        worker.postMessage({
          id,
          instance: target,
          scenarios: SCENARIOS,
          pins: withPins,
        } satisfies Ps1WorkerRequest);
      });
    },
    [],
  );

  const run = useCallback(
    async (withPins: Pin[], override?: Ps1Instance) => {
      const target = override ?? instance;
      if (!target) return;
      setRunning(true);
      setRunProgress("Starting deterministic multi-start search…");
      try {
        const next = await solveScenarios(target, withPins);
        setSolved(next);
        setPending(null);
        setHistory([]);
        setSessionLog([]);
        setLastDiff(null);
        setSelectedActivityId(target.activities[0]?.activityId ?? null);
        setRunError(null);
      } catch (cause) {
        setRunError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRunning(false);
        setRunProgress("");
      }
    },
    [instance, solveScenarios],
  );

  /**
   * One click from cold to a scored answer.
   *
   * A judge opening this page has no reason to know that loading and solving
   * are two steps, and the public instance is the same eight files every time,
   * so there is nothing to decide between them.
   */
  const loadPublic = useCallback(() => {
    setFiles(publicInstance);
    setSource("public");
    setPins([]);
    setIgnored([]);
    setRunError(null);
    try {
      void run([], loadInstance(publicInstance as Record<Ps1FileName, string>));
    } catch {
      // The parse memo renders the same failure with the same message; letting
      // it do that keeps one error path rather than two that can disagree.
      setSolved(null);
    }
  }, [publicInstance, run]);

  /**
   * A pin re-solves immediately. Entering it before the solve is the whole
   * point: the rest of the schedule moves around the controller's decision
   * rather than being annotated after the fact.
   */
  const togglePin = useCallback(
    async (pin: Pin) => {
      if (!instance || !solved) return;
      const key = `${pin.activityId}|${pin.week}`;
      const nextPins = pins.some((item) => `${item.activityId}|${item.week}` === key)
        ? pins.filter((item) => `${item.activityId}|${item.week}` !== key)
        : [...pins, pin];
      setRunning(true);
      setRunProgress("Preparing a pin change for review…");
      try {
        const nextSolved = await solveScenarios(instance, nextPins);
        const before = solved.find((entry) => entry.scenario === active)!;
        const after = nextSolved.find((entry) => entry.scenario === active)!;
        setPending({
          label: nextPins.length < pins.length ? `Release ${pin.activityId} from wk${pin.week}` : `Pin ${pin.activityId} to wk${pin.week}`,
          solved: nextSolved,
          pins: nextPins,
          diff: comparePlans(before.submission, before.report, after.submission, after.report),
        });
        setRunError(null);
      } catch (cause) {
        setRunError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRunning(false);
        setRunProgress("");
      }
    },
    [active, instance, pins, solveScenarios, solved],
  );

  const clearPins = useCallback(async () => {
    if (!instance || !solved || pins.length === 0) return;
    setRunning(true);
    setRunProgress("Preparing a clear-pins change for review…");
    try {
      const nextSolved = await solveScenarios(instance, []);
      const before = solved.find((entry) => entry.scenario === active)!;
      const after = nextSolved.find((entry) => entry.scenario === active)!;
      setPending({
        label: `Clear ${pins.length} pin${pins.length === 1 ? "" : "s"}`,
        solved: nextSolved,
        pins: [],
        diff: comparePlans(before.submission, before.report, after.submission, after.report),
      });
    } catch (cause) {
      setRunError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
      setRunProgress("");
    }
  }, [active, instance, pins.length, solveScenarios, solved]);

  /**
   * Adopt a replan for the scenario in view. The disruption stays in force, so
   * the score shown afterwards is the one for the night actually being planned
   * rather than the undisrupted one it replaced.
   */
  const adoptReplan = useCallback(
    (outcome: ReplanOutcome, disruptions: Disruption[]) => {
      if (!instance || !solved) return;
      const nextSolved = solved.map((entry) =>
          entry.scenario === active
            ? {
                ...entry,
                submission: outcome.submission,
                report: validate(instance, outcome.submission, entry.network, disruptions),
                rejectedPins: outcome.submission.rejectedPins,
                disruptions,
              }
            : entry,
      );
      const before = solved.find((entry) => entry.scenario === active)!;
      const after = nextSolved.find((entry) => entry.scenario === active)!;
      setPending({
        label: `Apply urgent-maintenance replan to Scenario ${active}`,
        solved: nextSolved,
        pins,
        diff: comparePlans(before.submission, before.report, after.submission, after.report),
      });
      setDisruptionOpen(false);
    },
    [instance, solved, active, pins],
  );

  const applyPending = useCallback(() => {
    if (!pending || !solved) return;
    setHistory((current) => [...current, { solved, pins }]);
    setSolved(pending.solved);
    setPins(pending.pins);
    setLastDiff(pending.diff);
    setSessionLog((current) => [
      ...current,
      {
        id: current.length + 1,
        at: new Date().toISOString(),
        action: pending.label,
        scenario: active,
        diff: pending.diff,
      },
    ]);
    setPending(null);
  }, [active, pending, pins, solved]);

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous || !solved) return;
    const before = solved.find((entry) => entry.scenario === active)!;
    const after = previous.solved.find((entry) => entry.scenario === active)!;
    const diff = comparePlans(before.submission, before.report, after.submission, after.report);
    setSolved(previous.solved);
    setPins(previous.pins);
    setHistory((current) => current.slice(0, -1));
    setLastDiff(diff);
    setSessionLog((current) => [
      ...current,
      {
        id: current.length + 1,
        at: new Date().toISOString(),
        action: "Undo the latest applied change",
        scenario: active,
        diff,
      },
    ]);
  }, [active, history, solved]);

  const download = useCallback((entry: Solved) => {
    if (!entry.report.feasible) return;
    for (const [name, text] of Object.entries(writeSubmission(entry.submission))) {
      save(`${entry.scenario}_${name}`, new Blob([text], { type: "text/csv" }));
    }
  }, []);

  /**
   * The whole submission in one file, which is the shape the deliverable is
   * actually asked for.
   *
   * Nine separate downloads is not only tedious, it is unreliable: a browser
   * that blocks rapid repeated downloads silently drops some of them, and a
   * judge has no way to tell which. One archive either arrives or does not.
   */
  const downloadAll = useCallback(() => {
    if (!solved || solved.length !== SCENARIOS.length || solved.some((entry) => !entry.report.feasible)) return;
    const files: Record<string, string> = {};
    for (const entry of solved) {
      for (const [name, text] of Object.entries(writeSubmission(entry.submission))) {
        files[`${entry.scenario}/${name}`] = text;
      }
    }
    save("ps1-submission.zip", new Blob([zipArchive(files)], { type: "application/zip" }));
  }, [solved]);

  const current = solved?.find((entry) => entry.scenario === active) ?? null;
  const error = parsed.error ?? runError;
  const allDownloadable = Boolean(
    solved && solved.length === SCENARIOS.length && solved.every((entry) => entry.report.feasible),
  );

  return (
    <div className="flex flex-col gap-5">
      <section
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void acceptFiles(Array.from(event.dataTransfer.files));
        }}
        className="ps1-panel transition-colors"
        data-dropping={dragging || undefined}
      >
        <h2>1. Load an instance</h2>
        <p className="mt-1 text-[12px] text-ink-700">
          The eight instance CSVs — drop them anywhere on this panel, or use the buttons.
          Everything runs in your browser; nothing is uploaded to a server.
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="flex flex-col items-start gap-1">
            <Button
              variant="primary"
              aria-describedby="ps1-note-public"
              onClick={() => loadPublic()}
            >
              Load the public instance and run
            </Button>
            <ActionNote id="ps1-note-public">
              The instance published with the brief. Loads all eight CSVs and solves all three
              scenarios in one step.
            </ActionNote>
          </div>
          <div className="flex flex-col items-start gap-1">
            <Button aria-describedby="ps1-note-upload" onClick={() => inputRef.current?.click()}>
              Upload instance files
            </Button>
            <ActionNote id="ps1-note-upload">
              Pick the eight CSVs of any other instance, including a hidden one.
            </ActionNote>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv"
            className="sr-only"
            onChange={(event) => void acceptFiles(Array.from(event.target.files ?? []))}
          />
          {source !== "none" && (
            <span className="py-1.5 text-[12px] text-ink-700">
              {source === "public" ? "Public instance loaded" : "Uploaded files"} —{" "}
              {PS1_FILES.length - missing.length}/{PS1_FILES.length} files
            </span>
          )}
        </div>

        {ignored.length > 0 && (
          <p className="mt-3 rounded-md border border-signal-amber bg-signal-amber-soft p-3 text-[12px] text-ink-900">
            <span className="font-semibold">
              Ignored {ignored.length} file{ignored.length === 1 ? "" : "s"}
            </span>{" "}
            — {ignored.join(", ")}. Files are matched on the eight published names, so rename a
            file to one of those if it belongs to the instance.
          </p>
        )}

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

      <section className="ps1-panel">
        <h2>2. Schedule</h2>
        <p className="mt-1 text-[12px] text-ink-700">
          Runs a deterministic multi-start search for all three scenarios in a browser worker,
          then checks every decidable submission rule with the local conformance validator.
        </p>
        <div className="mt-3 flex flex-col items-start gap-1">
          <Button
            variant="primary"
            disabled={!instance || running}
            aria-describedby="ps1-note-run"
            onClick={() => void run(pins)}
          >
            {running ? "Optimising…" : "Run all three scenarios"}
          </Button>
          <ActionNote id="ps1-note-run">
            {instance
              ? "Solves A, B and C from scratch. Any pins you have set enter the solve as hard constraints rather than being applied afterwards."
              : "Load an instance first — this stays disabled until all eight files are present."}
          </ActionNote>
          {runProgress && <p className="text-[11px] text-accent" role="status">{runProgress}</p>}
        </div>
      </section>

      {pending && <ChangeReview pending={pending} onApply={applyPending} onCancel={() => setPending(null)} />}

      {solved && (
        <section className="ps1-panel">
          <h2>3. Result</h2>
          <p className="mt-1 text-[12px] text-ink-700">
            The same work under three different rule sets. Switch between them to see each
            schedule, its score and the reasoning behind it; the scores are not comparable
            across scenarios, only within one.
          </p>

          <ScenarioComparison solved={solved} active={active} onSelect={setActive} />

          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Scenario">
            {solved.map((entry) => (
              <button
                key={entry.scenario}
                id={`ps1-scenario-tab-${entry.scenario}`}
                role="tab"
                aria-selected={entry.scenario === active}
                aria-controls={`ps1-scenario-panel-${entry.scenario}`}
                tabIndex={entry.scenario === active ? 0 : -1}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const index = SCENARIOS.indexOf(entry.scenario);
                  const delta = event.key === "ArrowRight" ? 1 : -1;
                  const next = SCENARIOS[(index + delta + SCENARIOS.length) % SCENARIOS.length];
                  setActive(next);
                  document.getElementById(`ps1-scenario-tab-${next}`)?.focus();
                }}
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
                  {entry.report.feasible
                    ? `${entry.report.objectiveScore ?? "n/a"}`
                    : `${entry.report.hardViolations.length} violations`}
                </span>
              </button>
            ))}
          </div>

          {current && (
            <div
              id={`ps1-scenario-panel-${current.scenario}`}
              role="tabpanel"
              aria-labelledby={`ps1-scenario-tab-${current.scenario}`}
              className="mt-4"
            >
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

              <p className="mt-2 text-[11px] text-ink-500">
                {current.startsTried} starts · {current.candidatesEvaluated} candidates · local
                conformance. Cross-possession physical-night alignment cannot be inferred from
                the official files.
              </p>

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

              <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-3">
                <div className="flex flex-col items-start gap-1">
                  <Button
                    variant="primary"
                    disabled={!allDownloadable || Boolean(pending)}
                    aria-describedby="ps1-note-download-zip"
                    onClick={downloadAll}
                  >
                    Download all three scenarios (.zip)
                  </Button>
                  <ActionNote id="ps1-note-download-zip">
                    One archive, nine CSVs, foldered A/ B/ C/ — the whole submission in a single
                    file rather than nine downloads a browser may throttle.
                  </ActionNote>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <Button
                    aria-describedby="ps1-note-disrupt"
                    onClick={() => {
                      setCutTarget(null);
                      setDisruptionOpen(true);
                    }}
                  >
                    Test urgent maintenance
                  </Button>
                  <ActionNote id="ps1-note-disrupt">
                    Takes nights away from a location mid-horizon and re-plans around the loss.
                    Nothing changes until you adopt the result.
                  </ActionNote>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <Button
                    disabled={!current.report.feasible || Boolean(pending)}
                    aria-describedby="ps1-note-download"
                    onClick={() => download(current)}
                  >
                    Scenario {current.scenario} only
                  </Button>
                  <ActionNote id="ps1-note-download">
                    Saves three loose files — RESULTS, SCHEDULE_ACCESS and SCHEDULE_OCCUPANCY —
                    in the column order the brief publishes.
                  </ActionNote>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-rule pt-3">
                <Button size="sm" disabled={history.length === 0 || Boolean(pending)} onClick={undo}>
                  Undo last applied change
                </Button>
                <Button
                  size="sm"
                  disabled={sessionLog.length === 0}
                  onClick={() =>
                    save(
                      "PS1_PLANNING_LOG.json",
                      new Blob([planningLogJson(sessionLog)], { type: "application/json" }),
                    )
                  }
                >
                  Export session log
                </Button>
                <span className="text-[11px] text-ink-500">
                  {sessionLog.length} session event{sessionLog.length === 1 ? "" : "s"}; the log
                  is never added to the official ZIP.
                </span>
              </div>

              {current.rejectedPins.length > 0 && (
                <ul className="mt-4 grid gap-1 rounded-md border border-signal-amber bg-signal-amber-soft p-3 text-[12px] text-ink-900">
                  {current.rejectedPins.map((pin) => (
                    <li key={`${pin.activityId}|${pin.week}`}>
                      <span className="font-semibold">
                        {pin.activityId} wk{pin.week} not pinned
                      </span>{" "}
                      — {pin.reason}
                    </li>
                  ))}
                </ul>
              )}

              {/*
                Timeline first. Choosing which location to disrupt before you
                have seen where the congestion is means choosing out of a list;
                after, it means pointing at the dark band.
              */}
              {instance && (
                <OperationsOverview
                  instance={instance}
                  submission={current.submission}
                  report={current.report}
                  comparisons={Object.fromEntries(
                    solved.map((entry) => [entry.scenario, entry.report]),
                  )}
                  network={current.network}
                  pins={pins}
                  disruptions={current.disruptions}
                  diff={pending?.diff ?? lastDiff}
                  selectedActivityId={selectedActivityId}
                  onSelectActivity={setSelectedActivityId}
                />
              )}

              {instance && (
                <PossessionTimeline
                  instance={instance}
                  submission={current.submission}
                  network={current.network}
                  pins={pins}
                  onPin={togglePin}
                  onClearPins={clearPins}
                  selectedActivityId={selectedActivityId}
                  onSelectActivity={setSelectedActivityId}
                  onCut={(next) => {
                    setCutTarget(next);
                    setDisruptionOpen(true);
                  }}
                />
              )}

              {/*
                Urgent maintenance is a what-if, not part of reading the
                schedule, so it lives behind a control rather than sitting open
                under the grid — the same place RailPlan keeps its own
                disruption tester.
              */}
              {instance && (
                <DisruptionPanel
                  // Remount on a new target so the panel picks it up as its
                  // starting point, and drops any replan computed for the old one.
                  key={cutTarget ? `${cutTarget.locationId}|${cutTarget.week}` : "default"}
                  instance={instance}
                  submission={current.submission}
                  network={current.network}
                  onApply={adoptReplan}
                  target={cutTarget}
                  open={disruptionOpen}
                  onOpenChange={setDisruptionOpen}
                />
              )}

              {instance && (
                <ExplainPanel
                  instance={instance}
                  submission={current.submission}
                  report={current.report}
                  network={current.network}
                />
              )}
            </div>
          )}
        </section>
      )}

      {instance && (
        <SubmissionCheck
          instance={instance}
          network={solved?.[0]?.network ?? buildNetwork(instance)}
          reference={referenceSubmission}
          ours={(solved ?? []).map((entry) => ({
            scenario: entry.scenario,
            objective: entry.report.objectiveScore ?? null,
          }))}
        />
      )}
    </div>
  );
}

function ChangeReview({
  pending,
  onApply,
  onCancel,
}: {
  pending: PendingChange;
  onApply: () => void;
  onCancel: () => void;
}) {
  const { diff } = pending;
  return (
    <section className="ps1-panel border-accent" aria-labelledby="ps1-change-review-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="workspace-eyebrow">Review before apply</p>
          <h2 id="ps1-change-review-title">{pending.label}</h2>
          <p className="mt-1 text-[12px] text-ink-700">
            The current schedule is unchanged until this proposal is applied.
          </p>
        </div>
        <span className={diff.feasibleAfter ? "text-[12px] font-semibold text-signal-green" : "text-[12px] font-semibold text-signal-red"}>
          {diff.feasibleAfter ? "Feasible" : `${diff.newViolations.length} new violations`}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-5">
        <Stat label="Score" value={`${diff.scoreBefore ?? "n/a"} → ${diff.scoreAfter ?? "n/a"}`} />
        <Stat label="Moved accesses" value={diff.movedAccesses} />
        <Stat label="Activities" value={diff.movedActivityIds.length} />
        <Stat label="Contracts" value={diff.changedContracts.length} />
        <Stat label="Resolved violations" value={diff.resolvedViolations.length} />
      </dl>
      {diff.movedActivityIds.length > 0 && (
        <p className="mt-2 text-[11px] text-ink-500">
          Moved: {diff.movedActivityIds.slice(0, 18).join(", ")}
          {diff.movedActivityIds.length > 18 ? ` and ${diff.movedActivityIds.length - 18} more` : ""}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="primary" disabled={!diff.feasibleAfter} onClick={onApply}>Apply reviewed change</Button>
        <Button onClick={onCancel}>Keep current schedule</Button>
      </div>
    </section>
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

/**
 * All three scenarios at once, because the interesting thing about them is the
 * difference.
 *
 * Deliberately no "best" column. Each scenario scores under its own rules —
 * overrun is free in A and a hard failure in B — so the objectives are not on
 * one scale and crowning the smallest would be a category error. The physical
 * columns either side of it *are* comparable, and they are the actual story:
 * the same work, and what each rule set makes you pay in days, nights and
 * early closures to deliver it.
 */
function ScenarioComparison({
  solved,
  active,
  onSelect,
}: {
  solved: Solved[];
  active: Scenario;
  onSelect: (scenario: Scenario) => void;
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-rule">
      <table className="w-full min-w-[560px] border-collapse text-[12px]">
        <caption className="sr-only">
          Every scenario compared. Objective scores are computed under each scenario&apos;s own
          rules and are not comparable between them; the remaining columns are.
        </caption>
        <thead>
          <tr className="border-b border-rule bg-sunk text-left text-ink-700">
            <th scope="col" className="py-1.5 pl-3 pr-3 font-medium">Scenario</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Feasible</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Objective <span className="font-normal text-ink-400">(own rules)</span>
            </th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Overrun days</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Excess nights</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">ECLO nights</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Access-nights</th>
          </tr>
        </thead>
        <tbody>
          {solved.map((entry) => (
            <tr
              key={entry.scenario}
              className={`border-b border-rule/60 last:border-0 ${
                entry.scenario === active ? "bg-accent-soft" : ""
              }`}
            >
              <th scope="row" className="py-1.5 pl-3 pr-3 text-left font-medium text-ink-900">
                <button
                  type="button"
                  className="underline decoration-dotted underline-offset-2 hover:text-accent"
                  onClick={() => onSelect(entry.scenario)}
                >
                  {entry.scenario}
                </button>
              </th>
              <td
                className={`py-1.5 pr-3 ${
                  entry.report.feasible ? "text-signal-green" : "text-signal-red"
                }`}
              >
                {entry.report.feasible
                  ? "yes"
                  : `${entry.report.hardViolations.length} violations`}
              </td>
              <td className="py-1.5 pr-3 tabular-nums font-semibold text-ink-900">
                {entry.report.objectiveScore ?? "n/a"}
              </td>
              <td className="py-1.5 pr-3 tabular-nums text-ink-700">
                {entry.report.softScores.overrunDaysTotal}
              </td>
              <td className="py-1.5 pr-3 tabular-nums text-ink-700">
                {entry.report.softScores.excessAccessNightsTotal}
              </td>
              <td className="py-1.5 pr-3 tabular-nums text-ink-700">
                {entry.report.softScores.ecloNightsTotal}
              </td>
              <td className="py-1.5 pr-3 tabular-nums text-ink-700">
                {entry.report.detail.nightsScheduled}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Per-contract completion, which is what a works controller actually reads.
 *
 * Only the contracts that slipped are shown by default. Fourteen rows of which
 * twelve say "on time" buries the two that do not, and the two that do not are
 * the entire decision this scenario represents. The rest are one press away.
 */
function ContractTable({ entry }: { entry: Solved }) {
  const [showAll, setShowAll] = useState(false);
  const all = [...entry.submission.results].sort(
    (a, b) => b.overrunDays - a.overrunDays || a.contractNumber.localeCompare(b.contractNumber),
  );
  const late = all.filter((row) => row.overrunDays > 0);
  const rows = showAll || late.length === 0 ? all : late;
  const hidden = all.length - rows.length;

  return (
    <div className="mt-4 overflow-x-auto">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] text-ink-700">
          {late.length === 0
            ? `All ${all.length} contracts complete on or before their planned date.`
            : `${late.length} of ${all.length} contracts overrun.`}
        </p>
        {hidden > 0 || showAll ? (
          <Button size="sm" variant="quiet" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show overruns only" : `Show all ${all.length} contracts`}
          </Button>
        ) : null}
      </div>
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
