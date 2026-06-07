import { defineConfig } from "vitest/config";

// Minimal Node-environment config. The monitor logic is pure (no DOM), so we
// keep this lean and only pick up the monitor test for now.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // The audit/scraper modules pull in Playwright; exclude node_modules and
    // build output so Vitest only runs our unit tests.
    exclude: ["node_modules/**", ".next/**"],
  },
});
