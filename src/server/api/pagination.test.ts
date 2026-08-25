import { describe, expect, it } from "vitest";
import { z } from "zod";

import { pageArgs, pageInput, toPage, wholeList } from "./pagination";

/**
 * The convention every list endpoint is being converted to, so these are the
 * assertions the rest of the API is written against. The awkward numbers are
 * the point: an empty result, a last page that is not full, and a caller asking
 * for more than the endpoint will serve are the three cases that decide whether
 * a pager on the other end renders something sane.
 */

const shape = pageInput({ defaultSize: 25, maxSize: 200 });
const schema = z.object(shape);

describe("pageInput", () => {
  it("fills in the page and size a caller did not name", () => {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  it("takes the defaults it was handed, not a house number", () => {
    const big = z.object(pageInput({ defaultSize: 500, maxSize: 1000 }));
    expect(big.parse({})).toEqual({ page: 1, pageSize: 500 });
  });

  it("spreads into an input that already has filters", () => {
    // The composition the whole design rests on: the endpoint keeps one schema
    // for its filters and its paging, so `input` arrives as one object.
    const withFilters = z
      .object({
        query: z.string().trim().max(120).optional(),
        status: z.enum(["all", "active"]).default("all"),
        ...pageInput({ defaultSize: 25, maxSize: 200 }),
      })
      .default({});

    expect(withFilters.parse(undefined)).toEqual({
      status: "all",
      page: 1,
      pageSize: 25,
    });
    expect(withFilters.parse({ query: " ada ", page: 3 })).toEqual({
      query: "ada",
      status: "all",
      page: 3,
      pageSize: 25,
    });
  });

  it("enforces the maximum, so a caller cannot ask for the whole table", () => {
    expect(schema.safeParse({ pageSize: 200 }).success).toBe(true);
    expect(schema.safeParse({ pageSize: 201 }).success).toBe(false);
    // No silent clamp: a request for 5,000 rows is refused rather than quietly
    // answered with 200, because the caller would otherwise read a truncated
    // page as the complete list.
    expect(schema.safeParse({ pageSize: 5000 }).success).toBe(false);
  });

  it("floors the page size at one and the page at one", () => {
    expect(schema.safeParse({ pageSize: 1 }).success).toBe(true);
    expect(schema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(schema.safeParse({ pageSize: -10 }).success).toBe(false);
    expect(schema.safeParse({ page: 1 }).success).toBe(true);
    // 1-based. A zero page would mean `skip: -pageSize`, which Prisma refuses.
    expect(schema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("rejects fractions rather than rounding them", () => {
    expect(schema.safeParse({ page: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ pageSize: 25.5 }).success).toBe(false);
  });

  it("refuses a default it could never serve", () => {
    // zod would run the default through `.max()` on every request that omitted
    // `pageSize`, so this has to fail when the router is built, not per call.
    expect(() => pageInput({ defaultSize: 500, maxSize: 100 })).toThrow();
    expect(() => pageInput({ defaultSize: 0, maxSize: 100 })).toThrow();
    expect(() => pageInput({ defaultSize: 25.5, maxSize: 100 })).toThrow();
  });
});

describe("pageArgs", () => {
  it("skips nothing on the first page", () => {
    expect(pageArgs({ page: 1, pageSize: 25 })).toEqual({ skip: 0, take: 25 });
  });

  it("counts whole pages from a 1-based page number", () => {
    expect(pageArgs({ page: 2, pageSize: 25 })).toEqual({ skip: 25, take: 25 });
    expect(pageArgs({ page: 7, pageSize: 10 })).toEqual({ skip: 60, take: 10 });
  });

  it("asks for a page past the end without complaining", () => {
    // The database answers nothing, `toPage` reports the real `pageCount`, and
    // the client can see it overshot. Refusing here would need a count first.
    expect(pageArgs({ page: 400, pageSize: 25 })).toEqual({
      skip: 9975,
      take: 25,
    });
  });
});

describe("toPage", () => {
  it("reports the total, not the length of the page", () => {
    const page = toPage(["a", "b"], 57, { page: 1, pageSize: 2 });
    expect(page).toEqual({
      rows: ["a", "b"],
      total: 57,
      page: 1,
      pageSize: 2,
      pageCount: 29,
    });
  });

  it("rounds a part-filled last page up into the count", () => {
    expect(toPage([], 51, { page: 1, pageSize: 25 }).pageCount).toBe(3);
    expect(toPage([], 50, { page: 1, pageSize: 25 }).pageCount).toBe(2);
  });

  it("hands back a short last page as it is", () => {
    // 57 people, 25 to a page: the third page holds seven, and `rows.length`
    // must not be talked up to `pageSize` by anything here.
    const last = toPage(new Array<string>(7).fill("x"), 57, {
      page: 3,
      pageSize: 25,
    });
    expect(last.rows).toHaveLength(7);
    expect(last.page).toBe(last.pageCount);
  });

  it("says page 1 of 1 when nothing matched", () => {
    // Not 0. A pager reading "page 1 of 0" is a contradiction, and every
    // `page <= pageCount` guard would call a perfectly ordinary request
    // out of range.
    const empty = toPage([], 0, { page: 1, pageSize: 25 });
    expect(empty).toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    });
  });

  it("echoes the page asked for, even past the end", () => {
    const overshot = toPage([], 10, { page: 9, pageSize: 25 });
    expect(overshot.page).toBe(9);
    expect(overshot.pageCount).toBe(1);
  });
});

describe("wholeList", () => {
  it("wraps a list that cannot be paged in the same envelope as one that can", () => {
    expect(wholeList(["a", "b", "c"])).toEqual({
      rows: ["a", "b", "c"],
      total: 3,
      page: 1,
      pageSize: 3,
      pageCount: 1,
    });
  });

  it("stays on one page however long the list is", () => {
    const many = wholeList(new Array<number>(500).fill(0));
    expect(many.pageCount).toBe(1);
    expect(many.pageSize).toBe(500);
    expect(many.total).toBe(500);
  });

  it("reads as a finished list when it is empty", () => {
    const empty = wholeList([]);
    expect(empty).toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 0,
      pageCount: 1,
    });
    // The two questions a client asks to decide whether to fetch more. Both
    // have to say no, and a `pageSize` of 0 still answers them correctly.
    expect(empty.rows.length < empty.pageSize).toBe(false);
    expect(empty.page < empty.pageCount).toBe(false);
  });
});

describe("the three together", () => {
  it("walks a list to its end and stops", () => {
    // What an integrator writes on day one, run against 57 rows at 25 a page.
    const everything = Array.from({ length: 57 }, (_, i) => i);
    const seen: number[] = [];

    let page = 1;
    let pageCount = 1;
    do {
      const input = schema.parse({ page });
      const { skip, take } = pageArgs(input);
      const result = toPage(
        everything.slice(skip, skip + take),
        everything.length,
        input,
      );
      seen.push(...result.rows);
      pageCount = result.pageCount;
      page += 1;
    } while (page <= pageCount);

    expect(pageCount).toBe(3);
    expect(seen).toEqual(everything);
  });
});
