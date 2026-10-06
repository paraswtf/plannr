#!/usr/bin/env node
/**
 * Screenshots of the deck, one PNG per slide and build, taken from a running
 * copy of it: the dev server you already have open, or `npm start` after a
 * build. It starts no server of its own.
 *
 *   npm run snapshot                          # every slide, every build
 *   npm run snapshot -- --slides students-ranking,findings
 *   npm run snapshot -- --steps last --dest ~/Desktop/deck
 *   npm run snapshot -- --slides combined --mid   # plus a frame mid-morph
 *
 * Each slide is reached the way a presenter reaches it — from the previous
 * slide's last build, with its morph — so the pictures show what the
 * audience sees. A locked deck opens by itself: the script carries the cookie
 * an unlocked browser has, worked out from the secret in .env.local.
 *
 * Options
 *   --url <url>       the running deck (default: http://localhost:3001)
 *   --dest <dir>      where to write PNGs (default: snapshots)
 *   --slides <list>   comma-separated slide ids or 1-based numbers (default: all)
 *   --steps <which>   all | first | last (default: all)
 *   --speed <n>       GSAP time scale while capturing (default: 3)
 *   --wait <ms>       settle time after each move, at that speed (default: 900)
 *   --mid             also capture each arrival halfway through its morph
 *   --scale <n>       device pixel ratio (default: 1; 2 for retina-sharp)
 *   --hide-placeholders  render without the dashed placeholder marks
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
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

const origin = new URL(String(arg("url", "http://localhost:3001"))).origin;
const dest = path.resolve(root, String(arg("dest", "snapshots")));
const only = arg("slides", "");
const which = String(arg("steps", "all"));
const speed = Number(arg("speed", 3));
const wait = Number(arg("wait", 900));
const mid = Boolean(arg("mid", false));
const scale = Number(arg("scale", 1));
const hidePh = Boolean(arg("hide-placeholders", false));

/** The cookie a browser earns by matching a code (src/lock/totp.ts). */
function unlockCookie() {
  const secret =
    process.env.DECK_TOTP_SECRET ??
    (() => {
      const file = path.join(root, ".env.local");
      if (!existsSync(file)) return "";
      const line = readFileSync(file, "utf8")
        .split("\n")
        .find((l) => l.startsWith("DECK_TOTP_SECRET="));
      return line ? line.slice("DECK_TOTP_SECRET=".length).trim() : "";
    })();
  if (!secret) return null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const char of secret.toUpperCase().replace(/[\s=-]/g, "")) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  const token = createHmac("sha256", Buffer.from(bytes))
    .update("plannr-deck-unlocked")
    .digest("hex");
  return { name: "plannr_deck", value: token, url: origin };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: scale,
});
const cookie = unlockCookie();
if (cookie) await context.addCookies([cookie]);
const page = await context.newPage();
page.on("pageerror", (e) => console.error(`  [page error] ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    console.error(`  [console.${m.type()}] ${m.text()}`);
  }
});

const query = `?speed=${speed}${hidePh ? "&placeholders=hidden" : ""}`;
await page.goto(`${origin}/${query}`);
await page.waitForFunction(() => window.__deck?.ready === true, null, {
  timeout: 60_000,
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
