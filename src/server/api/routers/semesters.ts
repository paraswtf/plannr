import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PermissionFlags } from "~/lib/permissions";
import { pageArgs, pageInput, toPage } from "~/server/api/pagination";
import { createTRPCRouter, permissionProcedure } from "~/server/api/trpc";

/**
 * Semesters, and the rollover between them.
 *
 * A semester is the pivot the whole app is dated against: courses, groups,
 * lectures and registers all belong to one, which is what lets last year still
 * be read as it stood. That only works if opening the next one is an ordinary
 * thing somebody can do from the app — otherwise the temptation is to edit the
 * current one in place every July, and the history quietly disappears.
 *
 * Opening one is therefore a copy forward rather than a fresh start: each batch
 * carries into it a semester further on than it was, and a batch that has
 * finished its degree simply does not come.
 */

/** As the college numbers them. A degree of N years runs to 2N. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** The number after this one, or null where the degree has ended. */
export function nextNumber(current: string, ofYears: number): string | null {
  const index = ROMAN.indexOf(current.toUpperCase());
  if (index < 0) return null;
  const next = ROMAN[index + 1];
  return next && index + 2 <= ofYears * 2 ? next : null;
}

const dates = z
  .object({
    name: z.string().trim().min(1).max(80),
    startDate: z.date(),
    endDate: z.date(),
  })
  .refine((input) => input.endDate > input.startDate, {
    message: "A semester has to end after it starts.",
    path: ["endDate"],
  });

export const semestersRouter = createTRPCRouter({
  /** Every semester the college has kept, newest first. */
  list: permissionProcedure(PermissionFlags.ViewGroups)
    .input(
      z
        .object({
          /**
           * A college opens two or three of these a year, so two hundred is
           * every term of a lifetime and then some — which is what it has to
           * be, since the setup panel renders this list whole and picks the
           * newest semester out of it to carry the next one forward from. A
           * page that stopped short would not look wrong; it would just be a
           * shorter history than the college has.
           */
          ...pageInput({ defaultSize: 200, maxSize: 500 }),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = { orgId: ctx.orgId };
      const [semesters, total] = await Promise.all([
        ctx.db.semester.findMany({
          where,
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            _count: {
              select: {
                courses: true,
                groups: true,
                events: true,
                batches: true,
              },
            },
          },
          orderBy: { startDate: "desc" },
          ...pageArgs(input),
        }),
        ctx.db.semester.count({ where }),
      ]);

      const today = new Date();
      return toPage(
        semesters.map((semester) => ({
          ...semester,
          /** The one running now. There is at most one, and sometimes none. */
          current: semester.startDate <= today && semester.endDate >= today,
        })),
        total,
        input,
      );
    }),

  /**
   * Opens a semester.
   *
   * `carryFrom` is the usual way to do it: every batch on that semester arrives
   * on this one a number further along, so the year groups continue without
   * anybody re-entering them. A batch in its final semester is left behind,
   * which is how a cohort graduates.
   */
  create: permissionProcedure(PermissionFlags.ManageProgrammes)
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        startDate: z.date(),
        endDate: z.date(),
        carryFrom: z.string().cuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endDate <= input.startDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A semester has to end after it starts.",
        });
      }
      const clash = await ctx.db.semester.findFirst({
        where: { orgId: ctx.orgId, name: input.name },
        select: { id: true },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `There is already a semester called "${input.name}".`,
        });
      }

      const semester = await ctx.db.semester.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
        },
        select: { id: true, name: true },
      });

      if (!input.carryFrom)
        return { semester, carried: 0, graduated: [] as string[] };

      const previous = await ctx.db.batchSemester.findMany({
        where: { semesterId: input.carryFrom, semester: { orgId: ctx.orgId } },
        select: {
          number: true,
          batch: {
            select: { id: true, name: true, startYear: true, endYear: true },
          },
        },
      });

      const carried: Array<{
        batchId: string;
        semesterId: string;
        number: string;
      }> = [];
      const graduated: string[] = [];
      for (const row of previous) {
        const years = Math.max(1, row.batch.endYear - row.batch.startYear);
        const next = nextNumber(row.number, years);
        if (!next) {
          graduated.push(row.batch.name);
          continue;
        }
        carried.push({
          batchId: row.batch.id,
          semesterId: semester.id,
          number: next,
        });
      }
      if (carried.length > 0) {
        await ctx.db.batchSemester.createMany({
          data: carried,
          skipDuplicates: true,
        });
      }

      return { semester, carried: carried.length, graduated };
    }),

  /** Renames a semester or moves its dates. */
  update: permissionProcedure(PermissionFlags.ManageProgrammes)
    .input(z.object({ id: z.string().cuid() }).and(dates))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.semester.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const clash = await ctx.db.semester.findFirst({
        where: { orgId: ctx.orgId, name: input.name, id: { not: input.id } },
        select: { id: true },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `There is already a semester called "${input.name}".`,
        });
      }

      return ctx.db.semester.update({
        where: { id: input.id },
        data: {
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
        },
        select: { id: true, name: true, startDate: true, endDate: true },
      });
    }),

  /**
   * Says which semester a batch is in, or takes it off one.
   *
   * Needed where the arithmetic cannot help: a batch that started late, one
   * repeating a semester, or a correction to what the rollover assumed.
   */
  setBatchNumber: permissionProcedure(PermissionFlags.ManageProgrammes)
    .input(
      z.object({
        batchId: z.string().cuid(),
        semesterId: z.string().cuid(),
        /** Null takes the batch out of that semester altogether. */
        number: z.string().trim().max(6).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const batch = await ctx.db.batch.findFirst({
        where: { id: input.batchId, orgId: ctx.orgId },
        select: { id: true },
      });
      const semester = await ctx.db.semester.findFirst({
        where: { id: input.semesterId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!batch || !semester) throw new TRPCError({ code: "NOT_FOUND" });

      const key = { batchId: input.batchId, semesterId: input.semesterId };
      if (input.number === null) {
        await ctx.db.batchSemester.deleteMany({ where: key });
        return { number: null };
      }

      const number = input.number.toUpperCase();
      if (!ROMAN.includes(number)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A semester number reads as ${ROMAN.slice(0, 8).join(", ")}.`,
        });
      }
      await ctx.db.batchSemester.upsert({
        where: { batchId_semesterId: key },
        update: { number },
        create: { ...key, number },
      });
      return { number };
    }),

  /**
   * Deletes a semester, but only while nothing has been hung off it.
   *
   * Courses and groups cascade from it in the schema, which would take their
   * lectures and registers with them — so an emptiness check here is the
   * difference between undoing a typo and erasing a term.
   */
  remove: permissionProcedure(PermissionFlags.ManageProgrammes)
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const semester = await ctx.db.semester.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: {
          id: true,
          name: true,
          _count: { select: { courses: true, groups: true, events: true } },
        },
      });
      if (!semester) throw new TRPCError({ code: "NOT_FOUND" });

      const { courses, groups, events } = semester._count;
      if (courses + groups + events > 0) {
        const held = [
          courses && `${courses} ${courses === 1 ? "course" : "courses"}`,
          groups && `${groups} ${groups === 1 ? "group" : "groups"}`,
          events && `${events} ${events === 1 ? "lecture" : "lectures"}`,
        ]
          .filter(Boolean)
          .join(", ");
        throw new TRPCError({
          code: "CONFLICT",
          message: `"${semester.name}" still holds ${held}. Deleting it would take those with it, so it cannot be removed.`,
        });
      }

      await ctx.db.batchSemester.deleteMany({
        where: { semesterId: semester.id },
      });
      await ctx.db.semester.delete({ where: { id: semester.id } });
      return { id: semester.id };
    }),
});
