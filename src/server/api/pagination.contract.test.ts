import { describe, expect, it, vi } from "vitest";

/**
 * The convention itself, asserted against every procedure that claims it.
 *
 * `pagination.test.ts` proves that `pageInput`, `pageArgs` and `toPage` behave.
 * That is a different question from the one here, and the easier one. This file
 * asks whether the twenty-odd list procedures scattered across
 * `src/server/api/routers/` actually follow the convention those helpers exist
 * to express — because a convention is only worth having while every member of
 * it is a member, and the twenty-second one is written by somebody who copied
 * the twenty-first at two in the morning.
 *
 * The three rules below are the ones with teeth, and each of them is a bug that
 * ships quietly rather than a test that fails loudly:
 *
 *   - **Both halves or neither.** A `page` with no `pageSize` is an input a
 *     caller can move through but not size, and `pageArgs` cannot even compute
 *     a `skip` from it.
 *   - **Both defaulted.** An integrator who has never read a word about paging
 *     sends no query string at all. That request has to work, and it has to
 *     come back with a sensible page rather than a validation error.
 *   - **A ceiling on the size.** Without one, `?pageSize=999999` is exactly the
 *     unbounded read the envelope was introduced to stop, with a query
 *     parameter in front of it.
 *
 * Only queries are examined. A mutation with a page in it is caught one layer
 * out, by `src/server/rest/registry.test.ts`, which requires every paginated
 * route to be a GET — and a GET can never be a mutation.
 *
 * The scaffolding is the same three pieces `registry.test.ts` and
 * `openapi.test.ts` explain at length: introspecting `appRouter` means
 * importing it, which drags in the environment schema, next-auth and a Prisma
 * client, none of which is used here and all of which would turn a unit test
 * into one that needs a `.env` and a database.
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

import { appRouter } from "~/server/api/root";

/** The two field names that, between them, are the whole convention. */
const PAGE_FIELDS = ["page", "pageSize"] as const;

interface ProcedureLike {
  _def?: { inputs?: unknown[]; type?: string };
}

// --- zod introspection -----------------------------------------------------
//
// Read through `_def.typeName` rather than `instanceof`, exactly as `openapi.ts`
// and `registry.test.ts` do and for the same reason: two copies of zod on disk
// would make every `instanceof` false, and this file would then report a clean
// bill of health for a convention it had stopped being able to see. The
// vacuity guard below is the second half of that defence.

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

/**
 * A schema's top-level fields, by name, keeping the field schemas themselves.
 *
 * `registry.test.ts` needs only the names; here the assertions are about what
 * each field will and will not accept, so the schemas have to survive the walk.
 * A `Map` rather than an object so that a field called `constructor` is a field
 * and not a surprise.
 */
function fieldsOf(schema: unknown, depth = 0): Map<string, unknown> {
  if (depth > MAX_UNWRAP_DEPTH) return new Map();
  const inner = unwrap(schema);
  const typeName = typeNameOf(inner);

  if (typeName === "ZodObject") {
    const shape = defOf(inner)?.shape;
    if (typeof shape !== "function") return new Map();
    try {
      return new Map(
        Object.entries((shape as () => Record<string, unknown>)()),
      );
    } catch {
      return new Map();
    }
  }

  // Walked because an input assembled as `z.object({ id }).and(rest)` still has
  // every field of both halves, and a reader of one half would conclude other-
  // wise. Nothing pages through an intersection today; that is not a promise.
  if (typeName === "ZodIntersection") {
    return new Map([
      ...fieldsOf(defOf(inner)?.left, depth + 1),
      ...fieldsOf(defOf(inner)?.right, depth + 1),
    ]);
  }

  return new Map();
}

/** Every field of a procedure's input, with stacked `.input()` calls folded in. */
function inputFieldsOf(procedure: ProcedureLike): Map<string, unknown> {
  const inputs = procedure._def?.inputs;
  const entries = (Array.isArray(inputs) ? inputs : []).flatMap((input) => [
    ...fieldsOf(input),
  ]);
  return new Map(entries);
}

/** What a schema makes of a value, with a rejection reported rather than thrown. */
function parsed(
  schema: unknown,
  value: unknown,
): { ok: boolean; data?: unknown } {
  try {
    const result = (
      schema as {
        safeParse: (input: unknown) => { success: boolean; data?: unknown };
      }
    ).safeParse(value);
    return { ok: result.success, data: result.data };
  } catch {
    return { ok: false };
  }
}

const PROCEDURES = appRouter._def.procedures as unknown as Record<
  string,
  ProcedureLike | undefined
>;

interface Paginated {
  name: string;
  fields: Map<string, unknown>;
}

/**
 * Every query that names either half of the pair.
 *
 * Keyed on *either* rather than on `page` alone, which is what lets the first
 * assertion catch the pair broken from both directions. A procedure taking a
 * lone `pageSize` is no more finished than one taking a lone `page`, and
 * selecting on `page` would leave it entirely unexamined.
 */
const PAGINATED: Paginated[] = Object.entries(PROCEDURES)
  .filter(([, procedure]) => procedure?._def?.type === "query")
  .map(([name, procedure]) => ({ name, fields: inputFieldsOf(procedure!) }))
  .filter(({ fields }) => PAGE_FIELDS.some((field) => fields.has(field)))
  .sort((a, b) => a.name.localeCompare(b.name));

const why = (rule: string) =>
  `${rule}\n\n` +
  `Every paginated input in this app is built with pageInput({ defaultSize, maxSize }) from\n` +
  `src/server/api/pagination.ts, which gets all of this right by construction. If this\n` +
  `procedure is hand-rolling its paging, stop — spread pageInput into the input object and\n` +
  `hand the parsed input to pageArgs and toPage.`;

describe("the paging convention", () => {
  /**
   * Every assertion below is a loop over `PAGINATED`, so an empty `PAGINATED`
   * is a green suite that checks nothing — the failure mode of any test shaped
   * like this one, and the likeliest way this file stops working without
   * anybody noticing, since it depends on zod internals to find its subjects.
   *
   * The two anchors are the ends of the range on purpose: `users.list` was
   * paged before this convention existed and `rooms.list` was converted to it.
   * Losing sight of either means the walk above is broken rather than that the
   * app changed.
   */
  it("can still see the procedures it is meant to be checking", () => {
    const names = PAGINATED.map(({ name }) => name);
    const message = why(
      `The introspection in this file found ${names.length} paginated quer${names.length === 1 ? "y" : "ies"} ` +
        `and expected to find at least users.list and rooms.list among them.\n` +
        `Unless both were genuinely renamed, the walk over the zod schemas has stopped working — probably\n` +
        `because zod's internals moved — and every other assertion in this file is now passing over an\n` +
        `empty list rather than checking anything.`,
    );

    expect(names, message).toContain("users.list");
    expect(names, message).toContain("rooms.list");
  });

  it("takes a page size wherever it takes a page, and the other way round", () => {
    for (const { name, fields } of PAGINATED) {
      const missing = PAGE_FIELDS.filter((field) => !fields.has(field));

      expect(
        missing,
        why(
          `"${name}" takes [${PAGE_FIELDS.filter((field) => fields.has(field)).join(", ")}] but not [${missing.join(", ")}].\n` +
            `The two are one feature. A page number with no size is a walk through pages whose length the\n` +
            `caller cannot choose and the response cannot state; a size with no number is a single page that\n` +
            `nothing can move past. pageArgs needs both to work out a skip, and toPage needs both to fill in\n` +
            `the envelope, so half the pair is not half a feature — it is a procedure that cannot page.`,
        ),
      ).toEqual([]);
    }
  });

  /**
   * The rule that makes paging additive rather than a breaking change.
   *
   * A caller who sends nothing must get a page, because that is every caller
   * the day before they read the docs — and, over HTTP, every request with no
   * query string on it at all.
   */
  it("defaults both, so a caller who names neither still gets a page", () => {
    for (const { name, fields } of PAGINATED) {
      for (const field of PAGE_FIELDS) {
        const schema = fields.get(field);
        // Absent is a failure of the assertion above; not worth two reports.
        if (schema === undefined) continue;

        const result = parsed(schema, undefined);
        const usable =
          result.ok &&
          typeof result.data === "number" &&
          Number.isInteger(result.data) &&
          result.data >= 1;

        expect(
          usable,
          why(
            `"${name}" does not turn an omitted "${field}" into a usable number — it answers ` +
              `${result.ok ? (JSON.stringify(result.data) ?? "undefined") : "a validation error"}.\n` +
              `Paging has to be something a caller opts into, never something they are conscripted for: a\n` +
              `request that names no page at all is the ordinary case, and it must come back with page 1 of\n` +
              `a size this endpoint chose. An .optional() here instead of a .default() type-checks and then\n` +
              `hands pageArgs an undefined, which it turns into skip: NaN — a query Prisma refuses, on a code\n` +
              `path nothing in the app exercises because the app always sends a page.\n` +
              `(zod runs a default through the field's own checks, so this also fails when the default is a\n` +
              `size above the maximum — a page the endpoint promises and then refuses to serve.)`,
          ),
        ).toBe(true);
      }
    }
  });

  /**
   * The one that decides how big a response this API can be made to produce.
   */
  it("caps the page size, so the response is bounded whatever is asked for", () => {
    for (const { name, fields } of PAGINATED) {
      const schema = fields.get("pageSize");
      if (schema === undefined) continue;

      expect(
        parsed(schema, Number.MAX_SAFE_INTEGER).ok,
        why(
          `"${name}" accepts pageSize=${Number.MAX_SAFE_INTEGER}, so it has no maximum.\n` +
            `The whole point of the envelope is that the size of a response is decided here rather than by\n` +
            `whoever is calling: an unbounded pageSize hands that decision straight back, and one careless\n` +
            `integrator — or one bored one — can ask a single request to load and serialise the entire table.\n` +
            `Name a maxSize you would be happy to see go out over the wire. It is a ceiling, not a default,\n` +
            `so it costs nothing to set generously.`,
        ),
      ).toBe(false);
    }
  });
});
