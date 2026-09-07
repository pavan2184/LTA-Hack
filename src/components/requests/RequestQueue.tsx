"use client";

import { Lock, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { categoryTone } from "@/components/insights/ViolationPanel";
import { requests } from "@railplan/core/data/requests";
import { teamById } from "@railplan/core/domain/resources";
import {
  categoriesFor,
  categoryOf,
  categoryProfile,
  conflictCategories,
  type ConflictCategory,
} from "@railplan/core/engine/conflicts";
import { formatClock } from "@railplan/core/engine/intervals";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { MaintenanceRequest } from "@railplan/core/types/railplan";

type FilterId = "attention" | "all" | "mandatory" | "pinned" | ConflictCategory;

const baseFilters: { id: FilterId; label: string }[] = [
  { id: "attention", label: "Needs action" },
  { id: "all", label: "All" },
  { id: "mandatory", label: "Mandatory" },
  { id: "pinned", label: "Pinned" },
];

type RowState = "clean" | "violating" | "deferred" | "pinned";

const priorityDot: Record<string, string> = {
  critical: "bg-signal-red",
  high: "bg-signal-amber",
  medium: "bg-ink-400",
  low: "bg-rule-strong",
};

/** Sector label tinted by corridor, matching the timeline's group colours. */
const corridorText: Record<string, string> = {
  NS: "text-line-ns-ink",
  EW: "text-line-ew-ink",
  CC: "text-line-cc-ink",
};

export function RequestQueue() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("attention");

  const result = useRailPlanStore((state) => state.activeResult());
  const selectedRequestId = useRailPlanStore((state) => state.selectedRequestId);
  const selectRequest = useRailPlanStore((state) => state.selectRequest);
  const locked = useRailPlanStore((state) => state.locked);

  const { stateFor, placementFor, categoriesOf } = useMemo(() => {
    const violations = result?.violations ?? [];
    const violating = new Set(violations.flatMap((v) => v.requestIds));
    const deferred = new Set((result?.plan.deferred ?? []).map((entry) => entry.requestId));
    const placements = new Map((result?.plan.placements ?? []).map((p) => [p.requestId, p]));

    return {
      placementFor: (id: string) => placements.get(id) ?? null,
      categoriesOf: (id: string) => categoriesFor(violations, id),
      stateFor: (id: string): RowState => {
        if (violating.has(id)) return "violating";
        if (deferred.has(id)) return "deferred";
        if (locked[id]) return "pinned";
        return "clean";
      },
    };
  }, [result, locked]);

  // Only offer a conflict-type filter for the kinds actually present, so the
  // control never promises a slice of the queue that is empty.
  const categoryFilters = useMemo(() => {
    const present = new Set(
      (result?.violations ?? []).map((violation) => categoryOf(violation.ruleId)),
    );
    return conflictCategories.filter((profile) => present.has(profile.id));
  }, [result]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesSearch =
        !term ||
        request.id.toLowerCase().includes(term) ||
        request.title.toLowerCase().includes(term) ||
        request.sector.toLowerCase().includes(term);
      if (!matchesSearch) return false;

      const state = stateFor(request.id);
      switch (filter) {
        case "all":
          return true;
        case "mandatory":
          return request.mandatory;
        case "pinned":
          return state === "pinned";
        case "attention":
          return state === "violating" || state === "deferred";
        default:
          return categoriesOf(request.id).includes(filter);
      }
    });
  }, [query, filter, stateFor, categoriesOf]);

  return (
    <aside className="flex min-h-0 flex-col border border-rule bg-surface">
      <div className="border-b border-rule p-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-ink-900">Requests</h2>
          <span className="text-[12px] text-ink-500">
            {visible.length} of {requests.length}
          </span>
        </div>

        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
          <input
            aria-label="Search requests"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ID, title or sector"
            className="h-7 w-full rounded-sm border border-rule bg-paper pl-7 pr-2 text-[12px] placeholder:text-ink-400 focus:border-accent focus:bg-surface"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {baseFilters.map((item) => (
            <Chip key={item.id} active={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}
            </Chip>
          ))}
          {categoryFilters.map((profile) => (
            <Chip
              key={profile.id}
              active={filter === profile.id}
              tone={profile.id}
              onClick={() => setFilter(filter === profile.id ? "attention" : profile.id)}
            >
              {profile.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!visible.length && (
          <p className="p-3 text-[12px] text-ink-500">
            {filter === "attention"
              ? "Nothing needs action. Every request is either placed cleanly or pinned."
              : "No requests match."}
          </p>
        )}

        {visible.map((request) => (
          <Row
            key={request.id}
            request={request}
            state={stateFor(request.id)}
            categories={categoriesOf(request.id)}
            start={placementFor(request.id)?.startMinute ?? null}
            selected={selectedRequestId === request.id}
            onSelect={() => selectRequest(request.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function Row({
  request,
  state,
  categories,
  start,
  selected,
  onSelect,
}: {
  request: MaintenanceRequest;
  state: RowState;
  categories: ConflictCategory[];
  start: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const team = teamById[request.teamId];
  const moved = start !== null && start !== request.preferredStart;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Open ${request.id}, ${request.title}`}
      aria-current={selected}
      className={cn(
        "block w-full border-b border-rule px-2.5 py-2 text-left transition-colors last:border-b-0",
        selected ? "bg-accent-soft" : "hover:bg-sunk",
        // A 3px left rule carries the state, so it survives being scanned
        // quickly and does not rely on the row's fill colour.
        state === "violating" && "border-l-[3px] border-l-signal-red",
        state === "deferred" && "border-l-[3px] border-l-signal-amber",
        state === "pinned" && "border-l-[3px] border-l-accent",
        state === "clean" && "border-l-[3px] border-l-signal-green",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {/* Priority as a colour chip: scanning a queue for the critical work
              should not require reading a word at the end of every line. */}
          <span className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot[request.priority])} />
          <span className="font-mono text-[11px] font-medium text-ink-700">{request.id}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium">
          {state === "pinned" && <Lock className="size-3 text-accent" />}
          <span
            className={
              state === "deferred"
                ? "text-signal-amber"
                : state === "violating"
                  ? "text-signal-red"
                  : "text-ink-500"
            }
          >
            {start !== null ? formatClock(start) : state === "deferred" ? "no slot" : ""}
          </span>
        </span>
      </div>

      <p className="mt-0.5 truncate text-[13px] text-ink-900">{request.title}</p>

      <p className="mt-0.5 text-[11px] text-ink-500">
        <span className={cn("font-medium", corridorText[request.blockIds[0]?.slice(0, 2) ?? "NS"])}>
          {request.sector}
        </span>{" "}
        &middot; {request.durationMinutes} min &middot;{" "}
        <span className={request.mandatory ? "font-medium text-signal-red" : undefined}>
          {request.mandatory ? "mandatory" : request.priority}
        </span>
      </p>

      {/* The two dimensions the chart cannot show: who is doing it, and when it
          was asked for. Both are constraints in their own right. */}
      <p className="mt-0.5 truncate text-[11px] text-ink-500">
        {team?.name ?? request.teamId} &middot; requested{" "}
        {formatClock(request.preferredStart)}-{formatClock(request.preferredStart + request.durationMinutes)}
        {moved && <span className="text-accent"> · moved</span>}
      </p>

      {categories.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {categories.map((category) => (
            <span
              key={category}
              className={cn("flex items-center gap-0.5 text-[10px] font-medium", categoryTone[category].text)}
            >
              <TriangleAlert className="size-2.5" />
              {categoryProfile[category].label}
            </span>
          ))}
        </p>
      )}
    </button>
  );
}

function Chip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone?: ConflictCategory;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[11px] font-medium transition-colors",
        active
          ? "border-ink-900 bg-ink-900 text-white"
          : "border-rule text-ink-500 hover:border-rule-strong hover:text-ink-900",
      )}
    >
      {tone && <span className={cn("size-1.5 rounded-full", categoryTone[tone].dot)} />}
      {children}
    </button>
  );
}
