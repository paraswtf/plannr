import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { PaperContent } from "~/lib/assignments";
import { SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { SAMPLE_META, SAMPLE_PAPER } from "~/server/services/papers/sample";
import {
  documentSettingsFor,
  typesetPaper,
} from "~/server/services/papers/typeset";
import { stopTypesetter } from "~/server/services/papers/typesetter";
import {
  NOT_OWNER_MESSAGE,
  STUCK_COUNT_MS,
} from "~/server/services/papers/unlock";
import { AssignmentType } from "../../../../generated/prisma";

/**
 * Question papers against a real Postgres and the real crypto: what is stored
 * when a paper is saved, who can open it, the lockout after wrong passwords,
 * uploads, and opening a paper to students.
 *
 * Needs QUESTION_PAPER_KEY in .env. Run with `npm run test:integration`.
 */

const TZ = "Asia/Kolkata";
const ORG = "papers-itest";
const MAIL = "@papers-itest.plannr-demo.invalid";
const HOUR = 3_600_000;
const PASSWORD = "correct horse battery";
const SECRET_TEXT = "Name the zebra-quokka theorem";
const createCaller = createCallerFactory(appRouter);

type Caller = ReturnType<typeof createCaller>;

let orgId: string;
let groupId: string;
let courseId: string;
let teacherId: string;
let teacher: Caller;
let otherTeacher: Caller;
let coordinator: Caller;
let admin: Caller;
let studentUserId: string;

const content: PaperContent = {
  instructions: "Answer every question.",
  sections: [
    {
      title: "Section A",
      questions: [
        { key: "q1", text: SECRET_TEXT, marks: 4, kind: "text" },
        {
          key: "q2",
          text: "What is $2 + 2$?",
          marks: 1,
          kind: "choice",
          options: ["3", "4", "5"],
          answer: 1,
        },
      ],
    },
  ],
};

async function person(
  local: string,
  role: "faculty" | "coordinator" | "student" | "admin",
) {
  const roleRow = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: role } },
  });
  const user = await db.user.create({
    data: { orgId, email: `${local}${MAIL}`, name: local },
  });
  await db.userRole.create({ data: { userId: user.id, roleId: roleRow.id } });
  const caller = createCaller({
    db,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + HOUR).toISOString(),
      user: {
        id: user.id,
        orgId,
        roles: [{ id: roleRow.id, name: roleRow.name, key: roleRow.key }],
        permissions: roleRow.permissions.toString(),
        isActive: true,
        isServiceAccount: false,
        viaApiKey: false,
      },
    },
  });
  return { user, caller };
}

async function makeTest(
  type: AssignmentType = AssignmentType.CLASS_TEST_ONLINE,
) {
  const startsAt = new Date(Date.now() + HOUR);
  return (
    await db.assignment.create({
      data: {
        orgId,
        type,
        title: "Unit 3 test",
        groupId,
        courseId,
        createdById: teacherId,
        durationMinutes: 45,
        startsAt,
        endsAt: new Date(startsAt.getTime() + HOUR),
      },
    })
  ).id;
}

/**
 * The teacher again, through a database that runs `meanwhile` just before
 * the request writes a sealed paper (the one write that carries a salt): a
 * second tab's request that lands between this one opening the paper and
 * storing what it made of it.
 */
async function teacherInterruptedBy(meanwhile: () => Promise<unknown>) {
  const role = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: "faculty" } },
  });
  let done = false;
  const bind = (target: object, prop: string | symbol) => {
    const value = Reflect.get(target, prop) as unknown;
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  };
  const papers = new Proxy(db.questionPaper, {
    get(target, prop) {
      if (prop !== "updateMany") return bind(target, prop);
      return async (args: { data: Record<string, unknown> }) => {
        if (!done && "kdfSalt" in args.data) {
          done = true;
          await meanwhile();
        }
        return target.updateMany(args);
      };
    },
  });
  const interrupted = new Proxy(db, {
    get: (target, prop) =>
      prop === "questionPaper" ? papers : bind(target, prop),
  });
  return createCaller({
    db: interrupted,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + HOUR).toISOString(),
      user: {
        id: teacherId,
        orgId,
        roles: [{ id: role.id, name: role.name, key: role.key }],
        permissions: role.permissions.toString(),
        isActive: true,
        isServiceAccount: false,
        viaApiKey: false,
      },
    },
  });
}

/** A small, real PDF, typeset by the paper core. */
async function samplePdf() {
  const doc = await documentSettingsFor(db, orgId);
  const { pdf } = await typesetPaper({
    content: SAMPLE_PAPER,
    meta: SAMPLE_META,
    doc,
  });
  return Buffer.from(pdf);
}

afterAll(() => stopTypesetter());

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "Papers Org", timezone: TZ },
  });
  orgId = org.id;

  await db.notification.deleteMany({ where: { orgId } });
  await db.assignment.deleteMany({ where: { orgId } });
  await db.studentProfile.deleteMany({ where: { orgId } });
  await db.facultyProfile.deleteMany({ where: { orgId } });
  await db.user.deleteMany({ where: { email: { endsWith: MAIL } } });
  await db.groupCourse.deleteMany({ where: { group: { orgId } } });
  await db.course.deleteMany({ where: { orgId } });
  await db.group.deleteMany({ where: { orgId } });
  await db.semester.deleteMany({ where: { orgId } });

  for (const role of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { orgId_key: { orgId, key: role.key } },
      update: { permissions: role.permissions },
      create: {
        orgId,
        key: role.key,
        name: role.name,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }

  const programme = await db.programme.upsert({
    where: { orgId_code: { orgId, code: "PP" } },
    update: {},
    create: { orgId, code: "PP", name: "Papers" },
  });
  const semester = await db.semester.create({
    data: {
      orgId,
      name: "Papers Term",
      startDate: new Date(Date.now() - 30 * 24 * HOUR),
      endDate: new Date(Date.now() + 90 * 24 * HOUR),
    },
  });
  groupId = (
    await db.group.create({
      data: {
        orgId,
        programmeId: programme.id,
        semesterId: semester.id,
        name: "PP-A",
      },
    })
  ).id;
  courseId = (
    await db.course.create({
      data: {
        orgId,
        semesterId: semester.id,
        programmeId: programme.id,
        title: "Number Theory",
      },
    })
  ).id;

  const t = await person("teacher", "faculty");
  teacherId = t.user.id;
  teacher = t.caller;
  otherTeacher = (await person("other-teacher", "faculty")).caller;
  coordinator = (await person("coordinator", "coordinator")).caller;
  admin = (await person("admin", "admin")).caller;

  const s = await person("student", "student");
  studentUserId = s.user.id;
  const profile = await db.studentProfile.create({
    data: { userId: s.user.id, orgId, prn: "papers-prn-1" },
  });
  await db.studentGroupMembership.create({
    data: { studentId: profile.id, groupId },
  });
});

describe("saving a paper written in Plannr", () => {
  it("stores neither the question text nor the password in the clear", async () => {
    const assignmentId = await makeTest();
    const saved = await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    expect(saved.totalMarks).toBe(5);
    expect(saved.pageCount).toBeGreaterThan(0);

    const row = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    expect(row.ownerId).toBe(teacherId);
    expect(row.contentCipher).not.toBeNull();
    for (const blob of [row.pdfCipher, row.contentCipher!]) {
      const bytes = Buffer.from(blob);
      expect(bytes.includes(Buffer.from(SECRET_TEXT))).toBe(false);
      expect(bytes.includes(Buffer.from("zebra"))).toBe(false);
      expect(bytes.includes(Buffer.from(PASSWORD))).toBe(false);
      expect(bytes.subarray(0, 5).toString("ascii")).not.toBe("%PDF-");
    }
    // The sheet is stored as it is, and holds no answers.
    expect(row.sheet).toEqual([
      { key: "q1", label: "1", marks: 4, kind: "text" },
      { key: "q2", label: "2", marks: 1, kind: "choice", optionCount: 3 },
    ]);

    const status = await teacher.papers.status({ assignmentId });
    expect(status.enabled).toBe(true);
    expect(status.paper).toMatchObject({
      source: "AUTHORED",
      isOwner: true,
      locked: false,
    });
  });

  it("re-saves only with the paper's own password", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    await expect(
      teacher.papers.saveAuthored({
        assignmentId,
        password: "another password",
        content,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
  });
});

describe("opening a paper", () => {
  it("opens for its owner and for nobody else, whatever they hold", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });

    const opened = await teacher.papers.unlockForEditing({
      assignmentId,
      password: PASSWORD,
    });
    expect(opened.content.sections[0]!.questions[1]!.answer).toBe(1);
    expect(opened.content.sections[0]!.questions[0]!.text).toBe(SECRET_TEXT);

    const pdf = await teacher.papers.unlockPdf({
      assignmentId,
      password: PASSWORD,
    });
    expect(Buffer.from(pdf.pdfBase64, "base64").subarray(0, 5).toString()).toBe(
      "%PDF-",
    );

    // A coordinator and an administrator may manage the test, so it is the
    // owner check that refuses them, with the right password in hand.
    for (const caller of [coordinator, admin]) {
      await expect(
        caller.papers.unlockForEditing({ assignmentId, password: PASSWORD }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: NOT_OWNER_MESSAGE,
      });
      await expect(
        caller.papers.unlockPdf({ assignmentId, password: PASSWORD }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: NOT_OWNER_MESSAGE,
      });
      await expect(
        caller.papers.release({ assignmentId, password: PASSWORD }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: NOT_OWNER_MESSAGE,
      });
    }
    // A teacher who did not set the test does not get as far as the paper.
    await expect(
      otherTeacher.papers.unlockPdf({ assignmentId, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("locks after five wrong passwords and opens again when the lock ends", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });

    for (let i = 0; i < 4; i++) {
      await expect(
        teacher.papers.unlockPdf({
          assignmentId,
          password: `wrong guess ${i}`,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    const fifth = await teacher.papers
      .unlockPdf({ assignmentId, password: "wrong guess 5" })
      .then(
        () => null,
        (error: { code: string; message: string }) => error,
      );
    expect(fifth?.code).toBe("TOO_MANY_REQUESTS");
    expect(fifth?.message).toMatch(/^Too many wrong passwords\. Try again at /);

    // The right password is refused too while the lock lasts.
    await expect(
      teacher.papers.unlockPdf({ assignmentId, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const locked = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    expect(locked.failedUnlocks).toBe(0);
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(
      Date.now() + 14 * 60_000,
    );
    expect((await teacher.papers.status({ assignmentId })).paper?.locked).toBe(
      true,
    );

    await db.questionPaper.update({
      where: { assignmentId },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    await teacher.papers.unlockPdf({ assignmentId, password: PASSWORD });
    const after = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    expect(after.lockedUntil).toBeNull();
    expect(after.failedUnlocks).toBe(0);
  });

  it("locks a paper whose fifth wrong try died before it could", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    // What a request leaves behind when it takes the last try and is then
    // stopped (a deploy, a dropped connection) before it writes the lock.
    await db.questionPaper.update({
      where: { assignmentId },
      data: {
        failedUnlocks: 5,
        lockedUntil: null,
        updatedAt: new Date(Date.now() - STUCK_COUNT_MS - 1000),
      },
    });
    await expect(
      teacher.papers.unlockPdf({ assignmentId, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // Now a real lock, which the card shows and which ends by itself.
    const locked = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    expect(locked.failedUnlocks).toBe(0);
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(
      Date.now() + 14 * 60_000,
    );
    expect((await teacher.papers.status({ assignmentId })).paper?.locked).toBe(
      true,
    );
    await db.questionPaper.update({
      where: { assignmentId },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    await teacher.papers.unlockPdf({ assignmentId, password: PASSWORD });
  });

  it("leaves a fifth try that is still running to write its own lock", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    // The count was taken a moment ago: that request may yet find the
    // password right, so no lock is written over it.
    await db.questionPaper.update({
      where: { assignmentId },
      data: { failedUnlocks: 5, lockedUntil: null },
    });
    await expect(
      teacher.papers.unlockPdf({ assignmentId, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const row = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    expect(row.failedUnlocks).toBe(5);
    expect(row.lockedUntil).toBeNull();
  });

  it("counts guesses sent all at once before any of them is tried", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        teacher.papers
          .unlockPdf({ assignmentId, password: `burst guess ${i}` })
          .then(
            () => "opened",
            (error: { code: string }) => error.code,
          ),
      ),
    );
    expect(results).not.toContain("opened");
    expect(
      results.filter((code) => code === "BAD_REQUEST").length,
    ).toBeLessThanOrEqual(4);
    const row = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    await expect(
      teacher.papers.unlockPdf({ assignmentId, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("changes the password with a new salt", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    const before = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    await teacher.papers.changePassword({
      assignmentId,
      password: PASSWORD,
      newPassword: "a brand new password",
    });
    const after = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    expect(Buffer.from(after.kdfSalt).equals(Buffer.from(before.kdfSalt))).toBe(
      false,
    );
    await expect(
      teacher.papers.unlockPdf({ assignmentId, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await teacher.papers.unlockPdf({
      assignmentId,
      password: "a brand new password",
    });
  });

  /** The question text a paper opens with, for the owner's editor. */
  const openedText = async (assignmentId: string, password: string) =>
    (await teacher.papers.unlockForEditing({ assignmentId, password })).content
      .sections[0]!.questions[0]!.text;

  const edited: PaperContent = {
    ...content,
    sections: [
      {
        ...content.sections[0]!,
        questions: [
          { key: "q1", text: "An edited question", marks: 4, kind: "text" },
          content.sections[0]!.questions[1]!,
        ],
      },
    ],
  };

  it("refuses a save that would seal over a password changed meanwhile", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    const tab = await teacherInterruptedBy(() =>
      teacher.papers.changePassword({
        assignmentId,
        password: PASSWORD,
        newPassword: "a brand new password",
      }),
    );
    await expect(
      tab.papers.saveAuthored({
        assignmentId,
        password: PASSWORD,
        content: edited,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(
        /changed while this was saving/,
      ) as unknown,
    });
    // The new password still opens the paper, as it was.
    expect(await openedText(assignmentId, "a brand new password")).toBe(
      SECRET_TEXT,
    );
  });

  it("refuses a new password that would seal over a save made meanwhile", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    const tab = await teacherInterruptedBy(() =>
      teacher.papers.saveAuthored({
        assignmentId,
        password: PASSWORD,
        content: edited,
      }),
    );
    await expect(
      tab.papers.changePassword({
        assignmentId,
        password: PASSWORD,
        newPassword: "a brand new password",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // The save is kept, under the password it was made with.
    expect(await openedText(assignmentId, PASSWORD)).toBe("An edited question");
  });
});

describe("uploading a PDF", () => {
  it("takes a real PDF and refuses a file that is not one, or is too big", async () => {
    const assignmentId = await makeTest();
    const pdf = await samplePdf();

    const saved = await teacher.papers.uploadPdf({
      assignmentId,
      password: PASSWORD,
      fileBase64: pdf.toString("base64"),
      fileName: "C:\\papers\\unit-3.pdf",
      questionMarks: [5, 2.5, 2.5],
    });
    expect(saved.totalMarks).toBe(10);
    const row = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    expect(row.source).toBe("UPLOAD");
    expect(row.fileName).toBe("unit-3.pdf");
    expect(row.pageCount).toBe(saved.pageCount);
    expect(row.contentCipher).toBeNull();
    expect((row.sheet as unknown[]).length).toBe(3);

    const other = await makeTest();
    await expect(
      teacher.papers.uploadPdf({
        assignmentId: other,
        password: PASSWORD,
        fileBase64: Buffer.from("just some text, not a PDF").toString("base64"),
        fileName: "notes.txt",
        questionMarks: [5],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This file is not a PDF. Upload the paper as a PDF.",
    });

    const big = Buffer.alloc(4 * 1024 * 1024 + 1, 0x20);
    big.write("%PDF-1.7\n");
    await expect(
      teacher.papers.uploadPdf({
        assignmentId: other,
        password: PASSWORD,
        fileBase64: big.toString("base64"),
        fileName: "big.pdf",
        questionMarks: [5],
      }),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });

    // A test answered in Plannr needs the marks of each question.
    await expect(
      teacher.papers.uploadPdf({
        assignmentId: other,
        password: PASSWORD,
        fileBase64: pdf.toString("base64"),
        fileName: "unit-3.pdf",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await db.questionPaper.count({ where: { assignmentId: other } }),
    ).toBe(0);
  });

  it("gives a test sat on paper a one-line sheet with its total", async () => {
    const assignmentId = await makeTest(AssignmentType.CLASS_TEST_OFFLINE);
    const pdf = await samplePdf();
    await teacher.papers.uploadPdf({
      assignmentId,
      password: PASSWORD,
      fileBase64: pdf.toString("base64"),
      fileName: "offline.pdf",
      totalMarks: 30,
    });
    const row = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
    });
    expect(row.sheet).toEqual([
      { key: "q1", label: "1", marks: 30, kind: "text" },
    ]);
    // Offline papers are printed, never opened to students.
    await expect(
      teacher.papers.release({ assignmentId, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("opening a paper to students", () => {
  it("writes its pages and key-free questions, and tells the students", async () => {
    const assignmentId = await makeTest();
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    const released = await teacher.papers.release({
      assignmentId,
      password: PASSWORD,
    });
    expect(released.pageCount).toBeGreaterThan(0);

    const row = await db.questionPaper.findUniqueOrThrow({
      where: { assignmentId },
      include: { pages: { orderBy: { number: "asc" } } },
    });
    expect(row.releasedAt).not.toBeNull();
    expect(row.pages).toHaveLength(released.pageCount);
    const svg = Buffer.from(row.pages[0]!.svg).toString("utf8");
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<script");
    expect(JSON.stringify(row.releasedQuestions)).not.toContain('"answer"');
    expect(JSON.stringify(row.releasedQuestions)).toContain(SECRET_TEXT);
    expect(row.answerKey).toEqual({ q2: 1 });
    expect(Buffer.from(row.releasedPdf!).subarray(0, 5).toString()).toBe(
      "%PDF-",
    );

    const news = await db.notification.findMany({
      where: { orgId, sourceKey: `paper-open:${assignmentId}` },
    });
    expect(news.map((n) => n.userId)).toEqual([studentUserId]);
    expect(news[0]!.title).toBe("Paper open: Unit 3 test");

    // Once open it is fixed: no re-save, no second release, no removal.
    await expect(
      teacher.papers.saveAuthored({
        assignmentId,
        password: PASSWORD,
        content,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      teacher.papers.release({ assignmentId, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      coordinator.papers.remove({ assignmentId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const closed = await coordinator.papers.close({ assignmentId });
    expect(closed.closedAt).toBeInstanceOf(Date);
  });
});
