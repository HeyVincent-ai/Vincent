import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    testTimeout: 120_000, // 2 min per test — LLM + API calls
    retry: 2, // retry on LLM flakiness
  },
});
