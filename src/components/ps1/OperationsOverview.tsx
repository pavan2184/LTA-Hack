"use client";

import { useMemo, useState, type KeyboardEvent } from "react";

import { buildAttentionItems } from "@railplan/ps1/engine/attention";
import type { Disruption } from "@railplan/ps1/engine/disruption";
import { explainPlacement } from "@railplan/ps1/engine/explain";
import { computeMetrics } from "@railplan/ps1/engine/metrics";
import {
  closureFor,
  expandSpan,
  parseLocationId,
  type Network,
} from "@railplan/ps1/engine/network";
import { answerQuestion } from "@railplan/ps1/engine/qa";
import type { Pin, RejectedPin } from "@railplan/ps1/engine/schedule";
import { buildTimeline } from "@railplan/ps1/engine/timeline";
import type {
  AttentionItem,
  PlanDiff,
  Ps1Instance,
  QaAnswer,
  Scenario,
  Submission,
  ValidationReport,
} from "@railplan/ps1/types/ps1";

import { PossessionTimeline } from "@/components/ps1/PossessionTimeline";
import type { WorkspaceSelection } from "@/components/ps1/workspace-types";
import { Figure } from "@/components/shared/Figure";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type QueuePreset = "all" | "action" | "p1" | "bottleneck" | "live" | "changes";
type InspectorTab = "summary" | "why" | "network" | "changes";
type MobileTab = "attention" | "selected" | "review" | "proof";

const INSPECTOR_TABS: InspectorTab[] = ["summary", "why", "network", "changes"];
const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: "attention", label: "Attention" },
  { id: "selected", label: "Selected" },
  { id: "review", label: "Review" },
  { id: "proof", label: "Proof" },
];

export function OperationsOverview({
  instance,
  submission,
  report,
  comparisons,
  network,
  pins,
  rejectedPins,
  disruptions,
  diff,
  selection,
  onSelect,
  onPin,
  onClearPins,
  onCut,
  onOpenProof,
}: {
  instance: Ps1Instance;
  submission: Submission;
  report: ValidationReport;
  comparisons: Partial<Record<Scenario, ValidationReport>>;
  network: Network;
  pins: Pin[];
  rejectedPins: RejectedPin[];
  disruptions: Disruption[];
  diff: PlanDiff | null;
  selection: WorkspaceSelection;
  onSelect: (selection: WorkspaceSelection) => void;
  onPin: (pin: Pin) => void;
  onClearPins: () => void;
  onCut: (target: { locationId: string; week: number }) => void;
  onOpenProof: () => void;
}) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("attention");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const onMobileTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: MobileTab) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = MOBILE_TABS.findIndex((item) => item.id === current);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? MOBILE_TABS.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + MOBILE_TABS.length) % MOBILE_TABS.length;
    const next = MOBILE_TABS[nextIndex].id;
    setMobileTab(next);
    document.getElementById(`ps1-mobile-tab-${next}`)?.focus();
  };

  const inspector = (
    <OperationsInspector
      instance={instance}
      submission={submission}
      report={report}
      comparisons={comparisons}
      network={network}
      pins={pins}
      disruptions={disruptions}
      diff={diff}
      selection={selection}
      onSelect={onSelect}
      onPin={onPin}
      onCut={onCut}
    />
  );
  const queue = (
    <AttentionQueue
      instance={instance}
      submission={submission}
      report={report}
      network={network}
      pins={pins}
      rejectedPins={rejectedPins}
      disruptions={disruptions}
      diff={diff}
      selection={selection}
      onSelect={(next) => {
        onSelect(next);
        setMobileTab("selected");
      }}
    />
  );

  return (
    <section className="mt-4" aria-label="Operations workspace">
      <div className="hidden gap-3 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_22rem]">
        <div className="min-w-0 rounded-sm border border-rule bg-surface p-3">{queue}</div>
        <div className="min-w-0 rounded-sm border border-rule bg-surface p-3">
          <PossessionTimeline
            instance={instance}
            submission={submission}
            network={network}
            pins={pins}
            disruptions={disruptions}
            selection={selection}
            onSelect={onSelect}
          />
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-rule pt-3 xl:hidden">
            <p className="text-[11px] text-ink-500">
              Select a cell, then open its operational details.
            </p>
            <Button size="sm" onClick={() => setInspectorOpen(true)}>Open selected details</Button>
          </div>
        </div>
        <aside className="hidden min-w-0 self-start rounded-sm border border-rule bg-surface p-3 xl:sticky xl:top-3 xl:block">
          {inspector}
        </aside>
      </div>

      <div className="lg:hidden">
        <div className="flex overflow-x-auto border-b border-rule" role="tablist" aria-label="Mobile workspace views">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`ps1-mobile-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={mobileTab === tab.id}
              aria-controls={`ps1-mobile-panel-${tab.id}`}
              tabIndex={mobileTab === tab.id ? 0 : -1}
              onKeyDown={(event) => onMobileTabKey(event, tab.id)}
              onClick={() => setMobileTab(tab.id)}
              className={`min-h-11 flex-1 whitespace-nowrap px-3 py-2 text-[12px] ${mobileTab === tab.id ? "border-b-2 border-accent font-semibold text-accent" : "text-ink-700"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div id={`ps1-mobile-panel-${mobileTab}`} role="tabpanel" aria-labelledby={`ps1-mobile-tab-${mobileTab}`} className="rounded-b-sm border border-t-0 border-rule bg-surface p-3">
          {mobileTab === "attention" ? queue : null}
          {mobileTab === "selected" ? inspector : null}
          {mobileTab === "review" ? <ChangeSummary diff={diff} /> : null}
          {mobileTab === "proof" ? (
            <div>
              <p className="text-[12px] text-ink-700">
                Validation evidence, conformance limits and downloads are available in the proof drawer.
              </p>
              <Button className="mt-3" size="sm" onClick={onOpenProof}>Open proof and export</Button>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-ink-500">
          Mobile is optimized for triage and reviewed decisions. Open this plan on a larger screen to edit the full location-week matrix.
        </p>
      </div>

      <Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <DialogContent className="w-[min(720px,calc(100vw-32px))] xl:hidden">
          <DialogTitle>Operations inspector</DialogTitle>
          <DialogDescription>Details and actions for the selected activity or location-week.</DialogDescription>
          {inspector}
        </DialogContent>
      </Dialog>

      {pins.length > 0 && (
        <div className="mt-2 flex items-center justify-between rounded-sm border border-rule bg-sunk px-3 py-2">
          <span className="text-[11px] text-ink-700">{pins.length} hard pin{pins.length === 1 ? "" : "s"} in the active plan</span>
          <Button size="sm" onClick={onClearPins}>Clear all pins</Button>
        </div>
      )}
    </section>
  );
}

function AttentionQueue({
  instance,
  submission,
  report,
  network,
  pins,
  rejectedPins,
  disruptions,
  diff,
  selection,
  onSelect,
}: {
  instance: Ps1Instance;
  submission: Submission;
  report: ValidationReport;
  network: Network;
  pins: Pin[];
  rejectedPins: RejectedPin[];
  disruptions: Disruption[];
  diff: PlanDiff | null;
  selection: WorkspaceSelection;
  onSelect: (selection: WorkspaceSelection) => void;
}) {
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<QueuePreset>("action");
  const items = useMemo(
    () => buildAttentionItems({ instance, submission, report, network, pins, rejectedPins, disruptions, diff }),
    [diff, disruptions, instance, network, pins, rejectedPins, report, submission],
  );
  const contractByNumber = useMemo(
    () => new Map(instance.contracts.map((contract) => [contract.contractNumber, contract])),
    [instance.contracts],
  );
  const visible = items.filter((item) => {
    const term = query.trim().toLowerCase();
    if (term && ![item.label, item.detail, ...item.activityIds, ...item.contractNumbers, ...item.locationIds].some((value) => value.toLowerCase().includes(term))) return false;
    if (preset === "all") return true;
    if (preset === "action") return item.severity !== "normal";
    if (preset === "p1") return item.kind === "p1-risk";
    if (preset === "bottleneck") return item.kind === "capacity" || item.kind === "disruption";
    if (preset === "changes") return item.kind === "recent-change";
    return item.contractNumbers.some((number) => contractByNumber.get(number)?.natureOfActivity === "Live");
  });
  const counts = items.reduce(
    (result, item) => ({ ...result, [item.severity]: (result[item.severity] ?? 0) + 1 }),
    {} as Partial<Record<AttentionItem["severity"], number>>,
  );
  const selectionVisible = selection
    ? visible.some((item) =>
        selection.kind === "activity"
          ? item.activityIds.includes(selection.activityId)
          : item.locationIds.includes(selection.locationId) && item.weeks.includes(selection.week),
      )
    : true;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-ink-900">Attention queue</h3>
        <span className="text-[11px] tabular-nums text-ink-400">{visible.length}/{items.length}</span>
      </div>
      <p className="mt-0.5 text-[10px] text-ink-500">
        {counts.blocking ?? 0} blocking · {counts.critical ?? 0} critical · {counts.warning ?? 0} warning
      </p>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Activity, contract or location…"
        aria-label="Search attention queue"
        className="mt-2 h-8 w-full rounded-sm border border-rule-strong bg-surface px-2 text-[12px]"
      />
      <label className="mt-2 block text-[11px] text-ink-700">
        View
        <select
          value={preset}
          onChange={(event) => setPreset(event.target.value as QueuePreset)}
          className="mt-1 h-8 w-full rounded-sm border border-rule-strong bg-surface px-2 text-[12px]"
        >
          <option value="action">Needs action</option>
          <option value="p1">P1 risk</option>
          <option value="bottleneck">Bottlenecks</option>
          <option value="live">Live works</option>
          <option value="changes">Recent changes</option>
          <option value="all">All activities</option>
        </select>
      </label>
      {!selectionVisible && selection && (
        <div className="mt-2 rounded-sm border border-signal-amber bg-signal-amber-soft p-2 text-[11px] text-ink-900">
          The selected item is hidden by this view.{" "}
          <button type="button" className="underline" onClick={() => { setPreset("all"); setQuery(""); }}>
            Reveal it
          </button>
        </div>
      )}
      <div className="mt-3 max-h-[31rem] overflow-auto border-t border-rule pt-1">
        {visible.length === 0 ? (
          <p className="p-3 text-[12px] text-ink-500">No item matches this view.</p>
        ) : (
          <ul className="grid gap-1">
            {visible.map((item) => {
              const target: WorkspaceSelection = item.locationIds[0] && item.weeks[0]
                ? { kind: "location-week", locationId: item.locationIds[0], week: item.weeks[0] }
                : item.activityIds[0]
                  ? { kind: "activity", activityId: item.activityIds[0] }
                  : null;
              const selected = target?.kind === "activity"
                ? selection?.kind === "activity" && selection.activityId === target.activityId
                : target?.kind === "location-week"
                  ? selection?.kind === "location-week" && selection.locationId === target.locationId && selection.week === target.week
                  : false;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!target}
                    aria-pressed={selected}
                    onClick={() => onSelect(target)}
                    className={`w-full rounded-sm border px-2 py-2 text-left ${selected ? "border-accent bg-accent-soft" : "border-transparent hover:border-rule hover:bg-sunk"}`}
                  >
                    <span className="flex items-start gap-2 text-[11px] font-semibold text-ink-900">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${severityDot(item.severity)}`} aria-hidden />
                      <span>{item.label}</span>
                    </span>
                    <span className="mt-0.5 block line-clamp-2 pl-4 text-[10px] leading-snug text-ink-600">{item.detail}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function OperationsInspector({
  instance,
  submission,
  report,
  comparisons,
  network,
  pins,
  disruptions,
  diff,
  selection,
  onSelect,
  onPin,
  onCut,
}: {
  instance: Ps1Instance;
  submission: Submission;
  report: ValidationReport;
  comparisons: Partial<Record<Scenario, ValidationReport>>;
  network: Network;
  pins: Pin[];
  disruptions: Disruption[];
  diff: PlanDiff | null;
  selection: WorkspaceSelection;
  onSelect: (selection: WorkspaceSelection) => void;
  onPin: (pin: Pin) => void;
  onCut: (target: { locationId: string; week: number }) => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("summary");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<QaAnswer | null>(null);
  const activityById = useMemo(() => new Map(instance.activities.map((activity) => [activity.activityId, activity])), [instance.activities]);
  const contractByNumber = useMemo(() => new Map(instance.contracts.map((contract) => [contract.contractNumber, contract])), [instance.contracts]);
  const accessByActivity = useMemo(() => {
    const map = new Map<string, Submission["access"]>();
    for (const row of submission.access) {
      const rows = map.get(row.activityId) ?? [];
      rows.push(row);
      map.set(row.activityId, rows);
    }
    return map;
  }, [submission.access]);
  const timeline = useMemo(() => buildTimeline(instance, submission, network, disruptions), [disruptions, instance, network, submission]);
  const selectedActivity = selection?.kind === "activity" ? activityById.get(selection.activityId) ?? null : null;
  const selectedLocation = selection?.kind === "location-week"
    ? [...timeline.rows, ...timeline.emptyRows].find((row) => row.locationId === selection.locationId) ?? null
    : null;
  const selectedCell = selection?.kind === "location-week" ? selectedLocation?.cells.get(selection.week) : undefined;
  const selectedContract = selectedActivity ? contractByNumber.get(selectedActivity.contractNumber) ?? null : null;
  const selectedRows = selectedActivity ? accessByActivity.get(selectedActivity.activityId) ?? [] : [];
  const explanation = selectedActivity ? explainPlacement(instance, submission, selectedActivity.activityId, network) : null;
  const metrics = useMemo(() => computeMetrics(instance, submission, report, network), [instance, network, report, submission]);
  const pinned = useMemo(() => new Set(pins.map((pin) => `${pin.activityId}|${pin.week}`)), [pins]);
  const heading = selectedActivity
    ? `${selectedActivity.activityId} · ${selectedActivity.contractNumber}`
    : selection?.kind === "location-week"
      ? `${selectedLocation?.label ?? selection.locationId} · wk${selection.week}`
      : "Nothing selected";

  const ask = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setQuestion(next);
    setAnswer(answerQuestion(next, { instance, submission, report, comparisons, diff, network }));
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: InspectorTab) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = INSPECTOR_TABS.indexOf(current);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = INSPECTOR_TABS[(index + delta + INSPECTOR_TABS.length) % INSPECTOR_TABS.length];
    setTab(next);
    document.getElementById(`ps1-inspector-tab-${next}`)?.focus();
  };

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-ink-900">Operations inspector</h3>
          <p className="text-[11px] text-ink-500">{heading}</p>
        </div>
        <span className="rounded-full border border-rule px-2 py-0.5 text-[9px] text-ink-700">Local conformance</span>
      </div>
      <div className="mt-3 flex overflow-x-auto border-b border-rule" role="tablist" aria-label="Inspector views">
        {INSPECTOR_TABS.map((name) => (
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
            className={`min-h-9 px-2.5 py-1.5 text-[11px] capitalize ${tab === name ? "border-b-2 border-accent font-semibold text-accent" : "text-ink-700"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <div id={`ps1-inspector-panel-${tab}`} role="tabpanel" aria-labelledby={`ps1-inspector-tab-${tab}`} className="min-h-52 pt-3">
        {tab === "summary" ? (
          selectedActivity ? (
            <div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <Cell label="Contract" value={selectedActivity.contractNumber} />
                <Cell label="Access type" value={selectedContract?.accessType ?? "—"} />
                <Cell label="Nature" value={selectedContract?.natureOfActivity ?? "—"} />
                <Cell label="Required" value={`${selectedActivity.totalAccesses} nights`} />
                <Cell label="Scheduled" value={selectedRows.map((row) => `wk${row.week}`).join(", ") || "none"} />
                <Cell label="Predecessor" value={selectedActivity.predecessorActivityId ?? "none"} />
              </dl>
              <div className="mt-3 border-t border-rule pt-2">
                <p className="text-[11px] font-medium text-ink-900">Hard pin</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedRows.map((row) => {
                    const key = `${selectedActivity.activityId}|${row.week}`;
                    return (
                      <Button key={key} size="sm" variant={pinned.has(key) ? "primary" : "default"} onClick={() => onPin({ activityId: selectedActivity.activityId, week: row.week, eclo: row.eclo })}>
                        {pinned.has(key) ? `Release wk${row.week}` : `Pin wk${row.week}`}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : selection?.kind === "location-week" ? (
            <div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <Cell label="Location" value={selectedLocation?.locationId ?? selection.locationId} />
                <Cell label="Week" value={selection.week} />
                <Cell label="Possessions" value={selectedCell?.possessions ?? 0} />
                <Cell label="Effective capacity" value={selectedCell?.effectiveCapacity ?? selectedLocation?.capacity ?? 0} />
                <Cell label="Nominal capacity" value={selectedCell?.nominalCapacity ?? selectedLocation?.capacity ?? 0} />
                <Cell label="Status" value={selectedCell?.disrupted ? "disrupted" : (selectedCell?.load ?? 0) >= 1 ? "at capacity" : "available"} />
              </dl>
              <ul className="mt-3 grid gap-1 border-t border-rule pt-2">
                {(selectedCell?.activityIds ?? []).map((activityId) => (
                  <li key={activityId} className="flex items-center justify-between gap-2">
                    <button type="button" className="text-[11px] font-medium text-accent underline" onClick={() => onSelect({ kind: "activity", activityId })}>{activityId}</button>
                    <Button size="sm" onClick={() => onPin({ activityId, week: selection.week })}>
                      {pinned.has(`${activityId}|${selection.week}`) ? "Release" : "Pin"}
                    </Button>
                  </li>
                ))}
              </ul>
              <Button className="mt-3" size="sm" variant="primary" onClick={() => onCut({ locationId: selection.locationId, week: selection.week })}>
                Impose urgent maintenance here
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {metrics.slice(0, 4).map((metric) => <Figure key={metric.key} metric={metric} className="rounded-sm" />)}
            </div>
          )
        ) : tab === "why" ? (
          selectedActivity ? (
            <div className="text-[12px] text-ink-700">
              <p>{explanation?.summary ?? "No placement explanation is available."}</p>
              {explanation?.facts.length ? (
                <dl className="mt-3 grid gap-1 text-[11px]">
                  {explanation.facts.map((fact) => <Cell key={fact.label} label={fact.label} value={fact.value} />)}
                </dl>
              ) : null}
            </div>
          ) : selection?.kind === "location-week" ? (
            <p className="text-[12px] text-ink-700">
              This location-week holds {selectedCell?.possessions ?? 0} possession{selectedCell?.possessions === 1 ? "" : "s"} against an effective capacity of {selectedCell?.effectiveCapacity ?? selectedLocation?.capacity ?? 0}{selectedCell?.disrupted ? `, reduced from ${selectedCell.nominalCapacity} by urgent maintenance` : ""}.
            </p>
          ) : (
            <p className="text-[12px] text-ink-500">Select an activity or location-week to see computed reasons.</p>
          )
        ) : tab === "network" ? (
          selectedActivity ? <NetworkSchematic instance={instance} activityId={selectedActivity.activityId} network={network} /> : (
            <p className="text-[12px] text-ink-500">Select an activity to inspect its occupied span, buffers and Live effects.</p>
          )
        ) : <ChangeSummary diff={diff} />}
      </div>

      <div className="mt-3 border-t border-rule pt-3">
        <p className="text-[11px] font-semibold text-ink-900">Ask this schedule</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {[
            selectedActivity ? `Why is ${selectedActivity.activityId} here?` : "Where are the bottlenecks?",
            "Compare scenarios",
            "How are ECLO and excess nights used?",
            "What changed?",
          ].map((prompt) => (
            <button key={prompt} type="button" className="rounded-full border border-rule px-2 py-1 text-[9px] text-ink-700 hover:bg-sunk" onClick={() => ask(prompt)}>{prompt}</button>
          ))}
        </div>
        <form className="mt-2 flex gap-1.5" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Question about this schedule" className="h-8 min-w-0 flex-1 rounded-sm border border-rule-strong px-2 text-[11px]" placeholder="Ask about this plan…" />
          <Button size="sm" type="submit">Ask</Button>
        </form>
        {answer && (
          <div className="mt-2 rounded-sm border border-rule bg-sunk p-2" role="status">
            <p className="text-[11px] text-ink-900">{answer.text}</p>
            {answer.facts.length > 0 && <ul className="mt-1 list-disc pl-4 text-[10px] text-ink-700">{answer.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>}
            {(answer.activityIds.length > 0 || answer.locationIds.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-rule pt-2">
                {answer.activityIds.map((activityId) => <Button key={activityId} size="sm" onClick={() => onSelect({ kind: "activity", activityId })}>{activityId}</Button>)}
                {answer.locationIds.map((locationId) => <Button key={locationId} size="sm" onClick={() => onSelect({ kind: "location-week", locationId, week: selection?.kind === "location-week" ? selection.week : 1 })}>{locationId}</Button>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
          <p className="text-[10px] font-semibold text-ink-700">{line.lineName}</p>
          <div className="mt-1 flex items-center overflow-x-auto pb-1">
            {instance.stations.filter((station) => station.lineCode === line.lineCode).sort((a, b) => a.seq - b.seq).map((station, index) => {
              const key = `${line.lineCode}|${station.stationId}`;
              const state = occupiedStations.has(key) ? "occupied" : closedStations.has(key) ? "closed" : "plain";
              return (
                <div key={key} className="flex items-center">
                  {index > 0 && <span className={`h-px w-3 ${state === "plain" ? "bg-rule" : "bg-accent"}`} />}
                  <span className={`whitespace-nowrap rounded-full border px-1.5 py-1 text-[8px] ${state === "occupied" ? "border-accent bg-accent text-white" : state === "closed" ? "border-signal-amber bg-signal-amber-soft text-ink-900" : "border-rule text-ink-500"}`}>{station.stationId}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[9px] text-ink-500">Blue is occupied; amber is the derived buffer, Live mirror or interchange closure.</p>
    </div>
  );
}

function ChangeSummary({ diff }: { diff: PlanDiff | null }) {
  if (!diff) return <p className="text-[12px] text-ink-500">No reviewed change is active.</p>;
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        <Cell label="Score" value={`${diff.scoreBefore ?? "n/a"} → ${diff.scoreAfter ?? "n/a"}`} />
        <Cell label="Feasible" value={`${diff.feasibleBefore ? "yes" : "no"} → ${diff.feasibleAfter ? "yes" : "no"}`} />
        <Cell label="Moved accesses" value={diff.movedAccesses} />
        <Cell label="Held still" value={`${diff.unchangedAccessPercent}%`} />
        <Cell label="Activities touched" value={diff.movedActivityIds.length} />
        <Cell label="New violations" value={diff.newViolations.length} />
      </dl>
      {diff.completionChanges.length > 0 && (
        <ul className="mt-3 grid gap-1 border-t border-rule pt-2 text-[10px] text-ink-700">
          {diff.completionChanges.map((change) => (
            <li key={change.contractNumber}>
              <span className="font-medium text-ink-900">{change.contractNumber}</span>: {change.beforeDate ?? "—"} → {change.afterDate ?? "—"} ({change.beforeOverrunDays ?? "—"} → {change.afterOverrunDays ?? "—"} days)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-ink-500">{label}</dt><dd className="font-medium text-ink-900">{value}</dd></div>;
}

function severityDot(severity: AttentionItem["severity"]): string {
  if (severity === "blocking") return "bg-signal-red";
  if (severity === "critical") return "bg-signal-amber";
  if (severity === "warning") return "bg-accent";
  if (severity === "change") return "bg-ink-700";
  return "border border-rule bg-surface";
}
