/**
 * Where a push notification's tap lands.
 *
 * A route rather than a link straight to the news because a tap is the person
 * reading it, and the service worker that shows the push cannot call tRPC on
 * their behalf: this marks the row read with the session cookie the tap
 * carries, then sends them on to what it was about. It is a GET because a
 * notification can only open a URL.
 */

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/**
 * Only a path on this site. The url column is written by the server, but this
 * route is reachable by anybody with a link, and a redirect that would follow
 * "//elsewhere" or a full address is an open redirect waiting for its first
 * bad row.
 */
function isLocalPath(url: string | null | undefined): url is string {
  // No whitespace, control characters or backslashes anywhere: browsers strip
  // tabs and newlines from a URL before reading it, so "/\t/elsewhere" would
  // arrive as "//elsewhere", and some read a backslash as a slash.
  return (
    typeof url === "string" &&
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !/[\s\\\u0000-\u001f\u007f]/.test(url)
  );
}

/**
 * A redirect to a path on this site, written as the path alone. The browser
 * resolves it against the address the tap arrived at, so a deployment reached
 * by more than one name (or a dev server on 127.0.0.1) keeps the person on the
 * host their session cookie belongs to.
 */
function goTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const here = `/api/notifications/${encodeURIComponent(id)}/open`;

  const session = await auth();
  if (!session?.user) {
    return goTo(`/login?${new URLSearchParams({ callbackUrl: here })}`);
  }

  // Both scoped to the person signed in, so somebody else's id marks nothing
  // and reveals nothing: it lands on the inbox like a row with no link.
  await db.notification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  const row = await db.notification.findFirst({
    where: { id, userId: session.user.id },
    select: { url: true },
  });

  return goTo(isLocalPath(row?.url) ? row.url : "/notifications");
}
