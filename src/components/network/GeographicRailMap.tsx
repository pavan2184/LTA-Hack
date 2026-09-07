"use client";

import { useId } from "react";
import { literalWorld } from "@railplan/core/domain/world";
import { lines } from "@railplan/core/domain/network";
import { formatClock } from "@railplan/core/engine/intervals";
import type { Plan } from "@railplan/core/types/railplan";
import type { ValidationContext } from "@railplan/core/engine/validate";
import { stationGeography } from "@/lib/geography/snapshot";

export interface GeographicRailMapProps {
  plan: Plan | null;
  context: ValidationContext;
  selectedRequestId: string | null;
  onSelectRequest: (id: string) => void;
  affectedBlockIds?: string[];
}
const button =
  "max-w-full rounded border border-rule-strong px-2 py-1 text-left text-xs hover:bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Presentation offsets separate the dense northern labels without moving points.
const stationLabelOffsets: Record<
  string,
  { x: number; y: number; anchor: "start" | "middle" | "end" }
> = {
  NS10: { x: -12, y: -7, anchor: "end" },
  NS11: { x: 0, y: -16, anchor: "middle" },
  NS12: { x: 11, y: 0, anchor: "start" },
};

export function GeographicRailMap({
  plan,
  context,
  selectedRequestId,
  onSelectRequest,
  affectedBlockIds = [],
}: GeographicRailMapProps) {
  const world = context.world ?? literalWorld();
  const descriptionId = useId();
  const resolveRequest = (id: string) =>
    context.extraRequests?.[id] ?? world.requestById[id];
  const selected = selectedRequestId
    ? resolveRequest(selectedRequestId)
    : undefined;
  const selectedBlocks = new Set(selected?.blockIds ?? []);
  const affectedBlocks = new Set(affectedBlockIds);
  const selectedPlacement = plan?.placements.find(
    (placement) => placement.requestId === selectedRequestId,
  );
  const selectedTeam = selected
    ? world.teamById[selectedPlacement?.teamId ?? selected.teamId]
    : undefined;
  const selectedStations = new Set(
    world.blocks
      .filter((block) => selectedBlocks.has(block.id))
      .flatMap((block) => [block.from, block.to]),
  );
  const stationRows = world.instance.stations.flatMap((station) => {
    const location = stationGeography.stations.find(
      (row) => row.code === station.code,
    );
    return location &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      Math.abs(location.latitude) <= 90 &&
      Math.abs(location.longitude) <= 180
      ? [{ ...station, ...location }]
      : [];
  });
  const centreLatitude = stationRows.length
    ? stationRows.reduce((sum, row) => sum + row.latitude, 0) /
      stationRows.length
    : 0;
  const longitudeScale = Math.cos((centreLatitude * Math.PI) / 180);
  const geographicPoints = stationRows.map((row) => ({
    ...row,
    x: row.longitude * longitudeScale,
    y: -row.latitude,
  }));
  const minX = Math.min(...geographicPoints.map((row) => row.x));
  const maxX = Math.max(...geographicPoints.map((row) => row.x));
  const minY = Math.min(...geographicPoints.map((row) => row.y));
  const maxY = Math.max(...geographicPoints.map((row) => row.y));
  const scale =
    geographicPoints.length > 1
      ? Math.min(
          620 / Math.max(maxX - minX, 0.000001),
          290 / Math.max(maxY - minY, 0.000001),
        )
      : 1;
  const points = geographicPoints.map((row) => ({
    ...row,
    x: 360 + (row.x - (minX + maxX) / 2) * scale,
    y: 195 + (row.y - (minY + maxY) / 2) * scale,
  }));
  const pointByCode = new Map(points.map((row) => [row.code, row]));
  const mappedBlocks = world.blocks.flatMap((block) => {
    const from = pointByCode.get(block.from),
      to = pointByCode.get(block.to);
    return from && to ? [{ ...block, fromPoint: from, toPoint: to }] : [];
  });
  const unmappedBlocks = [
    ...new Set([
      ...world.blocks
        .filter(
          (block) => !mappedBlocks.some((mapped) => mapped.id === block.id),
        )
        .map((block) => block.id),
      ...[...selectedBlocks, ...affectedBlocks].filter(
        (id) => !world.blockById[id],
      ),
    ]),
  ];
  const missingStations = world.instance.stations
    .filter((station) => !pointByCode.has(station.code))
    .map((station) => station.code);
  const depot = selectedTeam
    ? mappedBlocks.find((block) => block.id === selectedTeam.depotBlockId)
    : undefined;
  const nearbyBlocks = new Set([
    ...selectedBlocks,
    ...world.blocksWithin([...selectedBlocks], 1),
  ]);
  const placedIds = [
    ...new Set(plan?.placements.map((placement) => placement.requestId) ?? []),
  ];
  const neighbours = placedIds.filter(
    (id) =>
      id !== selectedRequestId &&
      resolveRequest(id)?.blockIds.some((blockId) => nearbyBlocks.has(blockId)),
  );
  const requestButton = (id: string) => {
    const request = resolveRequest(id);
    return (
      <button
        key={id}
        className={button}
        aria-label={`Select ${id} on geographic map`}
        aria-pressed={id === selectedRequestId}
        onClick={() => onSelectRequest(id)}
      >
        {id} · {request?.shortTitle ?? "Request details unavailable"}
        {request ? ` · ${request.blockIds.join(", ")}` : ""}
      </button>
    );
  };
  const metadata = stationGeography.metadata;
  return (
    <section
      aria-label="Geographic rail context"
      className="min-w-0 space-y-3 break-words rounded border border-rule bg-surface p-4 [overflow-wrap:anywhere]"
    >
      <header>
        <h2 className="text-base font-semibold">Geographic rail context</h2>
        <p id={descriptionId} className="mt-1 text-xs text-ink-700">
          Public station geography only. Straight connections are demo blocks,
          not surveyed rail-track geometry. Possessions, isolation areas and
          safety topology remain fabricated; this map establishes no operational
          clearance.
        </p>
      </header>
      {!plan && (
        <p className="text-sm">
          No active plan. Station context remains available; select scheduled
          work after loading a plan.
        </p>
      )}
      {selected ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            Selected work: {selected.id} · {selected.title}
          </p>
          <p>
            Selected blocks: {selected.blockIds.join(", ") || "None supplied"}
          </p>
          <p>
            Endpoint stations:{" "}
            {[...selectedStations]
              .map(
                (code) =>
                  `${code}${world.instance.stations.find((station) => station.code === code)?.name ? ` (${world.instance.stations.find((station) => station.code === code)!.name})` : ""}`,
              )
              .join(", ") || "Unavailable"}
          </p>
          <p>
            {selectedPlacement
              ? `Scheduled ${formatClock(selectedPlacement.startMinute)}–${formatClock(selectedPlacement.endMinute)} with ${selectedTeam?.name ?? selectedPlacement.teamId}.`
              : "Not scheduled in the active plan."}
          </p>
        </div>
      ) : (
        <p className="text-sm">
          {selectedRequestId
            ? `Request ${selectedRequestId} has no block definition in this planning context.`
            : "Select a request in the timeline or work list to locate it."}
        </p>
      )}
      {affectedBlocks.size > 0 && (
        <p className="text-sm font-medium">
          Disruption areas: {[...affectedBlocks].join(", ")}. Dashed overlays
          mark affected demo blocks, not measured safety zones.
        </p>
      )}
      {unmappedBlocks.length > 0 && (
        <p className="text-sm">
          Unmapped demo blocks: {unmappedBlocks.join(", ")}. One or more
          endpoint coordinates are unavailable; these connections are not drawn.
        </p>
      )}
      {missingStations.length > 0 && (
        <p className="text-xs text-ink-700">
          Station coordinates unavailable: {missingStations.join(", ")}.
        </p>
      )}
      {points.length ? (
        <figure className="space-y-2">
          <svg
            viewBox="0 0 720 390"
            className="block w-full rounded border border-rule bg-paper"
            role="img"
            aria-label={`Geographic station context${selected ? ` for ${selected.id}` : ""}`}
            aria-describedby={descriptionId}
          >
            <g aria-hidden="true">
              <path
                d="M675 66 L675 30 M668 42 L675 30 L682 42"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <text
                x="675"
                y="22"
                textAnchor="middle"
                fontSize="13"
                fill="currentColor"
              >
                N
              </text>
            </g>
            {mappedBlocks.map((block) => (
              <g
                key={block.id}
                data-block-id={block.id}
                data-selected={selectedBlocks.has(block.id)}
                data-affected={affectedBlocks.has(block.id)}
              >
                <title>
                  {block.id}
                  {selectedBlocks.has(block.id) ? " · selected work" : ""}
                  {affectedBlocks.has(block.id)
                    ? " · disrupted demo block"
                    : ""}
                </title>
                {selectedBlocks.has(block.id) && (
                  <line
                    x1={block.fromPoint.x}
                    y1={block.fromPoint.y}
                    x2={block.toPoint.x}
                    y2={block.toPoint.y}
                    stroke="currentColor"
                    strokeWidth="10"
                    className="text-ink-950"
                  />
                )}
                <line
                  x1={block.fromPoint.x}
                  y1={block.fromPoint.y}
                  x2={block.toPoint.x}
                  y2={block.toPoint.y}
                  stroke={lines[block.line].colour}
                  strokeWidth={selectedBlocks.has(block.id) ? 5 : 3}
                />
                {affectedBlocks.has(block.id) && (
                  <line
                    x1={block.fromPoint.x}
                    y1={block.fromPoint.y}
                    x2={block.toPoint.x}
                    y2={block.toPoint.y}
                    stroke="currentColor"
                    strokeWidth="11"
                    strokeDasharray="3 5"
                    className="text-signal-red"
                  />
                )}
              </g>
            ))}
            {points.map((station) => (
              <g
                key={station.code}
                data-station-code={station.code}
                data-selected={selectedStations.has(station.code)}
              >
                <title>
                  {station.code} · {station.name}
                  {selectedStations.has(station.code)
                    ? " · selected endpoint"
                    : ""}
                </title>
                <circle
                  cx={station.x}
                  cy={station.y}
                  r={selectedStations.has(station.code) ? 7 : 4}
                  fill="var(--color-surface, white)"
                  stroke="currentColor"
                  strokeWidth={selectedStations.has(station.code) ? 3 : 1.5}
                />
                {selectedStations.has(station.code) && (
                  <circle
                    cx={station.x}
                    cy={station.y}
                    r="2"
                    fill="currentColor"
                  />
                )}
                <text
                  x={station.x + (stationLabelOffsets[station.code]?.x ?? 11)}
                  y={station.y + (stationLabelOffsets[station.code]?.y ?? -7)}
                  textAnchor={
                    stationLabelOffsets[station.code]?.anchor ?? "start"
                  }
                  fontSize="11"
                  fill="currentColor"
                >
                  {station.code}
                </text>
              </g>
            ))}
            {depot && (
              <g data-marker="demo-depot">
                <title>
                  Demo depot block {depot.id}; midpoint symbol, not a real depot
                  coordinate
                </title>
                <path
                  d={`M${(depot.fromPoint.x + depot.toPoint.x) / 2} ${(depot.fromPoint.y + depot.toPoint.y) / 2 - 7} l7 7 l-7 7 l-7 -7 Z`}
                  fill="var(--color-surface, white)"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>
          <figcaption className="text-xs text-ink-700">
            North up · Station points are derived from public footprints. Double
            outlines and filled centres mark selected blocks/endpoints; dashed
            overlays mark disruption areas. A diamond marks a demo depot block
            midpoint.
          </figcaption>
        </figure>
      ) : (
        <p className="border border-rule p-3 text-sm">
          No matching station coordinates are available. Use the exact block IDs
          and work list; no geographic positions have been invented.
        </p>
      )}
      {selectedTeam && (
        <p className="text-xs text-ink-700">
          Demo depot block: {selectedTeam.depotBlockId} · {selectedTeam.name}
          {depot
            ? ". The diamond is a block midpoint, not a real depot coordinate."
            : " · coordinate unavailable; no depot symbol drawn."}
        </p>
      )}
      {selected && (
        <section
          aria-label="Nearby work on demo blocks"
          className="space-y-2 border-t border-rule pt-3"
        >
          <h3 className="text-sm font-medium">Nearby work on demo blocks</h3>
          <p className="text-xs text-ink-700">
            Same or directly adjacent demo blocks, regardless of scheduled time.
            This is network adjacency, not a geographic distance or safety test.
          </p>
          <div className="flex flex-wrap gap-2">
            {neighbours.length ? (
              neighbours.map(requestButton)
            ) : (
              <p className="text-xs">
                No other scheduled work on these or adjacent demo blocks.
              </p>
            )}
          </div>
        </section>
      )}
      <section aria-label="Work shown on geographic map">
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Active plan work list ({placedIds.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {placedIds.length ? (
              placedIds.map(requestButton)
            ) : (
              <p className="text-xs">No scheduled work to select.</p>
            )}
          </div>
        </details>
      </section>
      <footer className="space-y-2 border-t border-rule pt-3 text-xs text-ink-700">
        <p>
          {metadata.attribution} ·{" "}
          <a href={metadata.catalogueUrl} className="underline">
            {metadata.dataset}
          </a>{" "}
          · Accessed {metadata.accessedAt}.
        </p>
        <p>
          <a href={metadata.sourceUrl} className="underline">
            Source attachment
          </a>
          {" · "}
          <a href={metadata.licenceUrl} className="underline">
            Licence page
          </a>
        </p>
        <p className="font-medium">
          Source reuse notice needs confirmation before publication.
        </p>
        <p>{metadata.licenceNote}</p>
        <details>
          <summary className="cursor-pointer">Snapshot provenance</summary>
          <p className="mt-1 break-all">
            Transform {metadata.transformVersion} · Source SHA-256{" "}
            {metadata.sourceSha256} · Recorded terms: {metadata.licenceName} (
            {metadata.licenceStatus}).
          </p>
        </details>
      </footer>
    </section>
  );
}
