"use client";

import { format, parse } from "date-fns";
import { AlertTriangle, Ban, Check, ChevronDown, CircleCheck, ExternalLink, Lightbulb, LockKeyhole, ShieldCheck, UnlockKeyhole } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RobustnessCard } from "@/components/metrics/RobustnessCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { emergencyRequest } from "@/data/disruptionScenarios";
import { conflicts } from "@/data/originalSchedule";
import { requestById } from "@/data/requests";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { Conflict } from "@/types/railplan";

const conflictLabels: Record<Conflict["type"], string> = {
  track: "Track access conflicts",
  team: "Engineering team conflicts",
  equipment: "Equipment conflicts",
  "safety-buffer": "Safety-buffer violations",
  dependency: "Dependency violations",
  "time-window": "Requests outside permitted windows",
};

function displayTime(time: string) {
  return format(parse(time, "HH:mm", new Date(2026, 8, 16)), "HH:mm");
}

function ConflictSummary() {
  const currentView = useRailPlanStore((state) => state.currentView);
  const selectConflict = useRailPlanStore((state) => state.selectConflict);
  const active = currentView === "original" ? conflicts : [];
  const grouped = Object.entries(conflictLabels).map(([type, label]) => ({
    type,
    label,
    items: active.filter((conflict) => conflict.type === type),
  })).filter((group) => group.items.length);

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn("rounded-xl p-2.5", active.length ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
          {active.length ? <AlertTriangle className="size-5" /> : <CircleCheck className="size-5" />}
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-950">{active.length ? `${active.length} active conflicts` : "No active conflicts detected"}</h2>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{active.length ? "Select a conflict to focus its affected work on the timeline." : "All scheduled work satisfies the selected planning constraints."}</p>
        </div>
      </div>
      {grouped.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
          {grouped.map((group) => (
            <button key={group.type} type="button" onClick={() => selectConflict(group.items[0].id)} className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-red-200 hover:bg-red-50/40">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-slate-800">{group.label}</span>
                <Badge variant={group.items.some((item) => item.severity === "critical") ? "danger" : "warning"}>{group.items.length}</Badge>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">Focus affected work on the timeline</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestDetails({ requestId }: { requestId: string }) {
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const railPlanState = useRailPlanStore();
  const schedule = railPlanState.getVisibleSchedule();
  const request = requestId === emergencyRequest.id ? emergencyRequest : requestById[requestId];
  const job = schedule.jobs.find((item) => item.requestId === requestId);
  const locked = useRailPlanStore((state) => state.lockedRequestIds.includes(requestId));
  const accepted = useRailPlanStore((state) => state.acceptedRecommendationIds.includes(requestId));
  const rejected = useRailPlanStore((state) => state.rejectedRecommendationIds.includes(requestId));
  const toggleLock = useRailPlanStore((state) => state.toggleLock);
  const accept = useRailPlanStore((state) => state.acceptRecommendation);
  const reject = useRailPlanStore((state) => state.rejectRecommendation);
  const applyAlternative = useRailPlanStore((state) => state.applyAlternative);

  if (!request) return null;

  const explanation = job?.explanation ?? "This request cannot be scheduled within its permitted window without displacing higher-priority work.";
  const constraints = [request.sector, request.team, ...request.equipment, `${request.earliestStart}–${request.latestEnd} window`];

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="font-mono text-[10px] font-black text-cyan-700">{request.id}</span><Badge variant={request.priority === "critical" ? "danger" : request.priority === "high" ? "warning" : "neutral"}>{request.priority}</Badge></div>
          <h2 className="mt-1 text-base font-black leading-5 text-slate-950">{request.title}</h2>
          <p className="mt-1 text-[11px] text-slate-500">{request.workType} · {request.sector}</p>
        </div>
        {locked && <Badge variant="violet"><LockKeyhole className="size-3" />Locked</Badge>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px]">
        <div><p className="text-slate-400">Requested time</p><p className="mt-0.5 font-bold text-slate-800">{displayTime(request.preferredStart)}–{displayTime(job?.alternativeSlots[1]?.endTime ?? request.latestEnd)}</p></div>
        <div><p className="text-slate-400">Current schedule</p><p className="mt-0.5 font-bold text-slate-800">{job ? `${displayTime(job.startTime)}–${displayTime(job.endTime)}` : "Unscheduled"}</p></div>
        <div><p className="text-slate-400">Assigned team</p><p className="mt-0.5 font-bold text-slate-800">{job?.team ?? request.team}</p></div>
        <div><p className="text-slate-400">Required resources</p><p className="mt-0.5 truncate font-bold text-slate-800">{request.equipment.join(", ")}</p></div>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/60 p-3">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-900"><Lightbulb className="size-3.5" />Scheduling decision</div>
        <p className="mt-2 text-[11px] leading-[1.55] text-slate-700">{explanation}</p>
        <div className="mt-3 border-t border-cyan-100 pt-2.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-cyan-700">Impact</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-600">No high-priority jobs were displaced. Engineering-hour utilisation increased while all protected constraints remain visible to the planner.</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Constraints considered</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{constraints.map((constraint) => <Badge key={constraint} variant="neutral"><ShieldCheck className="size-2.5" />{constraint}</Badge>)}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant={accepted ? "success" : "primary"} size="sm" disabled={!job || rejected} onClick={() => { accept(requestId); toast.success(`${request.id} recommendation accepted.`); }}><Check className="size-3.5" />{accepted ? "Accepted" : "Accept recommendation"}</Button>
        <Button variant={rejected ? "danger" : "outline"} size="sm" disabled={!job || accepted} onClick={() => { reject(requestId); toast.error(`${request.id} recommendation rejected.`); }}><Ban className="size-3.5" />{rejected ? "Rejected" : "Reject recommendation"}</Button>
        <Button variant="outline" size="sm" onClick={() => toggleLock(requestId)}>{locked ? <UnlockKeyhole className="size-3.5" /> : <LockKeyhole className="size-3.5" />}{locked ? "Unlock request" : "Lock request"}</Button>
        <Button variant="ghost" size="sm" disabled={!job?.alternativeSlots.length} onClick={() => setAlternativesOpen((open) => !open)}><ExternalLink className="size-3.5" />View alternatives<ChevronDown className={cn("size-3 transition", alternativesOpen && "rotate-180")} /></Button>
      </div>

      {alternativesOpen && job && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Alternative placements</p>
          {job.alternativeSlots.map((option) => (
            <button key={option.id} type="button" onClick={() => { applyAlternative(requestId, option.id); toast.success(`${option.label} applied to ${request.id}.`); }} className={cn("w-full rounded-lg border p-2.5 text-left transition hover:border-cyan-300", option.recommended ? "border-cyan-200 bg-cyan-50/50" : "border-slate-200")}>
              <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-slate-800">{option.label} · {option.startTime}–{option.endTime}</span>{option.recommended && <Badge variant="success">Recommended</Badge>}</div>
              <p className="mt-1 text-[10px] text-slate-500">{option.impact}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DetailsPanel() {
  const selectedRequestId = useRailPlanStore((state) => state.selectedRequestId);
  const railPlanState = useRailPlanStore();
  const metrics = railPlanState.getVisibleSchedule().metrics;

  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-none">
      {selectedRequestId ? <RequestDetails requestId={selectedRequestId} /> : <ConflictSummary />}
      <RobustnessCard metrics={metrics} />
    </aside>
  );
}
