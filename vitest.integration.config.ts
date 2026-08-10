import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

// Unlike `next dev`, vitest does not read .env on its own, and src/env.js
// validates on import. The empty prefix loads every key, not just VITE_ ones.
const env = loadEnv("development", process.cwd(), "");

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // The router imports `auth()` to build its context, but these tests pass
      // a context in directly. Stubbing it keeps next-auth's Next.js-only
      // imports out of a plain Node process.
      "~/server/auth": fileURLToPath(
        new URL("./src/server/auth/__stub__.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    env,
    include: ["src/**/*.integration.test.ts"],
    // These share one database, so they must not run concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
