import { describe, it, expect } from "vitest";
import {
  configurationSchema,
  retrySchema,
  testConfigurationSchema,
} from "@/lib/notifications/schemas";

describe("notification mutation schemas", () => {
  it("accepts a bounded numeric Telegram destination or explicit disable with a version guard", () => {
    expect(
      configurationSchema.parse({
        expectedVersion: 0,
        chatId: "-1001234567890",
      }),
    ).toEqual({ expectedVersion: 0, chatId: "-1001234567890" });
    expect(
      configurationSchema.parse({ expectedVersion: 1, chatId: null }).chatId,
    ).toBeNull();
  });
  it.each([
    "0",
    "-0",
    "123.5",
    "+123",
    "00123",
    "@somechannel",
    "4503599627370496",
    "-4503599627370496",
    "123\nhttps://other",
  ])("rejects invalid chat ID %s", (chatId) => {
    expect(() =>
      configurationSchema.parse({ expectedVersion: 0, chatId }),
    ).toThrow();
  });
  it("rejects missing versions, caller identity/recipient in retry, and implicit duplicate-risk consent", () => {
    expect(() => configurationSchema.parse({ chatId: "123" })).toThrow();
    expect(() =>
      configurationSchema.parse({
        expectedVersion: 0,
        chatId: "123",
        actorId: "forged",
      }),
    ).toThrow();
    expect(() => retrySchema.parse({ chatId: "123" })).toThrow();
    expect(retrySchema.parse({}).acknowledgeDuplicateRisk).toBe(false);
    expect(() =>
      testConfigurationSchema.parse({ expectedVersion: -1 }),
    ).toThrow();
  });
});
