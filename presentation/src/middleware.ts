import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_COOKIE,
  authCookie,
  cookieOpens,
  deckSecret,
  OPEN_WITHOUT_SECRET,
  safeNext,
} from "~/lock/totp";

/*
 * The deck's lock. Until a browser has matched a code from the authenticator
 * app (app/api/unlock), every page sends it to /unlock and every other file,
 * the deck's JavaScript and its pictures, answers 401: the slides are in those
 * files, so they stay on the server as well. Open to anyone is only what the
 * unlock page needs: the page, the endpoint its form posts to, the
 * stylesheets, the fonts and the mark. Without a secret, a development server
 * is open and a production one stays shut (OPEN_WITHOUT_SECRET).
 */
const OPEN = [
  /^\/unlock\/?$/,
  /^\/api\/unlock\/?$/,
  // Stylesheets only (a dev server keeps them among the chunks), never the
  // scripts beside them.
  /^\/_next\/static\/(css|chunks)\/[^/]+\.css$/,
  /^\/_next\/static\/media\/[^/]+\.(woff2?|ttf|otf)$/,
  /^\/(favicon\.(ico|svg)|logo\.svg)$/,
];

export async function middleware(req: NextRequest) {
  if (!deckSecret() && OPEN_WITHOUT_SECRET) return NextResponse.next();
  const { pathname, search, protocol } = req.nextUrl;
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const open = await cookieOpens(token);
  const page =
    req.method === "GET" &&
    (req.headers.get("accept") ?? "").includes("text/html");

  if (/^\/unlock\/?$/.test(pathname) && open)
    return NextResponse.redirect(
      new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url),
    );
  if (OPEN.some((re) => re.test(pathname))) return NextResponse.next();

  if (open) {
    const res = NextResponse.next();
    // Each visit renews the cookie, so a browser that keeps coming back
    // never meets the 400-day cap.
    if (page && token)
      res.cookies.set(AUTH_COOKIE, token, authCookie(protocol === "https:"));
    return res;
  }
  if (page) {
    const url = req.nextUrl.clone();
    url.pathname = "/unlock";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return new NextResponse("Locked", {
    status: 401,
    headers: { "cache-control": "no-store" },
  });
}
