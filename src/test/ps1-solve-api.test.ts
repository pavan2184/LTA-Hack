// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { parseSolveRequest, PS1_MAX_BODY_BYTES } from "@/lib/ps1/request";
import { readBoundedJson } from "@/lib/http/body";

const native = vi.hoisted(() => ({ solve: vi.fn() }));
vi.mock("@/lib/ps1/server-solver", () => ({
  solveNative: native.solve,
  NativeSolverUnavailableError: class NativeSolverUnavailableError extends Error {},
}));
import { POST } from "@/app/api/ps1/solve/route";
import { NativeSolverUnavailableError } from "@/lib/ps1/server-solver";
import { NativeModelSizeError } from "@/lib/ps1/cp-sat-model";

const instance = loadInstance(Object.fromEntries(PS1_FILES.map((file) => [file, readFileSync(resolve("packages/ps1/data/public", file), "utf8")])));
const input = () => ({ instance: structuredClone(instance), scenario: "B", pins: [], disruptions: [] });
function request(body: unknown = input(), headers: Record<string, string> = {}) {
  return new Request("https://railplan.test/api/ps1/solve", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

beforeEach(() => { native.solve.mockReset(); });
describe("native solve admission", () => {
  it("cancels stalled body reads so a slow upload cannot hold admission forever", async () => {
    const cancel = vi.fn();
    const req = new Request("https://railplan.test/api/ps1/solve", {
      method: "POST", body: new ReadableStream({ cancel }), duplex: "half",
    } as RequestInit);
    await expect(readBoundedJson(req, 100, 5)).rejects.toMatchObject({ code: "malformed_request" });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("reuses referential checks for uploaded JSON, including dependency cycles", () => {
    const value = input();
    value.instance.activities[0].predecessorActivityId = value.instance.activities[1].activityId;
    value.instance.activities[1].predecessorActivityId = value.instance.activities[0].activityId;
    expect(() => parseSolveRequest(value)).toThrow(/cycle/);
    value.instance.activities[0].contractNumber = "unknown";
    expect(() => parseSolveRequest(value)).toThrow(/unknown contract/);
  });
  it("rejects forged solver parameters and invalid scalar fields", () => {
    expect(() => parseSolveRequest({ ...input(), seconds: 86400 })).toThrow();
    const value = input();
    value.instance.activities[0].totalAccesses = -1;
    expect(() => parseSolveRequest(value)).toThrow();
    value.instance.activities[0].totalAccesses = 1;
    value.instance.parameters.horizonStart = "2027-02-30";
    expect(() => parseSolveRequest(value)).toThrow();
  });
  it("bounds model expansion without discarding work", () => {
    const value = input();
    value.instance.parameters.horizonWeeks = 260;
    value.instance.activities = Array.from({ length: 300 }, (_, i) => ({ ...instance.activities[0], activityId: `A${i}` }));
    expect(() => parseSolveRequest(value)).toThrow(/model size limit/);
  });
  it("rejects unknown pins and cuts outside the horizon", () => {
    expect(() => parseSolveRequest({ ...input(), pins: [{ activityId: "unknown", week: 1 }] })).toThrow(/Pins/);
    expect(() => parseSolveRequest({ ...input(), disruptions: [{ locationId: instance.locationSupply[0].locationId, fromWeek: 9, toWeek: 2, capacity: 0 }] })).toThrow(/Capacity cuts/);
  });
});

describe("POST /api/ps1/solve", () => {
  it("accepts unauthenticated same-origin judging requests and passes cancellation", async () => {
    native.solve.mockResolvedValue({ status: "FEASIBLE" });
    const req = request(input(), { origin: "https://railplan.test" });
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(native.solve).toHaveBeenCalledWith(instance, expect.objectContaining({ scenario: "B", signal: req.signal }));
    expect(await response.json()).toEqual({ outcome: { status: "FEASIBLE" } });
  });
  it("rejects cross-origin and non-JSON requests before running native code", async () => {
    expect((await POST(request(input(), { origin: "https://other.test" }))).status).toBe(403);
    expect((await POST(request(input(), { "content-type": "text/plain" }))).status).toBe(415);
    expect(native.solve).not.toHaveBeenCalled();
  });
  it("enforces streamed byte limits even without Content-Length", async () => {
    const response = await POST(request({ text: "x".repeat(PS1_MAX_BODY_BYTES) }));
    expect(response.status).toBe(413);
    expect(native.solve).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and model inputs", async () => {
    const req = new Request("https://railplan.test/api/ps1/solve", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect((await POST(req)).status).toBe(400);
    expect((await POST(request({ ...input(), scenario: "D" }))).status).toBe(400);
  });
  it("allows only one concurrent solve and releases admission after failure", async () => {
    let reject!: (error: Error) => void;
    native.solve.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const first = POST(request());
    await vi.waitFor(() => expect(native.solve).toHaveBeenCalledOnce());
    const second = await POST(request());
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("5");
    reject(new Error("private native output"));
    const failed = await first;
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await failed.json())).not.toContain("private native output");
    native.solve.mockResolvedValue({ status: "FEASIBLE" });
    expect((await POST(request())).status).toBe(200);
  });
  it("reports a missing native runtime instead of silently changing solver", async () => {
    native.solve.mockRejectedValue(new NativeSolverUnavailableError());
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("solver_unavailable");
  });
  it("reports excessive co-sharing expansion as a size limit and releases admission", async () => {
    native.solve.mockRejectedValueOnce(new NativeModelSizeError("internal estimate"));
    const response = await POST(request());
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("model_too_large");
    native.solve.mockResolvedValueOnce({ status: "FEASIBLE" });
    expect((await POST(request())).status).toBe(200);
  });
});
