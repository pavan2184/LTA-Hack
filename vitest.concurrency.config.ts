import { configDefaults, defineConfig } from "vitest/config";
import base from "./vitest.config";
// Committed concurrency fixtures must never overlap other DB test files.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["scripts/db/*-concurrency.test.ts"],
    exclude: configDefaults.exclude,
    fileParallelism: false,
  },
});
