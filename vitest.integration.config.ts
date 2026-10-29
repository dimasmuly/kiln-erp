import path from "node:path";

import { defineConfig } from "vitest/config";

/** Runs against real PostgreSQL and EmberKV (see tests/integration/setup.ts). */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    // One database, so test files run one at a time; tests inside a file are sequential too.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
