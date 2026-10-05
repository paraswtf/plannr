#!/usr/bin/env node
/**
 * Screenshots of the built deck, one PNG per slide and build.
 *
 *   npm run build
 *   npm run snapshot                          # every slide, every build
 *   npm run snapshot -- --slides students-ranking,findings
 *   npm run snapshot -- --steps last --dest ~/Desktop/deck
 *   npm run snapshot -- --slides combined --mid   # plus a frame mid-morph
 *
 * No server is started: the exported files in out/ are handed to the browser
 * straight from disk, through Playwright's request interception. Each slide
 * is reached the way a presenter reaches it — from the previous slide's last
 * build, with its morph — so the pictures show what the audience sees.
 *
 * Options
 *   --out <dir>       the static export to read (default: out)
 *   --dest <dir>      where to write PNGs (default: snapshots)
 *   --slides <list>   comma-separated slide ids or 1-based numbers (default: all)
 *   --steps <which>   all | first | last (default: all)
 *   --speed <n>       GSAP time scale while capturing (default: 3)
 *   --wait <ms>       settle time after each move, at that speed (default: 900)
 *   --mid             also capture each arrival halfway through its morph
 *   --scale <n>       device pixel ratio (default: 1; 2 for retina-sharp)
 *   --hide-placeholders  render without the dashed placeholder marks
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value === undefined || value.startsWith("--") ? true : value;
}

const outDir = path.resolve(root, String(arg("out", "out")));
const dest = path.resolve(root, String(arg("dest", "snapshots")));
const only = arg("slides", "");
const which = String(arg("steps", "all"));
const speed = Number(arg("speed", 3));
const wait = Number(arg("wait", 900));
const mid = Boolean(arg("mid", false));
const scale = Number(arg("scale", 1));
const hidePh = Boolean(arg("hide-placeholders", false));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const ORIGIN = "http://deck.local";

async function serve(route) {
  const url = new URL(route.request().url());
  let file = decodeURIComponent(url.pathname);
  if (file.endsWith("/")) file += "index.html";
  if (!path.extname(file)) file += ".html";
  try {
    const body = await readFile(path.join(outDir, file));
    await route.fulfill({
      status: 200,
      body,
      contentType: TYPES[path.extname(file)] ?? "application/octet-stream",
    });
  } catch {
    await route.fulfill({ status: 404, body: "not found" });
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: scale,
});
page.on("pageerror", (e) => console.error(`  [page error] ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    console.error(`  [console.${m.type()}] ${m.text()}`);
  }
});
await page.route(`${ORIGIN}/**`, serve);
// Fonts come from the export; anything else external is not needed.
await page.route(/^https?:\/\/(?!deck\.local)/, (route) => route.abort());

const query = `?speed=${speed}${hidePh ? "&placeholders=hidden" : ""}`;
await page.goto(`${ORIGIN}/${query}`);
await page.waitForFunction(() => window.__deck?.ready === true, null, {
  timeout: 30_000,
});
await page.evaluate(() => document.fonts.ready);

/** @type {{id: string, index: number, steps: number, title: string}[]} */
const slides = await page.evaluate(() => window.__deck.slides);
const wanted = only
  ? String(only)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((key) => {
        const hit = /^\d+$/.test(key)
          ? slides[Number(key) - 1]
          : slides.find((s) => s.id === key);
        if (!hit) throw new Error(`No slide "${key}"`);
        return hit;
      })
  : slides;

if (!only) await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const name = (s, suffix) =>
  path.join(
    dest,
    `${String(s.index + 1).padStart(2, "0")}-${s.id}-${suffix}.png`,
  );

for (const s of wanted) {
  // Stand on the slide before, at its last build, then step forward into
  // this one, so the arrival morph plays exactly as in the room.
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

  if (mid && s.index > 0) {
    await page
      .waitForFunction(() => window.__deck.transition() !== null, null, {
        timeout: 5_000,
      })
      .catch(() => {});
    const paused = await page.evaluate(() => {
      const tl = window.__deck.transition();
      if (!tl) return false;
      tl.pause();
      tl.progress(0.5);
      return true;
    });
    if (paused) {
      await page.screenshot({ path: name(s, "mid") });
      await page.evaluate(() => {
        window.__deck.transition()?.resume();
      });
    }
  }

  const steps = Array.from({ length: s.steps }, (_, i) => i);
  const shots =
    which === "first" ? [0] : which === "last" ? [s.steps - 1] : steps;
  for (const step of steps) {
    if (step > 0) await page.evaluate(() => window.__deck.next());
    if (!shots.includes(step)) continue;
    await pause(wait);
    await page.screenshot({ path: name(s, `s${step}`) });
  }
  console.log(
    `${String(s.index + 1).padStart(2, "0")} ${s.id} (${s.steps} build${s.steps > 1 ? "s" : ""})`,
  );
}

await browser.close();
console.log(
  `\n${wanted.length} slide(s) → ${path.relative(process.cwd(), dest) || dest}`,
);
