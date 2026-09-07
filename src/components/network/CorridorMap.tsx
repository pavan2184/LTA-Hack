"use client";

import { emergencyInsertion } from "@railplan/core/data/disruptions";
import { requestById } from "@railplan/core/data/requests";
import { blocksWithin, conflictZones, lineOrder, lines, type LineId } from "@railplan/core/domain/network";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";

/**
 * Corridor schematic keyed on the same block ids the solver uses.
 *
 * Occupied blocks, the one-block exclusion margin around them, and any conflict
 * zone the work sits inside are all drawn from the request's `blockIds`. If the
 * map and the timeline ever disagree, one of them has the wrong ids — which is
 * exactly the bug a decorative map hides.
 */
export function CorridorMap({ requestId }: { requestId: string }) {
  const result = useRailPlanStore((state) => state.activeResult());
  const selectRequest = useRailPlanStore((state) => state.selectRequest);

  const request =
    requestById[requestId] ?? (requestId === emergencyInsertion.id ? emergencyInsertion : null);
  if (!request) return null;

  const occupied = new Set(request.blockIds);
  const margin = new Set(blocksWithin(request.blockIds, 1));
  const zones = conflictZones.filter(
    (zone) =>
      zone.blockIds.some((id) => occupied.has(id)) &&
      (zone.appliesToWorkClasses.length === 0 || zone.appliesToWorkClasses.includes(request.workClass)),
  );

  const neighbours = (result?.plan.placements ?? []).filter((placement) => {
    if (placement.requestId === requestId) return false;
    const other = requestById[placement.requestId];
    return other?.blockIds.some((id) => occupied.has(id));
  });

  return (
    <section className="border-t border-rule bg-paper px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Corridor</h3>
        <span className="font-mono text-[11px] text-ink-700">{request.blockIds.join(" ")}</span>
      </div>

      <div className="mt-2 space-y-2">
        {(Object.keys(lines) as LineId[]).map((lineId) => {
          const codes = lineOrder[lineId];
          const hasWork = codes.some((code, index) =>
            index < codes.length - 1 ? occupied.has(`${code}-${codes[index + 1]}`) : false,
          );

          return (
            <div key={lineId} className={cn(!hasWork && "border-l border-rule pl-1")}>
              <div className="mb-1 flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-3 w-1.5",
                    lineId === "NS" ? "bg-line-ns" : lineId === "EW" ? "bg-line-ew" : "bg-line-cc",
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    lineId === "NS"
                      ? "text-line-ns-ink"
                      : lineId === "EW"
                        ? "text-line-ew-ink"
                        : "text-line-cc-ink",
                  )}
                >
                  {lines[lineId].name}
                </span>
              </div>
              <div className="flex items-start">
                {codes.map((code, index) => {
                  const blockId = index < codes.length - 1 ? `${code}-${codes[index + 1]}` : null;
                  const state = !blockId
                    ? "none"
                    : occupied.has(blockId)
                      ? "occupied"
                      : margin.has(blockId)
                        ? "margin"
                        : "free";
                  const nodeActive =
                    occupied.has(`${codes[index - 1]}-${code}`) || (blockId ? occupied.has(blockId) : false);

                  return (
                    <div
                      key={code}
                      className={cn("flex items-start", index === codes.length - 1 ? "flex-none" : "min-w-0 flex-1")}
                    >
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full border",
                            nodeActive ? "border-ink-900 bg-ink-900" : "border-rule-strong bg-surface",
                          )}
                        />
                        <span
                          className={cn(
                            "mt-1 font-mono text-[10px]",
                            nodeActive ? "text-ink-900" : "text-ink-400",
                          )}
                        >
                          {code}
                        </span>
                      </div>
                      {blockId && (
                        <span
                          className={cn(
                            "mt-[3px] h-1 flex-1",
                            state === "occupied"
                              ? lineId === "NS"
                                ? "bg-line-ns"
                                : lineId === "EW"
                                  ? "bg-line-ew"
                                  : "bg-line-cc"
                              : state === "margin"
                                ? "bg-signal-amber/50"
                                : "bg-rule",
                          )}
                          title={
                            state === "occupied"
                              ? `${blockId}: occupied by ${request.id}`
                              : state === "margin"
                                ? `${blockId}: within one block of ${request.id}`
                                : blockId
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 space-y-1 text-[11px] text-ink-500">
        <p>
          <span className="inline-block h-1 w-4 translate-y-[-2px] bg-line-ns" /> occupied &middot;{" "}
          <span className="inline-block h-1 w-4 translate-y-[-2px] bg-signal-amber/60" /> one-block margin
        </p>
        {zones.map((zone) => (
          <p key={zone.id} className="text-signal-amber">
            Inside {zone.name}. {zone.reason}
          </p>
        ))}
        {neighbours.length > 0 && (
          <p>
            Sharing these blocks:{" "}
            {neighbours.map((placement, index) => (
              <span key={placement.requestId}>
                {index > 0 && ", "}
                <button
                  type="button"
                  onClick={() => selectRequest(placement.requestId)}
                  className="font-mono text-ink-700 underline decoration-rule-strong underline-offset-2 hover:text-ink-900"
                >
                  {placement.requestId}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
