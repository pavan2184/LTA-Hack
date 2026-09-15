import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { useUnsavedChanges } from "@/lib/navigation/useUnsavedChanges";

function Editor() {
  const [text, setText] = useState("");
  useUnsavedChanges(Boolean(text));
  return <input aria-label="Unsaved notes" value={text} onChange={(event) => setText(event.target.value)} />;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

it("cancels browser traversal before the URL and router tree can change", () => {
  const navigation = new EventTarget();
  vi.stubGlobal("navigation", navigation);
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Unsaved notes"), { target: { value: "Private notes" } });
  const navigate = Object.assign(new Event("navigate", { cancelable: true }), { navigationType: "traverse", destination: { sameDocument: true } });
  expect(navigation.dispatchEvent(navigate)).toBe(false);
  expect(screen.getByLabelText("Unsaved notes")).toHaveValue("Private notes");
});

it("confirms an accepted traversal once across navigate and popstate", () => {
  const navigation = new EventTarget();
  vi.stubGlobal("navigation", navigation);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Unsaved notes"), { target: { value: "Private notes" } });
  act(() => {
    navigation.dispatchEvent(Object.assign(new Event("navigate", { cancelable: true }), { navigationType: "traverse", destination: { sameDocument: true } }));
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(confirm).toHaveBeenCalledTimes(1);
});

it("retains the URL, router state and edits when native history is denied without Navigation API", async () => {
  vi.stubGlobal("navigation", undefined);
  window.history.replaceState({ __NA: true, route: "requests" }, "", "/requests");
  window.history.pushState({ __NA: true, route: "drafts" }, "", "/requests/drafts");
  const router = vi.fn();
  window.addEventListener("popstate", router);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Unsaved notes"), { target: { value: "Private notes" } });
    await act(async () => window.history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(router).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/requests/drafts");
    expect(window.history.state).toEqual({ __NA: true, route: "drafts" });
    expect(screen.getByLabelText("Unsaved notes")).toHaveValue("Private notes");
  } finally { window.removeEventListener("popstate", router); }
});

it("replays a permitted fallback traversal once to an earlier router listener", () => {
  vi.stubGlobal("navigation", undefined);
  const router = vi.fn();
  window.addEventListener("popstate", router);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Unsaved notes"), { target: { value: "Private notes" } });
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { __NA: true, route: "requests" } })));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(router).toHaveBeenCalledTimes(1);
    expect(router.mock.calls[0][0].state).toEqual({ __NA: true, route: "requests" });
  } finally { window.removeEventListener("popstate", router); }
});
