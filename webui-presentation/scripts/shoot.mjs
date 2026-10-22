#!/usr/bin/env node
/**
 * Screenshots of slides with no server: reads the static export in out/ and
 * serves it to headless Chromium through Playwright route interception.
 *
 *   npx next build                                   # writes out/
 *   SHOTS_DIR=/some/dir node scripts/shoot.mjs 1 2   # slide numbers (1-based) or ids
 *
 * No numbers: every slide. One PNG per build: NN-id-sK.png. Each slide is
 * reached from the previous one's last build so its morph plays as live.
 * Env: SHOTS_DIR (required), SPEED (GSAP timescale, default 4), WAIT (ms, 900).
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out");
const dest = process.env.SHOTS_DIR;
if (!dest) throw new Error("Set SHOTS_DIR to the folder for the PNGs.");
if (!existsSync(path.join(out, "index.html")))
  throw new Error("No out/ folder: run `npx next build` first.");
const speed = Number(process.env.SPEED ?? 4);
const wait = Number(process.env.WAIT ?? 900);
const only = process.argv.slice(2);

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/x-component",
  ".json": "application/json",
};
const HOST = "http://deck.test";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
});
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== HOST) return route.abort();
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  else if (!path.extname(p)) p += ".html";
  const file = path.join(out, p);
  if (!file.startsWith(out) || !existsSync(file))
    return route.fulfill({ status: 404, body: "not found" });
  route.fulfill({
    status: 200,
    contentType: TYPES[path.extname(file)] ?? "application/octet-stream",
    body: readFileSync(file),
  });
});
const page = await context.newPage();
page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") console.error(`[console.error] ${m.text()}`);
});
await page.goto(`${HOST}/?speed=${speed}`);
await page.waitForFunction(() => window.__deck?.ready === true, null, {
  timeout: 60_000,
});
await page.evaluate(() => document.fonts.ready);

const slides = await page.evaluate(() => window.__deck.slides);
const wanted = only.length
  ? only.map((k) => {
      const hit = /^\d+$/.test(k)
        ? slides[Number(k) - 1]
        : slides.find((s) => s.id === k);
      if (!hit) throw new Error(`No slide "${k}"`);
      return hit;
    })
  : slides;
await mkdir(dest, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

for (const s of wanted) {
  if (s.index > 0) {
    const before = slides[s.index - 1];
    await page.evaluate(
      ([i, st]) => window.__deck.go(i, st, true),
      [before.index, before.steps - 1],
    );
    await pause(wait);
    await page.evaluate(() => window.__deck.next());
  } else {
    await page.evaluate(() => window.__deck.go(0, 0, true));
  }
  for (let step = 0; step < s.steps; step++) {
    if (step > 0) await page.evaluate(() => window.__deck.next());
    await pause(wait);
    const file = path.join(
      dest,
      `${String(s.index + 1).padStart(2, "0")}-${s.id}-s${step}.png`,
    );
    await page.screenshot({ path: file });
    console.log(file);
  }
}
await browser.close();
