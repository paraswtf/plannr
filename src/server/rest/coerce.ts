import { z } from "zod";

/**
 * Making a query string look like what a procedure's schema already asks for.
 *
 * Every input schema in `src/server/api/routers` was written for a caller that
 * can send real types. The browser talks to tRPC through superjson, so
 * `z.date()` receives a Date, `z.number()` a number and `z.array()` an array,
 * and the schemas say exactly what the domain means. A REST `GET` has none of
 * that: `?minCapacity=60&from=2026-10-13T09:00Z&features=AC,MIC` is three
 * strings, and handing those to `rooms.list` would fail validation on all
 * three.
 *
 * The obvious fix — rewriting the routers with `z.coerce.number()` and
 * friends — was rejected. It would loosen the browser path too, so a form that
 * accidentally posted `"12"` would sail through where today it is caught, and
 * it would push a concern belonging to one doorway into code that serves both.
 * Instead this module reads the schema the router already declared and
 * converts the strings towards it. The schema stays the single description of
 * what an endpoint accepts, and it goes on being enforced by zod.
 *
 * Two rules govern everything below:
 *
 *   - **Best effort, never throwing.** A value that cannot be converted is
 *     handed on untouched. zod is the only thing here that judges an input,
 *     and its message names the field and says what it wanted, which is far
 *     more useful than anything this file could invent.
 *   - **Introspection is defensive.** Schemas are read through
 *     `_def.typeName`, a zod v3 internal. An unrecognised `typeName` returns
 *     the value as-is, so the worst a zod upgrade can do is stop coercing —
 *     never corrupt a value or crash a request.
 */

/** A leaf as it arrives from the wire: one value, or a repeated parameter. */
type RawLeaf = string | string[];
type RawNode = RawLeaf | RawTree;
interface RawTree {
  [key: string]: RawNode;
}

/**
 * The slice of zod's internals this file reads.
 *
 * Declared structurally rather than imported, because zod does not export the
 * def types in a usable shape and because naming the handful of fields we
 * depend on makes the coupling to zod's internals visible in one place.
 */
interface ZodDefLike {
  typeName?: string;
  /** ZodOptional, ZodNullable, ZodDefault, ZodCatch, ZodReadonly. */
  innerType?: z.ZodTypeAny;
  /** ZodEffects — the schema the transform or refinement is layered on. */
  schema?: z.ZodTypeAny;
  /** ZodArray's element type, and ZodBranded's underlying type. */
  type?: z.ZodTypeAny;
  /** ZodPipeline's entry side. */
  in?: z.ZodTypeAny;
  getter?: () => z.ZodTypeAny;
  options?: z.ZodTypeAny[];
  valueType?: z.ZodTypeAny;
  shape?: () => Record<string, z.ZodTypeAny>;
  unknownKeys?: string;
}

const defOf = (schema: z.ZodTypeAny): ZodDefLike =>
  (schema as unknown as { _def?: ZodDefLike })._def ?? {};

/** Runs a zod internal we do not control, treating any throw as "no answer". */
function safely<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date);

/**
 * Recognises a zod schema structurally, not with `instanceof`.
 *
 * Two copies of zod in one `node_modules` — a transitive dependency pinning a
 * different patch — would break `instanceof` and silently disable coercion for
 * the whole API. A shape check cannot be defeated that way.
 */
const isZodSchema = (value: unknown): value is z.ZodTypeAny =>
  typeof value === "object" &&
  value !== null &&
  "_def" in value &&
  typeof (value as { safeParse?: unknown }).safeParse === "function";

// Guards against a self-referential `z.lazy` chain and against a query string
// crafted to nest a thousand levels deep. Neither is reachable through the
// routes we publish; both are cheap to make impossible.
const MAX_UNWRAP = 20;
const MAX_DEPTH = 12;

/**
 * Peels the wrappers that decorate a schema without changing what a value must
 * look like on the way in.
 *
 * `z.number().optional()` still wants a number; `z.string().datetime().pipe(...)`
 * still wants a string. For a pipeline it is deliberately the *entry* side we
 * follow — the output side describes what the procedure ends up with, which is
 * not what the caller has to send.
 */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;

  for (let step = 0; step < MAX_UNWRAP; step += 1) {
    const def = defOf(current);
    let next: z.ZodTypeAny | undefined;

    switch (def.typeName) {
      case "ZodOptional":
      case "ZodNullable":
      case "ZodDefault":
      case "ZodCatch":
      case "ZodReadonly":
        next = def.innerType;
        break;
      case "ZodEffects":
        next = def.schema;
        break;
      case "ZodBranded":
        next = def.type;
        break;
      case "ZodPipeline":
        next = def.in;
        break;
      case "ZodLazy":
        next = safely(() => def.getter?.());
        break;
      default:
        return current;
    }

    if (!isZodSchema(next)) return current;
    current = next;
  }

  return current;
}

function coerce(schema: z.ZodTypeAny, value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return value;

  const inner = unwrap(schema);
  const def = defOf(inner);

  switch (def.typeName) {
    case "ZodObject":
      return coerceObject(def, value, depth);
    case "ZodRecord":
      return coerceRecordValues(def, value, depth);
    case "ZodArray":
      return coerceArray(def, value, depth);
    case "ZodNumber":
      return coerceNumber(value);
    case "ZodBoolean":
      return coerceBoolean(value);
    case "ZodDate":
      return coerceDate(value);
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return coerceUnion(def, value, depth);
    // ZodString, ZodEnum, ZodNativeEnum and ZodLiteral all want the string
    // exactly as it arrived. Prisma's enums are string-valued to a one, so
    // there is genuinely nothing to convert — and passing `"LAB"` through
    // unchanged is what lets zod say "expected one of LECTURE | LAB | …"
    // instead of complaining about a type.
    default:
      return value;
  }
}

function coerceObject(def: ZodDefLike, value: unknown, depth: number): unknown {
  if (!isPlainRecord(value)) return value;

  const shape = safely(() => def.shape?.()) ?? {};
  // A strict object refuses unknown keys outright, and a query string routinely
  // carries keys the procedure never asked for: a cache-buster `_=1699`, a
  // tracing parameter, the docs console's own scratch state. Dropping them is
  // the difference between an endpoint that works from a browser address bar
  // and one that 400s on somebody else's URL hygiene. A stripping or
  // passthrough object handles unknown keys perfectly well on its own, so
  // there we hand everything over and let the schema decide.
  const strict = def.unknownKeys === "strict";

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    const field = shape[key];
    if (isZodSchema(field)) {
      out[key] = coerce(field, raw, depth + 1);
    } else if (!strict) {
      out[key] = raw;
    }
  }
  return out;
}

function coerceRecordValues(
  def: ZodDefLike,
  value: unknown,
  depth: number,
): unknown {
  if (!isPlainRecord(value)) return value;
  const valueType = def.valueType;
  if (!isZodSchema(valueType)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    out[key] = coerce(valueType, raw, depth + 1);
  }
  return out;
}

/**
 * Both spellings of a list, because both are in the wild.
 *
 * `?features=AC&features=MIC` is what an HTML form and every HTTP library
 * emit; `?features=AC,MIC` is what a person types into an address bar and what
 * most API docs show. Supporting one and not the other means somebody loses an
 * afternoon to a filter that silently matched a single value called "AC,MIC".
 */
function elementsOf(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value as unknown[];

  if (typeof value === "string") {
    // `?features=` is an explicit empty list, not a list containing "".
    if (value.trim().length === 0) return [];
    return value.split(",").map((part) => part.trim());
  }

  if (isPlainRecord(value)) {
    // `?days[0]=MON&days[1]=TUE` — what `qs` and axios emit by default.
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => value[key]);
    }
  }

  return null;
}

function coerceArray(def: ZodDefLike, value: unknown, depth: number): unknown {
  const elements = elementsOf(value);
  if (!elements) return value;

  const element = def.type;
  if (!isZodSchema(element)) return elements;
  return elements.map((item) => coerce(element, item, depth + 1));
}

function coerceNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  // `Number("")` is 0, which would turn `?minCapacity=` into a filter nobody
  // asked for. An empty value is left alone so zod reports it.
  if (trimmed.length === 0) return value;

  const parsed = Number(trimmed);
  // Handing the original string back on NaN is deliberate: zod then says
  // "expected number, received string", which points at the real problem,
  // rather than "expected number, received nan", which points at this file.
  return Number.isNaN(parsed) ? value : parsed;
}

const TRUTHY = new Set(["true", "1", "yes"]);
const FALSY = new Set(["false", "0", "no"]);

function coerceBoolean(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const token = value.trim().toLowerCase();
  if (TRUTHY.has(token)) return true;
  if (FALSY.has(token)) return false;
  // Note what is *not* here: a bare `?includeInactive` with no value. Some
  // clients mean "true" by it and others emit exactly the same thing for a
  // field they left blank, so reading it either way would be a guess about
  // somebody's HTTP library. Spell the value.
  return value;
}

const DIGITS_ONLY = /^-?\d+$/;

function coerceDate(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (trimmed.length === 0) return value;

  // A digits-only value is epoch milliseconds. ISO 8601 always carries a
  // separator — a dash, a colon or a `T` — so the two cannot be confused, with
  // the single exception of a bare year, which is not a moment anybody means
  // when they are asking for a timetable window.
  const date = DIGITS_ONLY.test(trimmed)
    ? new Date(Number(trimmed))
    : new Date(trimmed);

  return Number.isNaN(date.getTime()) ? value : date;
}

/**
 * The first option that actually parses wins.
 *
 * Trying each rather than reading a discriminated union's discriminator keeps
 * one code path for both kinds of union, and costs nothing at the sizes any
 * input schema here reaches. The *coerced* value is returned, never the parsed
 * one — the procedure has to run its own validation, and handing it an already
 * transformed value would apply every transform twice.
 */
function coerceUnion(def: ZodDefLike, value: unknown, depth: number): unknown {
  for (const option of def.options ?? []) {
    if (!isZodSchema(option)) continue;
    const candidate = coerce(option, value, depth + 1);
    if (safely(() => option.safeParse(candidate).success) === true) {
      return candidate;
    }
  }
  return value;
}

/**
 * A key's path into the input object.
 *
 * Bracket notation is the primary spelling — `?filter[type]=LAB` — because it
 * is unambiguous and because it is what `qs`, Rails, PHP and every HTTP client
 * that has ever serialised a nested object already produce. Dots are supported
 * too, since they cost one `split`, but they are second class for a reason: a
 * dot is an ordinary character in a field name, so `?a.b=1` is genuinely
 * ambiguous in a way that `?a[b]=1` is not. No input schema in this app has a
 * dotted key today, and if one ever does, bracket notation still reaches it.
 *
 * `?features[]=AC` — a trailing empty bracket — marks the value as a list even
 * when only one arrived, which is the one thing repeated parameters cannot
 * express.
 */
function keyPath(key: string): { path: string[]; list: boolean } {
  const bracket = key.indexOf("[");
  const head = bracket === -1 ? key : key.slice(0, bracket);
  const rest = bracket === -1 ? "" : key.slice(bracket);

  const path = head.split(".").filter((segment) => segment.length > 0);
  let list = false;

  for (const match of rest.matchAll(/\[([^\]]*)\]/g)) {
    const segment = match[1] ?? "";
    if (segment.length === 0) {
      list = true;
      continue;
    }
    path.push(segment);
  }

  return { path: path.length > 0 ? path : [key], list };
}

function place(tree: RawTree, path: string[], leaf: RawLeaf): void {
  let node = tree;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]!;
    const existing = node[segment];
    if (existing === undefined) {
      const child: RawTree = {};
      node[segment] = child;
      node = child;
      continue;
    }
    // `?a=1&a[b]=2` contradicts itself. Rather than pick a winner, the first
    // writer keeps the key and the second is dropped — zod will then report
    // whichever one is wrong, against the field the caller actually named.
    if (typeof existing === "string" || Array.isArray(existing)) return;
    node = existing;
  }

  node[path[path.length - 1]!] = leaf;
}

/** The query string as a nested tree of strings, before any schema is read. */
function treeOf(query: URLSearchParams): RawTree {
  const tree: RawTree = {};
  for (const key of new Set(query.keys())) {
    const values = query.getAll(key);
    const { path, list } = keyPath(key);
    place(tree, path, values.length > 1 || list ? values : values[0]!);
  }
  return tree;
}

/**
 * A query string, converted into the shape a procedure's input schema expects.
 *
 * Returns `undefined` for a procedure that takes no input, and also for an
 * empty query string whose schema is happy with `undefined` — a `GET` with
 * nothing on it means "no arguments", and saying so lets `.default({})` do its
 * job instead of being handed an `{}` that only looks the same.
 */
export function coerceQuery(
  schema: z.ZodTypeAny | undefined,
  query: URLSearchParams,
): unknown {
  if (!schema) return undefined;

  const tree = treeOf(query);
  if (Object.keys(tree).length === 0 && acceptsUndefined(schema)) {
    return undefined;
  }
  return coerce(schema, tree, 0);
}

const acceptsUndefined = (schema: z.ZodTypeAny): boolean =>
  safely(() => schema.safeParse(undefined).success) ?? false;

/**
 * The same walk, for a value that is already an object.
 *
 * The route handler merges path parameters — `/rooms/{id}` — in on top of the
 * query, and those are strings too. Coercing the merged object rather than the
 * query alone is what stops `/events/{id}` breaking the day somebody writes a
 * procedure whose id is a number.
 */
export function coerceInput(
  schema: z.ZodTypeAny | undefined,
  value: unknown,
): unknown {
  if (!schema) return undefined;
  return coerce(schema, value, 0);
}

/**
 * A tRPC procedure's input schema, or `undefined` when it takes none.
 *
 * `_def.inputs` is an array because `.input()` may be called more than once,
 * in which case tRPC parses each in turn and merges the results. Merging the
 * object shapes reproduces that faithfully for the case that occurs — every
 * procedure in this app declares its input once — and falls back to the first
 * schema for the exotic case, since that is the one the raw request meets.
 */
export function inputSchemaOf(procedure: unknown): z.ZodTypeAny | undefined {
  const inputs = (
    procedure as { _def?: { inputs?: unknown } } | null | undefined
  )?._def?.inputs;
  if (!Array.isArray(inputs)) return undefined;

  const schemas = inputs.filter(isZodSchema);
  if (schemas.length === 0) return undefined;
  return schemas.reduce(mergeInputs);
}

function mergeInputs(a: z.ZodTypeAny, b: z.ZodTypeAny): z.ZodTypeAny {
  if (a instanceof z.ZodObject && b instanceof z.ZodObject) {
    return safely(() => a.merge(b) as z.ZodTypeAny) ?? a;
  }
  return a;
}
