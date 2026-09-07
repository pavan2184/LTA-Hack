import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stations } from "@railplan/core/domain/network";
import { parseGeoSnapshot } from "@/lib/geography/schema";
import { stationGeography } from "@/lib/geography/snapshot";
import {
  representativeCentroid,
  projectSvy21,
  transformFeatures,
  stationSelection,
} from "../../scripts/geography/transform";
import { snapshotFromArchive } from "../../scripts/geography/archive";

const square = (x: number, y: number, size = 2) => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];
const polygon = (x = 28000.642, y = 38743.572) => ({
  type: "Polygon",
  coordinates: [square(x, y)],
});
const sourceFeatures = () => {
  const features = Array.from({ length: 231 }, () => ({
    type: "Feature",
    properties: {
      STN_NAM_DE: "OTHER MRT STATION",
      ATTACHEMEN: null as string | null,
    },
    geometry: polygon(),
  }));
  for (const [i, selected] of stationSelection.entries())
    features[selected.sourceFeatureIndex] = {
      type: "Feature",
      properties: {
        STN_NAM_DE: selected.sourceName,
        ATTACHEMEN: selected.sourceAttachment || null,
      },
      geometry: polygon(28000.642 + i * 20),
    };
  return features;
};

describe("station geography snapshot", () => {
  it("covers exactly the known stations with unique factual coordinates and traceable conflicting licence metadata", () => {
    const parsed = parseGeoSnapshot(stationGeography);
    expect(parsed.stations.map(({ code, name }) => ({ code, name }))).toEqual(
      stations.map(({ code, name }) => ({ code, name })),
    );
    expect(
      new Set(parsed.stations.map((s) => `${s.longitude},${s.latitude}`)).size,
    ).toBe(15);
    expect(parsed.metadata.licenceStatus).toBe("conflicting");
    expect(parsed.metadata.licenceNote).toMatch(/internal use only/i);
    expect(parsed.stations.find((s) => s.code === "EW21")).toMatchObject({
      sourceFeatureIndex: 119,
      sourceAttachment: "",
    });
    expect(parsed.stations.find((s) => s.code === "CC10")).toMatchObject({
      sourceFeatureIndex: 116,
      sourceAttachment: "CC10_MPS STN.zip",
    });
  });
  it.each([
    [
      "missing",
      (x: typeof stationGeography) => {
        x.stations.pop();
      },
    ],
    [
      "duplicate id",
      (x: typeof stationGeography) => {
        x.stations[1] = { ...x.stations[0] };
      },
    ],
    [
      "unknown id",
      (x: typeof stationGeography) => {
        x.stations[0].code = "NS99";
      },
    ],
    [
      "wrong name",
      (x: typeof stationGeography) => {
        x.stations[0].name = "Canberra";
      },
    ],
    [
      "wrong attachment",
      (x: typeof stationGeography) => {
        x.stations[10].sourceAttachment = "CC22_BNV STN.zip";
      },
    ],
    [
      "wrong feature",
      (x: typeof stationGeography) => {
        x.stations[0].sourceFeatureIndex = 0;
      },
    ],
    [
      "duplicate coordinates",
      (x: typeof stationGeography) => {
        x.stations[1].longitude = x.stations[0].longitude;
        x.stations[1].latitude = x.stations[0].latitude;
      },
    ],
    [
      "NaN",
      (x: typeof stationGeography) => {
        x.stations[0].longitude = NaN;
      },
    ],
    [
      "infinite",
      (x: typeof stationGeography) => {
        x.stations[0].latitude = Infinity;
      },
    ],
    [
      "outside Singapore",
      (x: typeof stationGeography) => {
        x.stations[0].longitude = 100;
      },
    ],
  ])("rejects %s points", (_, mutate) => {
    const input = structuredClone(stationGeography);
    mutate(input);
    expect(() => parseGeoSnapshot(input)).toThrow();
  });
  it("rejects unknown fields and malformed provenance rather than retaining arbitrary source metadata", () => {
    expect(() =>
      parseGeoSnapshot({ ...stationGeography, rawGeometry: [] }),
    ).toThrow();
    expect(() =>
      parseGeoSnapshot({
        ...stationGeography,
        metadata: { ...stationGeography.metadata, sourceSha256: "bad" },
      }),
    ).toThrow();
    expect(() =>
      parseGeoSnapshot({
        ...stationGeography,
        metadata: { ...stationGeography.metadata, licenceStatus: "open" },
      }),
    ).toThrow();
    expect(() =>
      parseGeoSnapshot({
        ...stationGeography,
        stations: stationGeography.stations.map((s) => ({
          ...s,
          internalMetadata: "secret",
        })),
      }),
    ).toThrow();
    for (const field of ["sourceUrl", "catalogueUrl", "licenceUrl"]) {
      expect(() =>
        parseGeoSnapshot({
          ...stationGeography,
          metadata: {
            ...stationGeography.metadata,
            [field]: "javascript:alert(1)",
          },
        }),
      ).toThrow();
      expect(() =>
        parseGeoSnapshot({
          ...stationGeography,
          metadata: {
            ...stationGeography.metadata,
            [field]: "https://example.com/",
          },
        }),
      ).toThrow();
    }
    expect(() =>
      parseGeoSnapshot({
        ...stationGeography,
        metadata: { ...stationGeography.metadata, accessedAt: "2026-02-31" },
      }),
    ).toThrow();
  });
});

describe("offline station transformation", () => {
  it("uses area-weighted projected centroids, subtracting holes regardless of ring orientation", () => {
    expect(
      representativeCentroid({
        type: "Polygon",
        coordinates: [square(0, 0, 4), square(2, 2, 2)],
      }),
    ).toEqual([5 / 3, 5 / 3]);
    expect(
      representativeCentroid({
        type: "Polygon",
        coordinates: [square(0, 0, 4).reverse(), square(2, 2, 2).reverse()],
      }),
    ).toEqual([5 / 3, 5 / 3]);
    expect(
      representativeCentroid({
        type: "MultiPolygon",
        coordinates: [[square(0, 0, 2)], [square(10, 0, 4)]],
      }),
    ).toEqual([9.8, 1.8]);
  });
  it("projects the SVY21 false origin to its specified WGS84 control point in longitude,latitude order", () => {
    const [longitude, latitude] = projectSvy21([28001.642, 38744.572]);
    expect(longitude).toBeCloseTo(103.8333333333333, 10);
    expect(latitude).toBeCloseTo(1.366666666666667, 10);
  });
  it.each([
    { type: "Point", coordinates: [1, 2] },
    { type: "Polygon", coordinates: [] },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 1],
          [2, 2],
          [0, 0],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [NaN, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
  ])("rejects unsupported or invalid source geometry %#", (geometry) => {
    expect(() => representativeCentroid(geometry)).toThrow();
  });
  it("selects the reviewed source identity once and excludes all raw properties and geometry", () => {
    const transformed = transformFeatures(sourceFeatures());
    expect(transformed).toHaveLength(15);
    expect(transformed[0]).toEqual({
      code: "NS10",
      name: "Admiralty",
      longitude: 103.8333333,
      latitude: 1.3666667,
      sourceFeatureIndex: 150,
      sourceAttachment: "",
    });
    expect(Object.keys(transformed[0]).sort()).toEqual(
      [
        "code",
        "name",
        "longitude",
        "latitude",
        "sourceFeatureIndex",
        "sourceAttachment",
      ].sort(),
    );
  });
  it.each([
    "missing",
    "duplicate",
    "attachment",
    "feature index",
    "malformed field",
    "duplicate coordinates",
  ])("fails closed on %s source selection", (fault) => {
    const rows = sourceFeatures();
    if (fault === "missing")
      rows[150].properties.STN_NAM_DE = "OTHER MRT STATION";
    if (fault === "duplicate") rows[0] = { ...rows[150] };
    if (fault === "attachment")
      rows[150].properties.ATTACHEMEN = "unexpected.zip";
    if (fault === "feature index") [rows[0], rows[150]] = [rows[150], rows[0]];
    if (fault === "malformed field")
      rows[150].properties.STN_NAM_DE = null as unknown as string;
    if (fault === "duplicate coordinates")
      rows[91].geometry = rows[150].geometry;
    expect(() => transformFeatures(rows)).toThrow();
  });
  it("rejects a different or oversized local source before reading any archive members", async () => {
    const directory = mkdtempSync(join(tmpdir(), "railplan-geo-test-"));
    const file = join(directory, "unreviewed.zip");
    try {
      writeFileSync(file, "not the reviewed source");
      await expect(snapshotFromArchive(file)).rejects.toThrow(/SHA-256/);
      writeFileSync(file, Buffer.alloc(2 * 1024 * 1024 + 1));
      await expect(snapshotFromArchive(file)).rejects.toThrow(/2 MiB/);
      await expect(snapshotFromArchive(directory)).rejects.toThrow(
        /regular file/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("verifies the bundled snapshot without an archive and exits unsuccessfully for invalid arguments", () => {
    const command = ["--import", "tsx", "scripts/geography/verify.ts"];
    expect(
      execFileSync(process.execPath, command, { encoding: "utf8" }),
    ).toMatch(/Verified 15 station points.*no network/);
    expect(() =>
      execFileSync(process.execPath, [...command, "--source"], {
        stdio: "pipe",
      }),
    ).toThrow();
  });
});
