/**
 * Regenerates `public/og.png`, the 1200×630 card every link preview shows.
 *
 *   npx tsx scripts/og-image.tsx
 *
 * It is a build-time asset rather than a runtime `opengraph-image` route: the
 * card never changes per request, and a static PNG is the one thing every
 * scraper (WhatsApp, Slack, iMessage, Teams) reliably fetches. Fonts come from
 * Google Fonts at run time so no binaries live in the repo — the same two faces
 * the app itself loads, so the card and the product read as one thing.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ImageResponse } from "next/og";
// tsx compiles this file with the classic JSX runtime, so React must be in scope.
import React from "react";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const TAGLINE =
  "Clash-free timetables, live room availability and one-tap bookings for the whole campus.";
const CHIPS = ["Timetables", "Room booking", "Attendance"];

/** Pull one weight of a Google font as a TTF buffer. */
async function loadFont(family: string, weight: number): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`,
    // The default UA gets woff2 back, which satori cannot parse; an ancient one
    // makes Google serve plain TTF.
    { headers: { "User-Agent": "Mozilla/4.0" } },
  ).then((r) => r.text());

  const url = /https:\/\/[^)]+\.ttf/.exec(css)?.[0];
  if (!url) throw new Error(`No TTF found for ${family} ${weight}`);
  return fetch(url).then((r) => r.arrayBuffer());
}

/** The bare mark, inlined so resvg never has to hit the filesystem. */
async function loadMark(): Promise<string> {
  const svg = await readFile(path.join(ROOT, "public/logo.svg"));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

const [display, body, bodySemibold, mark] = await Promise.all([
  loadFont("Space Grotesk", 700),
  loadFont("Instrument Sans", 400),
  loadFont("Instrument Sans", 600),
  loadMark(),
]);

const card = (
  <div
    style={{
      position: "relative",
      display: "flex",
      flexDirection: "column",
      width: "1200px",
      height: "630px",
      background: "#0D1117",
      fontFamily: "Instrument Sans",
    }}
  >
    {/* Brand gradient rule along the top edge */}
    <div
      style={{
        display: "flex",
        width: "1200px",
        height: "10px",
        background:
          "linear-gradient(90deg, #7a2e8f 0%, #c9306c 32%, #e8455e 55%, #f2743c 78%, #f6a73b 100%)",
      }}
    />

    {/* Warm glow bleeding out of the mark */}
    <div
      style={{
        position: "absolute",
        top: "5px",
        left: "-120px",
        display: "flex",
        width: "700px",
        height: "700px",
        background:
          "radial-gradient(circle at center, rgba(232,69,94,0.30) 0%, rgba(122,46,143,0.14) 38%, rgba(13,17,23,0) 66%)",
      }}
    />

    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        padding: "0 80px",
      }}
    >
      <div
        style={{
          display: "flex",
          width: "260px",
          marginRight: "56px",
          justifyContent: "center",
        }}
      >
        <img src={mark} width={244} height={284} alt="" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", width: "700px" }}>
        <div
          style={{
            fontFamily: "Space Grotesk",
            fontSize: "104px",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1,
            color: "#ffffff",
          }}
        >
          Plannr
        </div>

        <div
          style={{
            marginTop: "24px",
            fontSize: "31px",
            lineHeight: 1.38,
            color: "rgba(255,255,255,0.62)",
          }}
        >
          {TAGLINE}
        </div>

        <div style={{ display: "flex", marginTop: "38px" }}>
          {CHIPS.map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                marginRight: "12px",
                padding: "11px 22px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                fontSize: "22px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.74)",
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const png = await new ImageResponse(card, {
  width: 1200,
  height: 630,
  fonts: [
    { name: "Space Grotesk", data: display, weight: 700, style: "normal" },
    { name: "Instrument Sans", data: body, weight: 400, style: "normal" },
    {
      name: "Instrument Sans",
      data: bodySemibold,
      weight: 600,
      style: "normal",
    },
  ],
}).arrayBuffer();

await writeFile(path.join(ROOT, "public/og.png"), Buffer.from(png));
console.log(`public/og.png — ${(png.byteLength / 1024).toFixed(0)} KB`);
