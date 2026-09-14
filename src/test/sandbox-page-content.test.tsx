import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/assistant/PlannerAssistant", () => ({
  PlannerAssistant: () => <div data-testid="assistant" />,
}));
vi.mock("@/components/insights/RequestInspector", () => ({
  RequestInspector: () => <div data-testid="request-inspector" />,
}));
vi.mock("@/components/insights/ViolationPanel", () => ({
  ViolationPanel: () => <div data-testid="violations" />,
}));
vi.mock("@/components/layout/PlanningPanels", () => ({
  PlanningPanels: ({
    variant,
    queue,
    inspector,
    workforce,
    geography,
  }: {
    variant: string;
    queue: ReactNode;
    inspector: ReactNode;
    workforce: ReactNode;
    geography: ReactNode;
  }) => (
    <div data-testid={`planning-panels-${variant}`}>
      {queue}
      {inspector}
      {workforce}
      {geography}
    </div>
  ),
}));
vi.mock("@/components/network/GeographicNetworkView", () => ({
  GeographicNetworkView: () => <div data-testid="geographic-map" />,
}));
vi.mock("@/components/requests/RequestQueue", () => ({
  RequestQueue: () => <div data-testid="request-queue" />,
}));
vi.mock("@/components/schedule/BlockTimeline", () => ({
  BlockTimeline: () => <div data-testid="block-timeline" />,
}));
vi.mock("@/components/schedule/WorkforceTimeline", () => ({
  WorkforceTimeline: () => <div data-testid="workforce-timeline" />,
}));

import { SandboxOverview } from "@/components/sandbox/SandboxOverview";
import { SandboxRequests } from "@/components/sandbox/SandboxRequests";
import { SandboxConflicts } from "@/components/sandbox/SandboxConflicts";
import { SandboxSchedule } from "@/components/sandbox/SandboxSchedule";
import { SandboxResources } from "@/components/sandbox/SandboxResources";
import { SandboxScenarios } from "@/components/sandbox/SandboxScenarios";
import { useRailPlanStore } from "@/store/useRailPlanStore";

afterEach(cleanup);
beforeEach(async () => {
  useRailPlanStore.getState().reset();
  await act(async () => useRailPlanStore.getState().load());
});

describe("sandbox page assignments", () => {
  it("places headline and secondary figures with the assistant on Overview", () => {
    render(<SandboxOverview />);
    expect(screen.getByRole("region", { name: "Plan signals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Secondary calculations" })).toBeInTheDocument();
    expect(screen.getByTestId("assistant")).toBeInTheDocument();
  });

  it("places the queue and inspector on Requests", () => {
    render(<SandboxRequests />);
    expect(screen.getByTestId("planning-panels-requests")).toBeInTheDocument();
    expect(screen.getByTestId("request-queue")).toBeInTheDocument();
    expect(screen.getByTestId("request-inspector")).toBeInTheDocument();
  });

  it("places validated violations on Conflicts", () => {
    render(<SandboxConflicts />);
    expect(screen.getByTestId("violations")).toBeInTheDocument();
  });

  it("places the block occupation timeline on Schedule", () => {
    render(<SandboxSchedule />);
    expect(screen.getByTestId("block-timeline")).toBeInTheDocument();
  });

  it("places workforce and geography on Resources", () => {
    render(<SandboxResources />);
    expect(screen.getByTestId("planning-panels-resources")).toBeInTheDocument();
    expect(screen.getByTestId("workforce-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("geographic-map")).toBeInTheDocument();
  });

  it("places disruption controls on Scenarios", () => {
    render(<SandboxScenarios />);
    expect(screen.getByRole("heading", { name: "Scenario testing" })).toBeInTheDocument();
  });
});
