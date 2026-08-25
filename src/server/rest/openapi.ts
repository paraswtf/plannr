import { zodToJsonSchema } from "zod-to-json-schema";

import { appRouter } from "~/server/api/root";
import { ROUTES } from "./registry";
import {
  compileRoute,
  inputSourceOf,
  type CompiledRoute,
  type RouteDef,
} from "./types";

/**
 * The OpenAPI document, generated rather than maintained.
 *
 * Nothing here is a second description of the API. The paths come from `ROUTES`
 * and the shapes come from the zod schemas the procedures already validate
 * against, so the document cannot drift from the thing it documents — the usual
 * failure of a hand-written spec, where an optional field quietly became
 * required eighteen months ago and only the support inbox knows.
 *
 * Two properties are worth defending, because both are easy to lose:
 *
 *   - **It never throws.** A docs endpoint that 500s because somebody wrote an
 *     unusual schema is worse than one that says `{}` for a single field. Every
 *     conversion is guarded and falls back to an unconstrained schema.
 *   - **It is byte-stable.** Keys are emitted in a sorted, deliberate order so
 *     that regenerating the document produces the identical bytes. Anything
 *     that diffs the spec in CI, or caches it by hash, depends on this, and a
 *     `Object.keys()` ordering accident is exactly how it gets lost.
 *
 * The prose in `info.description` is the one part written by hand. It is the
 * first thing an integrator reads and it has a job to do: explain that a key is
 * a principal rather than an impersonation, and that scopes are permissions
 * spelled the same way, before somebody designs around a guess.
 */

/** Options shared by every conversion, so the output stays uniform. */
const JSON_SCHEMA_OPTIONS = {
  target: "openApi3",
  $refStrategy: "none",
} as const;

type JsonSchema = Record<string, unknown>;

/** An unconstrained schema — the fallback whenever introspection gives up. */
const ANY_SCHEMA: JsonSchema = {};

// --- zod introspection -----------------------------------------------------
//
// Done through `_def.typeName` rather than `instanceof`, because a build that
// ends up with two copies of zod on disk would silently fail every `instanceof`
// and quietly produce a document with no parameters in it. A string comparison
// cannot fail that way.

interface ZodLike {
  _def?: Record<string, unknown>;
}

const defOf = (schema: unknown): Record<string, unknown> | undefined =>
  (schema as ZodLike | null | undefined)?._def;

const typeNameOf = (schema: unknown): string | undefined =>
  defOf(schema)?.typeName as string | undefined;

const descriptionOf = (schema: unknown): string | undefined =>
  defOf(schema)?.description as string | undefined;

/**
 * Wrappers that stand between a schema and the object underneath it, and the
 * `_def` key holding that inner schema.
 *
 * `ZodEffects` is included deliberately: a `.refine()` or `.transform()` still
 * documents as its *input*, which is what a caller has to send.
 */
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

/** Guards against a `ZodLazy` that refers to itself. */
const MAX_UNWRAP_DEPTH = 12;

function unwrap(schema: unknown): unknown {
  let current = schema;
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth += 1) {
    const typeName = typeNameOf(current);
    if (!typeName) return current;

    if (typeName === "ZodLazy") {
      const getter = defOf(current)?.getter;
      if (typeof getter !== "function") return current;
      try {
        current = (getter as () => unknown)();
        continue;
      } catch {
        return current;
      }
    }

    const key = UNWRAP[typeName];
    if (!key) return current;
    const inner = defOf(current)?.[key];
    if (inner === undefined) return current;
    current = inner;
  }
  return current;
}

/**
 * Peels only optionality, leaving defaults and nullability in place.
 *
 * Converting `z.string().optional()` on its own yields
 * `{ anyOf: [{ not: {} }, { type: "string" }] }` — technically the truth, and
 * useless in a query parameter, where optionality is carried by `required`
 * instead. A default survives the peel because `default: 50` in the rendered
 * docs tells a reader something they want to know.
 */
function withoutOptionality(schema: unknown): unknown {
  let current = schema;
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth += 1) {
    const typeName = typeNameOf(current);
    if (typeName !== "ZodOptional" && typeName !== "ZodReadonly")
      return current;
    const inner = defOf(current)?.innerType;
    if (inner === undefined) return current;
    current = inner;
  }
  return current;
}

const shapeOf = (schema: unknown): Record<string, unknown> | null => {
  if (typeNameOf(schema) !== "ZodObject") return null;
  const shape = defOf(schema)?.shape;
  if (typeof shape !== "function") return null;
  try {
    return (shape as () => Record<string, unknown>)();
  } catch {
    return null;
  }
};

function toJsonSchema(schema: unknown): JsonSchema {
  try {
    const converted = zodToJsonSchema(
      schema as Parameters<typeof zodToJsonSchema>[0],
      JSON_SCHEMA_OPTIONS,
    ) as JsonSchema;
    if (!converted || typeof converted !== "object") return { ...ANY_SCHEMA };
    // `$schema` is meaningless inside an OpenAPI Schema Object and only adds
    // noise; the openApi3 target normally omits it, but not provably so.
    const result = { ...converted };
    delete result.$schema;
    return result;
  } catch {
    return { ...ANY_SCHEMA };
  }
}

const isRequired = (schema: unknown): boolean => {
  const candidate = schema as { isOptional?: () => boolean } | null;
  if (typeof candidate?.isOptional !== "function") return false;
  try {
    return !candidate.isOptional();
  } catch {
    // Unknowable beats wrong: an integrator who sends a field they did not have
    // to gets an answer, one who omits a field we called optional gets a 400.
    return false;
  }
};

// --- procedure lookup ------------------------------------------------------

/**
 * `appRouter._def.procedures` is flat and keyed by the dotted path, so a route
 * naming `"rooms.list"` needs no walking to find its schema.
 */
interface ProcedureLike {
  _def?: { inputs?: unknown[]; type?: string };
}

const PROCEDURES = appRouter._def.procedures as unknown as Record<
  string,
  ProcedureLike | undefined
>;

/**
 * The schema a procedure validates its input against, or null for none.
 *
 * Chained `.input()` calls stack rather than replace, and tRPC merges them at
 * runtime, so several object schemas are folded into one here. Anything that is
 * not an object cannot be merged, and the first wins — a procedure that mixes
 * the two is exotic enough that documenting the outermost shape and moving on
 * beats inventing an intersection nobody asked for.
 */
function inputSchemaOf(procedure: string): unknown {
  const inputs = PROCEDURES[procedure]?._def?.inputs;
  if (!Array.isArray(inputs) || inputs.length === 0) return null;
  if (inputs.length === 1) return inputs[0];

  const objects = inputs.filter((input) => shapeOf(unwrap(input)) !== null);
  if (objects.length !== inputs.length) return inputs[0];

  return objects.reduce((merged, next) => {
    const target = merged as { merge?: (other: unknown) => unknown };
    if (typeof target.merge !== "function") return merged;
    try {
      return target.merge(next);
    } catch {
      return merged;
    }
  });
}

// --- documenting one route -------------------------------------------------

/**
 * Input fields the server fills in itself, which must not be asked of a caller.
 *
 * Path parameters are already documented as path parameters, and `defaults` are
 * the route's own doing. Documenting either a second time invites somebody to
 * send `{"id": "..."}` in the body of `PATCH /rooms/{id}` and wonder which one
 * the server believed.
 */
function serverSuppliedFields(route: CompiledRoute): Set<string> {
  const supplied = new Set<string>();
  for (const name of route.paramNames)
    supplied.add(route.params?.[name] ?? name);
  for (const name of Object.keys(route.defaults ?? {})) supplied.add(name);
  return supplied;
}

function pathParameters(route: CompiledRoute): JsonSchema[] {
  return route.paramNames.map((name) => {
    const field = route.params?.[name] ?? name;
    return {
      name,
      in: "path",
      required: true,
      description:
        field === name
          ? "Identifies the record this endpoint acts on."
          : `Identifies the record this endpoint acts on — the procedure's \`${field}\`.`,
      schema: { type: "string" },
    };
  });
}

function queryParameters(route: CompiledRoute): JsonSchema[] {
  const schema = inputSchemaOf(route.procedure);
  if (schema === null) return [];

  const supplied = serverSuppliedFields(route);
  const shape = shapeOf(unwrap(schema));

  // Not an object, so there are no fields to spread across the query string.
  // One JSON-encoded parameter is honest about that, and still callable.
  if (!shape) {
    return [
      {
        name: "input",
        in: "query",
        required: isRequired(schema),
        description:
          "This endpoint's input is not a flat set of named fields, so it travels as one JSON-encoded value. `x-plannr-schema` below is the schema that value must satisfy.",
        schema: { type: "string" },
        "x-plannr-schema": withoutSuppliedFields(
          toJsonSchema(withoutOptionality(schema)),
          supplied,
        ),
      },
    ];
  }

  return Object.keys(shape)
    .filter((name) => !supplied.has(name))
    .sort()
    .map((name) => {
      const field = shape[name];
      const converted = toJsonSchema(withoutOptionality(field));
      const description =
        (converted.description as string | undefined) ?? descriptionOf(field);
      delete converted.description;

      const parameter: JsonSchema = {
        name,
        in: "query",
        required: isRequired(field),
      };
      if (description) parameter.description = description;
      parameter.schema = converted;
      return parameter;
    });
}

/**
 * Drops the server-supplied fields from a converted schema.
 *
 * Recurses through `allOf`/`anyOf`/`oneOf` because an intersection of two
 * objects — `z.object({...}).and(z.object({...}))`, which a couple of
 * procedures use — converts to a composition rather than to one flat object,
 * and a path parameter hiding in the second branch is just as duplicated as one
 * hiding in the first.
 */
const COMPOSITION_KEYS = ["allOf", "anyOf", "oneOf"] as const;

const isEmptyObject = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  Object.keys(value).length === 0;

/** An object schema left with no properties and no other constraint. */
function constrainsNothing(schema: unknown): boolean {
  if (typeof schema !== "object" || schema === null) return false;
  const entries = Object.entries(schema as JsonSchema);
  if (entries.length === 0) return false;
  return entries.every(
    ([key, value]) =>
      (key === "type" && value === "object") ||
      (key === "properties" && isEmptyObject(value)),
  );
}

function withoutSuppliedFields(
  schema: JsonSchema,
  supplied: Set<string>,
  depth = 0,
): JsonSchema {
  if (supplied.size === 0 || depth > MAX_UNWRAP_DEPTH) return schema;

  const result: JsonSchema = { ...schema };

  for (const key of COMPOSITION_KEYS) {
    const branches: unknown = result[key];
    if (!Array.isArray(branches)) continue;
    result[key] = (branches as unknown[])
      .map((branch) =>
        branch && typeof branch === "object"
          ? withoutSuppliedFields(branch as JsonSchema, supplied, depth + 1)
          : branch,
      )
      // A branch that held nothing but the path parameter now constrains
      // nothing, and renders as a baffling empty box in every docs viewer.
      .filter((branch) => !constrainsNothing(branch));
  }

  const allOf = result.allOf;
  if (
    Array.isArray(allOf) &&
    allOf.length === 1 &&
    Object.keys(result).length === 1
  ) {
    return allOf[0] as JsonSchema;
  }

  const properties = result.properties;
  if (properties && typeof properties === "object") {
    const source = properties as JsonSchema;
    const kept: JsonSchema = {};
    for (const key of Object.keys(source).sort()) {
      if (supplied.has(key)) continue;
      kept[key] = source[key];
    }
    result.properties = kept;
  }

  if (Array.isArray(result.required)) {
    const kept = (result.required as string[]).filter(
      (name) => !supplied.has(name),
    );
    if (kept.length > 0) result.required = kept;
    else delete result.required;
  }

  return result;
}

function requestBody(route: CompiledRoute): JsonSchema | null {
  const schema = inputSchemaOf(route.procedure);
  if (schema === null) return null;

  const supplied = serverSuppliedFields(route);
  // Optionality is peeled before converting, because an optional input on its
  // own renders as `anyOf: [{ not: {} }, …]` — true, and unreadable. Whether the
  // body may be omitted is carried by `required` below, where a reader expects
  // to find it.
  const converted = withoutSuppliedFields(
    toJsonSchema(withoutOptionality(schema)),
    supplied,
  );

  // A body whose every field the route supplies itself is not a body: asking a
  // caller to send `{}` is worse than not asking them for anything.
  const properties = converted.properties;
  if (
    converted.type === "object" &&
    properties !== undefined &&
    Object.keys(properties as JsonSchema).length === 0
  ) {
    return null;
  }

  // Once the path parameters are stripped out, what is left may be entirely
  // optional — `PATCH /rooms/{id}` with nothing to change. Demanding a body
  // then would send integrators hunting for the required field there isn't one.
  const stillDemandsFields =
    converted.type !== "object" || Array.isArray(converted.required);

  return {
    required: isRequired(schema) && stillDemandsFields,
    content: { "application/json": { schema: converted } },
  };
}

// --- prose -----------------------------------------------------------------

function scopeSentence(scopes: readonly string[]): string {
  if (scopes.length === 0) {
    return "Requires no particular scope — any valid key may call it.";
  }
  return `Requires scope(s): ${scopes.join(", ")}.`;
}

const SERVICE_PRINCIPAL_REFUSAL =
  "An API key cannot call this endpoint. Its answer is defined relative to whoever is asking, and a service principal has no timetable of its own, no bookings and no linked calendar — so rather than hand an app a confidently empty answer, it refuses with 403. Ask for the same data by explicit id instead.";

function operationDescription(route: RouteDef): string {
  const paragraphs: string[] = [];
  if (route.description) paragraphs.push(route.description);
  if (route.dangerous) {
    paragraphs.push(
      "This endpoint changes state in a way that is not obvious from its method or its name. Read it twice before wiring an app to it.",
    );
  }
  paragraphs.push(scopeSentence(route.scopes));
  if (route.actor === "session") paragraphs.push(SERVICE_PRINCIPAL_REFUSAL);
  return paragraphs.join("\n\n");
}

/**
 * `"rooms.list"` → `"roomsList"`.
 *
 * OpenAPI requires these to be unique across the whole document, and a handful
 * of procedures deliberately serve two endpoints through a `defaults` flag —
 * archive and restore are one procedure and a boolean. Where the procedure
 * alone does not distinguish them, the last static path segment does, and a
 * counter is the last resort so that a clash can never make the document
 * invalid.
 */
const pascal = (value: string): string =>
  value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);

const baseOperationId = (procedure: string): string =>
  procedure
    .split(".")
    .map((part, index) => (index === 0 ? part : pascal(part)))
    .join("");

/**
 * The verb on the end of a path — the `approve` in `/plans/{planId}/approve`.
 *
 * Only a static segment sitting after a parameter counts. The trailing segment
 * of `/semesters/{id}` is the noun the whole group is named for, and
 * `semestersUpdateSemesters` tells a reader nothing that `semestersUpdatePatch`
 * does not tell them better.
 */
const actionSegment = (path: string): string | undefined => {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1];
  if (last === undefined || last.startsWith("{")) return undefined;
  return segments.some((segment) => segment.startsWith("{")) ? last : undefined;
};

function assignOperationIds(
  routes: CompiledRoute[],
): Map<CompiledRoute, string> {
  const shared = new Map<string, number>();
  for (const route of routes) {
    const base = baseOperationId(route.procedure);
    shared.set(base, (shared.get(base) ?? 0) + 1);
  }

  const taken = new Set<string>();
  const assigned = new Map<CompiledRoute, string>();

  for (const route of routes) {
    const base = baseOperationId(route.procedure);
    let candidate = base;

    if ((shared.get(base) ?? 0) > 1) {
      const action = actionSegment(route.path);
      candidate = `${base}${pascal(action ?? route.method.toLowerCase())}`;
    }

    let unique = candidate;
    let suffix = 2;
    while (taken.has(unique)) unique = `${candidate}${suffix++}`;
    taken.add(unique);
    assigned.set(route, unique);
  }

  return assigned;
}

// --- responses -------------------------------------------------------------

const ERROR_RESPONSES: Array<[string, string]> = [
  [
    "400",
    "The request did not match what this endpoint accepts. `details` names the fields that failed.",
  ],
  ["401", "No API key, or one that is malformed, revoked or expired."],
  [
    "403",
    "Authenticated, but the key does not hold a scope this endpoint requires — or the endpoint is closed to service principals.",
  ],
  ["404", "No such record, or none this caller is permitted to know exists."],
  [
    "429",
    "This key has exceeded its rate limit. `Retry-After` says how long to wait.",
  ],
  [
    "500",
    "Something failed on our side. `details.incident` is the id to quote when reporting it.",
  ],
];

function responsesFor(route: RouteDef): JsonSchema {
  const status = String(route.status ?? 200);
  const responses: JsonSchema = {};

  responses[status] =
    status === "204"
      ? { description: "Done. No body." }
      : {
          description: "Success.",
          content: {
            "application/json": {
              // Deliberately unconstrained. The payload is whatever the tRPC
              // procedure returns, and pinning `type: "object"` here would be a
              // documented lie for every endpoint that returns a list.
              schema: {
                description:
                  "The procedure's return value, serialised as JSON. Dates are ISO 8601 strings in UTC.",
              },
            },
          },
        };

  for (const [code, description] of ERROR_RESPONSES) {
    if (code === status) continue;
    responses[code] = {
      description,
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    };
  }

  return responses;
}

// --- tags ------------------------------------------------------------------

/**
 * One line per tag, looked up case-insensitively so that "API keys" and
 * "API Keys" cannot end up documented differently. A tag with no entry still
 * appears — an undescribed group beats a missing one — and the absence is
 * visible enough in the rendered docs that somebody will add the line.
 */
const TAG_DESCRIPTIONS: Record<string, string> = {
  rooms: "Rooms and the buildings that hold them.",
  buildings: "Buildings, and the rooms grouped under them.",
  spaces: "Rooms, buildings and what can be booked.",
  timetable: "The scheduled week, read by day, room, group or person.",
  events: "Individual sittings: scheduling, moving, cancelling and booking.",
  bookings: "Room requests, and approving or rejecting them.",
  attendance: "Registers: taking them, and reading what was taken.",
  academics: "Programmes, courses, semesters and the academic calendar.",
  courses: "Courses and the programmes they belong to.",
  semesters: "Semesters and the terms they define.",
  groups: "Student groups, divisions and their membership.",
  plans: "Schedule plans: drafts of a timetable, and their approval.",
  people: "Users, their roles and the permissions those roles carry.",
  users: "User records and their linked accounts.",
  roles: "Roles and the permission bits they grant.",
  calendar: "Linked external calendars and their synchronisation.",
  "api keys": "Minting, listing and revoking the keys that call this API.",
};

function tagObjects(routes: CompiledRoute[]): JsonSchema[] {
  // First-appearance order rather than alphabetical: `ROUTES` is assembled in
  // the order the docs should read, and throwing that away would scatter a
  // deliberate narrative into an alphabet.
  const seen: string[] = [];
  for (const route of routes) {
    if (!seen.includes(route.tag)) seen.push(route.tag);
  }

  return seen.map((tag) => {
    const description = TAG_DESCRIPTIONS[tag.toLowerCase()];
    return description ? { name: tag, description } : { name: tag };
  });
}

// --- the document ----------------------------------------------------------

const API_DESCRIPTION = `
The Plannr API is a second doorway onto the application the web client already
uses. Every endpoint below calls the same procedure the browser calls, which is
the property worth knowing before you build against it: an endpoint cannot
behave differently from the app. The rule about who may cancel a lecture is
written once, and both doorways get it.

## Authenticating

Send your key as a bearer token on every request:

    Authorization: Bearer plk_live_9f3c1a7b.<secret>

The part before the full stop is the key's **prefix**. It identifies the key,
it is safe to log, and it is what you will see listed in the admin UI. The part
after it is the **secret**, which is stored only as a hash — a key is displayed
once, when an administrator mints it, and a lost key is rolled rather than
recovered. Anything beginning \`plk_live_\` is a live credential; treat a paste
of one as you would a password.

Keys are rate limited over a rolling minute. Exceeding the limit is a \`429\`
carrying \`Retry-After\`; wait that long and retry rather than backing off
blindly.

## Scopes are permissions, spelled the same way

A scope is not a second permission system layered over the app. It is the
permission it looks like: \`ManageRooms\` on a key means exactly what
\`ManageRooms\` means on a member of staff, and it is checked by the very same
code. Each operation below names the scopes it needs.

Some scopes imply others, because the app's permissions do. A key scoped
\`ManageAllEvents\` can read the timetable whether or not \`ViewAllEvents\` was
ticked — managing every event necessarily means being able to see them — so the
effective reach of a key is usually a little wider than the list that was
ticked when it was minted.

\`Administrator\` cannot be granted to a key at all. It is the flag meaning
"and everything added in future releases too", which is not a promise anybody
can make on behalf of an application they no longer control. A key gets an
enumerated list of scopes, and widening it is somebody's deliberate act.

Holding a scope is necessary, not always sufficient. Procedures narrow results
by what the caller can see, so a key scoped \`ViewAllEvents\` reads the whole
timetable while one scoped only \`ViewOwnEvents\` reads nothing at all — a
machine teaches no classes.

## A key is a service principal, not an impersonation

Your key does not act as the administrator who created it. It acts as itself: a
principal of its own, holding its own scopes and no roles, which is what makes
it safe to hand to a third party and cheap to revoke.

That buys you attribution. When a key schedules an event or files a change
request, the audit trail names the key — not a person who once clicked a button
— and revoking the key does not orphan the history it created.

It also imposes a limit, and it is the one integrators trip over. A service
principal has no personal context: it teaches nothing, books nothing for
itself, belongs to no group, and has no linked Google Calendar. Endpoints whose
answer is defined relative to whoever is asking — "my week", "my bookings",
"my calendar connection" — therefore have no truthful answer to give a key.
Rather than return a confidently empty one, they refuse with \`403\`. Every such
endpoint says so in its description; the fix is almost always to ask for the
same data by explicit id.

## Conventions

Every non-2xx response has the same shape:

    { "error": { "code": "...", "message": "...", "details": ... } }

Branch on \`code\`, which is stable; \`message\` is written for a human reading
a log and may be reworded between releases. \`details\` appears where there is
more to say — on a \`400\` it is the validation failure broken down field by
field, which is usually enough to fix the request without reading anything
else.

Each operation lists the statuses it commonly returns, but the envelope is
universal: a \`409\` from a double-booked room, or a \`422\`, looks exactly the
same and can be handled by the same code.

Timestamps are ISO 8601 in UTC. Identifiers are opaque strings — do not parse
them, and do not assume a length.
`.trim();

/** Mirrors `ApiErrorBody` in `errors.ts`, which is what actually goes out. */
const ERROR_SCHEMA: JsonSchema = {
  type: "object",
  description: "The body of every non-2xx response.",
  properties: {
    error: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "Machine-readable reason, and the thing to branch on. Failures raised by the endpoint itself use the SCREAMING_SNAKE vocabulary — `BAD_REQUEST`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`; failures of the credential itself use lower_snake — `invalid_token`, `key_revoked`, `key_expired`, `rate_limited`.",
          examples: ["FORBIDDEN", "invalid_token"],
        },
        message: {
          type: "string",
          description:
            "Human-readable explanation, written for whoever is reading the log. Show it, but do not match on it — wording changes between releases.",
        },
        details: {
          description:
            'Present only where there is more to say. On a `400` it is the flattened validation failure, field by field, which is the fastest way to see what a request got wrong. On a `500` it is `{ "incident": "…" }` — quote that id when reporting the fault.',
        },
      },
      required: ["code", "message"],
    },
  },
  required: ["error"],
};

/**
 * Builds the document. `origin` is the deployment's own scheme-and-host, so the
 * spec a caller downloads points at the server that served it rather than at a
 * hard-coded production URL that is wrong in every other environment.
 */
export function buildOpenApiDocument(origin: string): Record<string, unknown> {
  const routes = ROUTES.map(compileRoute);
  const operationIds = assignOperationIds(routes);

  // Sorted, so the document is a stable artefact: identical inputs give
  // identical bytes, and a diff of two spec dumps shows what actually changed.
  const sorted = [...routes].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );

  const paths: JsonSchema = {};

  for (const route of sorted) {
    const operation: JsonSchema = {
      operationId: operationIds.get(route)!,
      summary: route.summary,
      description: operationDescription(route),
      tags: [route.tag],
    };

    const parameters = [...pathParameters(route)];
    const source = inputSourceOf(route);

    if (source === "query") parameters.push(...queryParameters(route));
    if (parameters.length > 0) operation.parameters = parameters;

    if (source === "body") {
      const body = requestBody(route);
      if (body) operation.requestBody = body;
    }

    operation.responses = responsesFor(route);
    operation["x-plannr-procedure"] = route.procedure;
    operation["x-plannr-scopes"] = [...route.scopes].sort();
    if (route.actor === "session") operation["x-plannr-session-only"] = true;
    if (route.dangerous) operation["x-plannr-dangerous"] = true;

    const item = (paths[route.path] as JsonSchema | undefined) ?? {};
    item[route.method.toLowerCase()] = operation;
    paths[route.path] = item;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Plannr API",
      version: "1.0.0",
      description: API_DESCRIPTION,
    },
    servers: [{ url: `${origin}/api/v1` }],
    tags: tagObjects(routes),
    // Applied at the document root rather than per operation: there is no
    // anonymous endpoint, and repeating the requirement 200 times would only
    // create somewhere for one of them to be forgotten.
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "plk_live_<prefix>.<secret>",
          description:
            "An API key minted by an administrator. Sent on every request as `Authorization: Bearer <key>`.",
        },
      },
      schemas: { Error: ERROR_SCHEMA },
    },
    paths,
  };
}
