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
    // Rollback DB fixtures share the global planning-source lock. Running files
    // together measures lock queues rather than each test's execution timeout.
    fileParallelism: false,
    exclude: [...configDefaults.exclude, "scripts/db/*-concurrency.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
