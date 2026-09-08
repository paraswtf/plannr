/**
 * Step two: Google sends them back here with a one-time code.
 *
 * Everything that can go wrong ends the same way — back on the calendar
 * settings screen with a `calendar=` reason in the query, which the page turns
 * into a sentence. A
 * blank screen or a raw stack trace is the worst possible answer to "I clicked
 * connect and something went wrong", and none of these failures is the user's
 * fault to debug.
 */

import { NextResponse, type NextRequest } from "next/server";

import { appUrl } from "~/env";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  CALENDAR_SCOPE,
  exchangeCode,
  identityFromIdToken,
} from "~/server/services/calendar/google";
import { decodeState } from "~/server/services/calendar/oauth";
import { recordConnection, syncEnabled } from "~/server/services/calendar/sync";

function back(reason: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/settings/calendar?calendar=${reason}`, appUrl),
  );
}

export async function GET(request: NextRequest) {
  if (!syncEnabled()) return back("disabled");

  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  const params = request.nextUrl.searchParams;

  // The person pressed "cancel" on the consent screen. Not an error, and it
  // must not read like one.
  if (params.get("error")) return back("declined");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back("failed");

  // Signed by us, recent, and — the part that matters — for *this* session. A
  // consent link mailed to somebody else cannot attach their Google account to
  // the account that opened it.
  const stateUserId = decodeState(state);
  if (!stateUserId || stateUserId !== session.user.id) return back("failed");

  try {
    const tokens = await exchangeCode(code);

    // Consent is granular: Google will happily return a token with the calendar
    // box unticked. Writing would then fail on every single event, which is a
    // much worse way to find out than saying so now.
    if (!tokens.scope?.includes(CALENDAR_SCOPE)) return back("scope");

    // Only issued on first consent. Without one we can refresh nothing and the
    // sync would die silently within the hour, so refusing to record the
    // connection is the honest outcome — `prompt=consent` is meant to
    // guarantee this, and if it did not, retrying is the fix.
    if (!tokens.refresh_token) return back("norefresh");

    const identity = tokens.id_token
      ? identityFromIdToken(tokens.id_token)
      : null;
    if (!identity) return back("failed");

    // They are signed into Plannr as one person and consented as another. We
    // would be writing this person's timetable into somebody else's calendar.
    if (
      session.user.email &&
      identity.email !== session.user.email.toLowerCase()
    ) {
      return back("mismatch");
    }

    await recordConnection(db, {
      userId: session.user.id,
      orgId: session.user.orgId,
      googleSub: identity.sub,
      googleEmail: identity.email,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresInSeconds: tokens.expires_in,
    });

    return back("connected");
  } catch {
    return back("failed");
  }
}
