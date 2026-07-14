"use client";

import { AlertTriangle, Clock3, Filter, LockKeyhole, Search, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { RailNetworkMap } from "@/components/network/RailNetworkMap";
import { Badge } from "@/components/ui/badge";
import { requests } from "@/data/requests";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { MaintenanceRequest, RequestStatus } from "@/types/railplan";
import { formatDuration } from "@/utils/time";

type FilterId = "all" | "conflicted" | "unscheduled" | "high" | "locked";

const filters: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "conflicted", label: "Conflicted" },
  { id: "unscheduled", label: "Unscheduled" },
  { id: "high", label: "High priority" },
  { id: "locked", label: "Locked" },
];

function statusBadge(status: RequestStatus) {
  const variants = { scheduled: "success", conflicted: "danger", unscheduled: "warning", locked: "violet", moved: "info", emergency: "danger" } as const;
  return <Badge variant={variants[status]}>{status}</Badge>;
}

export function RequestQueue() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const selectedRequestId = useRailPlanStore((state) => state.selectedRequestId);
  const selectRequest = useRailPlanStore((state) => state.selectRequest);
  const currentView = useRailPlanStore((state) => state.currentView);
  const railPlanState = useRailPlanStore();
  const schedule = railPlanState.getVisibleSchedule();
  const lockedIds = useRailPlanStore((state) => state.lockedRequestIds);

  const statusFor = (request: MaintenanceRequest): RequestStatus => {
    const job = schedule.jobs.find((item) => item.requestId === request.id);
    if (lockedIds.includes(request.id)) return "locked";
    if (!job) return "unscheduled";
    if (currentView === "original" && request.conflictIds.length) return "conflicted";
    if (job.status === "emergency") return "emergency";
    if (job.movedMinutes) return "moved";
    return "scheduled";
  };

  const visible = useMemo(() => requests.filter((request) => {
    const term = query.trim().toLowerCase();
    const matchesSearch = !term || request.id.toLowerCase().includes(term) || request.title.toLowerCase().includes(term);
    const status = statusFor(request);
    const matchesFilter = filter === "all" || filter === status || (filter === "high" && ["high", "critical"].includes(request.priority));
    return matchesSearch && matchesFilter;
  // statusFor intentionally reflects the current schedule snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [query, filter, schedule, currentView, lockedIds]);

  return (
    <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-100 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Maintenance requests</h2>
            <p className="text-[10px] text-slate-500">{visible.length} of {requests.length} requests</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-2 text-slate-500"><Filter className="size-3.5" /></div>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input aria-label="Search requests" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID or work title" className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs outline-none focus:border-cyan-500 focus:bg-white" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {filters.map((item) => <button type="button" key={item.id} onClick={() => setFilter(item.id)} className={cn("rounded-md px-2 py-1 text-[9px] font-bold", filter === item.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-800")}>{item.label}</button>)}
        </div>
      </div>

      <div className="h-[450px] space-y-2 overflow-y-auto p-2.5 2xl:h-[520px]">
        {visible.map((request) => {
          const status = statusFor(request);
          const selected = selectedRequestId === request.id;
          return (
            <button
              type="button"
              aria-label={`Open ${request.id} ${request.title}`}
              key={request.id}
              onClick={() => selectRequest(request.id)}
              className={cn("w-full rounded-lg border p-2.5 text-left transition", selected ? "border-cyan-500 bg-cyan-50/70 ring-2 ring-cyan-100" : status === "conflicted" ? "border-red-200 bg-red-50/30 hover:border-red-300" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50")}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-black text-slate-500">{request.id}</span>
                  {statusBadge(status)}
                </div>
                <Badge variant={request.priority === "critical" ? "danger" : request.priority === "high" ? "warning" : "neutral"}>{request.priority}</Badge>
              </div>
              <p className="mt-1.5 truncate text-xs font-bold text-slate-900">{request.title}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] text-slate-500">
                <span className="flex items-center gap-1"><Wrench className="size-2.5" />{request.sector}</span>
                <span className="truncate">{request.team}</span>
                <span className="flex items-center gap-1"><Clock3 className="size-2.5" />{formatDuration(request.durationMinutes)}</span>
                <span className={cn("flex items-center justify-end gap-1 font-semibold", request.conflictIds.length && currentView === "original" ? "text-red-600" : "text-slate-400")}>
                  {lockedIds.includes(request.id) ? <><LockKeyhole className="size-2.5" />Locked</> : request.conflictIds.length && currentView === "original" ? <><AlertTriangle className="size-2.5" />{request.conflictIds.length} conflicts</> : "No conflicts"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <RailNetworkMap />
    </aside>
  );
}
