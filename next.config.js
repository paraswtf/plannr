/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // The typst compiler is a native module. It is never bundled: the papers
  // service runs it in a separate Node process that requires it by name from
  // node_modules, which is also why the bundler cannot see it is used and the
  // routes that typeset have to name it for the file tracer below.
  serverExternalPackages: ["@myriaddreamin/typst-ts-node-compiler"],
  // The keys are globs, in which brackets are character classes: a key spelt
  // "/api/v1/[[...path]]" matches no route, so each route is named by its folder.
  outputFileTracingIncludes: {
    "/api/trpc/**": ["./node_modules/@myriaddreamin/**"],
    "/api/v1/**": ["./node_modules/@myriaddreamin/**"],
    "/api/papers/**": ["./node_modules/@myriaddreamin/**"],
  },
  async headers() {
    return [
      {
        // The worker is the one file that must never be served stale: a browser
        // that cached it for a day would keep running yesterday's rules. It is
        // served from the root so its scope covers the whole app.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default config;
