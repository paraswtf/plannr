import { describe, expect, it, vi } from "vitest";

/**
 * The test that keeps the public API from quietly falling behind the app.
 *
 * Everything here is structural. Not one assertion calls a procedure or touches
 * a database — the subject is the *declaration*: that every procedure the app
 * has is reachable, that every route names a procedure that exists, and that no
 * route is wired in a way that could never work. Those are exactly the mistakes
 * that survive code review, because a route with a typo in its `procedure` or a
 * path parameter that feeds nothing looks completely fine sitting in a list.
 *
 * The scaffolding below is the same three pieces `openapi.test.ts` explains at
 * length, for the same reason: introspecting `appRouter` means importing it,
 * which drags in the whole server boot sequence — the environment schema,
 * next-auth, a Prisma client — none of which is used and all of which would
 * turn a unit test into one that needs a `.env` and a database.
 */
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

vi.mock("~/server/auth", () => ({
  auth: async () => null,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

vi.mock("next-auth", () => ({ default: () => ({}) }));

import { GRANTABLE_SCOPES } from "~/lib/api-scopes";
import { PERMISSION_NAMES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { isRouteMatch, matchRoute, ROUTES } from "./registry";
import { compileRoute, inputSourceOf, type RouteDef } from "./types";

import { academicsRoutes } from "./routes/academics";
import { apiKeyRoutes } from "./routes/api-keys";
import { attendanceRoutes } from "./routes/attendance";
import { eventRoutes } from "./routes/events";
import { groupRoutes } from "./routes/groups";
import { peopleRoutes } from "./routes/people";
import { planRoutes } from "./routes/plans";
import { roomRoutes } from "./routes/rooms";
import { timetableRoutes } from "./routes/timetable";

/**
 * The modules by name, so a failure can tell a reader which file to open.
 *
 * Imported here rather than taken from `ROUTES` because the point of the
 * coverage failure below is to end with a path somebody can act on, and a flat
 * array cannot say where any of its entries came from.
 */
const ROUTE_MODULES: Array<[string, RouteDef[]]> = [
  ["src/server/rest/routes/rooms.ts", roomRoutes],
  ["src/server/rest/routes/timetable.ts", timetableRoutes],
  ["src/server/rest/routes/events.ts", eventRoutes],
  ["src/server/rest/routes/attendance.ts", attendanceRoutes],
  ["src/server/rest/routes/academics.ts", academicsRoutes],
  ["src/server/rest/routes/groups.ts", groupRoutes],
  ["src/server/rest/routes/plans.ts", planRoutes],
  ["src/server/rest/routes/people.ts", peopleRoutes],
  ["src/server/rest/routes/api-keys.ts", apiKeyRoutes],
];

interface ProcedureLike {
  _def?: { inputs?: unknown[]; type?: string };
}

const PROCEDURES = appRouter._def.procedures as unknown as Record<
  string,
  ProcedureLike | undefined
>;

const PROCEDURE_NAMES = Object.keys(PROCEDURES).sort();

const COMPILED = ROUTES.map(compileRoute);

const label = (route: RouteDef) => `${route.method} ${route.path}`;

// --- zod introspection -----------------------------------------------------
//
// Read through `_def.typeName` rather than `instanceof`, exactly as `openapi.ts`
// does and for the same reason: two copies of zod on disk would make every
// `instanceof` false, and this file would then cheerfully report that no route
// has any fields at all rather than failing.

interface ZodLike {
  _def?: Record<string, unknown>;
}

const defOf = (schema: unknown): Record<string, unknown> | undefined =>
  (schema as ZodLike | null | undefined)?._def;

const typeNameOf = (schema: unknown): string | undefined =>
  defOf(schema)?.typeName as string | undefined;

/** Wrappers that sit between a schema and the object underneath it. */
const UNWRAP: Record<string, string> = {
  ZodOptional: "innerType",
  ZodNullable: "innerType",
  ZodDefault: "innerType",
  ZodCatch: "innerType",
  ZodReadonly: "innerType",
  ZodBranded: "type",
  ZodEffects: "schema",
  ZodPipeline: "in",
};

const MAX_UNWRAP_DEPTH = 12;

function unwrap(schema: unknown): unknown {
  let current = schema;
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth += 1) {
    const typeName = typeNameOf(current);
    if (!typeName) return current;
    const key = UNWRAP[typeName];
    if (!key) return current;
    const inner = defOf(current)?.[key];
    if (inner === undefined) return current;
    current = inner;
  }
  return current;
}

interface Fields {
  /** Every top-level key the schema names. */
  keys: Set<string>;
  /** Those of them a caller must supply. */
  required: Set<string>;
  /** Whether an unrecognised key is dropped rather than rejected. */
  open: boolean;
}

/**
 * The top-level fields of a procedure's input, or null if it has no shape.
 *
 * `ZodIntersection` is walked because `semesters.update` is
 * `z.object({ id }).and(dates)` — its `id` is a real field that a route feeds
 * from the path, and a reader of the shape alone would conclude the opposite.
 */
function fieldsOf(schema: unknown, depth = 0): Fields | null {
  if (depth > MAX_UNWRAP_DEPTH) return null;
  const inner = unwrap(schema);
  const typeName = typeNameOf(inner);

  if (typeName === "ZodObject") {
    const shape = defOf(inner)?.shape;
    if (typeof shape !== "function") return null;
    let entries: Record<string, unknown>;
    try {
      entries = (shape as () => Record<string, unknown>)();
    } catch {
      return null;
    }
    const names = Object.keys(entries);
    return {
      keys: new Set(names),
      required: new Set(
        names.filter((name) => {
          const field = entries[name] as { isOptional?: () => boolean };
          return typeof field?.isOptional === "function"
            ? !field.isOptional()
            : true;
        }),
      ),
      // A `.strict()` object rejects anything it does not name, which is what
      // makes an unmapped path parameter fatal rather than merely useless.
      open: defOf(inner)?.unknownKeys !== "strict",
    };
  }

  if (typeName === "ZodIntersection") {
    const left = fieldsOf(defOf(inner)?.left, depth + 1);
    const right = fieldsOf(defOf(inner)?.right, depth + 1);
    if (!left || !right) return left ?? right;
    return {
      keys: new Set([...left.keys, ...right.keys]),
      required: new Set([...left.required, ...right.required]),
      open: left.open && right.open,
    };
  }

  return null;
}

/** Every field of a procedure's input, with stacked `.input()` calls folded in. */
function inputFieldsOf(procedure: string): Fields {
  const inputs = PROCEDURES[procedure]?._def?.inputs;
  const shapes = (Array.isArray(inputs) ? inputs : [])
    .map((input) => fieldsOf(input))
    .filter((shape): shape is Fields => shape !== null);

  return {
    keys: new Set(shapes.flatMap((shape) => [...shape.keys])),
    required: new Set(shapes.flatMap((shape) => [...shape.required])),
    open: shapes.every((shape) => shape.open),
  };
}

/** Where a route's suggested home is, for a procedure nobody has declared. */
function suggestFile(procedure: string): string {
  const namespace = procedure.split(".")[0]!;
  const home = ROUTE_MODULES.find(([, routes]) =>
    routes.some((route) => route.procedure.startsWith(`${namespace}.`)),
  );
  return home
    ? `add it to ${home[0]}`
    : `give it a module of its own under src/server/rest/routes/, and add that module to ROUTES in src/server/rest/registry.ts`;
}

describe("the registry covers the app", () => {
  /**
   * The one that matters.
   *
   * The public API is a second doorway onto the same procedures the browser
   * calls, not a curated subset of them, so "nobody got round to it" is not a
   * state this repository is allowed to be in. Writing a procedure and shipping
   * it without deciding what it looks like from outside is precisely how an API
   * rots: the app grows, the documented surface does not, and two years later
   * nobody can tell which omissions were decisions.
   */
  it("exposes every procedure the app has", () => {
    const declared = new Set(ROUTES.map((route) => route.procedure));
    const missing = PROCEDURE_NAMES.filter((name) => !declared.has(name));

    const width = Math.max(0, ...missing.map((name) => name.length));
    const message = [
      `${missing.length} procedure(s) on appRouter are not reachable over the public API:`,
      "",
      ...missing.map(
        (name) => `  • ${name.padEnd(width)}  →  ${suggestFile(name)}`,
      ),
      "",
      "Every tRPC procedure must appear as the `procedure` of at least one RouteDef.",
      "The REST layer is a second doorway onto the same app rather than a subset of",
      "it, so a procedure nobody has declared is not a decision to withhold it — it",
      "is one an integrator cannot reach and nobody remembers choosing.",
      "",
      "Adding one is a declaration, not code: copy a neighbour in the file above and",
      "fill in method, path, summary, tag and scopes. The handler calls the procedure",
      "through the ordinary server-side caller, so there is no behaviour to write and",
      "no permission check to repeat — the procedure already has one.",
      "",
      "There is deliberately no opt-out list. If an endpoint genuinely should not be",
      "available to an application — because its answer is about the person calling",
      'it — it still gets a RouteDef, marked `actor: "session"`, with a description',
      "naming what an app should call instead. See GET /events/mine for the shape.",
    ].join("\n");

    expect(missing, message).toEqual([]);
  });

  /** Catches a typo, and a rename that only got as far as the router. */
  it("names only procedures that exist", () => {
    for (const route of ROUTES) {
      expect(
        PROCEDURES[route.procedure],
        `${label(route)} names "${route.procedure}", which is not a procedure on appRouter. ` +
          `Either it was misspelled, or it was renamed in src/server/api/routers/ without this route following it.`,
      ).toBeDefined();
    }
  });

  /**
   * A module written but never registered would otherwise fail only as a pile
   * of "not reachable" procedures, pointing at the file that already has them.
   */
  it("assembles every route module", () => {
    const declared = new Set(ROUTES);
    for (const [file, routes] of ROUTE_MODULES) {
      for (const route of routes) {
        expect(
          declared.has(route),
          `${label(route)} is declared in ${file} but is not in ROUTES — add the module to src/server/rest/registry.ts.`,
        ).toBe(true);
      }
    }
  });
});

/**
 * Queries served over POST, and the reason each one had to be.
 *
 * A query is a read, a read is a GET, and the exceptions are all the same
 * exception: the input is a document, not a handful of fields. A pasted list of
 * two thousand student numbers or a two-megabyte CSV has nowhere to sit in a
 * query string, and no amount of principle makes a URL long enough. Every one
 * of these writes nothing, which is what keeps the POST honest.
 *
 * Listing them here rather than waving the rule through means a fourth one is
 * somebody's argument rather than somebody's habit.
 */
const QUERIES_SERVED_OVER_POST: Record<string, string> = {
  "POST /users/resolve":
    "resolves a pasted list of addresses, PRNs and employee numbers, which can run to thousands of entries",
  "POST /users/import/preview":
    "takes the whole upload and reports what it would do, without doing any of it",
  "POST /plans/{planId}/requirements/import/preview":
    "takes a demand CSV and reports what it resolves to, writing nothing",
};

describe("a route's method matches what its procedure does", () => {
  it("never serves a mutation over GET", () => {
    for (const route of ROUTES) {
      if (PROCEDURES[route.procedure]?._def?.type !== "mutation") continue;
      expect(
        route.method,
        `${label(route)} calls the mutation "${route.procedure}" over GET. ` +
          `A GET must be safe to repeat, to prefetch and to cache; anything that changes state needs POST, PATCH, PUT or DELETE.`,
      ).not.toBe("GET");
    }
  });

  it("serves a query over GET, unless its input is a document", () => {
    for (const route of ROUTES) {
      if (PROCEDURES[route.procedure]?._def?.type !== "query") continue;
      if (route.method === "GET") continue;

      expect(
        QUERIES_SERVED_OVER_POST[label(route)],
        `${label(route)} serves the query "${route.procedure}" over ${route.method}. ` +
          `Reads are GETs. If this one cannot be — because its input is a pasted list or an uploaded file with nowhere to sit in a query string — ` +
          `make it a POST and add it to QUERIES_SERVED_OVER_POST in this file with the reason, so the next reader knows it was argued rather than assumed.`,
      ).toBeDefined();
      // The exception is for a body, not for a verb: nothing reads over PATCH.
      expect(
        route.method,
        `${label(route)} is a read served over ${route.method}`,
      ).toBe("POST");
    }
  });

  it("keeps no stale exceptions", () => {
    const posted = new Set(
      ROUTES.filter(
        (route) =>
          route.method !== "GET" &&
          PROCEDURES[route.procedure]?._def?.type === "query",
      ).map(label),
    );
    for (const exception of Object.keys(QUERIES_SERVED_OVER_POST)) {
      expect(
        posted.has(exception),
        `QUERIES_SERVED_OVER_POST still excuses "${exception}", which is no longer a query served over POST. Delete the entry.`,
      ).toBe(true);
    }
  });
});

describe("a route can actually validate", () => {
  /**
   * A path parameter that reaches nothing is the quietest bug this layer can
   * have: the route matches, the handler runs, the procedure is called — with
   * the id the caller asked for silently dropped on the floor. `PATCH
   * /rooms/{id}` would edit whichever room a bare `rooms.update` decided to
   * edit, forever, and the URL would look right in every log.
   *
   * The one tolerated shape is an ancestor segment: `/plans/{planId}/comments/
   * {commentId}` names the plan for the reader's sake while the procedure takes
   * only the comment's own id. That is a deliberate choice, argued at the top of
   * routes/plans.ts, and it is safe only because the parameter is followed by
   * one that does feed the input — the request is still addressed by something
   * the server reads — and because the input drops unknown keys instead of
   * rejecting them.
   */
  it("feeds every path parameter into its procedure's input", () => {
    for (const route of COMPILED) {
      const fields = inputFieldsOf(route.procedure);

      route.paramNames.forEach((name, index) => {
        const target = route.params?.[name] ?? name;
        if (fields.keys.has(target)) return;

        const laterParameterFeedsInput = route.paramNames
          .slice(index + 1)
          .some((later) => fields.keys.has(route.params?.[later] ?? later));

        expect(
          laterParameterFeedsInput && fields.open,
          `${label(route)} carries {${name}}, which feeds "${target}" — a field "${route.procedure}" does not have. ` +
            `Its input names [${[...fields.keys].join(", ") || "nothing"}]. ` +
            `Either rename the segment to match the field, or map it with \`params: { ${name}: "<field>" }\`. ` +
            `A parameter is allowed to reach nothing only when it names an ancestor and a later segment does feed the input, as in /plans/{planId}/comments/{commentId}.`,
        ).toBe(true);
      });
    }
  });

  it("declares no parameter mapping for a segment that is not in the path", () => {
    for (const route of COMPILED) {
      for (const name of Object.keys(route.params ?? {})) {
        expect(
          route.paramNames.includes(name),
          `${label(route)} maps {${name}}, which does not appear in its path. The mapping does nothing, and the segment it was meant for is unmapped.`,
        ).toBe(true);
      }
    }
  });

  /** A required field with no way in is a route that answers 400 forever. */
  it("leaves no required field with nowhere to arrive from", () => {
    for (const route of COMPILED) {
      if (inputSourceOf(route) !== "none") continue;

      const supplied = new Set([
        ...route.paramNames.map((name) => route.params?.[name] ?? name),
        ...Object.keys(route.defaults ?? {}),
      ]);
      const unreachable = [...inputFieldsOf(route.procedure).required].filter(
        (name) => !supplied.has(name),
      );

      expect(
        unreachable,
        `${label(route)} is declared \`input: "none"\`, but "${route.procedure}" requires [${unreachable.join(", ")}], ` +
          `which no path parameter or default supplies. Every call would be rejected by zod. Drop the \`input\` line, or add the field to \`defaults\`.`,
      ).toEqual([]);
    }
  });
});

describe("the shape of the surface", () => {
  it("never declares the same method and path twice", () => {
    const seen = new Map<string, string>();
    for (const route of ROUTES) {
      const existing = seen.get(label(route));
      expect(
        existing,
        `${label(route)} is declared twice — once for "${existing}" and again for "${route.procedure}". ` +
          `Only the first would ever be reached, so the second is dead. If both are wanted, one of them needs its own path.`,
      ).toBeUndefined();
      seen.set(label(route), route.procedure);
    }
  });

  it("scopes routes with permissions that exist, and that a key can hold", () => {
    const known = new Set<string>(PERMISSION_NAMES);
    const grantable = new Set<string>(GRANTABLE_SCOPES);

    for (const route of ROUTES) {
      for (const scope of route.scopes) {
        expect(
          known.has(scope),
          `${label(route)} names the scope "${scope}", which is not in PermissionFlags. ` +
            `A scope is spelled exactly like the permission it is — check src/lib/permissions.ts, or fix the rename that left this behind.`,
        ).toBe(true);
        expect(
          grantable.has(scope),
          `${label(route)} requires "${scope}", which no API key can ever hold — Administrator is refused on a key by design. ` +
            `Name the specific bit the procedure checks, and if the endpoint is genuinely for people only, say so with \`actor: "session"\`.`,
        ).toBe(true);
      }
    }
  });

  /**
   * Paths are read by people and typed by hand. `/api-keys` and `/apiKeys` are
   * a coin toss to anybody who has not seen the registry, and a surface that is
   * lowercase-and-hyphens everywhere is one you can guess at.
   */
  it("writes paths the way a reader would guess", () => {
    for (const route of ROUTES) {
      const path = route.path;
      const complain = (why: string) =>
        `${label(route)} has a malformed path: ${why}.`;

      expect(path.startsWith("/"), complain("it does not start with /")).toBe(
        true,
      );
      expect(
        path.length > 1 && path.endsWith("/"),
        complain("it ends with a trailing slash"),
      ).toBe(false);
      expect(path.includes("//"), complain("it has an empty segment")).toBe(
        false,
      );

      for (const segment of path.split("/").slice(1)) {
        if (segment.startsWith("{") || segment.endsWith("}")) {
          expect(
            /^\{[a-z][A-Za-z0-9]*\}$/.test(segment),
            complain(
              `"${segment}" is not a well-formed parameter — write {camelCase} and nothing else in the segment`,
            ),
          ).toBe(true);
        } else {
          expect(
            /^[a-z0-9]+(-[a-z0-9]+)*$/.test(segment),
            complain(
              `"${segment}" is not lowercase-and-hyphens — /delete-impact, not /deleteImpact`,
            ),
          ).toBe(true);
        }
      }

      const names = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(
        (match) => match[1]!,
      );
      expect(
        new Set(names).size,
        complain(`it uses the same parameter name twice`),
      ).toBe(names.length);
    }
  });

  /**
   * `actor: "session"` is the only way this layer refuses an application
   * outright, and a bare refusal is the most frustrating answer an API gives:
   * it says no without saying what to do instead. `types.ts` is explicit that
   * these name the alternative, and the place a caller reads that is the
   * description — the OpenAPI document renders it, and the handler's 403 is
   * seen only by whoever already made the mistake.
   */
  it("tells an application what to call instead of a people-only endpoint", () => {
    for (const route of ROUTES) {
      if (route.actor !== "session") continue;
      expect(
        route.description && route.description.trim().length > 0,
        `${label(route)} is people-only but has no description. An API key calling it gets a refusal and nothing else — ` +
          `say why the answer is defined relative to a person, and name the endpoint an application should call instead. See GET /events/mine.`,
      ).toBe(true);
    }
  });
});

describe("matchRoute", () => {
  /**
   * The property that lets `/events/mine` and `/events/{id}` coexist, asserted
   * against the real registry rather than a fixture — a fixture would keep
   * passing after somebody sorted `COMPILED` by declaration order.
   */
  it("prefers a literal segment to a parameter", () => {
    const mine = matchRoute("GET", "/events/mine");
    expect(isRouteMatch(mine) && mine.route.procedure).toBe(
      "events.myBookings",
    );

    const byId = matchRoute("GET", "/events/cm0000000000000000000000");
    expect(isRouteMatch(byId) && byId.route.procedure).toBe("events.byId");
    expect(isRouteMatch(byId) && byId.params).toEqual({
      id: "cm0000000000000000000000",
    });
  });

  /** And everywhere else, not just where somebody thought to check. */
  it("reaches every literal path in the registry, over its own method", () => {
    for (const route of ROUTES) {
      if (route.path.includes("{")) continue;
      const match = matchRoute(route.method, route.path);
      expect(
        isRouteMatch(match) && match.route.procedure,
        `${label(route)} is shadowed by a parameterised route — matchRoute answers ` +
          `${isRouteMatch(match) ? match.route.procedure : JSON.stringify(match)} instead of ${route.procedure}.`,
      ).toBe(route.procedure);
    }
  });

  it("reaches every parameterised path, and decodes what it captured", () => {
    for (const route of COMPILED) {
      if (route.paramNames.length === 0) continue;

      // A value that cannot be mistaken for a literal segment of any route.
      const filled = route.path.replace(
        /\{([A-Za-z0-9_]+)\}/g,
        (_, name: string) => `zz-${name}-9`,
      );
      const match = matchRoute(route.method, filled);

      expect(
        isRouteMatch(match) && match.route.procedure,
        `${label(route)} is unreachable — matchRoute(${route.method}, ${filled}) answers ${JSON.stringify(
          isRouteMatch(match) ? match.route.path : match,
        )}.`,
      ).toBe(route.procedure);
      expect(isRouteMatch(match) && match.params).toEqual(
        Object.fromEntries(
          route.paramNames.map((name) => [name, `zz-${name}-9`]),
        ),
      );
    }
  });

  it("percent-decodes a parameter, so a room called A/1 is not two segments", () => {
    const match = matchRoute("GET", "/rooms/A%2F1");
    expect(isRouteMatch(match) && match.params.id).toBe("A/1");
  });

  it("separates the wrong verb from the wrong thing", () => {
    // A path that exists, with a method it does not serve: the answer names the
    // methods it does, which is what turns a 404 into a 405. Read off the
    // registry rather than written out, so adding a verb to /buildings does not
    // fail a test about something else.
    const wrongVerb = matchRoute("PUT", "/buildings");
    expect(isRouteMatch(wrongVerb)).toBe(false);
    expect(wrongVerb).toEqual({
      allowed: ROUTES.filter((route) => route.path === "/buildings")
        .map((route) => route.method)
        .sort(),
    });

    // A parameterised sibling counts towards that list, and should: PATCH
    // /events/{id} really does match /events/mine, and telling a caller that
    // PATCH is unavailable there would be a lie they could disprove.
    const shadowed = matchRoute("PUT", "/events/mine");
    expect(isRouteMatch(shadowed)).toBe(false);
    expect((shadowed as { allowed: string[] }).allowed).toContain("PATCH");
    expect((shadowed as { allowed: string[] }).allowed).not.toContain("PUT");

    expect(matchRoute("GET", "/nothing/of/the/sort")).toBeNull();
  });
});
