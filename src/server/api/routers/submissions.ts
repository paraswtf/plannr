import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  ASSIGNMENT_TYPE_META,
  answersFinalAt,
  answersSchema,
  answerWindow,
  autoMarks,
  markedByKeyAlone,
  marksSchema,
  mayAnswer,
  type AnswerWindow,
  type Answers,
  type ReleasedContent,
  type SheetEntry,
} from "~/lib/assignments";
import { personName } from "~/lib/people";
import { pageArgs, pageInput, toPage } from "~/server/api/pagination";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  assignmentForRead,
  assignmentForWrite,
  type AccessContext,
} from "~/server/services/assignments/access";
import { notify } from "~/server/services/notifications/notify";
import {
  SubmissionStatus,
  type Assignment,
  type QuestionPaper,
} from "../../../../generated/prisma";

/**
 * Students' answers to tests taken in Plannr, and the marks they are given.
 *
 * A student of the test's group answers while the window is open: from when
 * the teacher opens the paper until it is closed, the sitting ends or the time
 * allowed runs out, whichever comes first, with a little grace for an answer
 * already begun (a short one after a teacher's close). The server checks the
 * window on every save; the client's clock decides nothing. Whoever manages
 * the test (`access.ts`) sees the answers, marks them and publishes the marks
 * once nobody can answer any more, and students see their marks only after
 * that.
 */

const assignmentId = z.string().min(1).max(40);
const FEEDBACK_MAX = 4000;

/** How a student stands on the roster. */
export type RosterStatus =
  "not started" | "in progress" | "submitted" | "handed in at the close";

type Window = AnswerWindow | null;

/**
 * The paper's large columns: the sealed copies and the released PDF. Left out
 * of the lookups the answer screen and the roster poll with, which need only
 * the window, the sheet and the key; the PDF has its own procedure.
 */
const HEAVY = {
  pdfCipher: true,
  contentCipher: true,
  releasedPdf: true,
} as const;

type PaperTimes = Pick<
  QuestionPaper,
  "releasedAt" | "closedAt" | "answersCloseAt"
>;

function windowOf(assignment: Assignment, paper: PaperTimes | null): Window {
  return answerWindow({
    releasedAt: paper?.releasedAt ?? null,
    closedAt: paper?.closedAt ?? null,
    answersCloseAt: paper?.answersCloseAt ?? null,
    sittingEndsAt: assignment.endsAt,
    durationMinutes: assignment.durationMinutes,
  });
}

const sheetOfPaper = (paper: Pick<QuestionPaper, "sheet"> | null) =>
  (paper?.sheet as unknown as SheetEntry[] | undefined) ?? [];

/** Whether the window, grace included, has passed for an answer begun. */
const pastWindow = (window: Window, now: Date) =>
  Boolean(window && now > answersFinalAt(window));

function rosterStatus(
  submission: { status: SubmissionStatus } | null,
  window: Window,
  now: Date,
): RosterStatus {
  if (!submission) return "not started";
  if (submission.status === SubmissionStatus.SUBMITTED) return "submitted";
  return pastWindow(window, now) ? "handed in at the close" : "in progress";
}

/** The test, its paper and the student, for a student of the group. */
async function forStudent(ctx: AccessContext, id: string) {
  const { assignment, role, studentId } = await assignmentForRead(ctx, id);
  if (role !== "student" || !studentId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only students of the group answer this test. Open the roster to see their answers.",
    });
  }
  if (!ASSIGNMENT_TYPE_META[assignment.type].answeredInApp) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This is not answered in Plannr, so there is nothing to fill in here.",
    });
  }
  const paper = await ctx.db.questionPaper.findUnique({
    where: { assignmentId: assignment.id },
    omit: HEAVY,
  });
  return { assignment, paper, studentId, window: windowOf(assignment, paper) };
}

/** The test, for somebody who manages it, refusing one not answered in Plannr. */
async function forManager(ctx: AccessContext, id: string) {
  const assignment = await assignmentForWrite(ctx, id);
  if (!ASSIGNMENT_TYPE_META[assignment.type].answeredInApp) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This is not answered in Plannr, so it has no answers to see.",
    });
  }
  const paper = await ctx.db.questionPaper.findUnique({
    where: { assignmentId: assignment.id },
    omit: HEAVY,
  });
  return { assignment, paper, window: windowOf(assignment, paper) };
}

function closedError(window: Window) {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message: window
      ? "The time for answering this test is over, so answers can no longer be changed."
      : "The paper is not open yet. Answers open when your teacher opens the paper.",
  });
}

/** Refuses answers to questions the sheet does not have, or impossible choices. */
function checkAnswers(sheet: SheetEntry[], answers: Answers) {
  const byKey = new Map(sheet.map((entry) => [entry.key, entry]));
  for (const [key, answer] of Object.entries(answers)) {
    const entry = byKey.get(key);
    if (!entry) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `There is no question "${key}" on this paper. Reload the page and try again.`,
      });
    }
    if (answer.choice !== undefined) {
      if (
        entry.kind !== "choice" ||
        answer.choice >= (entry.optionCount ?? 0)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Question ${entry.label} has no such option. Choose one of its options.`,
        });
      }
    }
  }
}

const releasedPaper = <T extends Pick<QuestionPaper, "releasedAt">>(
  paper: T | null,
) => (paper?.releasedAt ? paper : null);

/**
 * Merges answers into a submission still in progress, question by question,
 * and says whether there was one. One statement, so a save racing a hand-in
 * cannot change answers that were handed in, and two tabs saving different
 * questions keep both. Raw SQL because Prisma has no jsonb merge.
 */
async function mergeAnswers(
  db: Pick<AccessContext["db"], "$executeRaw">,
  where: { assignmentId: string; studentId: string },
  answers: Answers,
): Promise<boolean> {
  const count = await db.$executeRaw`
    UPDATE "Submission"
    SET "answers" = "answers" || ${JSON.stringify(answers)}::jsonb,
        "updatedAt" = (now() AT TIME ZONE 'UTC')
    WHERE "assignmentId" = ${where.assignmentId}
      AND "studentId" = ${where.studentId}
      AND "status" = 'IN_PROGRESS'`;
  return count > 0;
}

export const submissionsRouter = createTRPCRouter({
  /**
   * The caller's own answers, the window and the answer sheet. Marks and
   * feedback appear only once the teacher has published them.
   */
  mine: protectedProcedure
    .input(z.object({ assignmentId }))
    .query(async ({ ctx, input }) => {
      const { assignment, paper, studentId, window } = await forStudent(
        ctx,
        input.assignmentId,
      );
      const submission = await ctx.db.submission.findUnique({
        where: {
          assignmentId_studentId: { assignmentId: assignment.id, studentId },
        },
      });
      const now = new Date();
      // Publishing is refused until nobody can answer any more; this holds
      // the marks back as well, so no student learns the key from them while
      // a classmate may still be answering.
      const published = Boolean(
        assignment.marksPublishedAt && pastWindow(window, now),
      );
      return {
        /** The server's clock, so the countdown can follow it. */
        serverNow: now,
        window,
        released: Boolean(paper?.releasedAt),
        closed: Boolean(window && now > window.closesAt),
        sheet: paper?.releasedAt ? sheetOfPaper(paper) : null,
        marksPublished: published,
        submission: submission
          ? {
              status: rosterStatus(submission, window, now),
              answers: submission.answers as Answers,
              startedAt: submission.startedAt,
              submittedAt: submission.submittedAt,
              marks: published
                ? (submission.marks as Record<string, number> | null)
                : null,
              score: published ? submission.score : null,
              feedback: published ? submission.feedback : null,
            }
          : null,
      };
    }),

  /** Begins answering. Answering again after starting returns the same one. */
  start: protectedProcedure
    .input(z.object({ assignmentId }))
    .mutation(async ({ ctx, input }) => {
      const { assignment, studentId, window } = await forStudent(
        ctx,
        input.assignmentId,
      );
      const key = { assignmentId: assignment.id, studentId };
      const existing = await ctx.db.submission.findUnique({
        where: { assignmentId_studentId: key },
        select: { id: true, status: true, startedAt: true },
      });
      if (existing) return existing;
      if (!mayAnswer(window, new Date(), false)) throw closedError(window);
      // upsert, so two tabs starting at once land on one submission.
      return ctx.db.submission.upsert({
        where: { assignmentId_studentId: key },
        create: { ...key, answers: {} },
        update: {},
        select: { id: true, status: true, startedAt: true },
      });
    }),

  /**
   * Saves answers so far. The client saves as the student types, sending
   * only the questions that changed: they are merged into what is saved, and
   * questions not sent are kept. The window's close comes back, so a screen
   * learns of a teacher's close with its next save.
   */
  save: protectedProcedure
    .input(z.object({ assignmentId, answers: answersSchema }))
    .mutation(async ({ ctx, input }) => {
      const { assignment, paper, studentId, window } = await forStudent(
        ctx,
        input.assignmentId,
      );
      const now = new Date();
      if (!window || !mayAnswer(window, now, true)) throw closedError(window);
      checkAnswers(sheetOfPaper(paper), input.answers);
      const saved = await mergeAnswers(
        ctx.db,
        { assignmentId: assignment.id, studentId },
        input.answers,
      );
      if (!saved) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "These answers have been handed in or were never started, so they cannot be saved. Reload the page.",
        });
      }
      return {
        savedAt: now,
        closesAt: window.closesAt,
        closed: now > window.closesAt,
      };
    }),

  /**
   * Hands the answers in, with a last save of them if given. Like a save,
   * the answers given are merged into what is saved.
   */
  submit: protectedProcedure
    .input(z.object({ assignmentId, answers: answersSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const { assignment, paper, studentId, window } = await forStudent(
        ctx,
        input.assignmentId,
      );
      if (!mayAnswer(window, new Date(), true)) throw closedError(window);
      if (input.answers) checkAnswers(sheetOfPaper(paper), input.answers);
      const key = { assignmentId: assignment.id, studentId };
      const notInProgress = () =>
        new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "There are no answers in progress to hand in. They may have been handed in already.",
        });
      const submittedAt = new Date();
      // The merge locks the row until the hand-in commits, so a second tab
      // handing in at the same moment finds it handed in and changes nothing.
      await ctx.db.$transaction(async (tx) => {
        const answers = input.answers ?? {};
        if (
          Object.keys(answers).length > 0 &&
          !(await mergeAnswers(tx, key, answers))
        ) {
          throw notInProgress();
        }
        const done = await tx.submission.updateMany({
          where: { ...key, status: SubmissionStatus.IN_PROGRESS },
          data: { status: SubmissionStatus.SUBMITTED, submittedAt },
        });
        if (done.count === 0) throw notInProgress();
      });
      return { submittedAt };
    }),

  /**
   * The paper as students see it: its questions without answers (none for an
   * uploaded paper, which is read from its pages), the answer sheet and the
   * page count. A student sees it once it is open; a manager always.
   */
  paper: protectedProcedure
    .input(z.object({ assignmentId }))
    .query(async ({ ctx, input }) => {
      const { assignment, role } = await assignmentForRead(
        ctx,
        input.assignmentId,
      );
      const paper = await ctx.db.questionPaper.findUnique({
        where: { assignmentId: assignment.id },
        omit: HEAVY,
      });
      if (role === "student" && !paper?.releasedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "The paper is not open yet. It opens when your teacher opens it.",
        });
      }
      if (!paper) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This test has no question paper yet.",
        });
      }
      return {
        releasedAt: paper.releasedAt,
        window: windowOf(assignment, paper),
        releasedQuestions:
          (paper.releasedQuestions as unknown as ReleasedContent | null) ??
          null,
        sheet: sheetOfPaper(paper),
        pageCount: paper.releasedAt ? paper.pageCount : 0,
      };
    }),

  /** One released page as SVG text, for the page route to serve as an image. */
  page: protectedProcedure
    .input(
      z.object({ assignmentId, number: z.number().int().min(1).max(10_000) }),
    )
    .query(async ({ ctx, input }) => {
      const { assignment } = await assignmentForRead(ctx, input.assignmentId);
      const paper = releasedPaper(
        await ctx.db.questionPaper.findUnique({
          where: { assignmentId: assignment.id },
        }),
      );
      const page = paper
        ? await ctx.db.questionPaperPage.findUnique({
            where: {
              paperId_number: { paperId: paper.id, number: input.number },
            },
            select: { svg: true },
          })
        : null;
      if (!page) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "There is no such page of an open paper.",
        });
      }
      return { svg: Buffer.from(page.svg).toString("utf8") };
    }),

  /** The released PDF, for the paper.pdf route. */
  pdf: protectedProcedure
    .input(z.object({ assignmentId }))
    .query(async ({ ctx, input }) => {
      const { assignment } = await assignmentForRead(ctx, input.assignmentId);
      const paper = releasedPaper(
        await ctx.db.questionPaper.findUnique({
          where: { assignmentId: assignment.id },
        }),
      );
      if (!paper?.releasedPdf) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "The paper is not open yet. It opens when your teacher opens it.",
        });
      }
      return {
        pdfBase64: Buffer.from(paper.releasedPdf).toString("base64"),
        fileName: paper.fileName ?? `${assignment.title}.pdf`,
      };
    }),

  /** Every student of the group and how far they got, by name. */
  roster: protectedProcedure
    .input(
      z.object({
        assignmentId,
        ...pageInput({ defaultSize: 500, maxSize: 2000 }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { assignment, paper, window } = await forManager(
        ctx,
        input.assignmentId,
      );
      const where = {
        orgId: ctx.orgId,
        memberships: { some: { groupId: assignment.groupId } },
      };
      const [students, total] = await Promise.all([
        ctx.db.studentProfile.findMany({
          where,
          orderBy: [{ user: { name: "asc" } }, { prn: "asc" }],
          ...pageArgs(input),
          select: {
            id: true,
            prn: true,
            user: { select: { name: true, email: true } },
            submissions: {
              where: { assignmentId: assignment.id },
              select: {
                id: true,
                status: true,
                submittedAt: true,
                score: true,
                markedAt: true,
              },
            },
          },
        }),
        ctx.db.studentProfile.count({ where }),
      ]);
      const now = new Date();
      const page = toPage(
        students.map((s) => {
          const submission = s.submissions[0] ?? null;
          return {
            studentId: s.id,
            name: personName(s.user),
            prn: s.prn,
            submissionId: submission?.id ?? null,
            status: rosterStatus(submission, window, now),
            submittedAt: submission?.submittedAt ?? null,
            score: submission?.score ?? null,
            marked: Boolean(submission?.markedAt),
          };
        }),
        total,
        input,
      );
      const finalAt = window ? answersFinalAt(window) : null;
      return {
        ...page,
        totalMarks: paper?.totalMarks ?? null,
        marksPublishedAt: assignment.marksPublishedAt,
        window,
        /** When nobody can answer any more, grace included; null before the paper opens. */
        answersFinalAt: finalAt,
        /** Marks can be published: the paper has been open and nobody can answer now. */
        canPublish: Boolean(finalAt && now > finalAt),
        /**
         * Every question is a choice question with a correct option, so
         * publishing marks by the key the answers not marked by hand.
         */
        markedByKey: markedByKeyAlone(
          sheetOfPaper(paper),
          (paper?.answerKey as Record<string, number> | null) ?? {},
        ),
      };
    }),

  /** One student's answers beside the paper, with what the key would give. */
  byId: protectedProcedure
    .input(z.object({ submissionId: z.string().min(1).max(40) }))
    .query(async ({ ctx, input }) => {
      const submission = await ctx.db.submission.findFirst({
        where: { id: input.submissionId, assignment: { orgId: ctx.orgId } },
        include: {
          student: {
            select: {
              id: true,
              prn: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      });
      if (!submission) throw new TRPCError({ code: "NOT_FOUND" });
      const { paper, window } = await forManager(ctx, submission.assignmentId);
      const sheet = sheetOfPaper(paper);
      const key = (paper?.answerKey as Record<string, number> | null) ?? {};
      const answers = submission.answers as Answers;
      return {
        id: submission.id,
        assignmentId: submission.assignmentId,
        student: {
          id: submission.student.id,
          name: personName(submission.student.user),
          prn: submission.student.prn,
        },
        status: rosterStatus(submission, window, new Date()),
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
        answers,
        sheet,
        releasedQuestions:
          (paper?.releasedQuestions as unknown as ReleasedContent | null) ??
          null,
        answerKey: key,
        autoMarks: autoMarks(sheet, key, answers),
        marks: submission.marks as Record<string, number> | null,
        score: submission.score,
        feedback: submission.feedback,
        markedAt: submission.markedAt,
      };
    }),

  /** Marks one student's answers. The score is the sum of the marks. */
  mark: protectedProcedure
    .input(
      z.object({
        submissionId: z.string().min(1).max(40),
        marks: marksSchema,
        feedback: z.string().trim().max(FEEDBACK_MAX).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const submission = await ctx.db.submission.findFirst({
        where: { id: input.submissionId, assignment: { orgId: ctx.orgId } },
        select: { id: true, assignmentId: true, status: true },
      });
      if (!submission) throw new TRPCError({ code: "NOT_FOUND" });
      const { paper, window } = await forManager(ctx, submission.assignmentId);
      if (rosterStatus(submission, window, new Date()) === "in progress") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This student is still answering. Mark the answers once they are handed in or the test closes.",
        });
      }

      const byKey = new Map(sheetOfPaper(paper).map((e) => [e.key, e]));
      let score = 0;
      for (const [key, given] of Object.entries(input.marks)) {
        const entry = byKey.get(key);
        if (!entry) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `There is no question "${key}" on this paper. Reload the page and try again.`,
          });
        }
        if (given > entry.marks) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Question ${entry.label} is worth ${entry.marks} marks, so it cannot be given ${given}.`,
          });
        }
        score += given;
      }
      const markedAt = new Date();
      await ctx.db.submission.update({
        where: { id: submission.id },
        data: {
          marks: input.marks,
          score,
          ...(input.feedback !== undefined
            ? { feedback: input.feedback === "" ? null : input.feedback }
            : {}),
          markedById: ctx.actor.id,
          markedAt,
        },
      });
      return { score, markedAt };
    }),

  /**
   * Shows the marks to the students and tells each who answered. Only once
   * nobody can answer any more: marks out while a classmate is still
   * answering would tell them the key. A paper the key marks entirely has the
   * answers not marked by hand marked by the key as the marks go out, so no
   * student is left without a score for want of a teacher pressing save.
   */
  publish: protectedProcedure
    .input(z.object({ assignmentId }))
    .mutation(async ({ ctx, input }) => {
      const { assignment, paper, window } = await forManager(
        ctx,
        input.assignmentId,
      );
      const now = new Date();
      if (!window || !pastWindow(window, now)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: !window
            ? "The paper has not been opened yet, so there are no answers to publish marks for."
            : "Students can still answer this test. Publish the marks once the paper has closed and the last answers are in.",
        });
      }
      const sheet = sheetOfPaper(paper);
      const key = (paper?.answerKey as Record<string, number> | null) ?? {};
      return ctx.db.$transaction(async (tx) => {
        const marksPublishedAt = assignment.marksPublishedAt ?? now;
        await tx.assignment.update({
          where: { id: assignment.id },
          data: { marksPublishedAt },
        });
        if (markedByKeyAlone(sheet, key)) {
          const unmarked = await tx.submission.findMany({
            where: { assignmentId: assignment.id, markedAt: null },
            select: { id: true, answers: true },
          });
          for (const submission of unmarked) {
            const marks = autoMarks(sheet, key, submission.answers as Answers);
            await tx.submission.update({
              where: { id: submission.id },
              data: {
                marks,
                score: Object.values(marks).reduce((sum, n) => sum + n, 0),
                markedById: ctx.actor.id,
                markedAt: now,
              },
            });
          }
        }
        const answered = await tx.submission.findMany({
          where: { assignmentId: assignment.id },
          select: { student: { select: { userId: true } } },
        });
        await notify(
          tx,
          answered.map((s) => s.student.userId),
          {
            orgId: ctx.orgId,
            category: "ASSIGNMENTS",
            title: `Marks out: ${assignment.title}`,
            body: "Your marks and your teacher's feedback are in Plannr.",
            url: `/assignments/${assignment.id}`,
            sourceKey: `marks-out:${assignment.id}`,
          },
        );
        return { marksPublishedAt };
      });
    }),
});
