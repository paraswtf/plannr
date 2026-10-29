import { z } from "zod";

/**
 * Tests and presentations: the parts both ends need.
 *
 * Pure and dependency-free apart from zod, like `permissions.ts`: the server
 * validates a paper with these schemas before it is sealed, and the editor
 * validates the same shapes before it sends one. The strings match the Prisma
 * enums exactly.
 */

export const ASSIGNMENT_TYPES = [
  "CLASS_TEST_OFFLINE",
  "CLASS_TEST_ONLINE",
  "CLASS_TEST_IN_APP_OFFLINE",
  "PRESENTATION",
] as const;

export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export interface AssignmentTypeMeta {
  type: AssignmentType;
  /** As a badge and in the type picker. */
  label: string;
  /** One line in the type picker. */
  description: string;
  /** A test sits once and may have a paper; a presentation has teams and slots. */
  isTest: boolean;
  /** Students read the paper and answer it in Plannr. */
  answeredInApp: boolean;
}

export const ASSIGNMENT_TYPE_META: Record<AssignmentType, AssignmentTypeMeta> =
  {
    CLASS_TEST_OFFLINE: {
      type: "CLASS_TEST_OFFLINE",
      label: "Class test",
      description:
        "Sat on paper in class. Unlock the question paper to print it.",
      isTest: true,
      answeredInApp: false,
    },
    CLASS_TEST_ONLINE: {
      type: "CLASS_TEST_ONLINE",
      label: "Online test",
      description:
        "Read and answered in Plannr, from anywhere, once you open the paper.",
      isTest: true,
      answeredInApp: true,
    },
    CLASS_TEST_IN_APP_OFFLINE: {
      type: "CLASS_TEST_IN_APP_OFFLINE",
      label: "In-class test in Plannr",
      description:
        "Sat in the room, read and answered in Plannr on students' own devices.",
      isTest: true,
      answeredInApp: true,
    },
    PRESENTATION: {
      type: "PRESENTATION",
      label: "Presentation",
      description:
        "Teams present over a range of days, each in a slot of its own.",
      isTest: false,
      answeredInApp: false,
    },
  };

// ─── Question papers ────────────────────────────────────────────────────────

/** Marks go in half steps: 0.5, 1, 1.5 and so on. */
const marks = z
  .number()
  .min(0)
  .max(100)
  .refine((n) => Number.isInteger(n * 2), "Marks go in steps of a half.");

export const questionSchema = z
  .object({
    /** Stable across edits; what answers and marks are keyed on. */
    key: z.string().min(1).max(40),
    /** Plain text. `$...$` is typeset as maths. */
    text: z.string().trim().min(1, "A question needs some text.").max(4000),
    marks,
    kind: z.enum(["text", "choice"]),
    options: z.array(z.string().trim().min(1).max(500)).max(8).optional(),
    /** The correct option, for choice questions. Never leaves the server once sealed. */
    answer: z.number().int().min(0).max(7).optional(),
    /** An optional block of code, shown in a monospaced box under the text. */
    code: z.string().max(4000).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.kind !== "choice") return;
    const count = q.options?.length ?? 0;
    if (count < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "A choice question needs at least two options.",
      });
    }
    if (q.answer !== undefined && q.answer >= count) {
      ctx.addIssue({
        code: "custom",
        path: ["answer"],
        message: "The correct answer must be one of the options.",
      });
    }
  });

export const paperContentSchema = z
  .object({
    instructions: z.string().max(4000).default(""),
    sections: z
      .array(
        z.object({
          title: z.string().trim().max(200).optional(),
          questions: z.array(questionSchema).max(100),
        }),
      )
      .min(1)
      .max(20),
  })
  .superRefine((paper, ctx) => {
    const keys = new Set<string>();
    let count = 0;
    paper.sections.forEach((section, s) =>
      section.questions.forEach((q, i) => {
        count += 1;
        if (keys.has(q.key)) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", s, "questions", i, "key"],
            message: "Two questions share a key.",
          });
        }
        keys.add(q.key);
      }),
    );
    if (count === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: "A paper needs at least one question.",
      });
    }
  });

export type PaperQuestion = z.infer<typeof questionSchema>;
export type PaperContent = z.infer<typeof paperContentSchema>;

/** What a student sees of a question: everything but the answer. */
export type ReleasedQuestion = Omit<PaperQuestion, "answer">;
export interface ReleasedContent {
  instructions: string;
  sections: Array<{ title?: string; questions: ReleasedQuestion[] }>;
}

/**
 * The paper with every answer taken out.
 *
 * Everything that is typeset, released or sent to a browser other than the
 * owner's editor is built from this, never from the content itself, so the
 * answer key cannot reach a printed page, a page image or a student.
 */
export function withoutAnswers(content: PaperContent): ReleasedContent {
  return {
    instructions: content.instructions,
    sections: content.sections.map((section) => ({
      ...(section.title ? { title: section.title } : {}),
      // Field by field rather than "everything but the answer": a field added
      // to questions later stays out of a student's hands until it is named.
      questions: section.questions.map((q) => ({
        key: q.key,
        text: q.text,
        marks: q.marks,
        kind: q.kind,
        ...(q.options ? { options: q.options } : {}),
        ...(q.code !== undefined ? { code: q.code } : {}),
      })),
    })),
  };
}

/** The answers to choice questions, keyed by question. */
export function answerKeyOf(content: PaperContent): Record<string, number> {
  const key: Record<string, number> = {};
  for (const section of content.sections) {
    for (const q of section.questions) {
      if (q.kind === "choice" && q.answer !== undefined) key[q.key] = q.answer;
    }
  }
  return key;
}

/**
 * One line of the answer sheet. No question text and no answers: the sheet is
 * stored as it is, beside the sealed paper, so it may hold nothing secret.
 */
export const sheetEntrySchema = z.object({
  key: z.string().min(1).max(40),
  /** "1", "2a": what the paper calls the question. */
  label: z.string().min(1).max(20),
  marks,
  kind: z.enum(["text", "choice"]),
  /** For choice questions: how many options there are. */
  optionCount: z.number().int().min(2).max(8).optional(),
});
export const sheetSchema = z.array(sheetEntrySchema).min(1).max(200);
export type SheetEntry = z.infer<typeof sheetEntrySchema>;

/** The answer sheet of a paper written in Plannr, numbered the way it prints. */
export function sheetOf(content: PaperContent): SheetEntry[] {
  let number = 0;
  return content.sections.flatMap((section) =>
    section.questions.map((q) => {
      number += 1;
      return {
        key: q.key,
        label: String(number),
        marks: q.marks,
        kind: q.kind,
        ...(q.kind === "choice" ? { optionCount: q.options?.length ?? 2 } : {}),
      };
    }),
  );
}

/** An answer sheet for an uploaded paper: questions 1 to n, with their marks. */
export function sheetForUpload(questionMarks: number[]): SheetEntry[] {
  return questionMarks.map((m, i) => ({
    key: `q${i + 1}`,
    label: String(i + 1),
    marks: m,
    kind: "text" as const,
  }));
}

export const totalMarksOf = (sheet: SheetEntry[]) =>
  sheet.reduce((sum, entry) => sum + entry.marks, 0);

/** A student's answers, keyed by question. */
export const answersSchema = z.record(
  z.string().max(40),
  z.object({
    text: z.string().max(20_000).optional(),
    choice: z.number().int().min(0).max(7).optional(),
  }),
);
export type Answers = z.infer<typeof answersSchema>;

/** Marks given, keyed by question. */
export const marksSchema = z.record(z.string().max(40), marks);

/**
 * The marks the key gives each choice question an answer was given to: full
 * marks for the right option, none for a wrong one. Text answers are left for
 * the teacher.
 */
export function autoMarks(
  sheet: SheetEntry[],
  key: Record<string, number>,
  answers: Answers,
): Record<string, number> {
  const given: Record<string, number> = {};
  for (const entry of sheet) {
    if (entry.kind !== "choice" || key[entry.key] === undefined) continue;
    const choice = answers[entry.key]?.choice;
    if (choice === undefined) continue;
    given[entry.key] = choice === key[entry.key] ? entry.marks : 0;
  }
  return given;
}

// ─── Maths in question text ─────────────────────────────────────────────────

export type TextSegment = { text: string } | { math: string };

/**
 * Splits question text into plain runs and `$...$` maths.
 *
 * Plain runs are typeset as text exactly as written, so nothing in them is
 * markup. Maths is typeset in typst's maths mode, where `#` would reach
 * typst's scripting language; it is refused rather than escaped, because a
 * question has no use for it. `\$` is a literal dollar sign, and an unclosed
 * `$` is just a dollar sign too.
 */
export function splitMath(
  text: string,
): { ok: true; segments: TextSegment[] } | { ok: false; error: string } {
  const segments: TextSegment[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\" && text[i + 1] === "$") {
      plain += "$";
      i += 2;
      continue;
    }
    if (ch === "$") {
      const close = findClosingDollar(text, i + 1);
      if (close === -1) {
        plain += ch;
        i += 1;
        continue;
      }
      const math = text.slice(i + 1, close);
      if (math.includes("#")) {
        return { ok: false, error: "Maths in a question cannot contain #." };
      }
      if (plain) segments.push({ text: plain });
      plain = "";
      if (math.trim()) segments.push({ math });
      i = close + 1;
      continue;
    }
    plain += ch;
    i += 1;
  }
  if (plain) segments.push({ text: plain });
  return { ok: true, segments };
}

function findClosingDollar(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\\" && text[i + 1] === "$") {
      i += 1;
      continue;
    }
    if (text[i] === "$") return i;
  }
  return -1;
}

// ─── When a test can be answered ────────────────────────────────────────────

/**
 * Answers already begun get this long after the window's natural end (the
 * sitting or the time allowed), for a slow network. The answer screen sends
 * what is unsaved as its clock runs out, so this only has to cover the trip.
 */
export const SUBMIT_GRACE_MS = 2 * 60_000;

/**
 * The grace after a teacher closes the paper early. Short, because the close
 * is a decision taken in the room: a save already on its way still lands, but
 * students cannot go on changing answers while the teacher goes through them.
 */
export const CLOSE_GRACE_MS = 15_000;

export interface AnswerWindow {
  opensAt: Date;
  closesAt: Date;
  /** The teacher closed the paper before its natural end. */
  closedByTeacher: boolean;
}

/**
 * When answers may be given: from the moment the paper is opened until the
 * earliest of the teacher closing it, the sitting ending, and the time allowed
 * running out. Null when the paper has not been opened.
 *
 * The sitting and the time allowed count only until the paper is opened: the
 * close they give is then kept as `answersCloseAt`, and from that moment the
 * window ends at that time or when the teacher closes it, whichever is first,
 * however the test is moved or changed afterwards.
 */
export function answerWindow(args: {
  releasedAt: Date | null;
  closedAt: Date | null;
  /** Fixed as the paper was opened. Null for a window not yet opened. */
  answersCloseAt?: Date | null;
  sittingEndsAt: Date | null;
  durationMinutes: number | null;
}): AnswerWindow | null {
  if (!args.releasedAt) return null;
  const natural = (
    args.answersCloseAt
      ? [args.answersCloseAt]
      : [
          args.sittingEndsAt,
          args.durationMinutes
            ? new Date(
                args.releasedAt.getTime() + args.durationMinutes * 60_000,
              )
            : null,
        ]
  ).filter((d): d is Date => d !== null);
  // A paper opened with nothing to bound it closes when its teacher closes it;
  // a day stands in until then, so the window is never unbounded.
  const naturalEnd = natural.length
    ? Math.min(...natural.map((d) => d.getTime()))
    : null;
  // A close after the natural end changes nothing: the time was already over.
  const closedByTeacher = Boolean(
    args.closedAt &&
    (naturalEnd === null || args.closedAt.getTime() < naturalEnd),
  );
  const closesAt = closedByTeacher
    ? args.closedAt!
    : new Date(naturalEnd ?? args.releasedAt.getTime() + 24 * 60 * 60_000);
  return { opensAt: args.releasedAt, closesAt, closedByTeacher };
}

/** The grace a begun submission has past the close of this window. */
export const graceOf = (window: { closedByTeacher?: boolean }) =>
  window.closedByTeacher ? CLOSE_GRACE_MS : SUBMIT_GRACE_MS;

/**
 * The moment nothing more can be saved, grace included: from then on every
 * begun submission counts as handed in, and marks may be shown.
 */
export const answersFinalAt = (window: {
  closesAt: Date;
  closedByTeacher?: boolean;
}) => new Date(window.closesAt.getTime() + graceOf(window));

/**
 * Whether a student may save answers now. A submission already begun keeps
 * its grace past the close (`graceOf`), so the last save of somebody on a
 * slow connection is not lost; one not yet begun gets no grace.
 */
export function mayAnswer(
  window: { opensAt: Date; closesAt: Date; closedByTeacher?: boolean } | null,
  now: Date,
  started: boolean,
): boolean {
  if (!window) return false;
  if (now < window.opensAt) return false;
  const limit = started
    ? answersFinalAt(window).getTime()
    : window.closesAt.getTime();
  return now.getTime() <= limit;
}

/** Whether two answers to a question say the same thing. */
const sameAnswer = (
  a: Answers[string] | undefined,
  b: Answers[string] | undefined,
) => (a?.text ?? "") === (b?.text ?? "") && a?.choice === b?.choice;

/**
 * The answers that differ from what the server has, or null when nothing
 * does. Saves send only these, so a second tab that loaded earlier changes
 * only the questions it was used to answer.
 */
export function unsavedAnswers(
  current: Answers,
  saved: Answers,
): Answers | null {
  const changes: Answers = {};
  for (const [key, answer] of Object.entries(current)) {
    if (!sameAnswer(answer, saved[key])) changes[key] = answer;
  }
  return Object.keys(changes).length ? changes : null;
}

/** Whether two sets of marks give every question the same mark. */
export function sameMarks(
  a: Record<string, number> | null | undefined,
  b: Record<string, number> | null | undefined,
): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) {
    if (a?.[key] !== b?.[key]) return false;
  }
  return true;
}

/**
 * Whether the key marks the whole paper: every question is a choice question
 * with a correct option, so nothing is left for the teacher to read.
 */
export const markedByKeyAlone = (
  sheet: SheetEntry[],
  key: Record<string, number>,
) =>
  sheet.length > 0 &&
  sheet.every(
    (entry) => entry.kind === "choice" && key[entry.key] !== undefined,
  );
