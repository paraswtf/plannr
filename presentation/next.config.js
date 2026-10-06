import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The deck is a static site: `next build` writes it to `out/`, which any file
 * host can serve and which opens offline on the presenting laptop.
 *
 * Both roots are pinned to this folder. Plannr's own lockfile sits one level
 * up, and without this Next would guess that the parent is the workspace and
 * trace files from there.
 *
 * @type {import("next").NextConfig}
 */
const config = {
  output: "export",
  images: { unoptimized: true },
  // Strict Mode mounts every new component's effects twice in development.
  // A slide's builds are measured when its timeline is built, and the second
  // build lands after the deck has started morphing the slide in, so it
  // measured cards mid-morph (back navigation broke the solution maps' lines).
  // Off, development builds a slide once, as the export always has.
  reactStrictMode: false,
  outputFileTracingRoot: here,
  turbopack: { root: here },
  // A throwaway preview build (see scripts/snapshot.mjs) may include another
  // author's half-finished slide; it should still render everything else.
  typescript: { ignoreBuildErrors: process.env.DECK_PREVIEW === "1" },
  eslint: { ignoreDuringBuilds: process.env.DECK_PREVIEW === "1" },
};

export default config;
