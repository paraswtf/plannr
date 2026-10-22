import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A plain static export: `npm run build` writes out/, which any static host
 * (or scripts/shoot.mjs, with no server) can serve. No lock, no API routes.
 *
 * @type {import("next").NextConfig}
 */
const config = {
  output: "export",
  images: { unoptimized: true },
  // Slide builds are measured when their timeline is built; Strict Mode's
  // double mount would measure mid-morph.
  reactStrictMode: false,
  outputFileTracingRoot: here,
  turbopack: { root: here },
};

export default config;
