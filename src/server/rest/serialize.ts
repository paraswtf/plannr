/**
 * Turning what a procedure returns into JSON anyone can read.
 *
 * tRPC's own transport is superjson, and for the browser that is exactly
 * right: a Date goes out as `{"json":"2026-10-13T09:00:00.000Z","meta":{...}}`
 * and comes back a Date, with no parsing code on either side. It is also
 * completely unusable as a public API. A superjson payload is a wire format
 * with a client library attached — a script in Python, a Google Apps Script
 * bound to somebody's attendance sheet, a `curl | jq` in a cron job all have to
 * learn a bespoke envelope before they can read a field. That trade buys the
 * browser a convenience it already has and costs every other caller a
 * dependency.
 *
 * So this API emits plain JSON, and pays the one price that entails: a Date
 * becomes an ISO 8601 string and the caller parses it. Every language on earth
 * parses ISO 8601.
 *
 * The rest of the rules exist because the values Prisma hands back are not all
 * JSON-shaped, and `JSON.stringify` deals with the awkward ones by throwing
 * (BigInt) or by quietly emitting something wrong (a Map becomes `{}`). Each
 * conversion below is the honest reading of the value, chosen so that no
 * response can ever fail to serialise halfway through and leave a client with
 * a truncated body.
 */

/** Prisma's Decimal, recognised by shape rather than by importing it. */
interface DecimalLike {
  toFixed: () => string;
  /** decimal.js keeps the digit array here; nothing else in a payload does. */
  d: unknown;
}

const isDecimal = (value: object): value is DecimalLike =>
  "d" in value &&
  typeof (value as { toFixed?: unknown }).toFixed === "function";

/**
 * A deep, JSON-safe copy of `value`.
 *
 * Not a stringifier — the result is handed to `JSON.stringify`, or to
 * `Response.json`, or asserted against in a test. Keeping the two steps apart
 * means the same conversion serves the OpenAPI examples and the docs console
 * without either of them re-parsing a string.
 */
export function toJson(value: unknown): unknown {
  return convert(value, new WeakSet<object>());
}

function convert(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      // NaN and ±Infinity have no JSON spelling. `JSON.stringify` writes
      // `null` for them, and doing it here keeps the copy and the string in
      // agreement about what the response says.
      return Number.isFinite(value) ? value : null;
    case "bigint":
      // Decimal, not hex, and a string rather than a number: an event id or a
      // row count past 2^53 would lose its last digits the moment a JavaScript
      // client parsed it back.
      return value.toString();
    case "function":
    case "symbol":
      // Treated as absent, exactly as `JSON.stringify` treats them.
      return undefined;
  }

  if (typeof value !== "object") return value;

  if (value instanceof Date) {
    // An Invalid Date is a bug upstream, but it is not worth a 500 in the
    // middle of a 300-row week. `null` says "no time" and the log still has
    // whatever caused it.
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (isDecimal(value)) {
    // A string, for the same reason as BigInt: a currency or a credit weight
    // that survived the database exactly should not be rounded by the reader.
    return value.toFixed();
  }

  if (ancestors.has(value)) return "[Circular]";

  // Tracked as an *ancestor* chain, not as "everything seen so far". A payload
  // where two rows reference the same building object is a graph, not a cycle,
  // and a seen-set that never forgets would replace the second copy with
  // "[Circular]" — a wrong answer that would look like a caching bug for days.
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => {
        const converted = convert(item, ancestors);
        // An array's length is part of its meaning, so a hole becomes `null`
        // rather than vanishing and shifting everything after it.
        return converted === undefined ? null : converted;
      });
    }

    if (value instanceof Set) {
      return [...value].map((item) => convert(item, ancestors) ?? null);
    }

    if (value instanceof Map) {
      const out: Record<string, unknown> = {};
      for (const [key, item] of value) {
        const converted = convert(item, ancestors);
        if (converted !== undefined) out[String(key)] = converted;
      }
      return out;
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const converted = convert(item, ancestors);
      // An omitted key and a `null` one mean different things to a client —
      // "this endpoint did not say" against "this row has no room" — so an
      // `undefined` field is dropped and a `null` one is kept.
      if (converted !== undefined) out[key] = converted;
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}
