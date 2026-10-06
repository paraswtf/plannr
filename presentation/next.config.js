import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The deck is a Next app with a server, `npm run build && npm start` or a host
 * like Vercel, because it is locked: the middleware (src/middleware.ts) keeps
 * every page and file behind a code from an authenticator app, and the
 * secret stays on the server. It still runs offline on the presenting laptop
 * with `npm start`.
 *
 * Both roots are pinned to this folder. Plannr's own lockfile sits one level
 * up, and without this Next would guess that the parent is the workspace and
 * trace files from there.
 *
 * @type {import("next").NextConfig}
 */
const config = {
  images: { unoptimized: true },
  // Strict Mode mounts every new component's effects twice in development.
  // A slide's builds are measured when its timeline is built, and the second
  // build lands after the deck has started morphing the slide in, so it
  // measured cards mid-morph (back navigation broke the solution maps' lines).
  // Off, development builds a slide once, as a production build always has.
  reactStrictMode: false,
  outputFileTracingRoot: here,
  turbopack: { root: here },
  // A throwaway preview build (see scripts/snapshot.mjs) may include another
  // author's half-finished slide; it should still render everything else.
  typescript: { ignoreBuildErrors: process.env.DECK_PREVIEW === "1" },
  eslint: { ignoreDuringBuilds: process.env.DECK_PREVIEW === "1" },
};

export default config;
