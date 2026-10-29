import { randomBytes } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  ASSIGNMENT_TYPE_META,
  answerKeyOf,
  answerWindow,
  paperContentSchema,
  sheetForUpload,
  sheetOf,
  totalMarksOf,
  withoutAnswers,
  type PaperContent,
  type SheetEntry,
} from "~/lib/assignments";
import { formatFullDate, formatHourLabel } from "~/lib/dates";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  assignmentForWrite,
  type AccessContext,
} from "~/server/services/assignments/access";
import { notify } from "~/server/services/notifications/notify";
import type { Db } from "~/server/services/occurrences";
import {
  PAPER_PASSWORD_MAX,
  papersEnabled,
  sealPaper,
  teacherSecret,
} from "~/server/services/papers/crypto";
import {
  documentSettingsFor,
  pagesAsSvg,
  pdfPageCount,
  TypesetError,
  typesetPaper,
  type PaperMeta,
} from "~/server/services/papers/typeset";
import {
  TypesetCrashError,
  TypesetTimeoutError,
} from "~/server/services/papers/typesetter";
import {
  openForOwner,
  orgTimezone,
  requireOwner,
  requirePapers,
} from "~/server/services/papers/unlock";
import {
  Prisma,
  QuestionPaperSource,
  type Assignment,
} from "../../../../generated/prisma";

/**
 * Question papers: written in Plannr or uploaded as a PDF, sealed so that only
 * the teacher who set the paper can open it, unlocked to print or to edit, and
 * opened to students for tests answered in Plannr.
 *
 * Two kinds of rule meet here. Managing a paper (seeing whether there is one,
 * closing answers, removing it) follows the assignment: whoever may change the
 * assignment may do it. Anything that takes the paper's password is for its
 * owner alone, at a browser; no permission stands in for that, Administrator
 * included, because the password is what the paper is sealed with.
 *
 * Slow work (scrypt, typst) happens before any transaction opens, so a long
 * paper never holds a database transaction past its timeout, and the wrong
 * password count is written where a later failure cannot roll it back.
 */

/** 4 MB, under the hosting platform's 4.5 MB request limit. */
export const PAPER_MAX_BYTES = 4 * 1024 * 1024;

const assignmentId = z.string().min(1).max(40);
/** Checked properly by the crypto when sealing; this only bounds the input. */
const password = z
  .string()
  .min(1)
  .max(PAPER_PASSWORD_MAX * 4);

/** Marks for one question of an uploaded paper, in half steps. */
const questionMark = z
  .number()
  .min(0)
  .max(100)
  .refine((n) => Number.isInteger(n * 2), "Marks go in steps of a half.");

/** A cuid-shaped id, made here because the id is sealed into the paper. */
function newPaperId() {
  const bytes = randomBytes(16);
  let text = "";
  for (const byte of bytes) text += (byte % 36).toString(36);
  return `c${Date.now().toString(36)}${text}`.slice(0, 25);
}

type Ctx = AccessContext;

/** The assignment, for a manager, refusing a presentation. */
async function testForWrite(ctx: Ctx, id: string) {
  const assignment = await assignmentForWrite(ctx, id);
  if (!ASSIGNMENT_TYPE_META[assignment.type].isTest) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A presentation has no question paper.",
    });
  }
  return assignment;
}

async function paperOf(db: Db, assignmentId: string) {
  return db.questionPaper.findUnique({ where: { assignmentId } });
}

async function requirePaper(db: Db, assignmentId: string) {
  const paper = await paperOf(db, assignmentId);
  if (!paper) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "This test has no question paper yet. Write or upload one first.",
    });
  }
  return paper;
}

/** Typesetting failures, in words a teacher can act on. */
function typesetFailure(error: unknown): never {
  if (error instanceof TypesetError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof TypesetTimeoutError) {
    throw new TRPCError({
      code: "TIMEOUT",
      message:
        "This paper took too long to typeset. Make it shorter or simpler and try again.",
    });
  }
  if (error instanceof TypesetCrashError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "The typesetter stopped unexpectedly. Try again in a moment.",
      cause: error,
    });
  }
  throw error;
}

/** What the paper's title block says about the test. */
async function metaFor(
  db: Db,
  assignment: Assignment,
  sheet: SheetEntry[],
): Promise<PaperMeta> {
  const [group, course, sitting, timeZone] = await Promise.all([
    db.group.findUniqueOrThrow({
      where: { id: assignment.groupId },
      select: { name: true, label: true },
    }),
    assignment.courseId
      ? db.course.findUnique({
          where: { id: assignment.courseId },
          select: { title: true },
        })
      : null,
    db.assignmentSitting.findFirst({
      where: { assignmentId: assignment.id },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, endsAt: true },
    }),
    orgTimezone(db, assignment.orgId),
  ]);
  const startsAt = sitting?.startsAt ?? assignment.startsAt;
  const endsAt = sitting?.endsAt ?? assignment.endsAt;
  // Null means "until the sitting ends", so the sitting's length is the time
  // allowed when the teacher gave none.
  const sittingMinutes =
    startsAt && endsAt
      ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000)
      : null;
  return {
    title: assignment.title,
    kind: ASSIGNMENT_TYPE_META[assignment.type].label,
    course: course?.title ?? null,
    group: group.label ?? group.name,
    when: startsAt
      ? `${formatFullDate(startsAt, timeZone)}, ${formatHourLabel(startsAt, timeZone)}`
      : null,
    durationMinutes: assignment.durationMinutes ?? sittingMinutes,
    totalMarks: totalMarksOf(sheet),
  };
}

async function typesetFor(
  db: Db,
  assignment: Assignment,
  content: PaperContent,
  signal: AbortSignal | undefined,
) {
  const meta = await metaFor(db, assignment, sheetOf(content));
  const doc = await documentSettingsFor(db, assignment.orgId);
  try {
    return await typesetPaper(
      { content: withoutAnswers(content), meta, doc },
      { signal },
    );
  } catch (error) {
    typesetFailure(error);
  }
}

const RELEASED_MESSAGE =
  "This paper is open to students, so it can no longer be changed.";

/**
 * For a write that lost to another one on the same paper: a save, a new
 * password or a release that landed while this one was opening it.
 */
const CHANGED_MESSAGE =
  "The paper changed while this was saving, in another tab or window. Reload the page and try again.";

/**
 * Why a write conditional on the paper as it was opened touched nothing:
 * the paper was opened to students, or it was re-sealed by another save or a
 * new password, whose work would otherwise be undone without a word.
 */
async function lostWrite(db: Db, paperId: string): Promise<never> {
  const now = await db.questionPaper.findUnique({
    where: { id: paperId },
    select: { releasedAt: true },
  });
  throw new TRPCError({
    code: "CONFLICT",
    message: now?.releasedAt ? RELEASED_MESSAGE : CHANGED_MESSAGE,
  });
}

/**
 * Seals and stores a paper: a first save makes it, with the caller as owner;
 * a later one replaces it, once the owner's password has opened the old one.
 */
async function storePaper(
  ctx: Ctx,
  assignment: Assignment,
  args: {
    password: string;
    pdf: Uint8Array;
    content: PaperContent | null;
    source: QuestionPaperSource;
    fileName: string | null;
    pageCount: number;
    sheet: SheetEntry[];
    totalMarks: number;
  },
) {
  const existing = await paperOf(ctx.db, assignment.id);
  let openedSalt: Uint8Array<ArrayBuffer> | null = null;
  if (existing) {
    requireOwner(ctx, existing);
    if (existing.releasedAt) {
      throw new TRPCError({ code: "CONFLICT", message: RELEASED_MESSAGE });
    }
    // Proves the password is the paper's, so a save cannot quietly re-seal
    // somebody's paper under a password they never chose.
    openedSalt = (await openForOwner(ctx, existing.id, args.password)).kdfSalt;
  } else if (ctx.actor.kind !== "user") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "A question paper is set at a browser by the teacher who will open it. Sign in to Plannr to set one.",
    });
  }

  const paperId = existing?.id ?? newPaperId();
  const sealed = await sealPaper({
    paperId,
    ownerId: ctx.actor.id,
    secret: await teacherSecret(ctx.db, ctx.actor.id),
    password: args.password,
    pdf: args.pdf,
    content: args.content
      ? new Uint8Array(Buffer.from(JSON.stringify(args.content), "utf8"))
      : null,
  });

  const data = {
    source: args.source,
    kdfSalt: Buffer.from(sealed.kdfSalt),
    kdfN: sealed.kdfN,
    kdfR: sealed.kdfR,
    kdfP: sealed.kdfP,
    pdfNonce: Buffer.from(sealed.pdfNonce),
    pdfCipher: Buffer.from(sealed.pdfCipher),
    contentNonce: sealed.contentNonce ? Buffer.from(sealed.contentNonce) : null,
    contentCipher: sealed.contentCipher
      ? Buffer.from(sealed.contentCipher)
      : null,
    fileName: args.fileName,
    byteSize: args.pdf.length,
    pageCount: args.pageCount,
    sheet: args.sheet as unknown as Prisma.InputJsonValue,
    totalMarks: args.totalMarks,
  };

  if (existing && openedSalt) {
    // Conditional on the sealed copy this request opened, so a release, a
    // new password or another save that landed meanwhile is never undone: the
    // later of two writes is refused rather than sealing over the earlier.
    const updated = await ctx.db.questionPaper.updateMany({
      where: {
        id: existing.id,
        ownerId: ctx.actor.id,
        releasedAt: null,
        kdfSalt: openedSalt,
      },
      data,
    });
    if (updated.count === 0) await lostWrite(ctx.db, existing.id);
  } else {
    try {
      await ctx.db.questionPaper.create({
        data: {
          ...data,
          id: paperId,
          assignmentId: assignment.id,
          ownerId: ctx.actor.id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A paper was saved for this test at the same moment. Reload the page and try again.",
        });
      }
      throw error;
    }
  }
  return { pageCount: args.pageCount, totalMarks: args.totalMarks };
}

/** Base64 to bytes, refusing anything that is not base64. */
function decodeBase64(text: string): Buffer {
  const clean = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The file did not arrive intact. Choose it again and upload it.",
    });
  }
  return Buffer.from(clean, "base64");
}

/** Just the file's own name, never a path, and never empty. */
function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // Control characters and quotes would break a Content-Disposition header.
  const tidy = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return (tidy || "paper.pdf").slice(0, 200);
}

const contentOf = (bytes: Uint8Array | null): PaperContent | null =>
  bytes
    ? paperContentSchema.parse(
        JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown,
      )
    : null;

/** The students of a group, as user ids, for telling them something. */
async function studentsOfGroup(db: Db, groupId: string) {
  const users = await db.user.findMany({
    where: { studentProfile: { memberships: { some: { groupId } } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** The longest paper whose pages are drawn for students when it opens. */
const MAX_RELEASED_PAGES = 40;

/**
 * The least time a paper opened to students must leave them. Opened later than
 * this before its class ends, it would close as it opened.
 */
const MIN_ANSWER_MS = 2 * 60_000;
export const papersRouter = createTRPCRouter({
  /**
   * Whether the test has a paper and where it stands. Never throws for a
   * server without a paper key: it says so in `enabled`, for the screen.
   */
  status: protectedProcedure
    .input(z.object({ assignmentId }))
    .query(async ({ ctx, input }) => {
      const assignment = await testForWrite(ctx, input.assignmentId);
      const paper = await paperOf(ctx.db, assignment.id);
      const now = new Date();
      return {
        enabled: papersEnabled(),
        paper: paper
          ? {
              source: paper.source,
              fileName: paper.fileName,
              pageCount: paper.pageCount,
              totalMarks: paper.totalMarks,
              sheet: paper.sheet as unknown as SheetEntry[],
              releasedAt: paper.releasedAt,
              closedAt: paper.closedAt,
              isOwner:
                paper.ownerId === ctx.actor.id && ctx.actor.kind === "user",
              locked: Boolean(paper.lockedUntil && paper.lockedUntil > now),
              lockedUntil:
                paper.lockedUntil && paper.lockedUntil > now
                  ? paper.lockedUntil
                  : null,
            }
          : null,
      };
    }),

  /**
   * Saves a paper written in Plannr. The PDF is typeset from the questions
   * without their answers; the content, answers included, is sealed beside it
   * for the owner's editor.
   */
  saveAuthored: protectedProcedure
    .input(z.object({ assignmentId, password, content: paperContentSchema }))
    .mutation(async ({ ctx, input, signal }) => {
      requirePapers();
      const assignment = await testForWrite(ctx, input.assignmentId);
      const existing = await paperOf(ctx.db, assignment.id);
      if (existing) {
        requireOwner(ctx, existing);
        if (existing.releasedAt) {
          throw new TRPCError({ code: "CONFLICT", message: RELEASED_MESSAGE });
        }
      }
      const typeset = await typesetFor(
        ctx.db,
        assignment,
        input.content,
        signal,
      );
      const sheet = sheetOf(input.content);
      return storePaper(ctx, assignment, {
        password: input.password,
        pdf: typeset.pdf,
        content: input.content,
        source: QuestionPaperSource.AUTHORED,
        fileName: null,
        pageCount: typeset.pageCount,
        sheet,
        totalMarks: totalMarksOf(sheet),
      });
    }),

  /**
   * Saves an uploaded PDF. Tests answered in Plannr need the marks of each
   * question, which make the answer sheet; a test sat on paper needs at most
   * its total.
   */
  uploadPdf: protectedProcedure
    .input(
      z.object({
        assignmentId,
        password,
        fileBase64: z
          .string()
          .max(
            Math.ceil(PAPER_MAX_BYTES / 3) * 4 + 4,
            "The file is larger than 4 MB. Save a smaller copy and upload that.",
          ),
        fileName: z.string().max(400),
        questionMarks: z.array(questionMark).min(1).max(100).optional(),
        /** Offline tests: the paper's total, printed nowhere, used for marks. */
        totalMarks: z
          .number()
          .min(0)
          .max(1000)
          .refine(
            (n) => Number.isInteger(n * 2),
            "Marks go in steps of a half.",
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input, signal }) => {
      requirePapers();
      const assignment = await testForWrite(ctx, input.assignmentId);
      const existing = await paperOf(ctx.db, assignment.id);
      if (existing) {
        requireOwner(ctx, existing);
        if (existing.releasedAt) {
          throw new TRPCError({ code: "CONFLICT", message: RELEASED_MESSAGE });
        }
      }

      const pdf = decodeBase64(input.fileBase64);
      if (pdf.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The file is empty. Choose the paper's PDF and upload it.",
        });
      }
      if (pdf.length > PAPER_MAX_BYTES) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message:
            "The file is larger than 4 MB. Save a smaller copy and upload that.",
        });
      }
      if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This file is not a PDF. Upload the paper as a PDF.",
        });
      }

      let sheet: SheetEntry[];
      if (ASSIGNMENT_TYPE_META[assignment.type].answeredInApp) {
        if (!input.questionMarks) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Give the marks for each question on the paper, so students get an answer sheet to fill in.",
          });
        }
        sheet = sheetForUpload(input.questionMarks);
      } else {
        const total =
          input.totalMarks ??
          (input.questionMarks
            ? input.questionMarks.reduce((sum, m) => sum + m, 0)
            : 0);
        sheet = [{ key: "q1", label: "1", marks: total, kind: "text" }];
      }

      let pageCount: number;
      try {
        pageCount = await pdfPageCount(new Uint8Array(pdf), { signal });
      } catch (error) {
        typesetFailure(error);
      }

      return storePaper(ctx, assignment, {
        password: input.password,
        pdf: new Uint8Array(pdf),
        content: null,
        source: QuestionPaperSource.UPLOAD,
        fileName: cleanFileName(input.fileName),
        pageCount,
        sheet,
        totalMarks: totalMarksOf(sheet),
      });
    }),

  /**
   * Typesets what is in the editor, without its answers, and stores nothing.
   * A mutation only because the paper is too big for a query string.
   */
  preview: protectedProcedure
    .input(z.object({ assignmentId, content: paperContentSchema }))
    .mutation(async ({ ctx, input, signal }) => {
      requirePapers();
      const assignment = await testForWrite(ctx, input.assignmentId);
      const { pdf } = await typesetFor(
        ctx.db,
        assignment,
        input.content,
        signal,
      );
      return { pdfBase64: Buffer.from(pdf).toString("base64") };
    }),

  /** The paper as written, answers included, for its owner's editor only. */
  unlockForEditing: protectedProcedure
    .input(z.object({ assignmentId, password }))
    .mutation(async ({ ctx, input }) => {
      requirePapers();
      await testForWrite(ctx, input.assignmentId);
      const paper = await requirePaper(ctx.db, input.assignmentId);
      requireOwner(ctx, paper);
      if (paper.source !== QuestionPaperSource.AUTHORED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This paper was uploaded as a PDF, so there is nothing to edit here. Upload a new file instead.",
        });
      }
      const opened = await openForOwner(ctx, paper.id, input.password);
      return { content: contentOf(opened.content)! };
    }),

  /** The decrypted PDF, for printing. Used by the print route only. */
  unlockPdf: protectedProcedure
    .input(z.object({ assignmentId, password }))
    .mutation(async ({ ctx, input }) => {
      requirePapers();
      const assignment = await testForWrite(ctx, input.assignmentId);
      const paper = await requirePaper(ctx.db, assignment.id);
      requireOwner(ctx, paper);
      const opened = await openForOwner(ctx, paper.id, input.password);
      return {
        pdfBase64: Buffer.from(opened.pdf).toString("base64"),
        fileName: paper.fileName ?? `${assignment.title}.pdf`,
      };
    }),

  /**
   * Opens the paper to the group's students, for tests answered in Plannr:
   * stores the PDF, its pages as images, and the questions without answers.
   */
  release: protectedProcedure
    .input(z.object({ assignmentId, password }))
    .mutation(async ({ ctx, input, signal }) => {
      requirePapers();
      const assignment = await testForWrite(ctx, input.assignmentId);
      if (!ASSIGNMENT_TYPE_META[assignment.type].answeredInApp) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This test is sat on paper, so its paper is not opened to students. Unlock it to print instead.",
        });
      }
      const paper = await requirePaper(ctx.db, assignment.id);
      requireOwner(ctx, paper);
      if (paper.releasedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This paper is already open to students.",
        });
      }

      // Each page becomes an image for phones, one typst job at a time, inside
      // this request: a paper longer than this is not one a class is set.
      if (paper.pageCount > MAX_RELEASED_PAGES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A paper of more than ${MAX_RELEASED_PAGES} pages cannot be opened to students in Plannr. Upload a shorter one.`,
        });
      }

      // Checked before the password and the typesetting, which both take time.
      const before = answerWindow({
        releasedAt: new Date(),
        closedAt: null,
        sittingEndsAt: assignment.endsAt,
        durationMinutes: assignment.durationMinutes,
      })!;
      if (before.closesAt.getTime() - Date.now() < MIN_ANSWER_MS) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This test's class has ended, or ends in under two minutes, so students would have no time to answer. Move the test to a later class, then open the paper.",
        });
      }

      const opened = await openForOwner(ctx, paper.id, input.password);
      const content = contentOf(opened.content);
      let pages: string[];
      try {
        pages = await pagesAsSvg(opened.pdf, { signal });
      } catch (error) {
        typesetFailure(error);
      }

      const now = new Date();
      const timeZone = await orgTimezone(ctx.db, ctx.orgId);
      const window = answerWindow({
        releasedAt: now,
        closedAt: null,
        sittingEndsAt: assignment.endsAt,
        durationMinutes: assignment.durationMinutes,
      })!;

      await ctx.db.$transaction(
        async (tx) => {
          const released = await tx.questionPaper.updateMany({
            where: { id: paper.id, releasedAt: null, kdfSalt: opened.kdfSalt },
            data: {
              releasedAt: now,
              answersCloseAt: window.closesAt,
              closedAt: null,
              releasedPdf: Buffer.from(opened.pdf),
              releasedQuestions: content
                ? (withoutAnswers(content) as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
              answerKey: content
                ? (answerKeyOf(content) as Prisma.InputJsonValue)
                : Prisma.DbNull,
            },
          });
          if (released.count === 0) {
            // Opened to students by another tab, or re-sealed since this one
            // opened it, in which case these pages may not be the paper's.
            const now = await tx.questionPaper.findUnique({
              where: { id: paper.id },
              select: { releasedAt: true },
            });
            throw new TRPCError({
              code: "CONFLICT",
              message: now?.releasedAt
                ? "This paper is already open to students."
                : CHANGED_MESSAGE,
            });
          }
          await tx.questionPaperPage.deleteMany({
            where: { paperId: paper.id },
          });
          await tx.questionPaperPage.createMany({
            data: pages.map((svg, i) => ({
              paperId: paper.id,
              number: i + 1,
              svg: Buffer.from(svg, "utf8"),
            })),
          });
          const where =
            assignment.type === "CLASS_TEST_ONLINE"
              ? "from anywhere"
              : "in class";
          await notify(tx, await studentsOfGroup(tx, assignment.groupId), {
            orgId: ctx.orgId,
            category: "ASSIGNMENTS",
            title: `Paper open: ${assignment.title}`,
            body: `Answer it in Plannr, ${where}, by ${formatHourLabel(window.closesAt, timeZone)}.`,
            url: `/assignments/${assignment.id}`,
            sourceKey: `paper-open:${assignment.id}`,
          });
        },
        // A paper's pages are drawn images, three or four times the PDF's
        // size (about 12 MB for a 4 MB scan, measured), written in one go to
        // a database across the network. Prisma's default 5 seconds is meant
        // for a few small rows. With the pages' 30 seconds and scrypt, this
        // still ends inside the request's 60.
        { maxWait: 5_000, timeout: 20_000 },
      );
      return { releasedAt: now, pageCount: pages.length };
    }),

  /** Stops answers early. Answers already begun count as handed in. */
  close: protectedProcedure
    .input(z.object({ assignmentId }))
    .mutation(async ({ ctx, input }) => {
      requirePapers();
      const assignment = await testForWrite(ctx, input.assignmentId);
      const paper = await requirePaper(ctx.db, assignment.id);
      if (!paper.releasedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This paper is not open to students yet, so there is nothing to close.",
        });
      }
      if (paper.closedAt) return { closedAt: paper.closedAt };
      const closedAt = new Date();
      await ctx.db.questionPaper.update({
        where: { id: paper.id },
        data: { closedAt },
      });
      return { closedAt };
    }),

  /** Re-seals the paper under a new password, with a new salt. */
  changePassword: protectedProcedure
    .input(z.object({ assignmentId, password, newPassword: password }))
    .mutation(async ({ ctx, input }) => {
      requirePapers();
      const assignment = await testForWrite(ctx, input.assignmentId);
      const paper = await requirePaper(ctx.db, assignment.id);
      requireOwner(ctx, paper);
      const opened = await openForOwner(ctx, paper.id, input.password);
      const sealed = await sealPaper({
        paperId: paper.id,
        ownerId: paper.ownerId,
        secret: await teacherSecret(ctx.db, paper.ownerId),
        password: input.newPassword,
        pdf: opened.pdf,
        content: opened.content,
      });
      // Conditional on the sealed copy that was opened: a save that landed
      // while this one ran scrypt would otherwise be overwritten by the older
      // paper, or be left sealed under a password that no longer opens it.
      const changed = await ctx.db.questionPaper.updateMany({
        where: { id: paper.id, kdfSalt: opened.kdfSalt },
        data: {
          kdfSalt: Buffer.from(sealed.kdfSalt),
          kdfN: sealed.kdfN,
          kdfR: sealed.kdfR,
          kdfP: sealed.kdfP,
          pdfNonce: Buffer.from(sealed.pdfNonce),
          pdfCipher: Buffer.from(sealed.pdfCipher),
          contentNonce: sealed.contentNonce
            ? Buffer.from(sealed.contentNonce)
            : null,
          contentCipher: sealed.contentCipher
            ? Buffer.from(sealed.contentCipher)
            : null,
        },
      });
      if (changed.count === 0) {
        throw new TRPCError({ code: "CONFLICT", message: CHANGED_MESSAGE });
      }
      return { ok: true as const };
    }),

  /** Deletes the paper. Not once students have seen it. */
  remove: protectedProcedure
    .input(z.object({ assignmentId }))
    .mutation(async ({ ctx, input }) => {
      requirePapers();
      const assignment = await testForWrite(ctx, input.assignmentId);
      const paper = await requirePaper(ctx.db, assignment.id);
      const removed = await ctx.db.questionPaper.deleteMany({
        where: { id: paper.id, releasedAt: null },
      });
      if (removed.count === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This paper has been open to students, so it is kept with their answers and cannot be removed.",
        });
      }
      return { ok: true as const };
    }),
});
