"use client";

import { useId } from "react";

export function readableTime(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const day = Math.floor(value / 1440);
  const minute = value % 1440;
  const clock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return `${clock}${day ? ` (+${day} day${day === 1 ? "" : "s"})` : ""}`;
}

/** Presentation only: the API continues to receive minutes relative to the night. */
export function ClockTimeField({ label, value, onChange, invalid, describedBy }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  const known = value !== null && Number.isFinite(value);
  const day = known ? Math.floor(value / 1440) : 0;
  const clock = known ? readableTime(value % 1440) : "";
  const control = "min-w-0 w-full rounded border border-rule-strong bg-surface px-2 py-2 text-sm disabled:bg-sunk disabled:text-ink-700";
  return <div className="min-w-0 space-y-1 text-sm">
    <label htmlFor={id}>{label}</label>
    <input id={id} type="time" step={60} className={control} value={clock}
      aria-invalid={invalid} aria-describedby={describedBy}
      onChange={(event) => {
        const match = /^(\d{2}):(\d{2})$/.exec(event.target.value);
        onChange(match ? day * 1440 + Number(match[1]) * 60 + Number(match[2]) : null);
      }} />
    <select aria-label={`${label} day`} className={control} value={day} disabled={!known}
      onChange={(event) => { if (known) onChange(Number(event.target.value) * 1440 + value % 1440); }}>
      <option value={0}>Planning date</option>
      <option value={1}>Next day (+1)</option>
      <option value={2}>Two days later (+2)</option>
    </select>
  </div>;
}
