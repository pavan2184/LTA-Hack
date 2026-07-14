"use client";

import { MapPinned, TrainFront } from "lucide-react";

import { requestById } from "@/data/requests";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";

const lines = [
  { id: "NS", label: "North–South", color: "bg-red-500", nodes: ["NS10", "NS11", "NS12", "NS13", "NS14", "NS15", "NS16"] },
  { id: "EW", label: "East–West", color: "bg-emerald-500", nodes: ["EW18", "EW19", "EW20", "EW21", "EW22"] },
  { id: "CC", label: "Circle", color: "bg-amber-500", nodes: ["CC10", "CC11", "CC12"] },
];

export function RailNetworkMap() {
  const selectedRequestId = useRailPlanStore((state) => state.selectedRequestId);
  const railPlanState = useRailPlanStore();
  const schedule = railPlanState.getVisibleSchedule();
  const request = selectedRequestId ? requestById[selectedRequestId] : null;
  const selectedStops = request?.sector.split("–") ?? [];
  const selectedPrefix = selectedStops[0]?.slice(0, 2);
  const nearbyCount = request ? schedule.jobs.filter((job) => job.sector === request.sector && job.requestId !== request.id).length : 0;

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPinned className="size-3.5 text-slate-500" />
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Rail network impact</p>
        </div>
        {request && <span className="text-[10px] font-bold text-cyan-700">{request.sector}</span>}
      </div>
      <div className="space-y-3">
        {lines.map((line) => {
          const lineSelected = line.id === selectedPrefix;
          const startIndex = selectedStops[0] ? line.nodes.indexOf(selectedStops[0]) : -1;
          const endIndex = selectedStops[1] ? line.nodes.indexOf(selectedStops[1]) : -1;
          return (
            <div key={line.id}>
              <div className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold text-slate-400"><span className={cn("h-1.5 w-5 rounded-full", line.color)} />{line.label}</div>
              <div className="flex items-center">
                {line.nodes.map((node, index) => {
                  const active = lineSelected && startIndex >= 0 && index >= Math.min(startIndex, endIndex) && index <= Math.max(startIndex, endIndex);
                  const activeSegment = lineSelected && startIndex >= 0 && index < Math.max(startIndex, endIndex) && index >= Math.min(startIndex, endIndex);
                  return (
                    <div key={node} className={cn("flex min-w-0 flex-1 items-center", index === line.nodes.length - 1 && "flex-none")}>
                      <div className="relative flex flex-col items-center">
                        <span className={cn("relative z-10 size-2.5 rounded-full border-2 bg-white", active ? "border-cyan-600 ring-2 ring-cyan-100" : "border-slate-300")} />
                        <span className={cn("mt-1 text-[8px]", active ? "font-bold text-cyan-800" : "text-slate-400")}>{node}</span>
                      </div>
                      {index < line.nodes.length - 1 && <span className={cn("mb-3 h-0.5 flex-1", activeSegment ? "bg-cyan-600" : "bg-slate-200")} />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
        <TrainFront className="mt-0.5 size-3.5 text-cyan-700" />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold text-slate-800">{request?.title ?? "Select a request to inspect its corridor"}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{request ? `${nearbyCount} nearby scheduled ${nearbyCount === 1 ? "job" : "jobs"} on this sector.` : "Related work and adjacent access will appear here."}</p>
        </div>
      </div>
    </div>
  );
}
