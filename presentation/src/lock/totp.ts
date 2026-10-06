/*
 * Time-based one-time codes (RFC 6238), the six digits an authenticator app
 * shows, checked in the browser with Web Crypto. And the token a browser keeps
 * once it has matched one, so it stays unlocked from then on.
 *
 * The deck is a static site, so all of this runs on the client and the secret
 * ships in its JavaScript: the lock stops anyone who only has the link, not
 * someone who reads the bundle. See the README's "Locking the deck".
 */

/** The authenticator app's shared secret, set by `npm run lock:setup`. With
 * none, the deck is not locked. */
export const DECK_SECRET = process.env.NEXT_PUBLIC_DECK_TOTP_SECRET ?? "";

/** Where an unlocked browser keeps its token. */
export const UNLOCK_KEY = "plannr.deck.unlock";

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

/** Whether `code` is the app's code now, or one step either side of now (a
 * phone's clock can be half a minute out). */
export async function codeMatches(
  secret: Uint8Array<ArrayBuffer>,
  code: string,
  now = Date.now(),
) {
  const step = Math.floor(now / 1000 / STEP_SECONDS);
  for (const s of [step, step - 1, step + 1]) {
    if ((await codeAt(secret, s)) === code) return true;
  }
  return false;
}

/** What an unlocked browser keeps: derived from the secret, so setting up a
 * new secret locks every browser again. */
export async function unlockToken(secret: Uint8Array<ArrayBuffer>) {
  const mac = await hmac(
    "SHA-256",
    secret,
    new TextEncoder().encode("plannr-deck-unlocked"),
  );
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}
