/**
 * The consent round trip, and why it is ours rather than NextAuth's.
 *
 * Sign-in asks for the narrowest scopes that identify somebody. Calendar
 * writing is a much larger thing to hand over, most people will never want it,
 * and asking for it at the door would mean everyone — including the students
 * who only ever read their timetable — approving calendar access to log in at
 * all. So it is a second, later, entirely optional consent, and revoking it
 * leaves the login untouched.
 *
 * Google is handed a `state` we can verify on the way back. It is signed rather
 * than stored: the round trip is stateless, no table needs cleaning up, and a
 * forged callback cannot bind somebody else's Google account to this session.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "~/env";

/** A consent link is useless after this, which bounds a replay to a few minutes. */
const STATE_TTL_MS = 10 * 60_000;

function secret(): string {
  // In development `AUTH_SECRET` is optional; the client secret is always
  // present and is no less secret, so it stands in rather than letting the
  // state go unsigned.
  return env.AUTH_SECRET ?? env.AUTH_GOOGLE_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** `<userId>.<issuedAt>.<signature>`, opaque to Google and to the browser. */
export function encodeState(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * The user this callback belongs to, or null if it cannot be trusted.
 *
 * Returning null rather than throwing: every failure here — tampering, an
 * expired link, a stray request from somewhere — ends the same way, with the
 * person sent back to the schedule and nothing connected.
 */
export function decodeState(state: string, now = Date.now()): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAt, signature] = parts as [string, string, string];

  const expected = Buffer.from(sign(`${userId}.${issuedAt}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  const issued = Number(issuedAt);
  if (!Number.isFinite(issued) || now - issued > STATE_TTL_MS || issued > now) {
    return null;
  }
  return userId;
}
