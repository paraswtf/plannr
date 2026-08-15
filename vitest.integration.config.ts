import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

// Unlike `next dev`, vitest does not read .env on its own, and src/env.js
// validates on import. The empty prefix loads every key, not just VITE_ ones.
//
// Mode "test" so `.env.test` is layered over `.env`: since the app's DATABASE_URL
// points at Supabase, and these fixtures empty tables between runs, inheriting it
// would mean the suite deleting real students the first time somebody ran it.
const env = loadEnv("test", process.cwd(), "");

/**
 * Refuses to run anywhere but a local database.
 *
 * `.env.test` is what normally redirects these tests, so the danger is the case
 * where it is missing or was never pulled — the suite would fall back to
 * whatever `.env` says, which is production, and the first `deleteMany` in a
 * fixture would take the college's data with it. A missing file should stop the
 * run, not quietly repoint it.
 */
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
const host = env.DATABASE_URL && new URL(env.DATABASE_URL).hostname;
if (!host || !LOCAL.has(host)) {
  throw new Error(
    `The integration tests empty tables as they go, so they only run against a local database — ` +
      `DATABASE_URL points at ${host ?? "nothing"}.\n` +
      `Start one with \`npm run db:start\` and put its URL in .env.test.`,
  );
}

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
