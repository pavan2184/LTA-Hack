import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ClockTimeField } from "@/components/requests/ClockTimeField";

function Example({ initial = 1470 }: { initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return <><ClockTimeField label="Start" value={value} onChange={setValue} /><output>{value === null ? "Unknown" : value}</output></>;
}
it("roundtrips next-day times without silently shifting to the planning date", () => {
  render(<Example />);
  expect(screen.getByLabelText("Start")).toHaveValue("00:30");
  expect(screen.getByLabelText("Start day")).toHaveValue("1");
  fireEvent.change(screen.getByLabelText("Start"), { target: { value: "01:15" } });
  expect(screen.getByRole("status")).toHaveTextContent("1515");
  fireEvent.change(screen.getByLabelText("Start day"), { target: { value: "0" } });
  expect(screen.getByRole("status")).toHaveTextContent("75");
});
it("keeps an unknown time unknown instead of inventing midnight", () => {
  render(<Example initial={null} />);
  expect(screen.getByLabelText("Start")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Start"), { target: { value: "00:00" } });
  expect(screen.getByRole("status")).toHaveTextContent("0");
  fireEvent.change(screen.getByLabelText("Start"), { target: { value: "" } });
  expect(screen.getByRole("status")).toHaveTextContent("Unknown");
});
