import { TRPCError } from "@trpc/server";
import { randomBytes } from "node:crypto";
import { ZodError } from "zod";

/**
 * What a failure looks like from outside.
 *
 * The procedures throw `TRPCError`, whose codes are words rather than numbers
 * — `FORBIDDEN`, `CONFLICT`, `PRECONDITION_FAILED` — and every one of them has
 * an HTTP status that means the same thing. So the mapping below is a
 * translation, not a policy: nothing here decides whether a request should
 * have failed, only how to say that it did.
 *
 * Two decisions are worth the ink.
 *
 * **Messages are public, except at 500.** Every message a procedure throws was
 * written for a person to read — "That room is already booked for this slot"
 * beats any generic string this file could substitute, and hiding it would
 * make the API strictly harder to integrate with for no gain in safety. An
 * unhandled exception is the opposite: its message is a stack-adjacent
 * accident that may name a column, a query or a file path. That one is
 * swallowed, logged with an incident id, and the id goes to the caller so a
 * support conversation can start with a `grep` instead of a guess.
 *
 * **A validation failure carries its issues.** `details` on a 400 holds the
 * flattened `ZodError`, field by field. It is the single most useful thing
 * this API can tell somebody building against it, and it costs nothing — the
 * schema had already worked out precisely what was wrong before the error was
 * thrown.
 */

/** The `TRPCError` code vocabulary, without reaching into tRPC's internals. */
export type TrpcErrorCode = TRPCError["code"];

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Every tRPC code, exhaustively.
 *
 * Typed as a total `Record` rather than a lookup table with a default, so that
 * a tRPC release adding a code fails the build here instead of quietly
 * reporting it as a 500 — which is precisely the sort of thing nobody notices
 * until a caller asks why "unsupported media type" comes back as a server
 * fault. Three of these — payment, media type, precondition-required — are
 * never thrown anywhere in this app, but tRPC defines them and each has an
 * unambiguous status, so guessing 500 for them would be a lie rather than a
 * default.
 */
const STATUS_BY_CODE: Record<TrpcErrorCode, number> = {
  BAD_REQUEST: 400,
  PARSE_ERROR: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_CONTENT: 422,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

/**
 * The HTTP status for a tRPC error code, defaulting to 500.
 *
 * Takes a `string` rather than a `TrpcErrorCode` because the value reaching it
 * is whatever came off a thrown error, and a code this build has never heard
 * of can only have come from a newer tRPC. The safe reading of "something went
 * wrong that we do not understand" is a server error — a 400 would tell the
 * caller to change their request, which would be a lie and would send them
 * looking in the wrong place.
 */
export function httpStatusFor(code: string): number {
  return (STATUS_BY_CODE as Record<string, number>)[code] ?? 500;
}

const INVALID_INPUT_MESSAGE =
  "The request did not match what this endpoint accepts. See details for the fields that failed.";

const INTERNAL_MESSAGE =
  "Something went wrong on our side. Quote the incident id if you report this.";

/** A JSON error response, with the content type the body actually is. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: HeadersInit,
): Response {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };

  // Built from the caller's headers rather than spread into an object literal,
  // so a `Retry-After` on a 429 or a `WWW-Authenticate` on a 401 survives
  // whatever shape it arrived in — and so the content type cannot be
  // accidentally overwritten by one of them.
  const merged = new Headers(headers);
  merged.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), { status, headers: merged });
}

/**
 * Anything thrown by a procedure, as a status and a body.
 *
 * Split from `errorResponse` because the docs console and the tests want the
 * decision without the `Response` around it.
 */
export function fromThrown(err: unknown): {
  status: number;
  body: ApiErrorBody;
} {
  if (err instanceof TRPCError) {
    const status = httpStatusFor(err.code);

    // Order matters: a 500 stays redacted even when it happens to carry a
    // ZodError. That combination means our own code produced something its own
    // schema rejected, which is an internal fault whose details describe our
    // data, not the caller's request.
    if (status === 500) return internal(err);

    const issues = zodErrorIn(err);
    if (issues) {
      return problem(
        400,
        "BAD_REQUEST",
        INVALID_INPUT_MESSAGE,
        issues.flatten(),
      );
    }
    return problem(status, err.code, err.message);
  }

  // A bare ZodError reaches here only from the REST layer's own parsing, before
  // a procedure was ever called — a malformed body, or path parameters that do
  // not fit. Same answer, same details.
  const issues = zodErrorIn(err);
  if (issues) {
    return problem(400, "BAD_REQUEST", INVALID_INPUT_MESSAGE, issues.flatten());
  }

  return internal(err);
}

const problem = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
): { status: number; body: ApiErrorBody } => ({
  status,
  body: {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  },
});

function internal(err: unknown): { status: number; body: ApiErrorBody } {
  const incident = randomBytes(5).toString("hex");
  // The one place the real error is allowed to be seen. Logged whole — cause
  // chain included — because by definition nobody knew this could happen.
  console.error(`[api] incident ${incident}`, err);

  return problem(500, "INTERNAL_SERVER_ERROR", INTERNAL_MESSAGE, { incident });
}

/**
 * The `ZodError` inside an error, however deeply tRPC wrapped it.
 *
 * Matched structurally as well as by `instanceof`, for the same reason as in
 * `coerce.ts`: a second copy of zod anywhere in the tree would otherwise turn
 * the most useful 400 this API produces into a bare 500.
 */
function zodErrorIn(err: unknown): ZodError | null {
  let current: unknown = err;

  // Bounded, because a `cause` chain can be made to loop and this runs on the
  // error path where nothing else is going to catch it.
  for (
    let depth = 0;
    depth < 5 && current !== null && current !== undefined;
    depth += 1
  ) {
    if (isZodError(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

const isZodError = (value: unknown): value is ZodError =>
  value instanceof ZodError ||
  (typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name === "ZodError" &&
    Array.isArray((value as { issues?: unknown }).issues) &&
    typeof (value as { flatten?: unknown }).flatten === "function");
