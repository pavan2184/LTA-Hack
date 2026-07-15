"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock3, LockKeyhole, MoveRight, Siren } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { emergencyRequest, disruptionById } from "@/data/disruptionScenarios";
import { requestById } from "@/data/requests";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { MaintenanceRequest, ScheduledJob } from "@/types/railplan";
import { timeToMinutes } from "@/utils/time";

const sectors = ["NS10–NS12", "NS12–NS14", "NS14–NS16", "EW18–EW20", "EW20–EW22", "CC10–CC12"];
const timeLabels = ["00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00", "03:30", "04:00"];

function jobStyle(job: ScheduledJob, selected: boolean, affected: boolean) {
  if (job.status === "emergency") return "border-red-700 bg-red-600 text-white";
  if (selected) return "border-cyan-700 bg-cyan-700 text-white ring-2 ring-cyan-200";
  if (affected) return "border-red-500 bg-red-50 text-red-900 ring-2 ring-red-100";
  if (job.locked) return "border-violet-400 bg-violet-100 text-violet-950";
  if (job.status === "conflicted") return "border-red-400 bg-red-100 text-red-950";
  if (job.status === "moved" || job.movedMinutes) return "border-cyan-300 bg-cyan-50 text-cyan-950";
  return "border-slate-300 bg-white text-slate-800";
}

function JobBlock({ job, request, lane, affected }: { job: ScheduledJob; request: MaintenanceRequest; lane: number; affected: boolean }) {
  const selectedRequestId = useRailPlanStore((state) => state.selectedRequestId);
  const selectedConflictId = useRailPlanStore((state) => state.selectedConflictId);
  const selectRequest = useRailPlanStore((state) => state.selectRequest);
  const selected = selectedRequestId === job.requestId;
  const relevantToConflict = selectedConflictId ? request.conflictIds.includes(selectedConflictId) : true;
  const left = (timeToMinutes(job.startTime) / 240) * 100;
  const width = Math.min(100 - left, ((timeToMinutes(job.endTime) - timeToMinutes(job.startTime)) / 240) * 100);
  const conflictTip = request.id === "M-014"
    ? "Track conflict with M-008 · Team Alpha is double-booked · 15-minute safety buffer not satisfied"
    : request.conflictIds.length
      ? `${request.conflictIds.length} constraint conflict${request.conflictIds.length > 1 ? "s" : ""} detected`
      : `${request.team} · ${request.sector}`;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, scaleX: 0.96 }}
      animate={{ opacity: relevantToConflict ? 1 : 0.3, scaleX: 1, left: `${left}%`, width: `${Math.max(width, 5)}%` }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      type="button"
      onClick={() => selectRequest(job.requestId)}
      title={conflictTip}
      aria-label={`Select ${request.id} ${request.title}`}
      className={cn("absolute z-10 min-w-[42px] overflow-hidden rounded-md border px-1.5 py-1 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600", jobStyle(job, selected, affected))}
      style={{ top: lane ? 31 : 10, height: lane ? 34 : 42, transformOrigin: "left" }}
    >
      <div className="flex items-center gap-1">
        {job.status === "conflicted" && <AlertTriangle className="size-2.5 shrink-0" />}
        {job.locked && <LockKeyhole className="size-2.5 shrink-0" />}
        {job.status === "emergency" && <Siren className="size-2.5 shrink-0" />}
        <span className="truncate font-mono text-[9px] font-black">{request.id}</span>
        <span className={cn("ml-auto size-1.5 shrink-0 rounded-full", request.priority === "critical" ? "bg-red-500" : request.priority === "high" ? "bg-amber-500" : "bg-slate-400", job.status === "emergency" && "bg-white")} />
      </div>
      <p className="mt-0.5 truncate text-[9px] font-semibold leading-3">{request.shortTitle}</p>
      <p className="truncate text-[8px] opacity-70">{job.team.replace(" Team", "")}</p>
    </motion.button>
  );
}

export function ScheduleTimeline() {
  const currentView = useRailPlanStore((state) => state.currentView);
  const selectedStrategy = useRailPlanStore((state) => state.selectedStrategy);
  const activeDisruptionId = useRailPlanStore((state) => state.activeDisruptionId);
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);
  const railPlanState = useRailPlanStore();
  const schedule = railPlanState.getVisibleSchedule();
  const scenario = activeDisruptionId ? disruptionById[activeDisruptionId] : null;

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-none">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-950">Engineering access timeline</h2>
            <Badge variant={currentView === "disrupted" ? "danger" : currentView === "original" ? "warning" : "success"}>{currentView === "disrupted" && hasReplanned ? "replanned" : currentView}</Badge>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">{schedule.name} · 16 September overnight window · strategy: {selectedStrategy.replaceAll("-", " ")}</p>
        </div>
        <div className="text-right">
          {schedule.metrics.activeConflicts === 0 ? (
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="size-3.5" />No active conflicts detected</p>
          ) : (
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-red-600"><AlertTriangle className="size-3.5" />{schedule.metrics.activeConflicts} active conflicts</p>
          )}
          <p className="mt-1 text-[9px] text-slate-400">All times local · engineering hours</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="grid grid-cols-[88px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50">
          <div className="flex items-center px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Sector</div>
          <div className="grid grid-cols-9">
            {timeLabels.map((label, index) => <div key={label} className={cn("py-2 text-[9px] font-semibold text-slate-500", index === 8 ? "text-right pr-1" : "-translate-x-2")}>{label}</div>)}
          </div>
        </div>

        <div>
          {sectors.map((sector) => {
            const rowJobs = schedule.jobs.filter((job) => job.sector === sector);
            const rowHasConflict = currentView === "original" && rowJobs.some((job) => job.status === "conflicted");
            const sectorDisruption = scenario && !hasReplanned && (scenario.sector === sector || scenario.id === "window-shortened");
            return (
              <div key={sector} className="grid h-[76px] grid-cols-[88px_minmax(0,1fr)] border-b border-slate-100 last:border-b-0">
                <div className={cn("flex flex-col justify-center border-r border-slate-100 px-2", sector.startsWith("NS") ? "border-l-2 border-l-red-500" : sector.startsWith("EW") ? "border-l-2 border-l-emerald-500" : "border-l-2 border-l-amber-500")}>
                  <span className="text-[10px] font-black text-slate-700">{sector}</span>
                  <span className="mt-0.5 text-[8px] text-slate-400">Protected access</span>
                </div>
                <div className={cn("timeline-grid timeline-minor-grid relative overflow-hidden", rowHasConflict && "bg-red-50/35")}>
                  {sectorDisruption && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="emergency-hatch absolute inset-y-0 z-[5] border-x border-red-400"
                      style={{ left: `${(timeToMinutes(scenario.startTime) / 240) * 100}%`, width: `${((timeToMinutes(scenario.endTime) - timeToMinutes(scenario.startTime)) / 240) * 100}%` }}
                    >
                      <span className="absolute left-1 top-1 rounded bg-red-600 px-1 py-0.5 text-[7px] font-black uppercase text-white">Disruption</span>
                    </motion.div>
                  )}
                  <AnimatePresence initial={false}>
                    {rowJobs.map((job, index) => {
                      const request = job.requestId === emergencyRequest.id ? emergencyRequest : requestById[job.requestId];
                      if (!request) return null;
                      const lane = currentView === "original" && job.status === "conflicted" ? index % 2 : 0;
                      const affected = Boolean(scenario && !hasReplanned && scenario.affectedRequestIds.includes(job.requestId));
                      return <JobBlock key={job.requestId} job={job} request={request} lane={lane} affected={affected} />;
                    })}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[9px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm border border-slate-300 bg-white" />Scheduled</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm border border-red-400 bg-red-100" />Conflicted</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm border border-cyan-300 bg-cyan-50" /><MoveRight className="size-2.5" />Moved</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm border border-violet-400 bg-violet-100" /><LockKeyhole className="size-2.5" />Locked</span>
        <span className="ml-auto flex items-center gap-1"><Clock3 className="size-3" />15-minute planning resolution</span>
      </div>
    </section>
  );
}
