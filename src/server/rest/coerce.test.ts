import { describe, expect, it } from "vitest";
import { z } from "zod";

import { coerceInput, coerceQuery, inputSchemaOf } from "./coerce";

const q = (search: string) => new URLSearchParams(search);

/** Coerce a query string and assert it survives the schema it was aimed at. */
const parse = <T extends z.ZodTypeAny>(schema: T, search: string) =>
  schema.parse(coerceQuery(schema, q(search))) as z.infer<T>;

describe("coerceQuery — scalars", () => {
  it("turns a number parameter into a number", () => {
    const schema = z.object({ minCapacity: z.number().int() });
    expect(parse(schema, "minCapacity=60")).toEqual({ minCapacity: 60 });
  });

  it("leaves a non-numeric string alone so zod reports it", () => {
    const schema = z.object({ minCapacity: z.number() });
    const coerced = coerceQuery(schema, q("minCapacity=lots"));
    expect(coerced).toEqual({ minCapacity: "lots" });

    const result = schema.safeParse(coerced);
    expect(result.success).toBe(false);
    // The message a developer sees names the type they sent, not NaN.
    expect(result.error?.issues[0]?.message).toContain("string");
  });

  it("does not read an empty value as zero", () => {
    const schema = z.object({ minCapacity: z.number() });
    expect(coerceQuery(schema, q("minCapacity="))).toEqual({
      minCapacity: "",
    });
  });

  it("reads every spelling of a boolean", () => {
    const schema = z.object({ flag: z.boolean() });
    for (const truthy of ["true", "TRUE", "1", "yes", " Yes "]) {
      expect(parse(schema, `flag=${encodeURIComponent(truthy)}`)).toEqual({
        flag: true,
      });
    }
    for (const falsy of ["false", "FALSE", "0", "no", " No "]) {
      expect(parse(schema, `flag=${encodeURIComponent(falsy)}`)).toEqual({
        flag: false,
      });
    }
  });

  it("leaves an unrecognised boolean untouched", () => {
    const schema = z.object({ flag: z.boolean() });
    expect(coerceQuery(schema, q("flag=maybe"))).toEqual({ flag: "maybe" });
    // A bare `?flag` is deliberately not true — see the note in coerce.ts.
    expect(coerceQuery(schema, q("flag"))).toEqual({ flag: "" });
  });

  it("reads an ISO string and epoch milliseconds as the same instant", () => {
    const schema = z.object({ from: z.date() });
    const iso = parse(schema, "from=2026-10-13T09:00:00.000Z");
    const epoch = parse(schema, `from=${Date.UTC(2026, 9, 13, 9)}`);
    expect(iso.from.toISOString()).toBe("2026-10-13T09:00:00.000Z");
    expect(epoch.from.getTime()).toBe(iso.from.getTime());
  });

  it("leaves an unparseable date as the string it arrived as", () => {
    const schema = z.object({ from: z.date() });
    expect(coerceQuery(schema, q("from=next+tuesday"))).toEqual({
      from: "next tuesday",
    });
  });

  it("passes enums, native enums and literals through untouched", () => {
    const Native = { LECTURE: "LECTURE", LAB: "LAB" } as const;
    const schema = z.object({
      kind: z.enum(["one", "two"]),
      type: z.nativeEnum(Native),
      fixed: z.literal("only"),
    });
    expect(parse(schema, "kind=one&type=LAB&fixed=only")).toEqual({
      kind: "one",
      type: "LAB",
      fixed: "only",
    });
  });
});

describe("coerceQuery — arrays", () => {
  const schema = z.object({ features: z.array(z.enum(["AC", "MIC"])) });

  it("accepts a repeated parameter", () => {
    expect(parse(schema, "features=AC&features=MIC")).toEqual({
      features: ["AC", "MIC"],
    });
  });

  it("accepts a single comma-separated value", () => {
    expect(parse(schema, "features=AC,MIC")).toEqual({
      features: ["AC", "MIC"],
    });
  });

  it("accepts one value as a list of one", () => {
    expect(parse(schema, "features=AC")).toEqual({ features: ["AC"] });
  });

  it("treats an empty value as an empty list", () => {
    expect(parse(schema, "features=")).toEqual({ features: [] });
  });

  it("keeps a single `features[]` a list", () => {
    expect(parse(schema, "features[]=AC")).toEqual({ features: ["AC"] });
  });

  it("accepts indexed brackets, in index order", () => {
    const days = z.object({ days: z.array(z.number().int()) });
    expect(parse(days, "days[1]=2&days[0]=1&days[2]=3")).toEqual({
      days: [1, 2, 3],
    });
  });

  it("coerces each element against the element type", () => {
    const sizes = z.object({ sizes: z.array(z.number()) });
    expect(parse(sizes, "sizes=10,20,30")).toEqual({ sizes: [10, 20, 30] });
  });
});

describe("coerceQuery — wrappers", () => {
  it("sees through optional, nullable and default", () => {
    const schema = z.object({
      a: z.number().optional(),
      b: z.number().nullable(),
      c: z.number().default(7),
    });
    expect(parse(schema, "a=1&b=2&c=3")).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("sees through refinements and transforms", () => {
    const schema = z.object({
      even: z.number().refine((n) => n % 2 === 0, "must be even"),
      doubled: z.number().transform((n) => n * 2),
    });
    expect(parse(schema, "even=4&doubled=5")).toEqual({
      even: 4,
      doubled: 10,
    });
  });

  it("sees through branded, catch, readonly, lazy and pipeline", () => {
    const schema = z.object({
      branded: z.number().brand<"Capacity">(),
      caught: z.number().catch(0),
      frozen: z.number().readonly(),
      later: z.lazy(() => z.number()),
      piped: z.number().pipe(z.number().min(1)),
    });
    expect(
      coerceQuery(schema, q("branded=1&caught=2&frozen=3&later=4&piped=5")),
    ).toEqual({ branded: 1, caught: 2, frozen: 3, later: 4, piped: 5 });
    expect(
      schema.safeParse(
        coerceQuery(schema, q("branded=1&caught=2&frozen=3&later=4&piped=5")),
      ).success,
    ).toBe(true);
  });

  it("follows a pipeline's entry side, not its output", () => {
    // The string is what the caller has to send; the number is what the
    // procedure ends up with. Coercing to the output would break the entry.
    const schema = z.object({
      when: z
        .string()
        .transform((value) => value.length)
        .pipe(z.number()),
    });
    expect(parse(schema, "when=abcd")).toEqual({ when: 4 });
  });
});

describe("coerceQuery — objects", () => {
  it("drops unknown keys from a strict object", () => {
    const schema = z.object({ known: z.number() }).strict();
    expect(coerceQuery(schema, q("known=1&_=1699&utm_source=docs"))).toEqual({
      known: 1,
    });
    expect(
      schema.safeParse(coerceQuery(schema, q("known=1&_=1699"))).success,
    ).toBe(true);
  });

  it("passes unknown keys through a passthrough object", () => {
    const schema = z.object({ known: z.number() }).passthrough();
    expect(parse(schema, "known=1&extra=hello")).toEqual({
      known: 1,
      extra: "hello",
    });
  });

  it("passes unknown keys on to a stripping object, which strips them itself", () => {
    const schema = z.object({ known: z.number() });
    expect(coerceQuery(schema, q("known=1&extra=hello"))).toEqual({
      known: 1,
      extra: "hello",
    });
    expect(parse(schema, "known=1&extra=hello")).toEqual({ known: 1 });
  });

  it("reads nested objects in bracket notation", () => {
    const schema = z.object({
      filter: z.object({ type: z.enum(["LAB"]), minCapacity: z.number() }),
    });
    expect(parse(schema, "filter[type]=LAB&filter[minCapacity]=30")).toEqual({
      filter: { type: "LAB", minCapacity: 30 },
    });
  });

  it("reads nested objects in dotted notation too", () => {
    const schema = z.object({
      filter: z.object({ type: z.enum(["LAB"]), minCapacity: z.number() }),
    });
    expect(parse(schema, "filter.type=LAB&filter.minCapacity=30")).toEqual({
      filter: { type: "LAB", minCapacity: 30 },
    });
  });

  it("reads more than one level deep", () => {
    const schema = z.object({
      a: z.object({ b: z.object({ c: z.number() }) }),
    });
    expect(parse(schema, "a[b][c]=9")).toEqual({ a: { b: { c: 9 } } });
  });
});

describe("coerceQuery — unions and records", () => {
  it("takes the first union option that parses after coercion", () => {
    const schema = z.object({ value: z.union([z.number(), z.boolean()]) });
    expect(parse(schema, "value=12")).toEqual({ value: 12 });
    expect(parse(schema, "value=true")).toEqual({ value: true });
  });

  it("hands a union back the raw value when no option fits", () => {
    const schema = z.object({ value: z.union([z.number(), z.boolean()]) });
    expect(coerceQuery(schema, q("value=neither"))).toEqual({
      value: "neither",
    });
  });

  it("resolves a discriminated union", () => {
    const schema = z.object({
      change: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("move"), minutes: z.number() }),
        z.object({ kind: z.literal("cancel"), permanent: z.boolean() }),
      ]),
    });
    expect(parse(schema, "change[kind]=move&change[minutes]=15")).toEqual({
      change: { kind: "move", minutes: 15 },
    });
    expect(parse(schema, "change[kind]=cancel&change[permanent]=yes")).toEqual({
      change: { kind: "cancel", permanent: true },
    });
  });

  it("coerces a record's values against its value type", () => {
    const schema = z.object({ counts: z.record(z.string(), z.number()) });
    expect(parse(schema, "counts[mon]=3&counts[tue]=4")).toEqual({
      counts: { mon: 3, tue: 4 },
    });
  });
});

describe("coerceQuery — edges", () => {
  it("returns undefined for a procedure that takes no input", () => {
    expect(coerceQuery(undefined, q("anything=1"))).toBeUndefined();
  });

  it("returns undefined for an empty query the schema is happy without", () => {
    expect(
      coerceQuery(z.object({ a: z.string() }).optional(), q("")),
    ).toBeUndefined();
    expect(coerceQuery(z.object({}).default({}), q(""))).toBeUndefined();
  });

  it("still builds an object for an empty query a schema demands", () => {
    expect(coerceQuery(z.object({ a: z.string() }), q(""))).toEqual({});
  });

  it("returns an unknown schema's value untouched rather than throwing", () => {
    const schema = z.object({ anything: z.any(), blob: z.unknown() });
    expect(coerceQuery(schema, q("anything=1&blob=2"))).toEqual({
      anything: "1",
      blob: "2",
    });
  });

  it("never throws, whatever the query string looks like", () => {
    const schema = z.object({ a: z.object({ b: z.number() }) });
    for (const search of [
      "a=1&a[b]=2",
      "a[b]=1&a=2",
      "a[=1",
      "a][]=1",
      "=lonely",
      "a[b][c][d][e][f][g][h][i][j][k][l][m][n]=1",
    ]) {
      expect(() => coerceQuery(schema, q(search))).not.toThrow();
    }
  });

  it("survives a self-referential lazy schema", () => {
    interface Node {
      value: number;
      child?: Node;
    }
    const node: z.ZodType<Node> = z.lazy(() =>
      z.object({ value: z.number(), child: node.optional() }),
    );
    expect(
      node.parse(coerceInput(node, { value: "1", child: { value: "2" } })),
    ).toEqual({ value: 1, child: { value: 2 } });
  });
});

describe("coerceInput", () => {
  it("coerces path parameters merged in on top of the query", () => {
    const schema = z.object({ id: z.number().int(), verbose: z.boolean() });
    // `/things/{id}` gives a string id, exactly like the query string does.
    expect(
      schema.parse(coerceInput(schema, { id: "42", verbose: "true" })),
    ).toEqual({ id: 42, verbose: true });
  });
});

describe("inputSchemaOf", () => {
  it("returns undefined for a procedure with no input", () => {
    expect(inputSchemaOf({ _def: { inputs: [] } })).toBeUndefined();
    expect(inputSchemaOf({ _def: {} })).toBeUndefined();
    expect(inputSchemaOf(undefined)).toBeUndefined();
    expect(inputSchemaOf(null)).toBeUndefined();
    expect(inputSchemaOf("rooms.list")).toBeUndefined();
  });

  it("returns the single declared schema", () => {
    const schema = z.object({ id: z.string() });
    expect(inputSchemaOf({ _def: { inputs: [schema] } })).toBe(schema);
  });

  it("merges the shapes when a procedure declared its input twice", () => {
    const merged = inputSchemaOf({
      _def: {
        inputs: [z.object({ a: z.number() }), z.object({ b: z.boolean() })],
      },
    });
    expect(merged).toBeDefined();
    expect(merged?.parse(coerceInput(merged, { a: "1", b: "true" }))).toEqual({
      a: 1,
      b: true,
    });
  });

  it("ignores anything on `inputs` that is not a schema", () => {
    const schema = z.object({ id: z.string() });
    expect(inputSchemaOf({ _def: { inputs: [null, schema, 7] } })).toBe(schema);
  });
});

describe("a real procedure's input", () => {
  // The shape of `rooms.list`, copied rather than imported so this test keeps
  // working when that router changes — what is under test is the coercion, not
  // the room filter.
  const RoomType = {
    LECTURE: "LECTURE",
    LAB: "LAB",
    SEMINAR: "SEMINAR",
  } as const;
  const RoomFeature = { AC: "AC", MIC: "MIC", PROJECTOR: "PROJECTOR" } as const;

  const roomsList = z
    .object({
      query: z.string().trim().optional(),
      buildingId: z.string().cuid().optional(),
      type: z.nativeEnum(RoomType).optional(),
      minCapacity: z.number().int().min(0).optional(),
      features: z.array(z.nativeEnum(RoomFeature)).optional(),
      includeInactive: z.boolean().default(false),
    })
    .default({});

  it("round-trips a full query string into a successful parse", () => {
    const search =
      "query=lab&buildingId=clx0000000000000000000000&type=LAB" +
      "&minCapacity=60&features=AC,PROJECTOR&includeInactive=true";

    expect(roomsList.parse(coerceQuery(roomsList, q(search)))).toEqual({
      query: "lab",
      buildingId: "clx0000000000000000000000",
      type: "LAB",
      minCapacity: 60,
      features: ["AC", "PROJECTOR"],
      includeInactive: true,
    });
  });

  it("lets the schema's own defaults fill an empty query", () => {
    expect(roomsList.parse(coerceQuery(roomsList, q("")))).toEqual({
      includeInactive: false,
    });
  });

  it("applies repeated feature parameters the same way", () => {
    expect(
      roomsList.parse(coerceQuery(roomsList, q("features=AC&features=MIC"))),
    ).toEqual({ features: ["AC", "MIC"], includeInactive: false });
  });

  it("reports a bad enum against the field, not the type", () => {
    const result = roomsList.safeParse(
      coerceQuery(roomsList, q("type=CANTEEN")),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["type"]);
  });

  it("reports a date window's failure per field", () => {
    // `rooms.availability` takes two dates and nothing optional about them.
    const availability = z.object({ from: z.date(), to: z.date() });
    const good = availability.parse(
      coerceQuery(
        availability,
        q("from=2026-10-13T09:00Z&to=2026-10-13T10:00Z"),
      ),
    );
    expect(good.to.getTime() - good.from.getTime()).toBe(60 * 60 * 1000);

    const bad = availability.safeParse(
      coerceQuery(availability, q("from=2026-10-13T09:00Z&to=whenever")),
    );
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(["to"]);
  });
});
