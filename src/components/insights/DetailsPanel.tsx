"use client";

import { format, parse } from "date-fns";
import { AlertTriangle, Ban, Check, ChevronDown, CircleCheck, ExternalLink, Lightbulb, LockKeyhole, ShieldCheck, UnlockKeyhole } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PlanReadinessCard } from "@/components/metrics/PlanReadinessCard";
import { RailNetworkMap } from "@/components/network/RailNetworkMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { emergencyRequest } from "@/data/disruptionScenarios";
import { conflicts } from "@/data/originalSchedule";
import { requestById } from "@/data/requests";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { Conflict } from "@/types/railplan";
import { addMinutesToTime } from "@/utils/time";

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
  const schedule = useRailPlanStore().getVisibleSchedule();
  const active = currentView === "original" ? conflicts : [];

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn("rounded-xl p-2.5", active.length ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
          {active.length ? <AlertTriangle className="size-5" /> : <CircleCheck className="size-5" />}
        </div>
        <div>
          <h2 className="text-base font-black text-slate-950">{active.length ? "Issues requiring action" : "Recommendation prepared"}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{active.length ? `${active.length} declared conflicts are blocking review. Open an issue to focus its work.` : `${schedule.metrics.scheduledJobs} of ${schedule.metrics.totalJobs} jobs are placed. Review changes before approval.`}</p>
        </div>
      </div>
      {active.length > 0 && (
        <div className="mt-4 space-y-2">
          {active.map((conflict) => (
            <button aria-label={`Open conflict ${conflict.title}`} key={conflict.id} type="button" onClick={() => selectConflict(conflict.id)} className="w-full rounded-lg border border-slate-200 p-3 text-left transition hover:border-red-300 hover:bg-red-50/40">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-bold leading-5 text-slate-900">{conflict.title}</span>
                <Badge variant={conflict.severity === "critical" ? "danger" : "warning"}>{conflict.severity}</Badge>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{conflictLabels[conflict.type]} · {conflict.requestIds.join(" + ")}</p>
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
  const currentView = useRailPlanStore((state) => state.currentView);

  if (!request) return null;

  const explanation = job?.explanation ?? "This request cannot be scheduled within its permitted window without displacing higher-priority work.";
  const constraints = [request.sector, request.team, ...request.equipment, `${request.earliestStart}–${request.latestEnd} window`];
  const submittedEnd = addMinutesToTime(request.preferredStart, request.durationMinutes);
  const canReview = currentView !== "original" && Boolean(job);
  const movement = job?.movedMinutes
    ? `${Math.abs(job.movedMinutes)} min ${job.movedMinutes > 0 ? "later" : "earlier"}`
    : "No time change";

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="font-mono text-xs font-black text-cyan-700">{request.id}</span><Badge variant={request.priority === "critical" ? "danger" : request.priority === "high" ? "warning" : "neutral"}>{request.priority}</Badge></div>
          <h2 className="mt-1 text-base font-black leading-5 text-slate-950">{request.title}</h2>
          <p className="mt-1 text-xs text-slate-500">{request.workType} · {request.sector}</p>
        </div>
        {locked && <Badge variant="violet"><LockKeyhole className="size-3" />Locked</Badge>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <div><p className="font-semibold text-slate-500">Submitted</p><p className="mt-1 font-bold text-slate-900">{displayTime(request.preferredStart)}–{displayTime(submittedEnd)}</p></div>
        <div><p className="font-semibold text-slate-500">Recommended</p><p className="mt-1 font-bold text-slate-900">{job ? `${displayTime(job.startTime)}–${displayTime(job.endTime)}` : "Not placed"}</p></div>
        <div><p className="font-semibold text-slate-500">Team</p><p className="mt-1 font-bold text-slate-900">{job?.team ?? request.team}</p></div>
        <div><p className="font-semibold text-slate-500">Change</p><p className="mt-1 font-bold text-slate-900">{job ? movement : "Deferred"}</p></div>
      </div>

      <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50/60 p-3">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-900"><Lightbulb className="size-3.5" />Why this placement</div>
        <p className="mt-2 text-xs leading-5 text-slate-700">{explanation}</p>
        <div className="mt-3 border-t border-cyan-100 pt-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-cyan-700">Planner check</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">This is a simulated fixture placement. Review track, team, equipment, and handback implications before accepting it.</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Planning inputs</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{constraints.map((constraint) => <Badge key={constraint} variant="neutral"><ShieldCheck className="size-2.5" />{constraint}</Badge>)}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant={accepted ? "success" : "primary"} size="sm" disabled={!canReview || rejected} onClick={() => { accept(requestId); toast.success(`${request.id} change accepted.`); }}><Check className="size-3.5" />{accepted ? "Change accepted" : "Accept change"}</Button>
        <Button variant={rejected ? "danger" : "outline"} size="sm" disabled={!canReview || accepted} onClick={() => { reject(requestId); toast.error(`${request.id} will keep its submitted placement.`); }}><Ban className="size-3.5" />{rejected ? "Keeping submitted" : "Keep submitted time"}</Button>
        <Button variant="outline" size="sm" onClick={() => toggleLock(requestId)}>{locked ? <UnlockKeyhole className="size-3.5" /> : <LockKeyhole className="size-3.5" />}{locked ? "Unlock request" : "Lock request"}</Button>
        <Button variant="ghost" size="sm" disabled={!job?.alternativeSlots.length} onClick={() => setAlternativesOpen((open) => !open)}><ExternalLink className="size-3.5" />View alternatives<ChevronDown className={cn("size-3 transition", alternativesOpen && "rotate-180")} /></Button>
      </div>

      {alternativesOpen && job && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Simulated alternatives</p>
          {job.alternativeSlots.map((option) => (
            <button key={option.id} type="button" onClick={() => { applyAlternative(requestId, option.id); toast.success(`${option.label} applied to ${request.id}.`); }} className={cn("w-full rounded-lg border p-2.5 text-left transition hover:border-cyan-300", option.recommended ? "border-cyan-200 bg-cyan-50/50" : "border-slate-200")}>
              <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-slate-800">{option.label} · {option.startTime}–{option.endTime}</span>{option.recommended && <Badge variant="success">Recommended</Badge>}</div>
              <p className="mt-1 text-xs text-slate-500">{option.impact}</p>
            </button>
          ))}
          <p className="text-xs leading-5 text-amber-700">Alternatives are fixture options and are not independently validated.</p>
        </div>
      )}
    </div>
  );
}

export function DetailsPanel() {
  const selectedRequestId = useRailPlanStore((state) => state.selectedRequestId);
  const currentView = useRailPlanStore((state) => state.currentView);
  const railPlanState = useRailPlanStore();
  const schedule = railPlanState.getVisibleSchedule();
  const movedJobs = currentView === "original" ? 0 : schedule.jobs.filter((job) => Boolean(job.movedMinutes)).length;

  return (
    <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-none">
      {selectedRequestId ? <RequestDetails requestId={selectedRequestId} /> : <ConflictSummary />}
      {selectedRequestId && <RailNetworkMap />}
      <PlanReadinessCard metrics={schedule.metrics} movedJobs={movedJobs} unscheduledJobs={schedule.unscheduledRequestIds.length} />
    </aside>
  );
}
