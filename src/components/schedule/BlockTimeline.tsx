"use client";

import { Lock } from "lucide-react";
import { useMemo } from "react";

import { emergencyInsertion } from "@/data/disruptions";
import { requestById, WINDOW_END } from "@/data/requests";
import { blockById, lines, trackBlocks, type LineId } from "@/domain/network";
import { teamById } from "@/domain/resources";
import { categoryOf, conflictCategories, type ConflictCategory } from "@/engine/conflicts";
import { formatClock } from "@/engine/intervals";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { Placement, Violation } from "@/types/railplan";

const TICKS = [0, 30, 60, 90, 120, 150, 180, 210, 240];

/**
 * Corridor identity, in the real MRT line colours.
 *
 * `swatch` is a solid chip on the group header — that is where the colour is
 * allowed to be loud. `gutter` is a 6% tint behind the block ids, just enough
 * to group twelve rows into three corridors without competing with the conflict
 * colours that mean a rule broke.
 */
const corridor: Record<
  LineId,
  { swatch: string; text: string; gutter: string; lane: string; band: string }
> = {
  NS: { swatch: "bg-line-ns", text: "text-line-ns", gutter: "gutter-ns", lane: "lane-ns", band: "band-ns" },
  EW: { swatch: "bg-line-ew", text: "text-line-ew", gutter: "gutter-ew", lane: "lane-ew", band: "band-ew" },
  CC: { swatch: "bg-line-cc", text: "text-line-cc", gutter: "gutter-cc", lane: "lane-cc", band: "band-cc" },
};

/** One hue per conflict category, matching the chips and the conflict list. */
const categoryStyle: Record<ConflictCategory, { fill: string; border: string; text: string }> = {
  sector: { fill: "bg-cf-sector", border: "border-cf-sector", text: "text-cf-sector" },
  engineer: { fill: "bg-cf-engineer", border: "border-cf-engineer", text: "text-cf-engineer" },
  compatibility: {
    fill: "bg-cf-compatibility",
    border: "border-cf-compatibility",
    text: "text-cf-compatibility",
  },
  equipment: { fill: "bg-cf-equipment", border: "border-cf-equipment", text: "text-cf-equipment" },
  sequencing: { fill: "bg-cf-sequencing", border: "border-cf-sequencing", text: "text-cf-sequencing" },
  window: { fill: "bg-cf-window", border: "border-cf-window", text: "text-cf-window" },
};

interface Bar {
  placement: Placement;
  left: number;
  width: number;
  clearanceWidth: number;
  /** Sub-row within the block row. Two jobs on one block cannot share one. */
  lane: number;
}

/** Height of one sub-lane, and of the bar drawn in it. */
const LANE_HEIGHT = 24;
const BAR_HEIGHT = 20;

/**
 * Stack jobs that share a block into sub-lanes.
 *
 * This is the whole point of charting by block: if two jobs hold NS12-NS13 at
 * the same time, they must be drawn one above the other, because drawing them
 * at the same height hides one behind the other — and the one it hides is
 * exactly the collision the planner opened this chart to see.
 */
function assignLanes(bars: Bar[]): Bar[] {
  const laneEnds: number[] = [];
  return [...bars]
    .sort((a, b) => a.left - b.left || a.placement.requestId.localeCompare(b.placement.requestId))
    .map((bar) => {
      const end = bar.left + bar.width + bar.clearanceWidth;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= bar.left + 0.001);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      return { ...bar, lane };
    });
}

/** A stretch of one bar in which a named rule is broken. */
interface Segment {
  violationId: string;
  category: ConflictCategory;
  requestId: string;
  lane: number;
  left: number;
  width: number;
}

const pct = (minutes: number) => (minutes / WINDOW_END) * 100;

/**
 * Possession chart, drawn per atomic track block.
 *
 * A job that spans three blocks appears on three rows, because that is what it
 * actually occupies. Charting by requested sector instead would hide exactly
 * the overlaps this tool exists to find — two jobs on "NS10-NS12" and
 * "NS11-NS13" look unrelated until you draw them against NS11-NS12.
 *
 * The second idea here is that a job is not "a conflict". Two 60-minute jobs
 * that overlap for 15 are fine for 105 of those minutes, and the chart says so:
 * the bar stays neutral and only the offending stretch is coloured, in the hue
 * of the rule that was broken.
 */
export function BlockTimeline() {
  const result = useRailPlanStore((state) => state.activeResult());
  const selectedRequestId = useRailPlanStore((state) => state.selectedRequestId);
  const selectedViolationId = useRailPlanStore((state) => state.selectedViolationId);
  const selectRequest = useRailPlanStore((state) => state.selectRequest);
  const view = useRailPlanStore((state) => state.view);
  const disruptionImpact = useRailPlanStore((state) => state.disruptionImpact);
  const activeDisruptionId = useRailPlanStore((state) => state.activeDisruptionId);
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);
  const disruptionPlacements = useRailPlanStore((state) => state.disruptionPlacements);
  const context = useRailPlanStore((state) => state.context);

  const violations = useMemo<Violation[]>(
    () => (activeDisruptionId && !hasReplanned ? disruptionImpact : (result?.violations ?? [])),
    [result, disruptionImpact, activeDisruptionId, hasReplanned],
  );

  const selectedViolation = violations.find((item) => item.id === selectedViolationId) ?? null;
  const highlighted = new Set(selectedViolation?.requestIds ?? []);

  const { closedBlockIds, windowEnd } = useMemo(() => {
    const ctx = context();
    return {
      closedBlockIds: new Set(ctx.closedBlockIds ?? []),
      windowEnd: ctx.windowEnd ?? WINDOW_END,
    };
  }, [context]);

  const byBlock = useMemo(() => {
    const map = new Map<string, Bar[]>();
    trackBlocks.forEach((block) => map.set(block.id, []));

    // While a disruption is being reviewed, draw what it forces into the plan
    // alongside the plan itself. Showing the violations without the work that
    // caused them leaves the planner reading an effect with no cause.
    const changed = new Map(disruptionPlacements.map((item) => [item.requestId, item]));
    const placements = [
      ...(result?.plan.placements ?? []).map((item) => changed.get(item.requestId) ?? item),
      ...disruptionPlacements.filter(
        (item) => !(result?.plan.placements ?? []).some((p) => p.requestId === item.requestId),
      ),
    ];

    placements.forEach((placement) => {
      const request = lookup(placement.requestId);
      if (!request) return;
      request.blockIds.forEach((blockId) => {
        const bucket = map.get(blockId);
        if (!bucket) return;
        bucket.push({
          placement,
          left: pct(placement.startMinute),
          width: pct(placement.endMinute - placement.startMinute),
          clearanceWidth: pct(request.clearanceMinutes),
          lane: 0,
        });
      });
    });

    map.forEach((bars, blockId) => map.set(blockId, assignLanes(bars)));
    return map;
  }, [result, disruptionPlacements]);

  /**
   * The coloured stretches, per block row.
   *
   * A violation is drawn on the block rows it actually names where it names any
   * — a possession overlap on NS12-NS13 does not belong on NS13-NS14 just
   * because one of the two jobs runs there. Rules about a crew or an asset name
   * no block, so those are drawn on every row the job occupies, which is the
   * truth: that crew is unavailable everywhere at once.
   */
  const segmentsByBlock = useMemo(() => {
    const map = new Map<string, Segment[]>();
    violations.forEach((violation) => {
      if (!violation.window) return;
      const namedBlocks = violation.subjects.filter((subject) => blockById[subject]);

      violation.requestIds.forEach((requestId) => {
        const request = lookup(requestId);
        if (!request) return;

        const rows = namedBlocks.length
          ? request.blockIds.filter((id) => namedBlocks.includes(id))
          : request.blockIds;

        rows.forEach((blockId) => {
          const bar = (byBlock.get(blockId) ?? []).find(
            (item) => item.placement.requestId === requestId,
          );
          if (!bar) return;

          const occupancyEnd = bar.placement.endMinute + request.clearanceMinutes;
          const start = Math.max(violation.window!.start, bar.placement.startMinute);
          const end = Math.min(violation.window!.end, occupancyEnd);
          if (end <= start) return;

          if (!map.has(blockId)) map.set(blockId, []);
          map.get(blockId)!.push({
            violationId: violation.id,
            category: categoryOf(violation.ruleId),
            requestId,
            lane: bar.lane,
            left: pct(start),
            width: pct(end - start),
          });
        });
      });
    });
    return map;
  }, [violations, byBlock]);

  const conflicted = useMemo(
    () => new Set(violations.flatMap((violation) => violation.requestIds)),
    [violations],
  );

  const grouped = (Object.keys(lines) as LineId[]).map((id) => ({
    line: lines[id],
    blocks: trackBlocks.filter((block) => block.line === id),
  }));

  const activeCategories = conflictCategories.filter((profile) =>
    violations.some((violation) => categoryOf(violation.ruleId) === profile.id),
  );

  return (
    <section className="min-w-0 border border-rule bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold text-ink-900">Block occupation</h2>
          <span className="text-[12px] text-ink-500">
            {view === "submitted" ? "requested plan" : "optimised schedule"}
          </span>
        </div>
        <p className="text-[12px] text-ink-500">
          {trackBlocks.length} blocks &middot; 00:00-{formatClock(WINDOW_END)} &middot; one row per block, not per request
        </p>
      </header>

      {selectedViolation && (
        <p className="border-b border-rule bg-paper px-3 py-1.5 text-[12px] text-ink-700">
          Showing{" "}
          <span className={cn("font-medium", categoryStyle[categoryOf(selectedViolation.ruleId)].text)}>
            {selectedViolation.requestIds.join(" and ")}
          </span>{" "}
          {selectedViolation.window
            ? `— the shaded band is ${formatClock(selectedViolation.window.start)}-${formatClock(selectedViolation.window.end)}, the minutes the rule is broken.`
            : "— this rule is not about a stretch of time, so no band is drawn."}
        </p>
      )}

      <div className="min-w-0 overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] border-b border-rule bg-sunk">
            <div className="px-2 py-1 text-[11px] uppercase tracking-[0.06em] text-ink-500">Block</div>
            <div className="relative h-6">
              {TICKS.map((tick) => (
                <span
                  key={tick}
                  className="absolute top-1 -translate-x-1/2 text-[11px] text-ink-500"
                  style={{ left: `${pct(tick)}%` }}
                >
                  {formatClock(tick)}
                </span>
              ))}
            </div>
          </div>

          {grouped.map(({ line, blocks }) => (
            <div key={line.id}>
              <div
                className={cn(
                  "grid grid-cols-[96px_minmax(0,1fr)] border-y border-rule",
                  corridor[line.id].band,
                )}
              >
                <div className="flex items-center gap-1.5 py-1 pr-2">
                  <span className={cn("h-4 w-1.5", corridor[line.id].swatch)} />
                  <span className={cn("text-[11px] font-semibold", corridor[line.id].text)}>
                    {line.name}
                  </span>
                </div>
                <div className="flex items-center text-[11px] text-ink-500">
                  {blocks.length} blocks
                </div>
              </div>

              {blocks.map((block) => {
                const bars = byBlock.get(block.id) ?? [];
                const segments = segmentsByBlock.get(block.id) ?? [];
                const closed = closedBlockIds.has(block.id);
                // A block row is as tall as the number of jobs that have to sit
                // side by side on it. Rows that need the space get it; the rest
                // stay compact.
                const laneCount = Math.max(1, ...bars.map((bar) => bar.lane + 1));
                const rowHeight = laneCount * LANE_HEIGHT + 6;

                return (
                  <div
                    key={block.id}
                    className="grid grid-cols-[96px_minmax(0,1fr)] border-b border-rule last:border-b-0"
                  >
                    <div
                      className={cn(
                        "flex items-start gap-1.5 border-r border-rule px-2 pt-1.5",
                        corridor[line.id].gutter,
                      )}
                    >
                      <span className="font-mono text-[11px] font-medium text-ink-700">{block.id}</span>
                      {closed && (
                        <span className="text-[10px] font-medium uppercase text-cf-window">closed</span>
                      )}
                    </div>

                    <div
                      className={cn("tl-grid relative", corridor[line.id].lane)}
                      style={{ height: `${rowHeight}px` }}
                    >
                      {/* Hours the track is not available: closed by a scenario,
                          or past the handback deadline. Drawn under everything so
                          a bar sitting in one is still legible — and obviously
                          wrong. */}
                      {closed && <span className="tl-unavailable absolute inset-0" aria-hidden />}
                      {windowEnd < WINDOW_END && (
                        <span
                          className="tl-unavailable absolute inset-y-0"
                          style={{ left: `${pct(windowEnd)}%`, right: 0 }}
                          aria-hidden
                        />
                      )}

                      {/* The selected conflict's minutes, carried across every
                          row, so two jobs on different blocks read as one
                          problem rather than two red marks. */}
                      {selectedViolation?.window && (
                        <span
                          className="absolute inset-y-0 border-x border-dashed border-ink-400 bg-ink-900/[0.05]"
                          style={{
                            left: `${pct(selectedViolation.window.start)}%`,
                            width: `${pct(selectedViolation.window.end - selectedViolation.window.start)}%`,
                          }}
                          aria-hidden
                        />
                      )}

                      {bars.map((bar) => {
                        const request = lookup(bar.placement.requestId);
                        if (!request) return null;
                        const team = teamById[bar.placement.teamId];
                        const selected = selectedRequestId === bar.placement.requestId;
                        const inConflict = conflicted.has(bar.placement.requestId);
                        // Work a disruption forced into the plan, as opposed to
                        // a placement the planner chose. Solid ink so it reads
                        // as an intrusion rather than a decision.
                        const forced = bar.placement.requestId === emergencyInsertion.id;
                        const dimmed = Boolean(selectedViolation) && !highlighted.has(bar.placement.requestId);

                        const top = 3 + bar.lane * LANE_HEIGHT;

                        return (
                          <div key={`${block.id}-${bar.placement.requestId}`}>
                            {bar.clearanceWidth > 0 && (
                              <span
                                className="absolute border-y border-r border-dashed border-rule-strong bg-sunk"
                                style={{
                                  top: `${top}px`,
                                  height: `${BAR_HEIGHT}px`,
                                  left: `${bar.left + bar.width}%`,
                                  width: `${bar.clearanceWidth}%`,
                                }}
                                title={`${request.clearanceMinutes} min clearance before handback`}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => selectRequest(bar.placement.requestId)}
                              title={`${request.id} ${request.title} — ${formatClock(bar.placement.startMinute)}-${formatClock(bar.placement.endMinute)}${team ? ` — ${team.name}` : ""}`}
                              aria-label={`Select ${request.id}, ${request.title}`}
                              className={cn(
                                "absolute flex min-w-[26px] items-center gap-1 overflow-hidden rounded-xs border px-1 text-left transition-opacity",
                                selected
                                  ? "z-20 border-accent bg-accent text-white"
                                  : forced
                                    ? "z-10 border-ink-900 bg-ink-900 text-white"
                                    : bar.placement.locked
                                      ? "bar-pinned z-10 border-accent bg-accent-soft text-accent"
                                      : inConflict
                                        ? "z-10 border-rule-strong bg-surface text-ink-700"
                                        : "border-signal-green bg-signal-green-soft text-signal-green",
                                dimmed && "opacity-35",
                                highlighted.has(bar.placement.requestId) && !selected && "z-20 ring-1 ring-ink-900",
                              )}
                              style={{
                                top: `${top}px`,
                                height: `${BAR_HEIGHT}px`,
                                left: `${bar.left}%`,
                                width: `${Math.max(bar.width, 2.5)}%`,
                              }}
                            >
                              {bar.placement.locked && <Lock className="size-2.5 shrink-0" />}
                              <span className="truncate font-mono text-[11px] font-medium">{request.id}</span>
                              {team && bar.width > 8 && (
                                <span className="truncate text-[10px] opacity-75">
                                  {shortTeam(team.name)}
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      })}

                      {/*
                        Drawn last, along the foot of the bar: the minutes at
                        fault. A strip rather than a wash, so the job keeps its
                        label — the planner needs to read which job it is at the
                        same moment they see what is wrong with it.
                      */}
                      {segments.map((segment) => (
                        <span
                          key={`${segment.violationId}-${segment.requestId}-${block.id}`}
                          className={cn(
                            "cf-hatch pointer-events-none absolute border-x",
                            categoryStyle[segment.category].fill,
                            categoryStyle[segment.category].border,
                            selectedViolation && selectedViolation.id !== segment.violationId
                              ? "z-20 opacity-30"
                              : "z-30",
                          )}
                          style={{
                            top: `${3 + segment.lane * LANE_HEIGHT + BAR_HEIGHT - 7}px`,
                            height: "7px",
                            left: `${segment.left}%`,
                            width: `${Math.max(segment.width, 0.6)}%`,
                          }}
                          aria-hidden
                        />
                      ))}

                      {/* End of engineering hours. */}
                      <span
                        className="pointer-events-none absolute inset-y-0 w-px bg-ink-900/45"
                        style={{ left: `${pct(windowEnd)}%` }}
                        aria-hidden
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule px-3 py-2 text-[11px] text-ink-500">
        <Legend className="border-signal-green bg-signal-green-soft">No rule broken</Legend>
        {activeCategories.map((profile) => (
          <Legend
            key={profile.id}
            className={cn("cf-hatch", categoryStyle[profile.id].fill, categoryStyle[profile.id].border)}
          >
            {profile.label}
          </Legend>
        ))}
        <Legend className="bar-pinned border-accent bg-accent-soft">Pinned</Legend>
        <Legend className="border-dashed border-rule-strong bg-sunk">Clearance</Legend>
        <span className="ml-auto">Colour marks the minutes at fault, not the whole job</span>
      </footer>
    </section>
  );
}

function Legend({ className, children }: { className?: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2.5 w-4 border", className)} />
      {children}
    </span>
  );
}

/** Requests include work a disruption forced in, which is not in the dataset. */
function lookup(requestId: string) {
  return requestById[requestId] ?? (requestId === emergencyInsertion.id ? emergencyInsertion : null);
}

/** "Team Alpha" -> "Alpha", "Signalling Unit" -> "Signalling". Fits in a bar. */
function shortTeam(name: string): string {
  return name.replace(/^Team /, "").replace(/ (Unit|Systems Unit)$/, "");
}
