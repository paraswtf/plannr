import { NextResponse, type NextRequest } from "next/server";

import { isAppRoute } from "~/lib/role-nav";

/**
 * Optimistic redirect only.
 *
 * Sessions live in Postgres and Prisma cannot run on the Edge, so this cannot
 * verify anything — it just spares a signed-out visitor a render before the
 * redirect. The real gates are the `(app)` server layout (which calls `auth()`
 * and checks the role) and the tRPC procedures, which are what actually protect
 * data. Three layers: middleware for feel, layout for the page, tRPC for truth.
 */

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isAppRoute(pathname)) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some(
    (name) => request.cookies.get(name)?.value,
  );
  if (hasSession) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
