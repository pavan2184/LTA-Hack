import { z } from "zod";
export const notificationIdSchema = z.uuid();
export const chatIdSchema = z
  .string()
  .regex(/^-?[1-9]\d{0,15}$/)
  .refine(
    (value) =>
      Number.isSafeInteger(Number(value)) &&
      Math.abs(Number(value)) <= 4503599627370495,
    "Use a nonzero signed numeric Telegram chat ID of at most 52 bits.",
  );
const version = z.number().int().min(0).max(2147483647);
export const configurationSchema = z
  .object({ expectedVersion: version, chatId: chatIdSchema.nullable() })
  .strict();
export const testConfigurationSchema = z
  .object({ expectedVersion: version })
  .strict();
export const retrySchema = z
  .object({ acknowledgeDuplicateRisk: z.boolean().default(false) })
  .strict();
export type ConfigurationInput = z.infer<typeof configurationSchema>;
