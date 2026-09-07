import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

if (existsSync(".env.local")) loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "scripts/db/plan-concurrency.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
