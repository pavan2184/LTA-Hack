import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
if (existsSync(".env.local")) loadEnvFile(".env.local");
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/e2e/*.test.ts"],
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 30000,
  },
});
