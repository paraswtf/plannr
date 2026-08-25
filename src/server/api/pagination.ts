import { z } from "zod";

/**
 * One shape for every list this API hands back.
 *
 * Before this module, `users.list` returned an envelope, `events.approvalQueue`
 * took a `take` cap, and a dozen others — rooms, groups, courses, roles,
 * semesters, buildings, plans, API keys — returned a bare array with nothing at
 * all bounding it. Two costs, and the second is the expensive one. An
 * integrator had to learn the paging rules one endpoint at a time, discovering
 * per call whether the answer was complete. And `GET /events` over a full term
 * answered with however many rows that term happened to hold, which is a
 * response size decided by the college's timetable rather than by us.
 *
 * The REST layer cannot fix either on its own. It is declarative — a `RouteDef`
 * names a procedure and `handler.ts` calls it — and it deliberately contains no
 * behaviour, so the envelope has to be what the procedures themselves return.
 * That is what this module is for, and it is why converting a procedure changes
 * the HTTP response shape: the two are the same thing by design.
 *
 * ## The envelope
 *
 * `{ rows, total, page, pageSize, pageCount }`, the shape `users.list` already
 * returned. Kept rather than redesigned. Cursors were the obvious alternative
 * and were rejected: they buy stable paging across a list that is being edited
 * underneath the reader, which nothing here suffers from at these sizes, and
 * they cost every caller the ability to ask for page 7 or to render a pager
 * that says "of 12" — which is exactly what the directory screen does today.
 *
 * `total` is the count of everything matching the filter, not the length of
 * `rows`. `pageCount` is derived, never stored, and never zero (see `toPage`).
 *
 * ## The default page size is a safety decision, not a preference
 *
 * This is the part a future reader must not undo.
 *
 * Turning an unbounded array into page 1 of a paginated one silently truncates
 * every screen that renders the whole list. A faculty picker that quietly loses
 * everyone after the fiftieth name is a worse bug than the unbounded response
 * it replaced: it is wrong, it looks entirely right, and the person it hurts is
 * the one who cannot find their own supervisor and has no way to tell that the
 * list is lying. The unbounded version was at least honest.
 *
 * So there is no house default page size, and `pageInput` refuses to invent
 * one — every call site states `defaultSize` and `maxSize` outright, because
 * having to type a number is what makes somebody think about the list in front
 * of them. How to choose them:
 *
 *   - **`defaultSize` covers the whole of that list as it stands today, with
 *     room to grow.** A caller who has never heard of paging must keep getting
 *     everything. Buildings, roles, semesters and terms are counted in tens, so
 *     a few hundred is past anything a plausible institution will reach. People,
 *     groups, courses and rooms are counted in hundreds, so be generous — a few
 *     hundred to a couple of thousand. Events over a term are the one genuinely
 *     unbounded list and are the reason any of this exists; they get a real
 *     page size and callers are expected to page.
 *   - **`maxSize` bounds the response, whatever the caller asks for.** It is
 *     the ceiling the endpoint promises never to exceed, and it is what an
 *     integrator opts *into* with `?pageSize=`. It should be comfortably above
 *     `defaultSize` and still be a response you would be happy to serialise.
 *   - **Smaller defaults are opted into, never imposed.** `users.list` defaults
 *     to 25 because the directory screen has been paged since its first day and
 *     names the page it wants on every request. That number is safe *there* and
 *     nowhere else. Do not copy it into a list something renders whole.
 *
 * The asymmetry is the whole point: widening a default costs nothing, while
 * shrinking one is a breaking change for every caller that never sent a
 * `pageSize` — and it breaks them silently, by handing back a short answer that
 * looks complete. If a default in this codebase looks embarrassingly large for
 * a page, that is not an oversight, it is the design. Trim it only with a
 * reason better than tidiness.
 *
 * ## Using it
 *
 * ```ts
 * .input(
 *   z
 *     .object({
 *       query: z.string().optional(),
 *       ...pageInput({ defaultSize: 500, maxSize: 1000 }),
 *     })
 *     .default({}),
 * )
 * .query(async ({ ctx, input }) => {
 *   const where = { orgId: ctx.orgId };
 *   const [rows, total] = await Promise.all([
 *     ctx.db.room.findMany({ where, ...pageArgs(input) }),
 *     ctx.db.room.count({ where }),
 *   ]);
 *   return toPage(rows, total, input);
 * });
 * ```
 *
 * Two things that look incidental and are not. The `.default({})` matters: a
 * `GET` with no query string arrives as `undefined` (see `coerceQuery`), and
 * only a default turns that into an object the field defaults can then fill —
 * with `.optional()` instead, `input` is `undefined` and there is no page to
 * read. And nothing needs doing in the REST layer to expose any of this:
 * `coerce.ts` reads the procedure's own schema, so `?page=2&pageSize=20`
 * becomes numbers the moment the fields exist.
 */

/** A page of results, and enough context to ask for the next one. */
export interface Page<T> {
  rows: T[];
  /** Everything matching the filter, not the length of `rows`. */
  total: number;
  /** 1-based, matching what the caller asked for. */
  page: number;
  pageSize: number;
  /** At least 1, even when nothing matched. */
  pageCount: number;
}

/**
 * The part of a procedure's input this module reads.
 *
 * Structural on purpose: every call site passes its whole parsed input —
 * filters and all — rather than picking the two fields out by hand.
 */
export interface PageParams {
  page: number;
  pageSize: number;
}

/** The two numbers every paginated procedure has to decide for itself. */
export interface PageOptions {
  defaultSize: number;
  maxSize: number;
}

/**
 * The zod fields, named so they can be spread into an existing input object.
 *
 * Returned as a raw shape rather than a `z.object` because almost every list
 * here already has filters, and `z.object({ ...filters, ...pageInput(...) })`
 * keeps one schema for the endpoint. Merging two objects would work equally
 * well for zod and read worse at thirteen call sites.
 *
 * A `type` and not an `interface`, which is load-bearing: TypeScript gives an
 * anonymous object type an implicit index signature and an interface none, so
 * the interface version satisfies zod's `ZodRawShape` when spread and fails the
 * moment somebody writes the equally reasonable `z.object(pageInput(...))`.
 */
export type PageShape = {
  page: z.ZodDefault<z.ZodNumber>;
  pageSize: z.ZodDefault<z.ZodNumber>;
};

export function pageInput({ defaultSize, maxSize }: PageOptions): PageShape {
  // Thrown at import time, when the router module is first loaded, because the
  // alternative is far quieter: zod runs a `.default()` value through the inner
  // schema, so a default above the maximum does not fail here — it fails on
  // every single request that omits `pageSize`, with a validation error naming
  // a field the caller never sent.
  if (!Number.isInteger(defaultSize) || !Number.isInteger(maxSize)) {
    throw new Error("Page sizes must be whole numbers.");
  }
  if (defaultSize < 1 || maxSize < 1 || defaultSize > maxSize) {
    throw new Error(
      `A page size of ${defaultSize} with a maximum of ${maxSize} is not a page anybody can ask for.`,
    );
  }

  return {
    page: z.number().int().min(1).default(1),
    // Floored at 1 rather than at something more comfortable: a caller asking
    // for one row at a time is asking for something coherent, and the only
    // thing a higher floor protects is our sense of how the API ought to be
    // used. The ceiling is the limit that does real work.
    pageSize: z.number().int().min(1).max(maxSize).default(defaultSize),
  };
}

/** `{ skip, take }` for Prisma, from a 1-based page. */
export function pageArgs(input: PageParams): { skip: number; take: number } {
  return { skip: (input.page - 1) * input.pageSize, take: input.pageSize };
}

/**
 * The envelope, around rows the database has already narrowed.
 *
 * `pageCount` floors at 1 so that an empty result is "page 1 of 1, holding
 * nothing" rather than "page 1 of 0", which every pager in the app would render
 * as a contradiction and every `page <= pageCount` guard would read as an
 * out-of-range request.
 */
export function toPage<T>(
  rows: T[],
  total: number,
  input: PageParams,
): Page<T> {
  return {
    rows,
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

/**
 * The envelope for a list that genuinely cannot be paged at the database.
 *
 * `events.approvalQueue` is the honest case: it runs two queries — pending
 * bookings and pending change requests — merges them, and sorts the merge by
 * age. Page 2 of that is not `skip: 50` on either query, and faking it would
 * mean over-fetching both and slicing in memory, which is the same unbounded
 * read dressed up with a smaller answer. So it reports the whole thing in the
 * shape everything else reports, and the caller writes one piece of code.
 *
 * It is laziness everywhere else. If the list is one `findMany`, this is being
 * reached for to avoid writing the `count()` next to it — and that hands the
 * response size back to the database, which is the exact thing this module
 * exists to take away. Assembling rows in memory *after* a single query is not
 * a reason either: paginate the query and map the page.
 *
 * `pageSize` is the list's own length, so an empty whole list reports
 * `pageSize: 0`. That reads correctly through the tests a client actually
 * writes — `rows.length < pageSize` is false, `page < pageCount` is false, both
 * meaning "there is no more", which is true.
 */
export function wholeList<T>(rows: T[]): Page<T> {
  return {
    rows,
    total: rows.length,
    page: 1,
    pageSize: rows.length,
    pageCount: 1,
  };
}
