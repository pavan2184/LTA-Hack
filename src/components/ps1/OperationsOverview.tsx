"use client";

import { useMemo, useState, type KeyboardEvent } from "react";

import { explainPlacement } from "@railplan/ps1/engine/explain";
import { answerQuestion } from "@railplan/ps1/engine/qa";
import {
  closureFor,
  expandSpan,
  parseLocationId,
  type Network,
} from "@railplan/ps1/engine/network";
import type { Disruption } from "@railplan/ps1/engine/disruption";
import type { Pin } from "@railplan/ps1/engine/schedule";
import type {
  PlanDiff,
  Ps1Instance,
  QaAnswer,
  Scenario,
  Submission,
  ValidationReport,
} from "@railplan/ps1/types/ps1";

import { Button } from "@/components/ui/button";

type QueueFilter = "late" | "pinned" | "live" | "eclo" | "disrupted" | "warning";
type InspectorTab = "summary" | "why" | "network" | "changes";

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: "late", label: "Late" },
  { id: "pinned", label: "Pinned" },
  { id: "live", label: "Live" },
  { id: "eclo", label: "ECLO" },
  { id: "disrupted", label: "Disrupted" },
  { id: "warning", label: "Warning" },
];
const TABS: InspectorTab[] = ["summary", "why", "network", "changes"];

export function OperationsOverview({
  instance,
  submission,
  report,
  comparisons,
  network,
  pins,
  disruptions,
  diff,
  selectedActivityId,
  onSelectActivity,
}: {
  instance: Ps1Instance;
  submission: Submission;
  report: ValidationReport;
  comparisons: Partial<Record<Scenario, ValidationReport>>;
  network: Network;
  pins: Pin[];
  disruptions: Disruption[];
  diff: PlanDiff | null;
  selectedActivityId: string | null;
  onSelectActivity: (activityId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<QueueFilter[]>([]);
  const [tab, setTab] = useState<InspectorTab>("summary");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<QaAnswer | null>(null);
  const activityById = useMemo(
    () => new Map(instance.activities.map((activity) => [activity.activityId, activity])),
    [instance.activities],
  );
  const contractByNumber = useMemo(
    () => new Map(instance.contracts.map((contract) => [contract.contractNumber, contract])),
    [instance.contracts],
  );
  const resultByContract = useMemo(
    () => new Map(submission.results.map((result) => [result.contractNumber, result])),
    [submission.results],
  );
  const accessByActivity = useMemo(() => {
    const map = new Map<string, Submission["access"]>();
    for (const row of submission.access) {
      const rows = map.get(row.activityId) ?? [];
      rows.push(row);
      map.set(row.activityId, rows);
    }
    return map;
  }, [submission.access]);
  const pinned = useMemo(() => new Set(pins.map((pin) => pin.activityId)), [pins]);
  const warning = useMemo(
    () =>
      new Set(
        instance.activities
          .filter((activity) =>
            report.hardViolations.some((violation) => violation.detail.includes(activity.activityId)),
          )
          .map((activity) => activity.activityId),
      ),
    [instance.activities, report.hardViolations],
  );
  const disrupted = useMemo(() => {
    const ids = new Set<string>();
    if (!disruptions.length) return ids;
    for (const row of submission.occupancy) {
      if (
        disruptions.some(
          (cut) =>
            cut.locationId === row.locationId &&
            row.week >= cut.fromWeek &&
            (cut.toWeek === undefined || row.week <= cut.toWeek),
        )
      ) {
        ids.add(row.activityId);
      }
    }
    return ids;
  }, [disruptions, submission.occupancy]);

  const activities = useMemo(() => {
    const term = query.trim().toLowerCase();
    return instance.activities.filter((activity) => {
      const contract = contractByNumber.get(activity.contractNumber)!;
      const rows = accessByActivity.get(activity.activityId) ?? [];
      if (
        term &&
        !activity.activityId.toLowerCase().includes(term) &&
        !activity.contractNumber.toLowerCase().includes(term) &&
        !contract.contractDescription.toLowerCase().includes(term)
      ) {
        return false;
      }
      return filters.every((filter) => {
        if (filter === "late") return (resultByContract.get(activity.contractNumber)?.overrunDays ?? 0) > 0;
        if (filter === "pinned") return pinned.has(activity.activityId);
        if (filter === "live") return contract.natureOfActivity === "Live";
        if (filter === "eclo") return rows.some((row) => row.eclo === 1);
        if (filter === "disrupted") return disrupted.has(activity.activityId);
        return warning.has(activity.activityId);
      });
    });
  }, [
    accessByActivity,
    contractByNumber,
    disrupted,
    filters,
    instance.activities,
    pinned,
    query,
    resultByContract,
    warning,
  ]);

  const selected = selectedActivityId ? activityById.get(selectedActivityId) ?? null : null;
  const selectedContract = selected ? contractByNumber.get(selected.contractNumber) ?? null : null;
  const selectedRows = selected ? accessByActivity.get(selected.activityId) ?? [] : [];
  const explanation = selected
    ? explainPlacement(instance, submission, selected.activityId, network)
    : null;

  const ask = (value: string) => {
    setQuestion(value);
    setAnswer(
      answerQuestion(value, {
        instance,
        submission,
        report,
        comparisons,
        diff,
        network,
      }),
    );
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: InspectorTab) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = TABS.indexOf(current);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    setTab(next);
    document.getElementById(`ps1-inspector-tab-${next}`)?.focus();
  };

  return (
    <section className="mt-5 grid gap-3 xl:grid-cols-[18rem_minmax(0,1fr)]" aria-label="Operations workspace">
      <div className="rounded-sm border border-rule bg-surface p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-ink-900">Activity queue</h3>
          <span className="text-[11px] tabular-nums text-ink-400">{activities.length}/{instance.activities.length}</span>
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Activity, contract or work…"
          aria-label="Search activities"
          className="mt-2 h-8 w-full rounded-sm border border-rule-strong bg-surface px-2 text-[12px]"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => (
            <Button
              key={filter.id}
              size="sm"
              aria-pressed={filters.includes(filter.id)}
              className={filters.includes(filter.id) ? "border-accent bg-accent-soft text-accent" : ""}
              onClick={() =>
                setFilters((current) =>
                  current.includes(filter.id)
                    ? current.filter((value) => value !== filter.id)
                    : [...current, filter.id],
                )
              }
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <div className="mt-3 max-h-[22rem] overflow-auto border-t border-rule pt-1">
          {activities.length === 0 ? (
            <p className="p-3 text-[12px] text-ink-500">No activity matches these filters.</p>
          ) : (
            <ul className="grid gap-0.5">
              {activities.map((activity) => {
                const contract = contractByNumber.get(activity.contractNumber)!;
                const rows = accessByActivity.get(activity.activityId) ?? [];
                const late = (resultByContract.get(activity.contractNumber)?.overrunDays ?? 0) > 0;
                return (
                  <li key={activity.activityId}>
                    <button
                      type="button"
                      aria-pressed={selectedActivityId === activity.activityId}
                      onClick={() => onSelectActivity(activity.activityId)}
                      className={`w-full rounded-sm border px-2 py-2 text-left ${
                        selectedActivityId === activity.activityId
                          ? "border-accent bg-accent-soft"
                          : "border-transparent hover:border-rule hover:bg-sunk"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-[12px] font-semibold text-ink-900">
                        {activity.activityId}
                        <span className={late ? "text-signal-amber" : "text-ink-400"}>
                          {rows.length ? `wk${Math.min(...rows.map((row) => row.week))}–${Math.max(...rows.map((row) => row.week))}` : "unscheduled"}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-700">
                        {activity.contractNumber} · {contract.accessType} · {contract.natureOfActivity}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="min-w-0 rounded-sm border border-rule bg-surface p-3 xl:sticky xl:top-3 xl:self-start">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-semibold text-ink-900">Operations inspector</h3>
            <p className="text-[11px] text-ink-500">
              {selected ? `${selected.activityId} · ${selected.contractNumber}` : "Choose an activity from the queue or timeline."}
            </p>
          </div>
          <span className="rounded-full border border-rule px-2 py-0.5 text-[10px] text-ink-700">
            Local conformance
          </span>
        </div>

        <div className="mt-3 flex overflow-x-auto border-b border-rule" role="tablist" aria-label="Inspector views">
          {TABS.map((name) => (
            <button
              key={name}
              id={`ps1-inspector-tab-${name}`}
              type="button"
              role="tab"
              aria-selected={tab === name}
              aria-controls={`ps1-inspector-panel-${name}`}
              tabIndex={tab === name ? 0 : -1}
              onKeyDown={(event) => onTabKey(event, name)}
              onClick={() => setTab(name)}
              className={`px-3 py-1.5 text-[12px] capitalize ${tab === name ? "border-b-2 border-accent font-semibold text-accent" : "text-ink-700"}`}
            >
              {name}
            </button>
          ))}
        </div>

        <div id={`ps1-inspector-panel-${tab}`} role="tabpanel" aria-labelledby={`ps1-inspector-tab-${tab}`} className="min-h-40 pt-3">
          {!selected ? (
            <p className="text-[12px] text-ink-500">Selection links the queue, timeline and network context.</p>
          ) : tab === "summary" ? (
            <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-[12px]">
              <Cell label="Contract" value={selected.contractNumber} />
              <Cell label="Access type" value={selectedContract?.accessType ?? "—"} />
              <Cell label="Nature" value={selectedContract?.natureOfActivity ?? "—"} />
              <Cell label="Required" value={`${selected.totalAccesses} nights`} />
              <Cell label="Scheduled" value={selectedRows.map((row) => `wk${row.week}`).join(", ") || "none"} />
              <Cell label="Predecessor" value={selected.predecessorActivityId ?? "none"} />
            </dl>
          ) : tab === "why" ? (
            <div className="text-[12px] text-ink-700">
              <p>{explanation?.summary ?? "No placement explanation is available."}</p>
              <p className="mt-2 text-[11px] text-ink-500">
                Objective contribution is derived from the contract tier, activity priority, final contract week, ECLO and excess-possession use.
              </p>
            </div>
          ) : tab === "network" ? (
            <NetworkSchematic instance={instance} activityId={selected.activityId} network={network} />
          ) : (
            <ChangeSummary diff={diff} />
          )}
        </div>

        <div className="mt-3 border-t border-rule pt-3">
          <p className="text-[12px] font-semibold text-ink-900">Ask this schedule</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              selected ? `Why is ${selected.activityId} here?` : "Where are the bottlenecks?",
              "Compare scenarios",
              "How are ECLO and excess nights used?",
              "What changed?",
            ].map((prompt) => (
              <button key={prompt} type="button" className="rounded-full border border-rule px-2 py-1 text-[10px] text-ink-700 hover:bg-sunk" onClick={() => ask(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
          >
            <input value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Question about this schedule" className="h-8 min-w-0 flex-1 rounded-sm border border-rule-strong px-2 text-[12px]" placeholder="Ask about an activity, contract or bottleneck…" />
            <Button size="sm" type="submit">Ask</Button>
          </form>
          {answer && (
            <div className="mt-2 rounded-sm border border-rule bg-sunk p-3" role="status">
              <p className="text-[12px] text-ink-900">{answer.text}</p>
              {answer.facts.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-[11px] text-ink-700">
                  {answer.facts.map((fact) => <li key={fact}>{fact}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function NetworkSchematic({ instance, activityId, network }: { instance: Ps1Instance; activityId: string; network: Network }) {
  const activity = instance.activities.find((row) => row.activityId === activityId)!;
  const contract = instance.contracts.find((row) => row.contractNumber === activity.contractNumber)!;
  const occupied = expandSpan(network, activity.startLocationId, activity.endLocationId);
  const closed = closureFor(network, occupied, contract.natureOfActivity);
  const occupiedStations = new Set<string>();
  const closedStations = new Set<string>();
  for (const [locations, target] of [[occupied, occupiedStations], [closed, closedStations]] as const) {
    for (const locationId of locations) {
      const parsed = parseLocationId(locationId);
      if (parsed.kind === "PLAT") target.add(`${parsed.lineCode}|${parsed.stationId}`);
      else {
        target.add(`${parsed.lineCode}|${parsed.fromStationId}`);
        target.add(`${parsed.lineCode}|${parsed.toStationId}`);
      }
    }
  }
  return (
    <div className="grid gap-3">
      {instance.lines.map((line) => (
        <div key={line.lineCode}>
          <p className="text-[11px] font-semibold text-ink-700">{line.lineName}</p>
          <div className="mt-1 flex items-center overflow-x-auto pb-1">
            {instance.stations.filter((station) => station.lineCode === line.lineCode).sort((a, b) => a.seq - b.seq).map((station, index) => {
              const key = `${line.lineCode}|${station.stationId}`;
              const state = occupiedStations.has(key) ? "occupied" : closedStations.has(key) ? "closed" : "plain";
              return (
                <div key={key} className="flex items-center">
                  {index > 0 && <span className={`h-px w-4 ${state === "plain" ? "bg-rule" : "bg-accent"}`} />}
                  <span className={`whitespace-nowrap rounded-full border px-2 py-1 text-[9px] ${state === "occupied" ? "border-accent bg-accent text-white" : state === "closed" ? "border-signal-amber bg-signal-amber-soft text-ink-900" : "border-rule text-ink-500"}`}>
                    {station.stationId}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-ink-500">Blue is occupied; amber is the buffer, Live mirror or interchange closure derived by the same engine used for validation.</p>
    </div>
  );
}

function ChangeSummary({ diff }: { diff: PlanDiff | null }) {
  if (!diff) return <p className="text-[12px] text-ink-500">No reviewed change is active.</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-[12px]">
      <Cell label="Score" value={`${diff.scoreBefore ?? "n/a"} → ${diff.scoreAfter ?? "n/a"}`} />
      <Cell label="Feasible" value={`${diff.feasibleBefore ? "yes" : "no"} → ${diff.feasibleAfter ? "yes" : "no"}`} />
      <Cell label="Moved accesses" value={diff.movedAccesses} />
      <Cell label="Activities touched" value={diff.movedActivityIds.length} />
      <Cell label="Contracts changed" value={diff.changedContracts.join(", ") || "none"} />
      <Cell label="New violations" value={diff.newViolations.length} />
    </dl>
  );
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-ink-500">{label}</dt><dd className="font-medium text-ink-900">{value}</dd></div>;
}
