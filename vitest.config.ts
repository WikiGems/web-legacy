import { defineConfig } from "vitest/config";

// Tests rely on Bun built-ins (bun:sqlite, Bun.spawn, Bun.file), so vitest must run
// under the Bun runtime: `bun run test` invokes `bun --bun vitest`.
export default defineConfig({
  test: {
    include: ["{apps,packages,scripts,shared,src,tests,worker}/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/target/**", "**/dist/**"],
    environment: "node",
    testTimeout: 30_000,
    // The suites share disposable databases and child processes; keep files isolated.
    pool: "threads",
  },
});
