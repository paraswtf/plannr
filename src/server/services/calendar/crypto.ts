/**
 * Sealing the Google refresh tokens before they are stored.
 *
 * A refresh token here is not a login credential — it is a standing permission
 * to write to somebody's calendar, redeemable by anyone holding it, for as long
 * as they never revoke it. A database backup or a leaked read-only replica
 * therefore has a very different meaning for this column than for the rest of
 * the schema, which is why it does not sit in plaintext next to everything else.
 *
 * AES-256-GCM: the tag makes it tamper-evident as well as unreadable, so a
 * modified ciphertext fails to open rather than decrypting to rubbish that gets
 * sent to Google.
 *
 * The stored form is `v1.<iv>.<tag>.<ciphertext>`, all base64url. The version
 * prefix is there so a key rotation has somewhere to say which key it used
 * without another migration.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { env } from "~/env";

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * The key, decoded and checked.
 *
 * Read on every call rather than at module load: the sync feature is off by
 * default, and a deployment that has not configured it must still be able to
 * import this module — the app boots, the connect button is simply absent.
 * Anything that actually reaches for a token gets a precise error instead of a
 * `undefined` key silently becoming a zero key.
 */
function key(): Buffer {
  const raw = env.CALENDAR_TOKEN_KEY;
  if (!raw) {
    throw new Error(
      "CALENDAR_TOKEN_KEY is not set. Google Calendar sync stores refresh " +
        "tokens sealed, so it cannot run without one: generate it with " +
        "`openssl rand -base64 32`.",
    );
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `CALENDAR_TOKEN_KEY must decode to ${KEY_BYTES} bytes, got ${decoded.length}. ` +
        "Generate it with `openssl rand -base64 32`.",
    );
  }
  return decoded;
}

/** Whether a usable key is configured, for the startup check. */
export function hasTokenKey(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function seal(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

export function open(sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4) {
    throw new Error("Sealed token is malformed.");
  }
  const [version, iv, tag, body] = parts as [string, string, string, string];
  // Compared byte-wise so a future `v2` cannot be coerced into the v1 path by
  // an attacker who can write to the column.
  const expected = Buffer.from(VERSION);
  const given = Buffer.from(version);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error(`Unknown sealed-token version: ${version}`);
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
