import "server-only";

import { TRPCError } from "@trpc/server";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { auth } from "~/server/auth";
import { errorResponse, fromThrown } from "~/server/rest/errors";

/**
 * What the paper routes share: a tRPC caller for the person signed in, and
 * errors turned into responses.
 *
 * These routes carry files, which tRPC's JSON cannot, and nothing else. Every
 * rule (who may open a paper, when a page may be seen) lives in the
 * procedures they call, so a route can be wrong about nothing but bytes.
 */

/**
 * A caller for the browser's own session, or null when nobody is signed in.
 * It carries the request's signal, so typesetting still waiting when the
 * browser goes away is dropped rather than run for nobody.
 */
export async function sessionCaller(request: Request) {
  const session = await auth();
  if (!session?.user) return null;
  return createCaller(
    await createTRPCContext({ headers: request.headers, session }),
    { signal: request.signal },
  );
}

export const signedOut = () =>
  errorResponse(
    401,
    "UNAUTHORIZED",
    "You are signed out. Sign in to Plannr and try again.",
  );

/**
 * Refuses a form posted from another site. The session cookie is SameSite=Lax,
 * which already keeps it off a cross-site POST; this is the second lock, for
 * a browser that ignores that.
 */
export function crossSite(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  // A chain of proxies may list several hosts; the first is the browser's.
  const host = (
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  )
    ?.split(",")[0]
    ?.trim();
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (host && originHost === host) return null;
  return errorResponse(
    403,
    "FORBIDDEN",
    "This request came from another site. Open the paper from Plannr itself.",
  );
}

/** A thrown procedure error as a JSON response, with the status its code means. */
export function jsonError(error: unknown): Response {
  const { status, body } = fromThrown(error);
  return errorResponse(
    status,
    body.error.code,
    body.error.message,
    body.error.details,
    { "cache-control": "no-store" },
  );
}

/**
 * The same, as plain text, for responses a browser shows in a tab of their
 * own (a printed paper, a page image) where JSON would be noise.
 */
export function textError(error: unknown): Response {
  const { status, body } = fromThrown(error);
  return new Response(body.error.message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const badRequest = (message: string) =>
  new TRPCError({ code: "BAD_REQUEST", message });

/** `inline` with the file's name, in both the old and the UTF-8 form. */
export function inlineDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
