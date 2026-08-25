import { handleApiRequest } from "~/server/rest/handler";

/**
 * The whole public API's front door.
 *
 * A single optional catch-all rather than a file per endpoint, because the
 * endpoints are declared data (`src/server/rest/registry.ts`) and adding one
 * should not mean adding a file. Everything of substance happens in
 * `handleApiRequest`; this file exists to satisfy Next's routing and to answer
 * the one thing that must be answered before any of that: a CORS preflight.
 */

/**
 * Nothing here is cacheable: every response depends on a credential, and a
 * cached one would be another caller's answer.
 */
export const dynamic = "force-dynamic";

/**
 * Node, not edge. Token verification uses `node:crypto` and every route ends up
 * in Prisma, neither of which the edge runtime provides.
 */
export const runtime = "nodejs";

/**
 * Why `*` is the right answer here, and why the cookie fallback does not make
 * it the wrong one.
 *
 * A wildcard origin and credentials are mutually exclusive by specification: a
 * browser will not attach cookies to a cross-origin request unless the response
 * carries `Access-Control-Allow-Credentials: true` and names the origin
 * exactly. This one says neither and never will, so no page on any other origin
 * can spend a visitor's Plannr session against this API. The session cookie is
 * `SameSite=Lax` besides, so it is not sent on a cross-site request to begin
 * with — the wildcard is the second lock rather than the only one.
 *
 * A bearer token is the opposite kind of credential. Nothing attaches it
 * automatically, so a page that has not been given the token cannot use it, and
 * there is no deputy to confuse. What the wildcard actually buys is a browser
 * being able to *read* the response — which is what makes the docs page, a
 * scratch fetch from a console, and a first-party dashboard on another domain
 * all work without anybody maintaining a list of origins.
 *
 * The consequence, and it is the important half: the cookie path is a
 * same-origin convenience for a person who already has a tab open, and no
 * integration may be built on it. From another origin the cookie will simply
 * not be there, whatever these headers say. Apps send a key.
 *
 * Only `Authorization` and `Content-Type` are allowed through. They are the two
 * an API client genuinely needs, and refusing the rest keeps the preflight a
 * statement about this API rather than a rubber stamp on whatever a caller
 * felt like adding.
 */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  // Rate-limit headers are useless to a browser client that cannot read them,
  // and they are the ones a client most needs to back off politely.
  "Access-Control-Expose-Headers":
    "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
};

const PREFLIGHT: Record<string, string> = {
  ...CORS,
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

async function handle(request: Request): Promise<Response> {
  const response = await handleApiRequest(request);
  for (const [name, value] of Object.entries(CORS)) {
    response.headers.set(name, value);
  }
  return response;
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
export const HEAD = handle;

/**
 * Answered here rather than in the handler because a preflight is a question
 * about the transport and not about the API: it carries no credential, and it
 * is sent for paths that may not exist. Routing it would mean 401ing or 404ing
 * the browser's question and never seeing the real request at all.
 */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: PREFLIGHT });
}
