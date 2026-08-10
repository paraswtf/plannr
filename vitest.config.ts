import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration suites talk to a real Postgres and are run separately.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
});
