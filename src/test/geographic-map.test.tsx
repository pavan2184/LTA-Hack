import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { buildWorld } from "@railplan/core/domain/world";
import type { Plan } from "@railplan/core/types/railplan";
import { GeographicRailMap } from "@/components/network/GeographicRailMap";

// Fabricated coordinates exercise projection/rendering; real source parity is
// tested independently against the checked-in geography snapshot.
vi.mock("@/lib/geography/snapshot", () => ({
  stationGeography: {
    version: 1,
    metadata: {
      dataset: "Fabricated geography fixture",
      sourceUrl: "https://example.test/source.zip",
      catalogueUrl: "https://example.test/catalogue",
      accessedAt: "2026-09-07",
      sourceSha256: "fixture",
      transformVersion: "fixture-v1",
      licenceName: "Source terms",
      licenceUrl: "https://example.test/licence",
      licenceStatus: "conflicting",
      licenceNote:
        "Open licence page conflicts with internal-use notice in source attachment.",
      attribution: "Test fixture attribution",
    },
    stations: [0, 1, 2, 3].map((index) => ({
      code: `NS${10 + index}`,
      name: `Fixture station ${index}`,
      longitude: 103 + index * 0.01,
      latitude: 1 + index * 0.01,
      sourceFeatureIndex: index,
      sourceAttachment: "fixture",
    })),
  },
}));
function fixture() {
  const instance = buildInstanceFromLiterals();
  instance.stations = instance.stations.filter((station) =>
    ["NS10", "NS11", "NS12", "NS13"].includes(station.code),
  );
  instance.blocks = instance.blocks.filter((block) =>
    ["NS10-NS11", "NS11-NS12", "NS12-NS13"].includes(block.id),
  );
  instance.adjacency = instance.adjacency.filter(
    (edge) =>
      instance.blocks.some((b) => b.id === edge.blockId) &&
      instance.blocks.some((b) => b.id === edge.neighbourId),
  );
  instance.teams = [
    { ...instance.teams[0], depotBlockId: instance.blocks[0].id },
  ];
  instance.requests = instance.requests.slice(0, 3).map((request, index) => ({
    ...request,
    id: `M-00${index + 1}`,
    title: `Fixture job ${index + 1}`,
    shortTitle: `Fixture ${index + 1}`,
    blockIds: [instance.blocks[index].id],
    teamId: instance.teams[0].id,
  }));
  const plan: Plan = {
    placements: instance.requests.map((request) => ({
      requestId: request.id,
      startMinute: 0,
      endMinute: 30,
      teamId: request.teamId,
      locked: false,
    })),
    deferred: [],
  };
  return {
    plan,
    context: { world: buildWorld(instance) },
    selectedRequestId: "M-001",
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("offline geographic rail map", () => {
  it("renders offline with conspicuous source provenance and unresolved reuse terms", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { container } = render(
      <GeographicRailMap {...fixture()} onSelectRequest={vi.fn()} />,
    );
    expect(
      screen.getByRole("img", { name: /Geographic station context/ }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("svg image, img, iframe")).toBeNull();
    expect(
      screen.getByText(
        /Source reuse notice needs confirmation before publication/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Source attachment" }),
    ).toHaveAttribute("href", "https://example.test/source.zip");
    expect(screen.getByRole("link", { name: "Licence page" })).toHaveAttribute(
      "href",
      "https://example.test/licence",
    );
    expect(
      screen.getByText(/Straight connections are demo blocks/),
    ).toBeInTheDocument();
  });
  it("marks exact selected blocks, endpoint stations and the selected team's demo depot block", () => {
    const { container } = render(
      <GeographicRailMap
        {...fixture()}
        affectedBlockIds={["NS11-NS12"]}
        onSelectRequest={vi.fn()}
      />,
    );
    expect(
      container.querySelector('[data-block-id="NS10-NS11"]'),
    ).toHaveAttribute("data-selected", "true");
    expect(
      container.querySelector('[data-station-code="NS10"]'),
    ).toHaveAttribute("data-selected", "true");
    expect(
      container.querySelector('[data-station-code="NS11"]'),
    ).toHaveAttribute("data-selected", "true");
    expect(
      container.querySelector('[data-block-id="NS11-NS12"]'),
    ).toHaveAttribute("data-affected", "true");
    expect(screen.getByText(/Demo depot block: NS10-NS11/)).toBeInTheDocument();
    expect(screen.getByText(/Disruption areas: NS11-NS12/)).toBeInTheDocument();
    expect(
      container.querySelector('[data-marker="demo-depot"]'),
    ).toBeInTheDocument();
  });
  it("offers keyboard selection of work on the same or adjacent demo blocks only", async () => {
    const select = vi.fn();
    render(<GeographicRailMap {...fixture()} onSelectRequest={select} />);
    const neighbours = screen.getByRole("region", {
      name: "Nearby work on demo blocks",
    });
    expect(
      within(neighbours).queryByRole("button", { name: /M-003/ }),
    ).not.toBeInTheDocument();
    const button = within(neighbours).getByRole("button", { name: /M-002/ });
    button.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(select).toHaveBeenCalledWith("M-002");
  });
  it("uses extra emergency request block IDs without falling back to a different baseline job", () => {
    const input = fixture();
    const emergency = {
      ...input.context.world.requests[2],
      id: "EM-01",
      title: "Emergency inspection",
      shortTitle: "Emergency",
    };
    const { container } = render(
      <GeographicRailMap
        {...input}
        selectedRequestId="EM-01"
        context={{ ...input.context, extraRequests: { "EM-01": emergency } }}
        plan={{
          ...input.plan,
          placements: [
            ...input.plan.placements,
            { ...input.plan.placements[0], requestId: "EM-01" },
          ],
        }}
        onSelectRequest={vi.fn()}
      />,
    );
    expect(screen.getByText(/Selected work: EM-01/)).toBeInTheDocument();
    expect(
      container.querySelector('[data-block-id="NS12-NS13"]'),
    ).toHaveAttribute("data-selected", "true");
    expect(
      container.querySelector('[data-block-id="NS10-NS11"]'),
    ).toHaveAttribute("data-selected", "false");
  });
  it("keeps unmapped block IDs visible without inventing missing coordinates", () => {
    const input = fixture();
    const instance = structuredClone(input.context.world.instance);
    instance.blocks[0].from = "UNMAPPED";
    const { container } = render(
      <GeographicRailMap
        {...input}
        context={{ world: buildWorld(instance) }}
        onSelectRequest={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Unmapped demo blocks: NS10-NS11/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Selected blocks: NS10-NS11/)).toBeInTheDocument();
    expect(container.querySelector('[data-block-id="NS10-NS11"]')).toBeNull();
    expect(
      screen.getByText(/Demo depot block: NS10-NS11.*coordinate unavailable/),
    ).toBeInTheDocument();
  });
  it("preserves geographic aspect and north-up orientation", () => {
    const { container } = render(
      <GeographicRailMap {...fixture()} onSelectRequest={vi.fn()} />,
    );
    const a = container.querySelector('[data-station-code="NS10"] circle')!;
    const b = container.querySelector('[data-station-code="NS11"] circle')!;
    const dx = Number(b.getAttribute("cx")) - Number(a.getAttribute("cx"));
    const dy = Number(a.getAttribute("cy")) - Number(b.getAttribute("cy"));
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
    expect(dx / dy).toBeCloseTo(Math.cos((1.015 * Math.PI) / 180), 4);
  });
});
