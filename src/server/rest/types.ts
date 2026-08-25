import { type PermissionName } from "~/lib/permissions";

/**
 * The public REST surface, declared rather than written.
 *
 * Every endpoint under `/api/v1` is one of these objects. None of them contains
 * any behaviour: a route names an existing tRPC procedure, and the handler
 * calls it through the ordinary server-side caller. That is deliberate and it
 * is the single most important property of this whole directory — the API is
 * not a reimplementation of the app, it is a second doorway onto it. A rule
 * about who may cancel a lecture is enforced once, in `events.cancel`, and
 * both doorways get it.
 *
 * The consequence to keep in mind when adding a route: you cannot fix a bug
 * here. If an endpoint behaves wrongly, the procedure behaves wrongly, and the
 * fix belongs in the router where the browser will pick it up too.
 *
 * `registry.test.ts` asserts that every procedure in `appRouter` appears
 * below, so this file cannot silently fall behind the app.
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Who may call an endpoint.
 *
 * - `any` — a person or an app. The overwhelming majority.
 * - `session` — a person only. Endpoints whose answer is defined relative to
 *   the caller ("my week", "my bookings") or that touch a human's own linked
 *   account. A service principal has no week and no Google Calendar, so
 *   rather than handing an app a confidently empty answer, these refuse it and
 *   name the endpoint to use instead.
 */
export type ActorRequirement = "any" | "session";

/** Where the procedure's input comes from, beyond the path parameters. */
export type InputSource = "query" | "body" | "none";

export interface RouteDef {
  method: HttpMethod;
  /**
   * Path template relative to `/api/v1`, with `{brace}` parameters:
   * `/rooms/{id}`, `/plans/{planId}/comments/{commentId}`.
   *
   * Static segments beat parameters when both match, so `/events/mine` and
   * `/events/{id}` can coexist and mean different things.
   */
  path: string;
  /** Dotted procedure path on `appRouter`, e.g. `"rooms.list"`. */
  procedure: string;
  /** One line, imperative, for the OpenAPI summary. Ends without a full stop. */
  summary: string;
  /** Longer prose for the docs, where the summary is not the whole story. */
  description?: string;
  /** Groups endpoints in the OpenAPI document and the generated docs. */
  tag: string;

  /**
   * Permission bits a caller must hold, named as in `PermissionFlags`.
   *
   * Documentation and an early, legible refusal — never the enforcement. The
   * procedure checks for itself, and a mismatch here can only ever make the
   * API stricter than the app, never looser.
   */
  scopes: PermissionName[];

  actor?: ActorRequirement;

  /**
   * Defaults to `query` for GET and DELETE, `body` for everything else.
   * `none` is for procedures that take no input at all.
   */
  input?: InputSource;

  /**
   * Path parameter → input field, when they are not spelled the same.
   * `{ planId: "id" }` feeds `/plans/{planId}` into an input keyed `id`.
   */
  params?: Record<string, string>;

  /**
   * Fixed input merged in under anything the caller sent.
   *
   * For the handful of procedures that serve two endpoints through a flag —
   * `/rooms/{id}/archive` and `/rooms/{id}/restore` are one procedure and a
   * boolean. Caller input wins, so this cannot be used to lock a field.
   */
  defaults?: Record<string, unknown>;

  /** Success status. Defaults to 200, or 204 when the procedure returns void. */
  status?: number;

  /**
   * Marks an endpoint as changing state in a way that is not obvious from the
   * method — used by the docs to flag the ones worth reading twice before
   * wiring an app to them.
   */
  dangerous?: boolean;
}

/**
 * A compiled route: the template turned into something matchable, once, at
 * module load rather than per request.
 */
export interface CompiledRoute extends RouteDef {
  pattern: RegExp;
  paramNames: string[];
  /** Static segments, for ranking a match against a competing one. */
  specificity: number;
}

const PARAM = /\{([A-Za-z0-9_]+)\}/g;

export function compileRoute(route: RouteDef): CompiledRoute {
  const paramNames: string[] = [];
  let specificity = 0;

  const source = route.path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      PARAM.lastIndex = 0;
      const match = PARAM.exec(segment);
      if (match?.[0] === segment) {
        paramNames.push(match[1]!);
        // Path parameters never span a slash, so anything but one is fine.
        return "([^/]+)";
      }
      specificity += 1;
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return {
    ...route,
    pattern: new RegExp(`^/${source}$`),
    paramNames,
    specificity,
  };
}

/** Where a route's non-path input is read from, applying the defaults. */
export function inputSourceOf(route: RouteDef): InputSource {
  if (route.input) return route.input;
  return route.method === "GET" || route.method === "DELETE" ? "query" : "body";
}
