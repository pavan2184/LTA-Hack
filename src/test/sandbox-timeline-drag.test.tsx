import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SandboxPlannerPanel } from "@/components/layout/SandboxPlannerPanels";
import { useRailPlanStore } from "@/store/useRailPlanStore";

beforeEach(async () => {
  useRailPlanStore.getState().reset();
  await useRailPlanStore.getState().load();
  await useRailPlanStore.getState().buildPlan();
});
afterEach(() => vi.unstubAllGlobals());
it("snaps pointer motion, previews linked bars and cancels with Escape without changing the plan", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  render(<SandboxPlannerPanel kind="timeline" />);
  const before = useRailPlanStore.getState().planned;
  const bar = screen.getByRole("button", { name: /Select M-001 on NS10-NS11/ });
  const linked = screen.getByRole("button", { name: /Select M-001 on NS11-NS12/ });
  bar.setPointerCapture = vi.fn(); bar.hasPointerCapture = () => true; bar.releasePointerCapture = vi.fn();
  vi.spyOn(bar.parentElement!, "getBoundingClientRect").mockReturnValue({ width: 600 } as DOMRect);
  fireEvent.pointerDown(bar, { button: 0, clientX: 60 });
  fireEvent.pointerMove(bar, { clientX: 100 });
  expect(bar.style.left).toBe("6.25%");
  expect(linked.style.left).toBe("6.25%");
  expect(useRailPlanStore.getState().planned).toBe(before);
  fireEvent.keyDown(bar, { key: "Escape" });
  fireEvent.pointerUp(bar, { clientX: 100 });
  expect(screen.queryByRole("button", { name: "Apply move" })).not.toBeInTheDocument();
  fireEvent.pointerDown(bar, { button: 0, clientX: 60 });
  fireEvent.pointerMove(bar, { clientX: 100 });
  fireEvent.pointerUp(bar, { clientX: 100 });
  expect(screen.getByRole("button", { name: "Apply move" })).toBeEnabled();
});
it("offers a keyboard move preview, applies all linked bars and supports Undo", async () => {
  render(<SandboxPlannerPanel kind="timeline" />);
  const before = useRailPlanStore.getState().planned;
  const bar = screen.getByRole("button", { name: /Select M-001 on NS10-NS11/ });
  fireEvent.keyDown(bar, { key: "ArrowRight", altKey: true });
  expect(screen.getByRole("button", { name: "Apply move" })).toBeEnabled();
  expect(useRailPlanStore.getState().planned).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Apply move" }));
  expect(screen.getByRole("button", { name: /Select M-001 on NS10-NS11.*00:15–01:15/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Select M-001 on NS11-NS12.*00:15–01:15/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo move" }));
  expect(useRailPlanStore.getState().planned).toBe(before);
});
it("cancels previews and refuses apply after a different planning operation", async () => {
  render(<SandboxPlannerPanel kind="timeline" />);
  fireEvent.keyDown(screen.getByRole("button", { name: /Select M-001 on NS10-NS11/ }), { key: "ArrowRight", altKey: true });
  fireEvent.click(screen.getByRole("button", { name: "Cancel move" }));
  expect(screen.queryByRole("button", { name: "Apply move" })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("button", { name: /Select M-001 on NS10-NS11/ }), { key: "ArrowRight", altKey: true });
  await act(async () => useRailPlanStore.getState().setStrategy("min-risk"));
  expect(screen.queryByRole("button", { name: "Apply move" })).not.toBeInTheDocument();
});
