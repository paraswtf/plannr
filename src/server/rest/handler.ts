import "server-only";

import type { Session } from "next-auth";

import { bitsToScopes } from "~/lib/api-scopes";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import {
  API_AUTH_FAILURE,
  authenticateApiKey,
  type ApiKeyIdentity,
  type RateVerdict,
} from "~/server/api-keys/authenticate";
import { appRouter, createCaller } from "~/server/api/root";
import { PERSONAL_SCOPES } from "~/server/api/routers/api-keys";
import { createTRPCContext } from "~/server/api/trpc";
import { auth } from "~/server/auth";
import { coerceInput, coerceQuery, inputSchemaOf } from "./coerce";
import { errorResponse, fromThrown } from "./errors";
import { buildOpenApiDocument } from "./openapi";
import { isRouteMatch, matchRoute } from "./registry";
import { toJson } from "./serialize";
import { inputSourceOf, type CompiledRoute } from "./types";

/**
 * Everything that happens between a request arriving at `/api/v1` and a
 * procedure being called.
 *
 * The shape of this file is the whole argument for the design. It authenticates,
 * it matches a route, it turns a URL and a body into one input object, and then
 * it calls the same tRPC procedure the browser calls. What it never does is
 * decide whether the caller may do the thing — that answer lives in the
 * procedure, once, and both doorways get it. The two refusals below that look
 * like authorisation (`requires_user` and `insufficient_scope`) are courtesies:
 * they turn an obscure failure into a legible one a few milliseconds earlier,
 * and if either were deleted tomorrow the API would still be exactly as safe.
 *
 * That property is worth defending when this file grows. A rule added here is a
 * rule the app itself does not have, and the first time the two disagree it
 * will be because somebody fixed the procedure and never thought to look in
 * here.
 *
 * The seam that makes it possible is `createTRPCContext`'s optional `session`.
 * A bearer token is verified here, exchanged for an ordinary `Session` whose
 * user is the key's service principal, and handed down. Below that line nothing
 * in the app knows or cares that the caller was not a person.
 */

/**
 * The URL prefix this handler is mounted at, stripped before matching so that
 * route templates read as the API's paths rather than the app's routing.
 */
const MOUNT = "/api/v1";

/**
 * Bodies are capped well below anything a legitimate call needs — the largest
 * input in the app is a bulk import of a few hundred rows. The cap exists so an
 * unauthenticated flood cannot make the server buffer megabytes per connection
 * while it is still deciding whether the credential is real.
 */
const MAX_BODY_BYTES = 1_000_000;

/**
 * What an uptime check is really asking is "is this deployment answering, and
 * which one is it?". A hand-maintained version string answers neither honestly,
 * because nobody remembers to bump it; the commit that is actually live does.
 */
const BUILD_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

/** Paths this handler answers itself, before the registry is consulted. */
const BUILT_INS = new Set(["/health", "/me", "/openapi.json"]);

export async function handleApiRequest(request: Request): Promise<Response> {
  // HEAD is answered by running the GET and dropping the body, so an endpoint
  // can never support one and not the other. Next synthesises this for a plain
  // GET export, but this file is a catch-all and has to do it itself.
  const isHead = request.method === "HEAD";

  try {
    const response = await dispatch(request, isHead ? "GET" : request.method);
    if (!isHead) return response;
    return new Response(null, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    // Nothing should reach here — every step below returns a Response — but an
    // unhandled rejection out of a route handler is a blank 500 with no log
    // line, which is the worst thing this API could do to somebody debugging.
    console.error(`[api] unhandled ${request.method} ${request.url}`, error);
    return thrown(error);
  }
}

async function dispatch(request: Request, method: string): Promise<Response> {
  const url = new URL(request.url);
  const pathname = normalise(url.pathname);
  const builtIn = BUILT_INS.has(pathname);

  // Answered before authentication on purpose: an uptime monitor should not
  // need a credential, and issuing one to a status page is how credentials end
  // up living in third-party dashboards.
  if (pathname === "/health" && method === "GET") {
    return json({ ok: true, version: BUILD_VERSION });
  }

  if (builtIn && method !== "GET") {
    return fail(
      405,
      "method_not_allowed",
      `${MOUNT}${pathname} is read-only.`,
      {
        headers: { Allow: "GET" },
      },
    );
  }

  const match = builtIn ? null : matchRoute(method, pathname);

  if (match !== null && !isRouteMatch(match)) {
    const allowed = match.allowed.join(", ");
    return fail(
      405,
      "method_not_allowed",
      `${method} is not allowed on ${MOUNT}${pathname}. This path accepts ${allowed}.`,
      { headers: { Allow: allowed } },
    );
  }

  if (!builtIn && match === null) {
    return fail(
      404,
      "not_found",
      `No endpoint at ${MOUNT}${pathname}. ${MOUNT}/openapi.json lists every endpoint this build serves; the three it cannot describe are itself, ${MOUNT}/health and ${MOUNT}/me.`,
    );
  }

  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;

  if (pathname === "/openapi.json") {
    return json(buildOpenApiDocument(originOf(request, url)), 200, {
      ...caller.headers,
      // The document changes only when the build does, and somebody who has
      // just authenticated to read it can be trusted to hold it for a minute.
      "cache-control": "private, max-age=300",
    });
  }

  if (pathname === "/me") {
    return json(describeCaller(caller), 200, caller.headers);
  }

  // Every other shape of `match` has returned by now; this narrows the type
  // without a cast and answers honestly in the impossible case.
  if (!isRouteMatch(match)) {
    return fail(404, "not_found", `No endpoint at ${MOUNT}${pathname}.`);
  }
  const { route, params } = match;

  const refusal = refuseActor(route, caller) ?? refuseScopes(route, caller);
  if (refusal) return refusal;

  const procedure = procedureFor(route);
  if (!procedure) {
    // The registry names a procedure that does not exist, which means one was
    // renamed and its route was not. There is nothing the caller can do about
    // that, so keep their half short and make the log line the useful one.
    console.error(
      `[api] ${route.method} ${route.path} names "${route.procedure}", which is not a procedure on appRouter`,
    );
    return misconfigured(caller);
  }

  const input = await buildInput(request, url, route, params, procedure);
  if (input instanceof Response) return withHeaders(input, caller.headers);

  try {
    // The request's signal goes with it, as in the paper routes, so a paper
    // still waiting to be typeset is dropped when its caller hangs up.
    const trpc = createCaller(
      await createTRPCContext({
        headers: request.headers,
        session: caller.session,
      }),
      { signal: request.signal },
    );

    const resolved = route.procedure
      .split(".")
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown>)[key],
        trpc,
      );

    if (typeof resolved !== "function") {
      console.error(
        `[api] "${route.procedure}" is not callable on the tRPC caller`,
      );
      return misconfigured(caller);
    }

    const invoke = resolved as (value?: unknown) => Promise<unknown>;
    const result = await invoke(input.value);

    const status = route.status ?? (result === undefined ? 204 : 200);
    if (status === 204) {
      return new Response(null, { status: 204, headers: caller.headers });
    }
    return json(toJson(result), status, caller.headers);
  } catch (error) {
    // The rate-limit headers describe the request that was spent, and it was
    // spent whether or not the procedure liked it. A client that only reads
    // them on success has no idea how close to the ceiling its failures are.
    return thrown(error, caller.headers);
  }
}

/** `/api/v1/rooms/` and `/api/v1/rooms` are the same endpoint. */
function normalise(pathname: string): string {
  const stripped = pathname.startsWith(MOUNT)
    ? pathname.slice(MOUNT.length)
    : pathname;
  const trimmed = stripped.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "/";
}

// ─── Authentication ─────────────────────────────────────────────────────────

interface AuthenticatedCaller {
  session: Session;
  /** Present only when the credential was a bearer token. */
  key: ApiKeyIdentity | null;
  rate: RateVerdict | null;
  /** Rate-limit headers, attached to every response this request produces. */
  headers: Record<string, string>;
}

/**
 * Establishes who is calling, or returns the refusal to send back.
 *
 * Two credentials are accepted and they are not equal partners. A bearer token
 * is what this API is for. The cookie fallback exists so that a person can
 * paste a URL into a browser tab and read the answer while they are learning
 * the API — a same-origin convenience, and nothing should be built on top of it
 * (the route file's CORS note explains why it cannot be, even if somebody
 * tried).
 */
async function authenticate(
  request: Request,
): Promise<AuthenticatedCaller | Response> {
  const result = await authenticateApiKey(
    request.headers,
    clientIp(request.headers),
  );

  if (result === null) {
    const session = await auth();
    if (!session?.user) {
      return fail(
        401,
        "unauthenticated",
        "This endpoint needs a credential. Send an API key as `Authorization: Bearer plk_live_<prefix>.<secret>`, or open the URL in a browser already signed in to Plannr on this origin.",
        { headers: { "WWW-Authenticate": challenge() } },
      );
    }
    return { session, key: null, rate: null, headers: {} };
  }

  if (!result.ok) {
    const { status, code, message } = API_AUTH_FAILURE[result.failure];
    const headers: Record<string, string> = {};
    if (result.retryAfterSeconds) {
      headers["Retry-After"] = String(result.retryAfterSeconds);
    }
    // RFC 6750: a 401 that does not name the scheme leaves a generic HTTP
    // client with nothing to act on. The 403s deliberately do not carry it —
    // the credential was understood, and presenting another one will not help.
    if (status === 401) headers["WWW-Authenticate"] = challenge(code);
    return fail(status, code, message, { headers });
  }

  return {
    session: result.session,
    key: result.key,
    rate: result.rate,
    headers: rateHeaders(result.rate),
  };
}

const challenge = (error?: string): string =>
  error === undefined
    ? 'Bearer realm="Plannr API"'
    : `Bearer realm="Plannr API", error="${error}"`;

/**
 * Both numbers are seconds, deliberately: `X-RateLimit-Reset` is a delay and
 * not a timestamp, so it says the same thing in the same unit as `Retry-After`
 * and a client needs no clock of its own to act on either.
 */
function rateHeaders(rate: RateVerdict): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(Math.max(0, rate.remaining)),
    "X-RateLimit-Reset": String(rate.resetSeconds),
  };
}

/**
 * The caller's address as the edge saw it.
 *
 * `x-forwarded-for` accumulates proxies left to right, so the first entry is
 * the client and everything after it is infrastructure. It is only ever written
 * to a key's `lastUsedIp` for forensics — nothing is authorised by it, which is
 * just as well, since a client can put whatever it likes in there.
 */
function clientIp(headers: Headers): string | null {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip");
}

/**
 * The origin the caller actually reached, for the OpenAPI `servers` block.
 *
 * Taken from the request rather than the app's configured URL because a
 * document fetched from a preview deployment must describe that deployment.
 * Somebody who copied the `servers` entry out of a preview would otherwise be
 * reading one API and calling another.
 */
function originOf(request: Request, url: URL): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return url.origin;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// ─── /me ────────────────────────────────────────────────────────────────────

/**
 * The first call an integrator makes, so it answers every question they are
 * about to ask: whether the token works, what it is allowed to do, what the
 * audit trail will record them as, and how much headroom is left this minute.
 *
 * The scope list is the expanded one — every scope in force, implications
 * included — because "what can this credential do?" is the question being
 * asked, and the literal grant would understate the answer.
 */
function describeCaller(caller: AuthenticatedCaller): unknown {
  const user = caller.session.user;
  const bits = new PermissionBitField(BigInt(user.permissions));

  if (caller.key) {
    const personal = caller.key.ownerId !== null;
    return {
      // Two kinds, and the difference is the first thing somebody wiring a
      // shortcut up needs to see: a personal key answers "my next class" and a
      // service key cannot, so a caller getting an empty day should be able to
      // tell which of the two they are holding without reading the source.
      kind: personal ? "personal" : "service",
      key: {
        id: caller.key.id,
        name: caller.key.name,
        prefix: caller.key.prefix,
      },
      // What it may do *now* — for a personal key, already narrowed to the
      // intersection with what its owner currently holds, which is why this is
      // read off the session rather than off the key's scopes column.
      scopes: bitsToScopes(bits.bits),
      // The id every audit column will name for anything this key does. For a
      // service key it is a real user row that is not a person, which is
      // exactly the point; for a personal one the owner is named beside it.
      principalId: caller.key.principalId,
      owner: personal
        ? { id: user.id, name: user.name ?? null, email: user.email ?? null }
        : null,
      rateLimit: caller.rate
        ? {
            limit: caller.rate.limit,
            remaining: Math.max(0, caller.rate.remaining),
            resetSeconds: caller.rate.resetSeconds,
          }
        : null,
    };
  }

  return {
    kind: "user",
    user: {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
    },
    roles: user.roles,
    permissions: bits.toArray(),
  };
}

// ─── Early refusals ─────────────────────────────────────────────────────────

/**
 * Refuses a key on an endpoint whose answer is defined relative to a person.
 *
 * Not a permission check — a key could hold every bit in the app and still have
 * no "my week", because it has no timetable, no bookings and no calendar. The
 * alternative to refusing is answering "your classes this week" with an empty
 * list, which is a correct answer to a question nobody asked and a very slow
 * bug to find.
 */
function refuseActor(
  route: CompiledRoute,
  caller: AuthenticatedCaller,
): Response | null {
  // A browser is welcome everywhere; only a credential is ever turned away.
  if (!caller.key) return null;

  /**
   * A personal key may reach the endpoints that opt in to it, and nothing else.
   *
   * Deny by default, and this is the one refusal in the file that is doing real
   * work rather than turning an obscure failure into a legible one. A personal
   * key carries its owner's id, and a good deal of the app is gated on identity
   * rather than on a permission bit: `plans.delete` asks only whether you
   * created the plan, and would cheerfully let a token in a shortcut on a lost
   * phone delete its owner's drafts. Narrow scopes do not help there, because
   * those procedures never consult a bit.
   *
   * So the safe default is the opposite one. An endpoint that wants to be
   * reachable from somebody's phone says `actor: "person"` and is reviewed on
   * the way in; everything else is shut, whatever bits the key happens to hold.
   * That is what makes "a leaked Siri key reads its owner's timetable and can do
   * nothing else at all" a true sentence rather than an aspiration.
   */
  if (caller.key.ownerId !== null) {
    if (route.actor === "person") return null;
    return fail(
      403,
      "requires_user",
      `${route.method} ${MOUNT}${route.path} is not available to a personal key. A personal key exists so somebody's own phone can ask about their own timetable, so it reaches only the endpoints built for that — the ${MOUNT}/siri/* answers. Everything else needs a signed-in browser, or one of the institution's own API keys.`,
      { headers: caller.headers },
    );
  }

  if (route.actor === "person") {
    // A service principal is its own machine identity: it teaches nothing and
    // attends nothing, so the question this endpoint asks has no answer for it.
    return fail(
      403,
      "requires_user",
      `${route.method} ${MOUNT}${route.path} answers a question about the person calling it, and this key is its own principal rather than somebody's — it has no timetable of its own to report. A personal key, minted from Settings > Siri by the person whose answer you want, does have one.`,
      { headers: caller.headers },
    );
  }

  if (route.actor !== "session") return null;

  return fail(
    403,
    "requires_user",
    `${route.method} ${MOUNT}${route.path} answers a question about the person calling it — their week, their bookings, their linked calendar — or grants authority, which no credential may do on its own behalf. Either way it is only available to a signed-in user. Where the same question can be asked about somebody by name, ask it that way instead and say who you mean: ${MOUNT}/timetable/week?facultyId=… rather than the caller's own week.`,
    { headers: caller.headers },
  );
}

/**
 * Refuses a key that is plainly short of a scope the endpoint needs.
 *
 * A courtesy and nothing more. The procedure runs the real check a moment later
 * against the very same bits, so the only thing this changes is the quality of
 * the error: "you are missing MarkAttendance, and you hold ViewAttendance and
 * ViewGroups" instead of "you do not have permission to do that".
 *
 * Only keys are checked. A person's refusal comes from the procedure in the
 * app's own words, and a second copy of it here would be one more thing to keep
 * in step for no gain.
 */
function refuseScopes(
  route: CompiledRoute,
  caller: AuthenticatedCaller,
): Response | null {
  if (!caller.key) return null;

  const bits = new PermissionBitField(BigInt(caller.session.user.permissions));
  const missing = route.scopes.filter(
    (name) => !bits.has(PermissionFlags[name]),
  );
  if (missing.length === 0) return null;

  const one = missing.length === 1;
  // A personal key is not short of a scope an administrator can add. It holds
  // only PERSONAL_SCOPES, and no more than its owner holds of those: a scope
  // outside them is work a personal key never does, and one inside them can
  // only be missing because the owner lost it. Sending them to the wrong person
  // is a whole afternoon.
  const personal = PERSONAL_SCOPES as readonly string[];
  const remedy =
    caller.key.ownerId === null
      ? `Ask an administrator to add ${one ? "that scope" : "those scopes"} to it, or call with a key that already has ${one ? "it" : "them"}.`
      : missing.some((name) => !personal.includes(name))
        ? "A personal key reads only what its owner may see. Do this signed in at a browser instead, or with a service key that holds the scope."
        : `A personal key can never hold more than the person it belongs to, so ${one ? "that permission has" : "those permissions have"} been taken off their account. Ask whoever manages roles to look at it.`;
  return fail(
    403,
    "insufficient_scope",
    `This key does not hold ${missing.join(", ")}. ${remedy}`,
    {
      details: {
        required: route.scopes,
        missing,
        granted: bitsToScopes(bits.bits),
      },
      headers: caller.headers,
    },
  );
}

const misconfigured = (caller: AuthenticatedCaller): Response =>
  fail(
    500,
    "route_misconfigured",
    "This endpoint is wired to a procedure that no longer exists. It is a bug on our side — please report it.",
    { headers: caller.headers },
  );

// ─── Input ──────────────────────────────────────────────────────────────────

function procedureFor(route: CompiledRoute): unknown {
  const procedures = appRouter._def.procedures as unknown as Record<
    string,
    unknown
  >;
  return procedures[route.procedure];
}

/**
 * One input object out of three sources, or the refusal to send instead.
 *
 * Path parameters are merged last and win outright. They are in the URL the
 * caller asked for, so `PATCH /rooms/abc` carrying `{"id":"def"}` is not a
 * conflict to resolve — it is a request to edit `abc` with a stray field in it.
 * Defaults go first because they exist to let one procedure serve two endpoints
 * (`/archive` and `/restore`), and a default that could not be overridden would
 * be a lock, which is not what they are for.
 *
 * Coercion happens after the merge, not before, and that ordering is the whole
 * reason this API can be spoken in plain JSON. The query string is not the only
 * source of strings that have to become something else: a path parameter is a
 * string by construction, and a body carries `"2026-10-13T09:00:00Z"` where the
 * procedure declared `z.date()` — the browser is handed a real `Date` by
 * superjson and this doorway has no such luxury. Coercing only the query, as
 * this once did, made every write endpoint with a date in it unusable while
 * looking entirely correct. `coerceInput` is the same best-effort walk
 * `coerceQuery` already ran and every one of its leaf conversions ignores a
 * value that is not a string, so running it a second time over the query path
 * changes nothing there.
 */
async function buildInput(
  request: Request,
  url: URL,
  route: CompiledRoute,
  params: Record<string, string>,
  procedure: unknown,
): Promise<{ value: unknown } | Response> {
  const schema = inputSchemaOf(procedure);
  const source = inputSourceOf(route);

  let provided: unknown;
  if (source === "query") {
    // The schema is what tells `?limit=20` it is a number and `?archived=true`
    // that it is a boolean; without one there is nothing to coerce towards.
    provided = coerceQuery(schema, url.searchParams);
  } else if (source === "body") {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    provided = body;
  }

  const named: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(params)) {
    named[route.params?.[name] ?? name] = value;
  }

  // A procedure whose input is a bare string or number has nothing to merge
  // into. The app has none today and `coerceQuery` handles the case anyway, so
  // pass the value through and let zod have the last word.
  if (provided !== undefined && !isPlainObject(provided)) {
    return { value: provided };
  }

  const merged = { ...route.defaults, ...provided, ...named };

  // `{}` and "nothing at all" are different requests. A procedure that takes no
  // input should be called with no argument; one whose fields are all optional
  // needs `{}`, because `undefined` would not satisfy the object itself. The
  // coercion above has already decided which of those an empty query string
  // meant, so `undefined` here is that decision and not an absence of one.
  if (Object.keys(merged).length === 0 && (provided === undefined || !schema)) {
    return { value: undefined };
  }
  return { value: schema ? coerceInput(schema, merged) : merged };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge();

  const raw = await request.text();
  // Measured again after reading, because a chunked request arrives with no
  // content-length to check first.
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return tooLarge();

  const trimmed = raw.trim();
  // A POST to a procedure that takes no input is a legitimate request with no
  // body, and insisting on `{}` would be pedantry a curl user pays for.
  if (trimmed.length === 0) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return fail(
      400,
      "invalid_json",
      `The request body is not valid JSON: ${error instanceof Error ? error.message : "it could not be parsed"}.`,
    );
  }

  // Every procedure in the app takes an object, and an array or a bare string
  // could not carry a path parameter alongside it even if one did.
  if (!isPlainObject(parsed) || Array.isArray(parsed)) {
    return fail(400, "invalid_body", "The request body must be a JSON object.");
  }

  return parsed;
}

const tooLarge = (): Response =>
  fail(
    413,
    "payload_too_large",
    `Request bodies are limited to ${MAX_BODY_BYTES / 1_000_000} MB. Split the work across several calls.`,
  );

// ─── Responses ──────────────────────────────────────────────────────────────

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

/** Every refusal this file produces, so they all have one shape. */
function fail(
  status: number,
  code: string,
  message: string,
  options: {
    details?: unknown;
    headers?: Record<string, string>;
  } = {},
): Response {
  return errorResponse(status, code, message, options.details, options.headers);
}

/** Anything a procedure threw, with this request's rate-limit headers kept. */
function thrown(error: unknown, headers?: Record<string, string>): Response {
  const { status, body } = fromThrown(error);
  return errorResponse(
    status,
    body.error.code,
    body.error.message,
    body.error.details,
    headers,
  );
}

function withHeaders(
  response: Response,
  headers: Record<string, string>,
): Response {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}
