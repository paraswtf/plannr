import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Next compiles the app's JSX itself, so `tsconfig.json` says `jsx:
  // "preserve"` and hands it over untouched — which is the one thing Vite's
  // transform refuses to accept back. Overridden here rather than in the
  // tsconfig because the app's build is Next's business and only the runner
  // needs the JSX turned into calls.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    // `.tsx` as well: the API-key console is tested as components, in a DOM,
    // which each such file asks for with a `@vitest-environment` docblock
    // rather than paying for one across the node suites.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Integration suites talk to a real Postgres and are run separately.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
});
