"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  loadInstance,
  PS1_FILES,
  type Ps1FileName,
} from "@railplan/ps1/io/load";
import { writeSubmission } from "@railplan/ps1/io/write";
import { zipArchive } from "@railplan/ps1/io/zip";
import { solveInstance, type Pin } from "@railplan/ps1/engine/schedule";
import type {
  Disruption,
  ReplanOutcome,
} from "@railplan/ps1/engine/disruption";
import { validate } from "@railplan/ps1/engine/validate";
import { comparePlans, planningLogJson } from "@railplan/ps1/engine/revision";
import { buildHandoverSummary } from "@railplan/ps1/engine/handover";
import { buildNetwork } from "@railplan/ps1/engine/network";
import type {
  Ps1Instance,
  PlanDiff,
  Scenario,
  SolveOutcome,
} from "@railplan/ps1/types/ps1";

import { TrainFront, FolderOpen, RefreshCw, Moon, Sun, ShieldCheck, Undo2, Wrench, FileSpreadsheet, LockKeyhole, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActionNote } from "@/components/ps1/ActionNote";
import { DisruptionPanel } from "@/components/ps1/DisruptionPanel";
import { SubmissionCheck } from "@/components/ps1/SubmissionCheck";
import { OperationsOverview } from "@/components/ps1/OperationsOverview";
import {
  isReadyScenario,
  type ScenarioRun,
  type WorkspaceSelection,
} from "@/components/ps1/workspace-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Ps1WorkerRequest, Ps1WorkerResponse } from "@/workers/ps1.worker";

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



interface PendingChange {
  label: string;
  scenario: Scenario;
  runs: ScenarioRun[];
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
  const [runs, setRuns] = useState<ScenarioRun[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [active, setActive] = useState<Scenario>("C");
  const [pins, setPins] = useState<Pin[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [cutTarget, setCutTarget] = useState<{
    locationId: string;
    week: number;
  } | null>(null);
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState("");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [history, setHistory] = useState<
    { runs: ScenarioRun[]; pins: Pin[]; scenario: Scenario }[]
  >([]);
  const [sessionLog, setSessionLog] = useState<SessionEntry[]>([]);
  const [lastDiff, setLastDiff] = useState<PlanDiff | null>(null);
  const [selection, setSelection] = useState<WorkspaceSelection>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [lowGlare, setLowGlare] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const cancelWorkerRef = useRef<(() => void) | null>(null);
  const runIdRef = useRef(0);
  const operationEpochRef = useRef(0);
  // A draft upload can arrive in several batches. Solving or loading the public
  // instance closes that draft, so later uploads cannot inherit its old files.
  const uploadFilesRef = useRef<Record<string, string> | null>(null);

  useEffect(() => () => {
    operationEpochRef.current += 1;
    cancelWorkerRef.current?.();
  }, []);

  const missing = useMemo(
    () => PS1_FILES.filter((name) => !(name in files)),
    [files],
  );

  // Parsing is a pure function of the files, so it belongs in a memo — but the
  // failure has to come back as a value rather than a setState during render.
  const parsed: { instance: Ps1Instance | null; error: string | null } =
    useMemo(() => {
      if (missing.length) return { instance: null, error: null };
      try {
        return {
          instance: loadInstance(files as Record<Ps1FileName, string>),
          error: null,
        };
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
    const epoch = ++operationEpochRef.current;
    cancelWorkerRef.current?.();
    const base = uploadFilesRef.current ?? {};
    uploadFilesRef.current = base;
    setFiles(base);
    setRuns(null);
    setSource("upload");
    // Pins name activity ids from the instance they were set against, so they
    // cannot survive a different one being loaded over the top.
    setPins([]);
    setPending(null);
    setHistory([]);
    setSessionLog([]);
    setLastDiff(null);
    setSelection(null);
    setIgnored([]);
    setRunError(null);
    setRunning(true);
    setRunProgress("Reading instance files…");
    try {
      const next: Record<string, string> = { ...base };
      const skipped: string[] = [];
      for (const file of list) {
        const name = PS1_FILES.find((candidate) => file.name.endsWith(candidate));
        if (name) {
          if (file.size > MAX_FILE_BYTES) {
            throw new Error(`${file.name} exceeds the 5 MB browser-safety limit.`);
          }
          const text = await file.text();
          if (epoch !== operationEpochRef.current) return;
          next[name] = text;
        } else skipped.push(file.name);
      }
      const totalRows = Object.values(next).reduce(
        (total, text) => total + Math.max(0, text.split(/\r\n|\n|\r/).length - 1),
        0,
      );
      if (totalRows > MAX_TOTAL_ROWS) {
        throw new Error(
          `The selected files contain about ${totalRows} rows; the limit is ${MAX_TOTAL_ROWS}.`,
        );
      }
      if (epoch !== operationEpochRef.current) return;
      uploadFilesRef.current = next;
      setIgnored(skipped);
      setFiles(next);
    } catch (cause) {
      if (epoch !== operationEpochRef.current) return;
      setRunError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (epoch === operationEpochRef.current) {
        setRunning(false);
        setRunProgress("");
      }
    }
  }, []);

  /**
   * `override` exists so loading an instance can solve it in the same click.
   * `instance` is derived by a memo, so it is still the previous value during
   * the handler that sets the files — the freshly parsed one has to be passed
   * in rather than read off state that has not caught up yet.
   */
  const solveScenarios = useCallback(
    async (
      target: Ps1Instance,
      withPins: Pin[],
      withDisruptions: Partial<Record<Scenario, Disruption[]>> = {},
    ): Promise<ScenarioRun[]> => {
      const network = buildNetwork(target);
      const id = ++runIdRef.current;
      const toRuns = (outcomes: SolveOutcome[]): ScenarioRun[] =>
        outcomes.map((outcome, index) => ({
          scenario: SCENARIOS[index],
          outcome,
          network,
          disruptions: withDisruptions[SCENARIOS[index]] ?? [],
        }));

      if (typeof Worker === "undefined") {
        return toRuns(
          SCENARIOS.map((scenario) =>
            solveInstance(target, {
              scenario,
              pins: withPins,
              disruptions: withDisruptions[scenario] ?? [],
            }, network),
          ),
        );
      }

      cancelWorkerRef.current?.();
      const worker = new Worker(
        new URL("../../workers/ps1.worker.ts", import.meta.url),
        {
          type: "module",
        },
      );
      workerRef.current = worker;
      return await new Promise<ScenarioRun[]>((resolve, reject) => {
        const release = () => {
          worker.terminate();
          if (workerRef.current === worker) {
            workerRef.current = null;
            cancelWorkerRef.current = null;
          }
        };
        cancelWorkerRef.current = () => {
          release();
          reject(new Error("The operation was replaced by a newer instance or solve."));
        };
        worker.onmessage = (event: MessageEvent<Ps1WorkerResponse>) => {
          const message = event.data;
          if (message.id !== id || workerRef.current !== worker) return;
          if (message.type === "progress") {
            setRunProgress(
              `Scenario ${message.scenario} complete · ${message.completed}/${message.total}`,
            );
            return;
          }
          release();
          if (message.type === "error") reject(new Error(message.message));
          else resolve(toRuns(message.outcomes));
        };
        worker.onerror = (event) => {
          if (workerRef.current !== worker) return;
          release();
          reject(
            new Error(
              event.message || "The browser optimisation worker failed.",
            ),
          );
        };
        worker.postMessage({
          id,
          instance: target,
          scenarios: SCENARIOS,
          pins: withPins,
          disruptions: withDisruptions,
        } satisfies Ps1WorkerRequest);
      });
    },
    [],
  );

  const run = useCallback(
    async (withPins: Pin[], override?: Ps1Instance, resetScenario = true) => {
      const target = override ?? instance;
      if (!target) return;
      const epoch = ++operationEpochRef.current;
      uploadFilesRef.current = null;
      setRunning(true);
      setRunProgress("Starting deterministic multi-start search…");
      try {
        const next = await solveScenarios(target, withPins, Object.fromEntries(
          (override ? [] : runs ?? []).map((entry) => [entry.scenario, entry.disruptions]),
        ));
        if (epoch !== operationEpochRef.current) return;
        setRuns(next);
        setPending(null);
        setHistory([]);
        setSessionLog([]);
        setLastDiff(null);
        setSelection(
          target.activities[0]
            ? { kind: "activity", activityId: target.activities[0].activityId }
            : null,
        );
        if (resetScenario) setActive("C");
        setRunError(null);
      } catch (cause) {
        if (epoch !== operationEpochRef.current) return;
        setRunError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (epoch === operationEpochRef.current) {
          setRunning(false);
          setRunProgress("");
        }
      }
    },
    [instance, runs, solveScenarios],
  );

  /**
   * One click from cold to a scored answer.
   *
   * A judge opening this page has no reason to know that loading and solving
   * are two steps, and the public instance is the same eight files every time,
   * so there is nothing to decide between them.
   */
  const loadPublic = useCallback(() => {
    uploadFilesRef.current = null;
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
      setRuns(null);
    }
  }, [publicInstance, run]);

  /**
   * A pin re-solves immediately. Entering it before the solve is the whole
   * point: the rest of the schedule moves around the controller's decision
   * rather than being annotated after the fact.
   */
  const togglePin = useCallback(
    async (pin: Pin) => {
      if (!instance || !runs) return;
      const key = `${pin.activityId}|${pin.week}`;
      const nextPins = pins.some(
        (item) => `${item.activityId}|${item.week}` === key,
      )
        ? pins.filter((item) => `${item.activityId}|${item.week}` !== key)
        : [...pins, pin];
      const epoch = ++operationEpochRef.current;
      setRunning(true);
      setRunProgress("Preparing a pin change for review…");
      try {
        const nextSolved = await solveScenarios(instance, nextPins, Object.fromEntries(
          runs.map((entry) => [entry.scenario, entry.disruptions]),
        ));
        if (epoch !== operationEpochRef.current) return;
        const before = runs.find((entry) => entry.scenario === active);
        const after = nextSolved.find((entry) => entry.scenario === active)!;
        if (!isReadyScenario(before) || !isReadyScenario(after)) {
          throw new Error(
            after.outcome.diagnostics.warnings[0] ??
              `Scenario ${active} cannot satisfy this pin.`,
          );
        }
        setPending({
          label:
            nextPins.length < pins.length
              ? `Release ${pin.activityId} from wk${pin.week}`
              : `Pin ${pin.activityId} to wk${pin.week}`,
          scenario: active,
          runs: nextSolved,
          pins: nextPins,
          diff: comparePlans(
            before.outcome.submission,
            before.outcome.validation,
            after.outcome.submission,
            after.outcome.validation,
          ),
        });
        setRunError(null);
      } catch (cause) {
        if (epoch !== operationEpochRef.current) return;
        setRunError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (epoch === operationEpochRef.current) {
          setRunning(false);
          setRunProgress("");
        }
      }
    },
    [active, instance, pins, runs, solveScenarios],
  );

  const clearPins = useCallback(async () => {
    if (!instance || !runs || pins.length === 0) return;
    const epoch = ++operationEpochRef.current;
    setRunning(true);
    setRunProgress("Preparing a clear-pins change for review…");
    try {
      const nextSolved = await solveScenarios(instance, [], Object.fromEntries(
        runs.map((entry) => [entry.scenario, entry.disruptions]),
      ));
      if (epoch !== operationEpochRef.current) return;
      const before = runs.find((entry) => entry.scenario === active);
      const after = nextSolved.find((entry) => entry.scenario === active)!;
      if (!isReadyScenario(before) || !isReadyScenario(after)) {
        throw new Error(
          after.outcome.diagnostics.warnings[0] ??
            `Scenario ${active} could not be rebuilt.`,
        );
      }
      setPending({
        label: `Clear ${pins.length} pin${pins.length === 1 ? "" : "s"}`,
        scenario: active,
        runs: nextSolved,
        pins: [],
        diff: comparePlans(
          before.outcome.submission,
          before.outcome.validation,
          after.outcome.submission,
          after.outcome.validation,
        ),
      });
    } catch (cause) {
      if (epoch !== operationEpochRef.current) return;
      setRunError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (epoch === operationEpochRef.current) {
        setRunning(false);
        setRunProgress("");
      }
    }
  }, [active, instance, pins.length, runs, solveScenarios]);

  /**
   * Adopt a replan for the scenario in view. The disruption stays in force, so
   * the score shown afterwards is the one for the night actually being planned
   * rather than the undisrupted one it replaced.
   */
  const adoptReplan = useCallback(
    (outcome: ReplanOutcome, disruptions: Disruption[]) => {
      if (!instance || !runs) return;
      const activeRun = runs.find((entry) => entry.scenario === active);
      if (!activeRun) return;
      const validation = validate(
        instance,
        outcome.submission,
        activeRun.network,
        disruptions,
      );
      if (!validation.feasible) {
        setRunError(
          "The urgent-maintenance proposal failed local conformance and cannot enter review.",
        );
        return;
      }
      const nextRuns = runs.map((entry) =>
        entry.scenario === active
          ? {
              ...entry,
              outcome: {
                ...entry.outcome,
                status: "FEASIBLE" as const,
                submission: outcome.submission,
                validation,
                diagnostics: {
                  ...entry.outcome.diagnostics,
                  rejectedPins: outcome.submission.rejectedPins,
                },
              },
              disruptions,
            }
          : entry,
      );
      const before = runs.find((entry) => entry.scenario === active);
      const after = nextRuns.find((entry) => entry.scenario === active);
      if (!isReadyScenario(before) || !isReadyScenario(after)) return;
      setPending({
        label: `Apply urgent-maintenance replan to Scenario ${active}`,
        scenario: active,
        runs: nextRuns,
        pins,
        diff: comparePlans(
          before.outcome.submission,
          before.outcome.validation,
          after.outcome.submission,
          after.outcome.validation,
        ),
      });
      setDisruptionOpen(false);
    },
    [instance, runs, active, pins],
  );

  const applyPending = useCallback(() => {
    if (!pending || !runs) return;
    setHistory((current) => [
      ...current,
      { runs, pins, scenario: pending.scenario },
    ]);
    setRuns(pending.runs);
    setPins(pending.pins);
    setLastDiff(pending.diff);
    setSessionLog((current) => [
      ...current,
      {
        id: current.length + 1,
        at: new Date().toISOString(),
        action: pending.label,
        scenario: pending.scenario,
        diff: pending.diff,
      },
    ]);
    setPending(null);
  }, [pending, pins, runs]);

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous || !runs) return;
    const before = runs.find((entry) => entry.scenario === previous.scenario);
    const after = previous.runs.find(
      (entry) => entry.scenario === previous.scenario,
    );
    if (!isReadyScenario(before) || !isReadyScenario(after)) return;
    const diff = comparePlans(
      before.outcome.submission,
      before.outcome.validation,
      after.outcome.submission,
      after.outcome.validation,
    );
    setRuns(previous.runs);
    setPins(previous.pins);
    setHistory((current) => current.slice(0, -1));
    setLastDiff(diff);
    setActive(previous.scenario);
    setSessionLog((current) => [
      ...current,
      {
        id: current.length + 1,
        at: new Date().toISOString(),
        action: "Undo the latest applied change",
        scenario: previous.scenario,
        diff,
      },
    ]);
  }, [history, runs]);

  const download = useCallback((entry: ScenarioRun) => {
    if (!isReadyScenario(entry) || !entry.outcome.validation.feasible) return;
    for (const [name, text] of Object.entries(
      writeSubmission(entry.outcome.submission),
    )) {
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
    if (
      !runs ||
      runs.length !== SCENARIOS.length ||
      runs.some(
        (entry) =>
          !isReadyScenario(entry) || !entry.outcome.validation.feasible,
      )
    )
      return;
    const files: Record<string, string> = {};
    for (const entry of runs) {
      if (!isReadyScenario(entry)) return;
      for (const [name, text] of Object.entries(
        writeSubmission(entry.outcome.submission),
      )) {
        files[`${entry.scenario}/${name}`] = text;
      }
    }
    save(
      "ps1-submission.zip",
      new Blob([zipArchive(files)], { type: "application/zip" }),
    );
  }, [runs]);

  const current = runs?.find((entry) => entry.scenario === active) ?? null;
  const error = parsed.error ?? runError;
  const allDownloadable = Boolean(
    runs &&
    runs.length === SCENARIOS.length &&
    runs.every(
      (entry) => isReadyScenario(entry) && entry.outcome.validation.feasible,
    ),
  );
  const currentReady = isReadyScenario(current) ? current : null;
  const activeDiff = pending?.scenario === active ? pending.diff : lastDiff;
  const comparisonReports = Object.fromEntries(
    (runs ?? []).flatMap((entry) =>
      isReadyScenario(entry)
        ? [[entry.scenario, entry.outcome.validation] as const]
        : [],
    ),
  );
  const downloadBlockedReason = pending
    ? "Apply or discard the proposed change before exporting."
    : !runs
      ? "Run all three scenarios first."
      : !allDownloadable
        ? "Every scenario must be feasible and locally conformant before the official ZIP is available."
        : null;
  const copyHandover = useCallback(async () => {
    if (!currentReady) return;
    const text = buildHandoverSummary({
      scenario: currentReady.scenario,
      report: currentReady.outcome.validation,
      pins,
      disruptions: currentReady.disruptions,
      recentAction: sessionLog.at(-1)?.action ?? null,
      diff: activeDiff,
    });
    try {
      await navigator.clipboard.writeText(text);
      setRunError(null);
    } catch {
      setRunError(
        "The browser could not copy the handover summary. Select and copy it from the proof drawer instead.",
      );
    }
  }, [activeDiff, currentReady, pins, sessionLog]);

  return (
    <div
      className={`ps1-workbench ${lowGlare ? "ps1-low-glare" : ""}`}
      data-tone={lowGlare ? "low-glare" : "light"}
    >
      <header className="ps1-titlebar">
        <a href="/ps1" className="ps1-brand" aria-label="RailPlan start"><TrainFront size={22} strokeWidth={1.6} aria-hidden /><span>RailPlan</span></a>
        <h1>Track access planning</h1>
        <span className="ps1-title-context">{runs ? `${source === "public" ? "Public" : "Uploaded"} instance / Policy ${active}` : "NebulaX · PS1"}</span>
        <span className="ps1-local-label"><LockKeyhole size={12} aria-hidden /> Local workspace</span>
      </header>
      {/* Proxied by the visible "Upload instance files" and "Load another"
          buttons, so it stays out of the tab order: focus landing on a 1x1
          clipped control with no accessible name told a keyboard user nothing. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose the eight official CSV instance files"
        onChange={(event) =>
          void acceptFiles(Array.from(event.target.files ?? []))
        }
      />

      {!runs ? (
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
          className="ps1-panel ps1-preflight transition-colors"
          data-dropping={dragging || undefined}
        >
          <div className="ps1-preflight-heading"><FileSpreadsheet size={30} strokeWidth={1.3} aria-hidden /><p className="workspace-eyebrow">Start a planning session</p></div>
          <h2>Bring your work onto the plan.</h2>
          <p className="mt-1 max-w-3xl text-[12px] text-ink-700">
            Drop the eight official CSVs here. Parsing, solving and validation
            stay on this device.
          </p>
          <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-3">
            <div className="flex flex-col items-start gap-1">
              <Button
                variant="primary"
                aria-describedby="ps1-note-public"
                onClick={loadPublic}
              >
                Load the public instance and run
              </Button>
              <ActionNote id="ps1-note-public">
                Loads all eight published files and solves A, B and C in one
                step.
              </ActionNote>
            </div>
            <div className="flex flex-col items-start gap-1">
              <Button
                aria-describedby="ps1-note-upload"
                onClick={() => inputRef.current?.click()}
              >
                Upload instance files
              </Button>
              <ActionNote id="ps1-note-upload">
                Choose the eight CSVs for a hidden or custom instance.
              </ActionNote>
            </div>
            {source !== "none" && (
              <span className="py-1.5 text-[12px] text-ink-700">
                {source === "public"
                  ? "Public instance loaded"
                  : "Uploaded files"}{" "}
                — {PS1_FILES.length - missing.length}/{PS1_FILES.length} files
              </span>
            )}
          </div>
          <div className="ps1-import-manifest" aria-label="Required instance files">
            <div><strong>Instance files</strong><span>{PS1_FILES.length - missing.length} / 8 ready</span></div>
            <ul>{PS1_FILES.map((name, index) => <li key={name} data-ready={!missing.includes(name)}><span>{String(index + 1).padStart(2, "0")}</span><code>{name.replace(/^\d+_/, "")}</code><span>{missing.includes(name) ? "Required" : "Loaded"}</span></li>)}</ul>
            <p>No account required. Files and planning results stay in this browser.</p>
          </div>
          {ignored.length > 0 && (
            <p className="mt-3 rounded-md border border-signal-amber bg-signal-amber-soft p-3 text-[12px] text-ink-900">
              <span className="font-semibold">
                Ignored {ignored.length} file{ignored.length === 1 ? "" : "s"}
              </span>{" "}
              — {ignored.join(", ")}.
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
            <div className="mt-4 border-t border-rule pt-3">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
                <Stat label="Contracts" value={instance.contracts.length} />
                <Stat label="Activities" value={instance.activities.length} />
                <Stat
                  label="Locations"
                  value={instance.locationSupply.length}
                />
                <Stat
                  label="Horizon"
                  value={`${instance.parameters.horizonWeeks} weeks`}
                />
              </dl>
              <Button
                className="mt-3"
                variant="primary"
                disabled={running}
                onClick={() => void run(pins)}
              >
                {running ? "Optimising…" : "Run all three scenarios"}
              </Button>
            </div>
          )}
          {runProgress && (
            <p className="mt-2 text-[11px] text-accent" role="status">
              {runProgress}
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="ps1-command-bar" aria-label="Planning commands">
            <div className="ps1-ribbon-group">
              <Button size="sm" variant="quiet" onClick={() => inputRef.current?.click()}><FolderOpen aria-hidden />Load another</Button>
              <Button size="sm" variant="quiet" title={pending ? "Apply or discard the proposed change before re-running." : undefined} disabled={!instance || running || Boolean(pending)} onClick={() => instance && void run(pins, undefined, false)}><RefreshCw aria-hidden className={running ? "animate-spin" : undefined} />{running ? "Optimising…" : "Re-run"}</Button>
              <span className="ps1-ribbon-caption">Instance</span>
            </div>
            <div className="ps1-ribbon-group">
              <Button size="sm" variant="quiet" disabled={!currentReady} onClick={() => { setCutTarget(null); setDisruptionOpen(true); }}><Wrench aria-hidden />Test urgent maintenance</Button>
              <Button size="sm" variant="quiet" disabled={history.length === 0 || Boolean(pending)} onClick={undo}><Undo2 aria-hidden />Undo</Button>
              <span className="ps1-ribbon-caption">Plan & review</span>
            </div>
            <div className="ps1-ribbon-group">
              <Button size="sm" variant="quiet" onClick={() => setProofOpen(true)}><ShieldCheck aria-hidden />Proof and export</Button>
              <Button size="sm" variant="quiet" aria-pressed={lowGlare} onClick={() => setLowGlare(value => !value)}>{lowGlare ? <Sun aria-hidden /> : <Moon aria-hidden />}{lowGlare ? "Light mode" : "Low-glare"}</Button>
              <span className="ps1-ribbon-caption">Workspace</span>
            </div>
            <div className="ps1-ribbon-summary">
              <strong>{instance?.activities.length ?? 0} activities <span>/</span> {instance?.parameters.horizonWeeks ?? 0} weeks</strong>
              <span className={current?.outcome.status === "FEASIBLE" ? "text-signal-green" : "text-signal-red"}>{current?.outcome.status ?? "—"} · local conformance · rev {sessionLog.length + 1}</span>
            </div>
            {runProgress && <p className="ps1-solving-status" role="status">{runProgress}</p>}
          </section>

          <ScenarioComparison
            runs={runs}
            active={active}
            onSelect={setActive}
            diff={activeDiff}
            compact
          />

          <section
            id={`ps1-scenario-panel-${active}`}
            role="tabpanel"
            aria-labelledby={`ps1-scenario-tab-${active}`}
            className="ps1-active-plan"
          >
            {currentReady && instance ? (
              <>
                <OperationsOverview
                  instance={instance}
                  submission={currentReady.outcome.submission}
                  report={currentReady.outcome.validation}
                  comparisons={comparisonReports}
                  network={currentReady.network}
                  pins={pins}
                  rejectedPins={currentReady.outcome.diagnostics.rejectedPins}
                  disruptions={currentReady.disruptions}
                  diff={activeDiff}
                  selection={selection}
                  onSelect={setSelection}
                  onPin={togglePin}
                  onClearPins={clearPins}
                  onCut={(next) => {
                    setCutTarget(next);
                    setDisruptionOpen(true);
                  }}
                  onOpenProof={() => setProofOpen(true)}
                />
                <DisruptionPanel
                  key={
                    cutTarget
                      ? `${cutTarget.locationId}|${cutTarget.week}`
                      : "default"
                  }
                  instance={instance}
                  submission={currentReady.outcome.submission}
                  network={currentReady.network}
                  onApply={adoptReplan}
                  target={cutTarget}
                  open={disruptionOpen}
                  onOpenChange={setDisruptionOpen}
                  lowGlare={lowGlare}
                  existingDisruptions={currentReady.disruptions}
                />
              </>
            ) : current ? (
              <ScenarioFailure run={current} />
            ) : null}
          </section>

          {pending && (
            <ChangeReview
              pending={pending}
              onApply={applyPending}
              onCancel={() => setPending(null)}
            />
          )}
        </>
      )}

      {runs && <footer className="ps1-statusbar"><span><span className="ps1-status-dot" />{pending ? "Review pending · exports paused" : "Applied plan"} · revision {sessionLog.length + 1}</span><span>Weekly allocations · planning output, not operational approval</span><button type="button" onClick={() => setProofOpen(true)}>Local checking & conformance limits</button></footer>}

      {error && (
        <p
          className="rounded-sm border border-signal-red bg-signal-red-soft p-3 text-[12px] text-signal-red"
          role="alert"
        >
          {error}
        </p>
      )}

      {instance && (
        <Dialog open={proofOpen} onOpenChange={setProofOpen}>
          <DialogContent className={`ps1-dialog ${lowGlare ? "ps1-low-glare" : ""} max-h-[90vh] w-[min(960px,calc(100vw-24px))] overflow-y-auto`}>
            <DialogTitle>Proof, handover and export</DialogTitle>
            <DialogDescription>
              Validation evidence and official submission artifacts remain local
              to this browser.
            </DialogDescription>
            <section className="mt-3 rounded-sm border border-rule bg-sunk p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-ink-900">
                  Release gate
                </h3>
                <span
                  className={`text-[12px] font-semibold ${allDownloadable && !pending ? "text-signal-green" : "text-signal-red"}`}
                >
                  {allDownloadable && !pending
                    ? "Ready to export"
                    : "Export blocked"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-ink-700">
                {downloadBlockedReason ??
                  "All three scenarios are feasible, complete and locally conformant."}
              </p>
              <p className="mt-2 text-[10px] text-ink-500">
                Undecidable locally: cross-possession physical-night alignment,
                because the official files contain no global night identifier.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={!allDownloadable || Boolean(pending)}
                  onClick={downloadAll}
                >
                  Download official nine-file ZIP
                </Button>
                <Button
                  disabled={!currentReady || Boolean(pending)}
                  onClick={() => current && download(current)}
                >
                  Scenario {active} CSVs
                </Button>
                <Button
                  disabled={!currentReady}
                  onClick={() => void copyHandover()}
                >
                  Copy handover summary
                </Button>
                <Button
                  disabled={sessionLog.length === 0}
                  onClick={() =>
                    save(
                      "PS1_PLANNING_LOG.json",
                      new Blob([planningLogJson(sessionLog)], {
                        type: "application/json",
                      }),
                    )
                  }
                >
                  Export session log
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-ink-500">
                ZIP manifest: A/, B/ and C/, each containing RESULTS.csv,
                SCHEDULE_ACCESS.csv and SCHEDULE_OCCUPANCY.csv. The handover and
                planning log are never included.
              </p>
              {currentReady && (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] sm:grid-cols-4">
                    <Stat
                      label="Starts tried"
                      value={currentReady.outcome.diagnostics.startsTried}
                    />
                    <Stat
                      label="Candidates"
                      value={
                        currentReady.outcome.diagnostics.candidatesEvaluated
                      }
                    />
                    <Stat
                      label="Elapsed"
                      value={`${currentReady.outcome.diagnostics.elapsedMs} ms`}
                    />
                    <Stat
                      label="Warnings"
                      value={currentReady.outcome.diagnostics.warnings.length}
                    />
                  </dl>
                  <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-sm border border-rule bg-surface p-2 text-[10px] text-ink-700">
                    {buildHandoverSummary({
                      scenario: currentReady.scenario,
                      report: currentReady.outcome.validation,
                      pins,
                      disruptions: currentReady.disruptions,
                      recentAction: sessionLog.at(-1)?.action ?? null,
                      diff: activeDiff,
                    })}
                  </pre>
                </>
              )}
            </section>
            <SubmissionCheck
              instance={instance}
              network={runs?.[0]?.network ?? buildNetwork(instance)}
              reference={referenceSubmission}
              ours={(runs ?? []).map((entry) => ({
                scenario: entry.scenario,
                objective: isReadyScenario(entry)
                  ? (entry.outcome.validation.objectiveScore ?? null)
                  : null,
              }))}
            />
          </DialogContent>
        </Dialog>
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
  const proposed = pending.runs.find(
    (run) => run.scenario === pending.scenario,
  );
  const rejectedPins = proposed?.outcome.diagnostics.rejectedPins ?? [];
  return (
    <section
      className="ps1-panel sticky bottom-2 z-40 border-accent shadow-[0_-8px_24px_rgba(20,22,26,.12)]"
      aria-labelledby="ps1-change-review-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="workspace-eyebrow">Review before apply</p>
          <h2 id="ps1-change-review-title">{pending.label}</h2>
          <p className="mt-1 text-[12px] text-ink-700">
            The current schedule is unchanged until this proposal is applied.
          </p>
        </div>
        <span
          className={
            diff.feasibleAfter
              ? "text-[12px] font-semibold text-signal-green"
              : "text-[12px] font-semibold text-signal-red"
          }
        >
          {diff.feasibleAfter
            ? "Feasible"
            : `${diff.newViolations.length} new violations`}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-6">
        <Stat
          label="Score"
          value={`${diff.scoreBefore ?? "n/a"} → ${diff.scoreAfter ?? "n/a"}`}
        />
        <Stat label="Moved accesses" value={diff.movedAccesses} />
        <Stat label="Held still" value={`${diff.unchangedAccessPercent}%`} />
        <Stat label="Activities" value={diff.movedActivityIds.length} />
        <Stat label="Contracts" value={diff.changedContracts.length} />
        <Stat
          label="Resolved violations"
          value={diff.resolvedViolations.length}
        />
      </dl>
      {diff.movedActivityIds.length > 0 && (
        <p className="mt-2 text-[11px] text-ink-500">
          Moved: {diff.movedActivityIds.slice(0, 18).join(", ")}
          {diff.movedActivityIds.length > 18
            ? ` and ${diff.movedActivityIds.length - 18} more`
            : ""}
        </p>
      )}
      {diff.completionChanges.length > 0 && (
        <ul className="mt-2 grid gap-1 text-[10px] text-ink-700 sm:grid-cols-2">
          {diff.completionChanges.slice(0, 6).map((change) => (
            <li key={change.contractNumber}>
              <span className="font-semibold text-ink-900">
                {change.contractNumber}
              </span>{" "}
              {change.beforeDate ?? "—"} → {change.afterDate ?? "—"}
            </li>
          ))}
        </ul>
      )}
      {rejectedPins.length > 0 && (
        <p className="mt-2 rounded-sm border border-signal-red bg-signal-red-soft p-2 text-[11px] text-signal-red">
          {rejectedPins.length} rejected pin
          {rejectedPins.length === 1 ? "" : "s"}:{" "}
          {rejectedPins
            .slice(0, 3)
            .map((pin) => `${pin.activityId}@wk${pin.week}`)
            .join(", ")}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          disabled={!diff.feasibleAfter}
          onClick={onApply}
        >
          Apply reviewed change
        </Button>
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

/** Objectives are policy-specific, so the cards compare facts without declaring a winner. */
export function ScenarioComparison({
  runs,
  active,
  onSelect,
  diff,
  compact = false,
}: {
  runs: ScenarioRun[];
  active: Scenario;
  onSelect: (scenario: Scenario) => void;
  diff: PlanDiff | null;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (
      !(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(
        event.key,
      )
    )
      return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? runs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + runs.length) %
            runs.length;
    onSelect(runs[nextIndex].scenario);
    document
      .getElementById(`ps1-scenario-tab-${runs[nextIndex].scenario}`)
      ?.focus();
  };

  return (
    <div className={`ps1-policy-comparison ${compact ? "ps1-policy-compact" : ""}`} data-expanded={!compact || expanded}>
      {compact && <div className="ps1-policy-tools"><span>SCENARIOS</span><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><ChevronDown size={13} aria-hidden />{expanded ? "Hide comparison" : "Compare metrics"}</button></div>}
    <div
      className="ps1-policy-tabs grid gap-2 sm:grid-cols-3"
      role="tablist"
      aria-label="Scenario policies"
    >
      {runs.map((entry, index) => {
        const ready = isReadyScenario(entry);
        const report = ready ? entry.outcome.validation : null;
        const latest = ready
          ? ([...entry.outcome.submission.results].sort((a, b) =>
              b.simulatedCompletionDate.localeCompare(
                a.simulatedCompletionDate,
              ),
            )[0]?.simulatedCompletionDate ?? "—")
          : "—";
        return (
          <button
            key={entry.scenario}
            id={`ps1-scenario-tab-${entry.scenario}`}
            type="button"
            role="tab"
            tabIndex={active === entry.scenario ? 0 : -1}
            aria-selected={active === entry.scenario}
            aria-controls={`ps1-scenario-panel-${entry.scenario}`}
            onClick={() => onSelect(entry.scenario)}
            onKeyDown={(event) => move(event, index)}
            className={`rounded-sm border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active === entry.scenario ? "border-accent bg-accent-soft" : "border-rule bg-surface hover:border-rule-strong"}`}
          >
            <span className="flex items-start justify-between gap-2">
              <span>
                <span className="block text-[10px] uppercase tracking-[.14em] text-ink-500">
                  Policy {entry.scenario}
                </span>
                <span className="block text-[12px] font-semibold text-ink-900">
                  {policyName(entry.scenario)}
                </span>
              </span>
              <span
                className={`text-[10px] font-semibold uppercase ${ready ? "text-signal-green" : "text-signal-red"}`}
              >
                {entry.outcome.status}
              </span>
            </span>
            {compact && report && <span className="ps1-policy-score">{report.objectiveScore ?? "—"}<span>score</span></span>}
            {report ? (
              <span className="ps1-policy-metrics">
                <span className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-[10px] text-ink-500">
                  <span>
                    Score{" "}
                    <strong className="block text-[12px] text-ink-900">
                      {report.objectiveScore ?? "—"}
                    </strong>
                  </span>
                  <span>
                    P1/P2/P3{" "}
                    <strong className="block text-[12px] text-ink-900">
                      {report.softScores.priorityOverrun["1"]}/
                      {report.softScores.priorityOverrun["2"]}/
                      {report.softScores.priorityOverrun["3"]}
                    </strong>
                  </span>
                  <span>
                    Completes{" "}
                    <strong className="block text-[12px] text-ink-900">
                      {latest}
                    </strong>
                  </span>
                  <span>
                    Excess{" "}
                    <strong className="block text-[12px] text-ink-900">
                      {report.softScores.excessAccessNightsTotal}
                    </strong>
                  </span>
                  <span>
                    ECLO{" "}
                    <strong className="block text-[12px] text-ink-900">
                      {report.softScores.ecloNightsTotal}
                    </strong>
                  </span>
                  <span>
                    Churn{" "}
                    <strong className="block text-[12px] text-ink-900">
                      {entry.scenario === active && diff
                        ? `${diff.unchangedAccessPercent}% kept`
                        : "—"}
                    </strong>
                  </span>
                </span>
                <span className="mt-2 block border-t border-rule pt-1 text-[10px] text-ink-500">
                  Dominant cost: {dominantCost(report.softScores)}
                </span>
              </span>
            ) : (
              <span className="mt-2 block text-[11px] text-signal-red">
                {entry.outcome.diagnostics.warnings[0] ??
                  "No valid schedule was produced."}
              </span>
            )}
          </button>
        );
      })}
    </div>
    </div>
  );
}

function ScenarioFailure({ run }: { run: ScenarioRun }) {
  return (
    <div
      className="rounded-sm border border-signal-red bg-signal-red-soft p-4"
      role="status"
    >
      <p className="workspace-eyebrow">Scenario {run.scenario}</p>
      <h2 className="text-signal-red">
        {run.outcome.status === "INVALID_INSTANCE"
          ? "The instance is invalid"
          : "No submittable schedule was found"}
      </h2>
      <p className="mt-1 text-[12px] text-ink-700">
        The other scenario cards remain available. This outcome is retained
        instead of collapsing the workspace.
      </p>
      {run.outcome.diagnostics.warnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[11px] text-ink-700">
          {run.outcome.diagnostics.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[10px] text-ink-500">
        {run.outcome.diagnostics.startsTried} starts ·{" "}
        {run.outcome.diagnostics.candidatesEvaluated} candidates ·{" "}
        {run.outcome.diagnostics.elapsedMs} ms
      </p>
    </div>
  );
}

function policyName(scenario: Scenario): string {
  if (scenario === "A") return "Rigid supply";
  if (scenario === "B") return "Rigid dates";
  return "Balanced trade-offs";
}

function dominantCost(scores: {
  priorityWeightedScore: number;
  excessAccessNightsTotal: number;
  ecloNightsTotal: number;
}): string {
  const terms = [
    ["priority-weighted delay", scores.priorityWeightedScore],
    ["excess possessions", scores.excessAccessNightsTotal],
    ["ECLO", scores.ecloNightsTotal],
  ] as const;
  return [...terms].sort((a, b) => b[1] - a[1])[0][1] > 0
    ? [...terms].sort((a, b) => b[1] - a[1])[0][0]
    : "none";
}
