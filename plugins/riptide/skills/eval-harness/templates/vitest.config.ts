import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["cases/**/*.eval.ts"],
    // Model calls are slow; a per-case timeout below the turn cap produces
    // confusing failures that look like model problems.
    testTimeout: 300_000,
    hookTimeout: 60_000,
    // Concurrency is a cost and rate-limit knob, not a speed knob. Raise it
    // deliberately.
    fileParallelism: true,
    maxConcurrency: 3,
    reporters: ["default"],
  },
});
