import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import SuperJSON from "superjson";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "next-auth";

import type { PaperContent } from "~/lib/assignments";
import { SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory, createTRPCContext } from "~/server/api/trpc";
import { db } from "~/server/db";
import { stopTypesetter } from "~/server/services/papers/typesetter";
import { AssignmentType } from "../../../../generated/prisma";

/**
 * Answering a test in Plannr and marking it, against a real Postgres: the
 * window the server holds students to, who may answer, the roster, marking
 * and the moment students see their marks.
 *
 * Needs QUESTION_PAPER_KEY in .env. Run with `npm run test:integration`.
 */

const TZ = "Asia/Kolkata";
const ORG = "subs-itest";
const MAIL = "@subs-itest.plannr-demo.invalid";
const HOUR = 3_600_000;
const PASSWORD = "answers open sesame";
const createCaller = createCallerFactory(appRouter);

type Caller = ReturnType<typeof createCaller>;

let orgId: string;
let groupId: string;
let otherGroupId: string;
let teacherId: string;
let teacher: Caller;
let student: Caller;
let classmate: Caller;
let outsider: Caller;
let studentUserId: string;
let studentSession: Session;

const content: PaperContent = {
  instructions: "Answer every question.",
  sections: [
    {
      questions: [
        { key: "essay", text: "Explain recursion.", marks: 5, kind: "text" },
        {
          key: "pick",
          text: "Which is prime?",
          marks: 2,
          kind: "choice",
          options: ["4", "7", "9"],
          answer: 1,
        },
        {
          key: "pick2",
          text: "Which is even?",
          marks: 1,
          kind: "choice",
          options: ["3", "8"],
          answer: 1,
        },
      ],
    },
  ],
};

async function person(local: string, role: "faculty" | "student") {
  const roleRow = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: role } },
  });
  const user = await db.user.create({
    data: { orgId, email: `${local}${MAIL}`, name: local },
  });
  await db.userRole.create({ data: { userId: user.id, roleId: roleRow.id } });
  const session = {
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
  };
  const caller = createCaller({ db, headers: new Headers(), session });
  return { user, caller, session };
}

async function enrol(local: string, group: string) {
  const p = await person(local, "student");
  const profile = await db.studentProfile.create({
    data: { userId: p.user.id, orgId, prn: `${local}-prn` },
  });
  await db.studentGroupMembership.create({
    data: { studentId: profile.id, groupId: group },
  });
  return p;
}

/** A paper the key marks entirely: choice questions only. */
const choicesOnly: PaperContent = {
  instructions: "",
  sections: [{ questions: content.sections[0]!.questions.slice(1) }],
};

/** An online test whose paper is open now, sitting until two hours from now. */
async function openTest(paper: PaperContent = content) {
  const startsAt = new Date(Date.now() - 5 * 60_000);
  const assignmentId = (
    await db.assignment.create({
      data: {
        orgId,
        type: AssignmentType.CLASS_TEST_ONLINE,
        title: "Unit 4 test",
        groupId,
        createdById: teacherId,
        durationMinutes: 60,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * HOUR),
      },
    })
  ).id;
  await teacher.papers.saveAuthored({
    assignmentId,
    password: PASSWORD,
    content: paper,
  });
  await teacher.papers.release({ assignmentId, password: PASSWORD });
  return assignmentId;
}

/**
 * Opened two hours ago for half an hour. The close is set on the paper itself:
 * it was fixed when the paper opened, and editing the test now would not move
 * it.
 */
async function windowOver(assignmentId: string) {
  const releasedAt = new Date(Date.now() - 2 * HOUR);
  await db.questionPaper.update({
    where: { assignmentId },
    data: {
      releasedAt,
      answersCloseAt: new Date(releasedAt.getTime() + HOUR / 2),
    },
  });
}

/** As if the teacher had pressed Close this long ago. */
async function closedAgo(assignmentId: string, ms: number) {
  await db.questionPaper.update({
    where: { assignmentId },
    data: { closedAt: new Date(Date.now() - ms) },
  });
}

/**
 * A save sent the way the answer screen sends one as the page is hidden or
 * closed: a plain POST with keepalive, outside the tRPC client.
 */
async function rawSave(input: { assignmentId: string; answers: unknown }) {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: new Request("http://localhost/api/trpc/submissions.save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(SuperJSON.serialize(input)),
    }),
    router: appRouter,
    createContext: () =>
      createTRPCContext({ headers: new Headers(), session: studentSession }),
  });
  return {
    ok: response.ok,
    payload: (await response.json()) as {
      result?: { data?: { json?: { closed?: boolean } } };
      error?: { json?: { data?: { code?: string } } };
    },
  };
}

afterAll(() => stopTypesetter());

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "Submissions Org", timezone: TZ },
  });
  orgId = org.id;

  await db.notification.deleteMany({ where: { orgId } });
  await db.assignment.deleteMany({ where: { orgId } });
  await db.studentProfile.deleteMany({ where: { orgId } });
  await db.user.deleteMany({ where: { email: { endsWith: MAIL } } });
  await db.group.deleteMany({ where: { orgId } });

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
    where: { orgId_code: { orgId, code: "SB" } },
    update: {},
    create: { orgId, code: "SB", name: "Submissions" },
  });
  const group = (name: string) =>
    db.group.create({ data: { orgId, programmeId: programme.id, name } });
  groupId = (await group("SB-A")).id;
  otherGroupId = (await group("SB-B")).id;

  const t = await person("teacher", "faculty");
  teacherId = t.user.id;
  teacher = t.caller;
  const s = await enrol("amara", groupId);
  student = s.caller;
  studentUserId = s.user.id;
  studentSession = s.session;
  classmate = (await enrol("bilal", groupId)).caller;
  outsider = (await enrol("chen", otherGroupId)).caller;
});

describe("answering a test", () => {
  it("starts, saves and submits inside the window", async () => {
    const assignmentId = await openTest();

    const before = await student.submissions.mine({ assignmentId });
    expect(before.serverNow).toBeInstanceOf(Date);
    expect(before.released).toBe(true);
    expect(before.submission).toBeNull();
    expect(before.sheet?.map((e) => e.key)).toEqual(["essay", "pick", "pick2"]);

    const paper = await student.submissions.paper({ assignmentId });
    expect(JSON.stringify(paper.releasedQuestions)).not.toContain('"answer"');
    expect(paper).not.toHaveProperty("answerKey");
    const page = await student.submissions.page({ assignmentId, number: 1 });
    expect(page.svg).toContain("<svg");

    await student.submissions.start({ assignmentId });
    await student.submissions.save({
      assignmentId,
      answers: { essay: { text: "A function that calls itself." } },
    });
    // Keys and options the sheet does not have are refused.
    await expect(
      student.submissions.save({
        assignmentId,
        answers: { nonsense: { text: "x" } },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      student.submissions.save({
        assignmentId,
        answers: { pick: { choice: 5 } },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      student.submissions.save({
        assignmentId,
        answers: { essay: { choice: 0 } },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await student.submissions.submit({
      assignmentId,
      answers: {
        essay: { text: "A function that calls itself." },
        pick: { choice: 1 },
        pick2: { choice: 0 },
      },
    });
    const after = await student.submissions.mine({ assignmentId });
    expect(after.submission?.status).toBe("submitted");
    expect(after.submission?.submittedAt).toBeInstanceOf(Date);
    // Handed in is final.
    await expect(
      student.submissions.save({ assignmentId, answers: {} }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("refuses a save once the window and its grace are over", async () => {
    const assignmentId = await openTest();
    await student.submissions.start({ assignmentId });
    await windowOver(assignmentId);

    await expect(
      student.submissions.save({
        assignmentId,
        answers: { essay: { text: "Too late" } },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      student.submissions.submit({ assignmentId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      classmate.submissions.start({ assignmentId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const roster = await teacher.submissions.roster({ assignmentId });
    const byName = Object.fromEntries(
      roster.rows.map((r) => [r.name, r.status]),
    );
    expect(byName).toEqual({
      amara: "handed in at the close",
      bilal: "not started",
    });
  });

  it("merges each save and the hand-in into what is saved, question by question", async () => {
    const assignmentId = await openTest();
    await student.submissions.start({ assignmentId });
    const saved = await student.submissions.save({
      assignmentId,
      answers: { essay: { text: "First tab" } },
    });
    expect(saved.closed).toBe(false);
    expect(saved.closesAt).toBeInstanceOf(Date);
    // A second tab, opened before the first saved, sends only what it changed.
    await student.submissions.save({
      assignmentId,
      answers: { pick: { choice: 1 } },
    });
    expect(
      (await student.submissions.mine({ assignmentId })).submission?.answers,
    ).toEqual({
      essay: { text: "First tab" },
      pick: { choice: 1 },
    });
    // A question sent again is replaced, and clearing a text answer sticks.
    await student.submissions.save({
      assignmentId,
      answers: { essay: { text: "" } },
    });
    await student.submissions.submit({
      assignmentId,
      answers: { pick2: { choice: 1 } },
    });
    const after = await student.submissions.mine({ assignmentId });
    expect(after.submission?.status).toBe("submitted");
    expect(after.submission?.answers).toEqual({
      essay: { text: "" },
      pick: { choice: 1 },
      pick2: { choice: 1 },
    });
    // A second hand-in changes nothing.
    await expect(
      student.submissions.submit({
        assignmentId,
        answers: { essay: { text: "Too late" } },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const final = await student.submissions.mine({ assignmentId });
    expect(final.submission?.answers.essay).toEqual({ text: "" });
  });

  it("gives only a short grace after the teacher closes the paper", async () => {
    const assignmentId = await openTest();
    await student.submissions.start({ assignmentId });

    // A save on its way as the teacher closes still lands, and says so.
    await closedAgo(assignmentId, 5_000);
    const late = await student.submissions.save({
      assignmentId,
      answers: { essay: { text: "Just in time" } },
    });
    expect(late.closed).toBe(true);
    expect((await student.submissions.mine({ assignmentId })).closed).toBe(
      true,
    );

    // Not a quarter of a minute later: students cannot keep answering.
    await closedAgo(assignmentId, 20_000);
    await expect(
      student.submissions.save({
        assignmentId,
        answers: { essay: { text: "Heard it from the teacher" } },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      student.submissions.submit({ assignmentId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const roster = await teacher.submissions.roster({ assignmentId });
    expect(roster.rows.find((r) => r.name === "amara")!.status).toBe(
      "handed in at the close",
    );
    expect(roster.canPublish).toBe(true);
    const mine = await student.submissions.mine({ assignmentId });
    expect(mine.submission?.answers).toEqual({
      essay: { text: "Just in time" },
    });
  });

  it("takes a save sent as the page is closed, in the shape the screen reads", async () => {
    const assignmentId = await openTest();
    await student.submissions.start({ assignmentId });
    const saved = await rawSave({
      assignmentId,
      answers: { essay: { text: "Typed as the phone locked" } },
    });
    expect(saved.ok).toBe(true);
    expect(saved.payload.result?.data?.json?.closed).toBe(false);
    expect(
      (await student.submissions.mine({ assignmentId })).submission?.answers,
    ).toEqual({ essay: { text: "Typed as the phone locked" } });

    await windowOver(assignmentId);
    const late = await rawSave({
      assignmentId,
      answers: { essay: { text: "Too late" } },
    });
    expect(late.ok).toBe(false);
    expect(late.payload.error?.json?.data?.code).toBe("PRECONDITION_FAILED");
  });

  it("keeps students of another group out", async () => {
    const assignmentId = await openTest();
    await expect(
      outsider.submissions.mine({ assignmentId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      outsider.submissions.start({ assignmentId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      outsider.submissions.page({ assignmentId, number: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      outsider.submissions.pdf({ assignmentId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows nothing of the paper to students before it opens", async () => {
    const assignmentId = (
      await db.assignment.create({
        data: {
          orgId,
          type: AssignmentType.CLASS_TEST_IN_APP_OFFLINE,
          title: "Not yet",
          groupId,
          createdById: teacherId,
          endsAt: new Date(Date.now() + HOUR),
        },
      })
    ).id;
    await teacher.papers.saveAuthored({
      assignmentId,
      password: PASSWORD,
      content,
    });
    await expect(
      student.submissions.paper({ assignmentId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      student.submissions.start({ assignmentId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect((await student.submissions.mine({ assignmentId })).sheet).toBeNull();
  });
});

describe("marking", () => {
  it("suggests marks for choice questions, refuses too many, and publishes", async () => {
    const assignmentId = await openTest();
    await student.submissions.start({ assignmentId });
    await student.submissions.submit({
      assignmentId,
      answers: {
        essay: { text: "A function that calls itself." },
        pick: { choice: 1 },
        pick2: { choice: 0 },
      },
    });

    const roster = await teacher.submissions.roster({ assignmentId });
    const row = roster.rows.find((r) => r.name === "amara")!;
    expect(row.status).toBe("submitted");

    const submission = await teacher.submissions.byId({
      submissionId: row.submissionId!,
    });
    expect(submission.autoMarks).toEqual({ pick: 2, pick2: 0 });
    expect(submission.answerKey).toEqual({ pick: 1, pick2: 1 });

    await expect(
      teacher.submissions.mark({
        submissionId: row.submissionId!,
        marks: { essay: 6 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      teacher.submissions.mark({
        submissionId: row.submissionId!,
        marks: { nope: 1 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // A student cannot mark, nor read somebody's submission.
    await expect(
      student.submissions.byId({ submissionId: row.submissionId! }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const marked = await teacher.submissions.mark({
      submissionId: row.submissionId!,
      marks: { essay: 4.5, pick: 2, pick2: 0 },
      feedback: "Good definition; give an example next time.",
    });
    expect(marked.score).toBe(6.5);

    // Not before publishing.
    const hidden = await student.submissions.mine({ assignmentId });
    expect(hidden.marksPublished).toBe(false);
    expect(hidden.submission?.score).toBeNull();
    expect(hidden.submission?.marks).toBeNull();
    expect(hidden.submission?.feedback).toBeNull();

    // Not while classmates can still answer: the marks would give the key away.
    const during = await teacher.submissions.roster({ assignmentId });
    expect(during.canPublish).toBe(false);
    expect(during.answersFinalAt).toBeInstanceOf(Date);
    await expect(
      teacher.submissions.publish({ assignmentId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    // Marks marked published some other way stay hidden until then too.
    await db.assignment.update({
      where: { id: assignmentId },
      data: { marksPublishedAt: new Date() },
    });
    const early = await student.submissions.mine({ assignmentId });
    expect(early.marksPublished).toBe(false);
    expect(early.submission?.marks).toBeNull();
    await db.assignment.update({
      where: { id: assignmentId },
      data: { marksPublishedAt: null },
    });

    await windowOver(assignmentId);
    expect(
      (await teacher.submissions.roster({ assignmentId })).canPublish,
    ).toBe(true);
    await teacher.submissions.publish({ assignmentId });
    const shown = await student.submissions.mine({ assignmentId });
    expect(shown.submission?.score).toBe(6.5);
    expect(shown.submission?.marks).toEqual({ essay: 4.5, pick: 2, pick2: 0 });
    expect(shown.submission?.feedback).toBe(
      "Good definition; give an example next time.",
    );

    // Only students who answered are told.
    const news = await db.notification.findMany({
      where: { orgId, sourceKey: `marks-out:${assignmentId}` },
    });
    expect(news.map((n) => n.userId)).toEqual([studentUserId]);
    expect(news[0]!.title).toBe("Marks out: Unit 4 test");
  });

  it("refuses to publish before the paper is opened", async () => {
    const assignmentId = (
      await db.assignment.create({
        data: {
          orgId,
          type: AssignmentType.CLASS_TEST_ONLINE,
          title: "Not opened",
          groupId,
          createdById: teacherId,
          endsAt: new Date(Date.now() + HOUR),
        },
      })
    ).id;
    const roster = await teacher.submissions.roster({ assignmentId });
    expect(roster.canPublish).toBe(false);
    expect(roster.answersFinalAt).toBeNull();
    await expect(
      teacher.submissions.publish({ assignmentId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("marks a paper of choice questions by the key as the marks go out", async () => {
    const assignmentId = await openTest(choicesOnly);
    await student.submissions.start({ assignmentId });
    await student.submissions.submit({
      assignmentId,
      answers: { pick: { choice: 1 }, pick2: { choice: 0 } },
    });
    await classmate.submissions.start({ assignmentId });
    await classmate.submissions.save({
      assignmentId,
      answers: { pick: { choice: 1 }, pick2: { choice: 1 } },
    });
    await windowOver(assignmentId);

    // A mark given by hand is kept as it is.
    const before = await teacher.submissions.roster({ assignmentId });
    expect(before.markedByKey).toBe(true);
    const bilal = before.rows.find((r) => r.name === "bilal")!;
    await teacher.submissions.mark({
      submissionId: bilal.submissionId!,
      marks: { pick: 1, pick2: 1 },
    });

    await teacher.submissions.publish({ assignmentId });
    const mine = await student.submissions.mine({ assignmentId });
    expect(mine.marksPublished).toBe(true);
    expect(mine.submission?.score).toBe(2);
    expect(mine.submission?.marks).toEqual({ pick: 2, pick2: 0 });
    const theirs = await classmate.submissions.mine({ assignmentId });
    expect(theirs.submission?.score).toBe(2);

    const after = await teacher.submissions.roster({ assignmentId });
    expect(after.rows.every((r) => r.marked)).toBe(true);
  });

  it("leaves a paper with written answers to the teacher", async () => {
    const assignmentId = await openTest();
    await student.submissions.start({ assignmentId });
    await student.submissions.submit({
      assignmentId,
      answers: { pick: { choice: 1 } },
    });
    await windowOver(assignmentId);
    const roster = await teacher.submissions.roster({ assignmentId });
    expect(roster.markedByKey).toBe(false);
    await teacher.submissions.publish({ assignmentId });
    const mine = await student.submissions.mine({ assignmentId });
    expect(mine.marksPublished).toBe(true);
    expect(mine.submission?.score).toBeNull();
  });

  it("refuses to mark answers still being written", async () => {
    const assignmentId = await openTest();
    await student.submissions.start({ assignmentId });
    const roster = await teacher.submissions.roster({ assignmentId });
    const row = roster.rows.find((r) => r.name === "amara")!;
    expect(row.status).toBe("in progress");
    await expect(
      teacher.submissions.mark({
        submissionId: row.submissionId!,
        marks: { essay: 1 },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
