import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["test/**/*.test.mjs"],
    // Vitest 4: poolOptions removed, use top-level options
    fileParallelism: false,
    sequence: { sequential: true },
  },
});
