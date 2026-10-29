import { describe, expect, it } from "vitest";

import {
  AssignmentType as PrismaAssignmentType,
  QuestionPaperSource,
} from "../../generated/prisma";
import {
  ASSIGNMENT_TYPE_META,
  ASSIGNMENT_TYPES,
  answerKeyOf,
  answersFinalAt,
  answerWindow,
  autoMarks,
  CLOSE_GRACE_MS,
  markedByKeyAlone,
  mayAnswer,
  paperContentSchema,
  sameMarks,
  sheetForUpload,
  sheetOf,
  splitMath,
  SUBMIT_GRACE_MS,
  totalMarksOf,
  unsavedAnswers,
  withoutAnswers,
  type PaperContent,
} from "./assignments";

const paper: PaperContent = {
  instructions: "Answer every question.",
  sections: [
    {
      title: "Part A",
      questions: [
        {
          key: "a1",
          text: "Which of these is a stack operation?",
          marks: 1,
          kind: "choice",
          options: ["push", "enqueue", "hash"],
          answer: 0,
        },
        { key: "a2", text: "Define $O(n log n)$.", marks: 2.5, kind: "text" },
      ],
    },
    {
      questions: [
        {
          key: "b1",
          text: "Reverse a list.",
          marks: 5,
          kind: "text",
          code: "def rev(xs):\n    ...",
        },
      ],
    },
  ],
};

describe("assignment types", () => {
  it("are exactly the ones the database enum has", () => {
    expect([...ASSIGNMENT_TYPES].sort()).toEqual(
      Object.values(PrismaAssignmentType).sort(),
    );
    expect(Object.values(QuestionPaperSource).sort()).toEqual([
      "AUTHORED",
      "UPLOAD",
    ]);
  });

  it("answer online and in-app tests in Plannr, and only those", () => {
    expect(
      ASSIGNMENT_TYPES.filter((t) => ASSIGNMENT_TYPE_META[t].answeredInApp),
    ).toEqual(["CLASS_TEST_ONLINE", "CLASS_TEST_IN_APP_OFFLINE"]);
    expect(ASSIGNMENT_TYPE_META.PRESENTATION.isTest).toBe(false);
  });
});

describe("a paper written in Plannr", () => {
  it("passes its own schema", () => {
    expect(paperContentSchema.safeParse(paper).success).toBe(true);
  });

  it("refuses a choice question with one option or an answer that is not one", () => {
    const one = structuredClone(paper);
    one.sections[0]!.questions[0]!.options = ["push"];
    expect(paperContentSchema.safeParse(one).success).toBe(false);

    const outside = structuredClone(paper);
    outside.sections[0]!.questions[0]!.answer = 5;
    expect(paperContentSchema.safeParse(outside).success).toBe(false);
  });

  it("refuses two questions with one key, and a paper with no questions", () => {
    const twice = structuredClone(paper);
    twice.sections[1]!.questions[0]!.key = "a1";
    expect(paperContentSchema.safeParse(twice).success).toBe(false);

    expect(
      paperContentSchema.safeParse({
        instructions: "",
        sections: [{ questions: [] }],
      }).success,
    ).toBe(false);
  });

  it("refuses marks that are not in half steps", () => {
    const odd = structuredClone(paper);
    odd.sections[0]!.questions[1]!.marks = 2.3;
    expect(paperContentSchema.safeParse(odd).success).toBe(false);
  });
});

describe("withoutAnswers", () => {
  it("takes every answer out and nothing else", () => {
    const released = withoutAnswers(paper);
    expect(JSON.stringify(released)).not.toContain('"answer"');
    expect(released.sections[0]!.questions[0]!.options).toEqual([
      "push",
      "enqueue",
      "hash",
    ]);
    expect(released.sections[1]!.questions[0]!.code).toContain("def rev");
    expect(released.instructions).toBe(paper.instructions);
  });

  it("leaves the paper it was given alone", () => {
    withoutAnswers(paper);
    expect(paper.sections[0]!.questions[0]!.answer).toBe(0);
  });
});

describe("the answer sheet", () => {
  it("numbers the questions through the sections and keeps no text", () => {
    const sheet = sheetOf(paper);
    expect(sheet.map((e) => e.label)).toEqual(["1", "2", "3"]);
    expect(sheet[0]).toEqual({
      key: "a1",
      label: "1",
      marks: 1,
      kind: "choice",
      optionCount: 3,
    });
    expect(JSON.stringify(sheet)).not.toContain("stack");
    expect(totalMarksOf(sheet)).toBe(8.5);
  });

  it("is questions 1 to n for an uploaded paper", () => {
    expect(
      sheetForUpload([2, 3]).map((e) => [e.key, e.label, e.marks]),
    ).toEqual([
      ["q1", "1", 2],
      ["q2", "2", 3],
    ]);
  });

  it("marks choice questions from the key and leaves text to the teacher", () => {
    const sheet = sheetOf(paper);
    const key = answerKeyOf(paper);
    expect(key).toEqual({ a1: 0 });
    expect(autoMarks(sheet, key, { a1: { choice: 0 } })).toEqual({ a1: 1 });
    expect(autoMarks(sheet, key, { a1: { choice: 2 } })).toEqual({ a1: 0 });
    expect(autoMarks(sheet, key, { a2: { text: "..." } })).toEqual({});
  });
});

describe("splitMath", () => {
  it("keeps plain text as it is, markup characters and all", () => {
    expect(splitMath("C# basics: 2*3 = 6, a_b <tag> @ref")).toEqual({
      ok: true,
      segments: [{ text: "C# basics: 2*3 = 6, a_b <tag> @ref" }],
    });
  });

  it("separates maths from the text around it", () => {
    expect(splitMath("Solve $x^2 + 1 = 0$ for x.")).toEqual({
      ok: true,
      segments: [
        { text: "Solve " },
        { math: "x^2 + 1 = 0" },
        { text: " for x." },
      ],
    });
  });

  it("reads an escaped or unclosed dollar as a dollar", () => {
    expect(splitMath("It costs \\$5 or $6")).toEqual({
      ok: true,
      segments: [{ text: "It costs $5 or $6" }],
    });
  });

  it("refuses # inside maths", () => {
    expect(splitMath('Try $#import "@preview/x:1.0.0"$')).toEqual({
      ok: false,
      error: "Maths in a question cannot contain #.",
    });
  });
});

describe("the answer window", () => {
  const opened = new Date("2026-11-04T04:30:00Z");
  const end = new Date("2026-11-04T05:30:00Z");

  it("is closed until the paper is opened", () => {
    expect(
      answerWindow({
        releasedAt: null,
        closedAt: null,
        sittingEndsAt: end,
        durationMinutes: null,
      }),
    ).toBeNull();
  });

  it("closes at the earliest of the end of the sitting, the time allowed and the teacher", () => {
    const base = { releasedAt: opened, closedAt: null, sittingEndsAt: end };
    expect(answerWindow({ ...base, durationMinutes: null })!.closesAt).toEqual(
      end,
    );
    expect(answerWindow({ ...base, durationMinutes: 20 })!.closesAt).toEqual(
      new Date("2026-11-04T04:50:00Z"),
    );
    const early = new Date("2026-11-04T04:40:00Z");
    expect(
      answerWindow({ ...base, closedAt: early, durationMinutes: 20 })!.closesAt,
    ).toEqual(early);
  });

  it("gives a begun submission a little grace and a new one none", () => {
    const window = answerWindow({
      releasedAt: opened,
      closedAt: null,
      sittingEndsAt: end,
      durationMinutes: null,
    });
    const justAfter = new Date(end.getTime() + SUBMIT_GRACE_MS / 2);
    expect(mayAnswer(window, justAfter, true)).toBe(true);
    expect(mayAnswer(window, justAfter, false)).toBe(false);
    expect(
      mayAnswer(window, new Date(end.getTime() + SUBMIT_GRACE_MS + 1), true),
    ).toBe(false);
    expect(mayAnswer(window, new Date(opened.getTime() - 1), true)).toBe(false);
  });
});

describe("closing early", () => {
  const opened = new Date("2026-11-04T04:30:00Z");
  const end = new Date("2026-11-04T05:30:00Z");
  const base = {
    releasedAt: opened,
    answersCloseAt: end,
    sittingEndsAt: null,
    durationMinutes: null,
  };

  it("gives a teacher's close only a short grace", () => {
    const early = new Date("2026-11-04T05:00:00Z");
    const window = answerWindow({ ...base, closedAt: early })!;
    expect(window.closesAt).toEqual(early);
    expect(window.closedByTeacher).toBe(true);
    expect(answersFinalAt(window)).toEqual(
      new Date(early.getTime() + CLOSE_GRACE_MS),
    );
    const at = (ms: number) => new Date(early.getTime() + ms);
    expect(mayAnswer(window, at(CLOSE_GRACE_MS), true)).toBe(true);
    expect(mayAnswer(window, at(CLOSE_GRACE_MS + 1), true)).toBe(false);
    expect(mayAnswer(window, at(1), false)).toBe(false);
  });

  it("keeps the natural end's grace for a close after it", () => {
    const window = answerWindow({
      ...base,
      closedAt: new Date("2026-11-04T06:00:00Z"),
    })!;
    expect(window.closesAt).toEqual(end);
    expect(window.closedByTeacher).toBe(false);
    expect(answersFinalAt(window)).toEqual(
      new Date(end.getTime() + SUBMIT_GRACE_MS),
    );
  });

  it("counts a close of a paper with no end as the teacher's", () => {
    const closedAt = new Date("2026-11-04T07:00:00Z");
    const window = answerWindow({
      releasedAt: opened,
      closedAt,
      sittingEndsAt: null,
      durationMinutes: null,
    })!;
    expect(window.closesAt).toEqual(closedAt);
    expect(window.closedByTeacher).toBe(true);
  });

  it("is not closed by anybody while open", () => {
    expect(answerWindow({ ...base, closedAt: null })!.closedByTeacher).toBe(
      false,
    );
  });
});

describe("saving only what changed", () => {
  it("sends the questions that differ from the saved answers", () => {
    expect(
      unsavedAnswers(
        { a: { text: "same" }, b: { text: "new" }, c: { choice: 1 } },
        { a: { text: "same" }, b: { text: "old" }, c: { choice: 0 } },
      ),
    ).toEqual({ b: { text: "new" }, c: { choice: 1 } });
  });

  it("sends a cleared answer, but not an empty one never saved", () => {
    expect(unsavedAnswers({ a: { text: "" } }, { a: { text: "x" } })).toEqual({
      a: { text: "" },
    });
    expect(unsavedAnswers({ a: { text: "" } }, {})).toBeNull();
  });

  it("is null when everything is saved, whatever order the fields are in", () => {
    expect(
      unsavedAnswers(
        { a: { choice: 2 }, b: { text: "t" } },
        {
          b: { text: "t" },
          a: { choice: 2 },
        },
      ),
    ).toBeNull();
  });
});

describe("comparing marks", () => {
  it("compares mark by mark, in any order", () => {
    expect(sameMarks({ a: 1, b: 0.5 }, { b: 0.5, a: 1 })).toBe(true);
    expect(sameMarks({ a: 1 }, { a: 1.5 })).toBe(false);
    expect(sameMarks({ a: 0 }, {})).toBe(false);
    expect(sameMarks({}, null)).toBe(true);
  });
});

describe("a paper the key marks alone", () => {
  const sheet = sheetOf(paper);
  it("needs every question to be a choice with an answer", () => {
    expect(markedByKeyAlone(sheet, answerKeyOf(paper))).toBe(false);
    const choices = sheet.filter((e) => e.kind === "choice");
    const key = Object.fromEntries(choices.map((e) => [e.key, 0]));
    expect(markedByKeyAlone(choices, key)).toBe(true);
    expect(markedByKeyAlone(choices, {})).toBe(false);
    expect(markedByKeyAlone([], {})).toBe(false);
  });
});
