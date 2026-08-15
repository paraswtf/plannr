import { type MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest — what Android and desktop Chrome read when
 * someone installs Plannr to their home screen.
 *
 * The 192/512 icons carry maskable safe-zone padding, so they are listed under
 * both purposes: "maskable" for platforms that crop to their own shape, "any"
 * for the install prompt and task switcher, which need a plain icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plannr — campus timetables & room booking",
    short_name: "Plannr",
    description:
      "Clash-free timetables, live room availability, one-tap room bookings and class attendance — one scheduling system for the whole campus.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eef0f3",
    theme_color: "#eef0f3",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
