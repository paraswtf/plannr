/**
 * Minting and checking the credential itself.
 *
 * A token looks like this, and its three parts each have a job:
 *
 *   plk_live_9f3c1a7b.Xk2p…64 more characters
 *   └──┬───┘ └───┬──┘ └────────────┬────────────┘
 *    scheme   prefix            secret
 *
 * The prefix is a public, indexed handle. It is what makes verification one
 * `findUnique` rather than a scan over every key hashing each candidate, it is
 * what the console can show you next to a name, and it is safe in a log line.
 * The secret half is 256 bits of CSPRNG output, shown once and stored only as
 * a SHA-256 digest.
 *
 * SHA-256 and not bcrypt on purpose. Password hashes are slow because passwords
 * are low-entropy and guessable; this secret is 256 random bits, so there is no
 * dictionary to run and nothing to slow down. What matters instead is that
 * verification is fast enough to sit in front of every API request, and that
 * the comparison is constant-time — which it is, below.
 *
 * The scheme segment carries no meaning today beyond making a leaked token
 * greppable: "plk_live_" in a paste is unambiguously one of ours, which is what
 * secret-scanners key off.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Marks a string as one of ours, for humans and for secret scanners. */
export const TOKEN_SCHEME = "plk_live";

/** Characters in the public prefix, after the scheme. */
const PREFIX_BYTES = 4; // → 8 hex characters
/** Bytes of entropy in the secret half. */
const SECRET_BYTES = 32; // → 256 bits, 43 characters base64url

const TOKEN_PATTERN = new RegExp(
  `^${TOKEN_SCHEME}_([0-9a-f]{${PREFIX_BYTES * 2}})\\.([A-Za-z0-9_-]{20,})$`,
);

export interface MintedKey {
  /** The whole token. Shown once, never stored, never recoverable. */
  token: string;
  /** Public handle, unique per key, safe to display and to log. */
  prefix: string;
  /** SHA-256 of the secret half, hex — this is what goes in the database. */
  hash: string;
  /** Tail of the secret, so a list can read "…7f2a" without holding the key. */
  last4: string;
}

/** A fresh credential. The caller is responsible for showing `token` once. */
export function mintKey(): MintedKey {
  const prefix = randomBytes(PREFIX_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");

  return {
    token: `${TOKEN_SCHEME}_${prefix}.${secret}`,
    prefix,
    hash: hashSecret(secret),
    last4: secret.slice(-4),
  };
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export interface ParsedToken {
  prefix: string;
  secret: string;
}

/**
 * Splits a presented token, or null if it is not shaped like one of ours.
 *
 * Rejecting on shape before touching the database is what stops a malformed
 * `Authorization` header — or a deliberate flood of them — turning into a
 * query each.
 */
export function parseToken(token: string): ParsedToken | null {
  const match = TOKEN_PATTERN.exec(token.trim());
  if (!match) return null;
  return { prefix: match[1]!, secret: match[2]! };
}

/**
 * Constant-time digest comparison.
 *
 * Both sides are hashed first, so the buffers are always 32 bytes and
 * `timingSafeEqual` never throws on a length mismatch — which would itself be
 * an oracle for the length of the stored value.
 */
export function verifySecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), "hex");
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, "hex");
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Reads a bearer token out of an `Authorization` header, if there is one. */
export function bearerFrom(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  const value = rest.join(" ").trim();
  return value.length > 0 ? value : null;
}

/**
 * The address given to a key's service principal.
 *
 * `.invalid` is reserved by RFC 2606 and resolves nowhere, so nothing can ever
 * be delivered to it. It also cannot pass the Workspace-domain check in the
 * sign-in callback, which means these rows are unable to log in even if one
 * ever acquired an OAuth account by accident.
 */
export const servicePrincipalEmail = (prefix: string): string =>
  `svc-${prefix}@api.plannr.invalid`;
