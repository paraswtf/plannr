/**
 * Step one of connecting a calendar: send the person to Google's consent
 * screen.
 *
 * A route rather than a tRPC mutation because the outcome is a redirect the
 * browser must follow to a third party, which is not something a JSON API call
 * can do. The link is generated per request so the signed `state` is fresh.
 */

import { NextResponse } from "next/server";

import { auth } from "~/server/auth";
import { consentUrl } from "~/server/services/calendar/google";
import { encodeState } from "~/server/services/calendar/oauth";
import { syncEnabled } from "~/server/services/calendar/sync";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));
  }
  if (!syncEnabled()) {
    return NextResponse.redirect(
      new URL("/schedule?calendar=disabled", process.env.NEXT_PUBLIC_APP_URL),
    );
  }

  // The address is a hint to Google's account chooser only: it preselects the
  // Workspace account rather than whichever personal one they used last. What
  // actually gets connected is checked on the way back.
  return NextResponse.redirect(
    consentUrl(encodeState(session.user.id), session.user.email ?? undefined),
  );
}
