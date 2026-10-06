#!/usr/bin/env node
/**
 * Sets up the deck's lock: a secret for an authenticator app, saved in
 * .env.local (git ignores it), and a QR code to scan into the app once.
 *
 *   npm run lock:setup              # first time: a new secret, and its QR
 *   npm run lock:setup              # again: the same QR, to add another phone
 *   npm run lock:setup -- --rotate  # a new secret; every browser locks again
 *
 * The secret stays on the server: the middleware and /api/unlock read it, and
 * no page or script ever carries it. The dev server picks the change up by
 * itself; for a hosted copy, set DECK_TOTP_SECRET in the host's environment.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import QRCode from "qrcode";

const KEY = "DECK_TOTP_SECRET";
/** The name the first, client-side version of the lock used. */
const OLD_KEY = "NEXT_PUBLIC_DECK_TOTP_SECRET";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env.local");
const rotate = process.argv.includes("--rotate");

function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

const lines = existsSync(envFile)
  ? readFileSync(envFile, "utf8").split("\n")
  : [];
// A secret under the old, public name was in the deck's JavaScript, so it is
// not carried over: it goes, and a new one is made below.
const old = lines.findIndex((l) => l.startsWith(`${OLD_KEY}=`));
if (old >= 0) lines.splice(old, 1);
const at = lines.findIndex((l) => l.startsWith(`${KEY}=`));
let secret = at >= 0 ? lines[at].slice(KEY.length + 1).trim() : "";

if (!secret || rotate || old >= 0) {
  secret = base32(randomBytes(20));
  const line = `${KEY}=${secret}`;
  if (at >= 0) lines[at] = line;
  else lines.splice(lines.at(-1) === "" ? -1 : lines.length, 0, line);
  writeFileSync(envFile, `${lines.join("\n").replace(/\n*$/, "")}\n`);
  console.log(
    old >= 0
      ? "\nThe old secret had been in the deck's JavaScript, so .env.local has a new\none. Scan it below, and delete the old entry from your app."
      : rotate && at >= 0
        ? "\nA new secret is in .env.local. Every browser is locked again."
        : "\nThe deck's secret is in .env.local.",
  );
} else {
  console.log("\nThe deck already has a secret; here it is again.");
}

const uri = `otpauth://totp/Plannr:Presenting%20Plannr?secret=${secret}&issuer=Plannr&algorithm=SHA1&digits=6&period=30`;
console.log(
  "\nScan this with your authenticator app (Google Authenticator, Authy, 1Password…):\n",
);
console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
console.log(`Or type the key in: ${secret.match(/.{1,4}/g).join(" ")}\n`);
console.log(
  "The deck asks for the app's six digits once per browser. The dev server\n" +
    "picks this up by itself; restart `npm start`, or set DECK_TOTP_SECRET on\n" +
    "the host and redeploy, for a running copy.\n",
);
