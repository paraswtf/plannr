/*
 * The deck's lock, checked on the server: time-based one-time codes (RFC
 * 6238), the six digits an authenticator app shows, and the cookie a browser
 * keeps once it has matched one. Web Crypto only, so the same code runs in the
 * middleware (src/middleware.ts) and in the unlock route (app/api/unlock).
 *
 * Nothing here is imported by a client component: the secret never leaves the
 * server. See the README's "Locking the deck".
 */

/** The authenticator app's shared secret, set by `npm run lock:setup`. Read
 * per request, so a host's env applies. */
export const deckSecret = () => process.env.DECK_TOTP_SECRET?.trim() ?? "";

/** With no secret, a development server leaves the deck open, for work on the
 * slides, and a production one keeps it shut: a host that was never given the
 * secret shows nothing rather than everything. */
export const OPEN_WITHOUT_SECRET = process.env.NODE_ENV !== "production";

/** The cookie an unlocked browser carries. */
export const AUTH_COOKIE = "plannr_deck";

/** Browsers cap a cookie's life at 400 days; the middleware renews it on
 * every visit, so in practice it never runs out. */
export const AUTH_MAX_AGE = 400 * 24 * 60 * 60;

/** How the cookie is set: out of reach of the page's scripts, sent on
 * ordinary navigation, and only over https where the site is on https. */
export const authCookie = (https: boolean) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: AUTH_MAX_AGE,
  secure: https,
});

const STEP_SECONDS = 30;
const DIGITS = 6;

/** Base32 (RFC 4648), as authenticator apps write secrets, to bytes. */
export function base32ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error(`Not base32: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

async function hmac(
  hash: "SHA-1" | "SHA-256",
  key: Uint8Array<ArrayBuffer>,
  data: BufferSource,
) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
}

/** The code for one 30-second step (HOTP with that step as its counter). */
export async function codeAt(secret: Uint8Array<ArrayBuffer>, step: number) {
  const counter = new ArrayBuffer(8);
  const view = new DataView(counter);
  view.setUint32(0, Math.floor(step / 2 ** 32));
  view.setUint32(4, step >>> 0);
  const mac = await hmac("SHA-1", secret, counter);
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    ((mac[offset + 1] ?? 0) << 16) |
    ((mac[offset + 2] ?? 0) << 8) |
    (mac[offset + 3] ?? 0);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The step `code` belongs to, if it is the app's code now or one step
 * either side of now (a phone's clock can be half a minute out); else null. */
export async function codeStep(
  secret: Uint8Array<ArrayBuffer>,
  code: string,
  now = Date.now(),
) {
  const step = Math.floor(now / 1000 / STEP_SECONDS);
  let match: number | null = null;
  for (const s of [step - 1, step, step + 1]) {
    if (sameText(await codeAt(secret, s), code)) match = s;
  }
  return match;
}

/** What an unlocked browser's cookie holds: derived from the secret, so it
 * gives nothing of the secret away, and a new secret locks every browser. */
export async function unlockToken(secret: Uint8Array<ArrayBuffer>) {
  const mac = await hmac(
    "SHA-256",
    secret,
    new TextEncoder().encode("plannr-deck-unlocked"),
  );
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Equal strings, compared in time that does not depend on where they differ. */
export function sameText(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Whether a request's cookie opens the deck. */
export async function cookieOpens(value: string | undefined) {
  const secret = deckSecret();
  if (!secret) return OPEN_WITHOUT_SECRET;
  if (!value) return false;
  return sameText(value, await unlockToken(base32ToBytes(secret)));
}

/** Only a path on this site: `next` comes from the address bar. It is read
 * the way a browser will read it (which drops tabs and line breaks, so
 * "/\t/evil.com" means "//evil.com"), and anything that leaves the site, or
 * could, becomes "/". */
export function safeNext(next: string | null | undefined) {
  const site = "http://deck.invalid";
  try {
    const url = new URL(next ?? "/", site);
    if (url.origin === site && !url.pathname.startsWith("//"))
      return url.pathname + url.search + url.hash;
  } catch {
    // Not a URL at all.
  }
  return "/";
}
