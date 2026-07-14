"use client";

import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis } from "recharts";

import type { ScheduleMetrics } from "@/types/railplan";

export function RobustnessCard({ metrics }: { metrics: ScheduleMetrics }) {
  const data = [
    { label: "Resources", value: metrics.resourceAvailability },
    { label: "Emergency", value: metrics.emergencyCapacity },
    { label: "Buffers", value: metrics.safetyBuffers },
    { label: "Flexibility", value: metrics.flexibility },
  ];

  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Schedule robustness</p>
          <p className="text-xl font-black text-slate-950">{metrics.robustness}<span className="text-sm font-semibold text-slate-400"> / 100</span></p>
        </div>
        <div className="h-[100px] w-[150px]" aria-label="Robustness radar chart">
          <ResponsiveContainer width={150} height={100}>
            <RadarChart data={data} outerRadius={36}>
              <PolarGrid stroke="#cbd5e1" />
              <PolarAngleAxis dataKey="label" tick={{ fontSize: 8, fill: "#64748b" }} />
              <Radar dataKey="value" stroke="#0891b2" fill="#06b6d4" fillOpacity={0.22} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {data.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-[10px] text-slate-500"><span>{item.label}</span><strong>{item.value}</strong></div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${item.value}%` }} /></div>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[11px] leading-4 text-slate-600">
        {metrics.robustness >= 84
          ? "This schedule can absorb one urgent 60-minute request without displacing critical work."
          : "This schedule is highly utilised but vulnerable to work overruns or engineer unavailability."}
      </p>
    </div>
  );
}
