import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_COOKIE,
  authCookie,
  base32ToBytes,
  codeStep,
  deckSecret,
  safeNext,
  unlockToken,
} from "~/lock/totp";

/*
 * What the lock remembers, in this server's memory since there is no
 * database: the wrong codes of the last fifteen minutes, and the step of the
 * last code that worked. Eight misses from one address, or forty from
 * everyone together (an address can be forged), and the form makes people
 * wait, which keeps six digits slow to guess; an unlocked browser never meets
 * the wait. A code opens the deck once, so one read off a projected screen is
 * already spent. On the presenting laptop this is the whole server; on a host,
 * each instance keeps its own.
 */
let misses: { who: string; at: number }[] = [];
let lastStep = -1;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_MISSES = 8;
const MAX_MISSES_ALL = 40;

/** The unlock form posts here: a matching code earns the cookie. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => new FormData());
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const next = safeNext(field("next"));
  const to = (path: string) =>
    NextResponse.redirect(new URL(path, req.url), 303);
  const retry = (error: "code" | "used" | "wait") =>
    to(`/unlock?error=${error}&next=${encodeURIComponent(next)}`);
  // With no secret the middleware decides: open in development, shut in
  // production.
  const secret = deckSecret();
  if (!secret) return to(next);

  const who =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  misses = misses.filter((miss) => now - miss.at < WINDOW_MS);
  if (
    misses.length >= MAX_MISSES_ALL ||
    misses.filter((miss) => miss.who === who).length >= MAX_MISSES
  )
    return retry("wait");
  // Counted as a miss before the code is checked, which waits on crypto:
  // otherwise a burst of guesses sent at once would all pass the limit above
  // before any of them was counted.
  misses.push({ who, at: now });

  const key = base32ToBytes(secret);
  const step = await codeStep(key, field("code").replace(/\D/g, ""));
  if (step === null) return retry("code");
  if (step <= lastStep) return retry("used");
  lastStep = step;
  misses = misses.filter((miss) => miss.who !== who);
  const res = to(next);
  res.cookies.set(
    AUTH_COOKIE,
    await unlockToken(key),
    authCookie(req.nextUrl.protocol === "https:"),
  );
  return res;
}
