import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Google Calendar sync, end to end against a real database and a fake Google.
 *
 * The unit tests cover what an event *looks* like; this covers the part that
 * cannot be checked by reading — that editing the timetable actually reaches
 * the people in the room, and that a cancellation reaches them as a change to
 * the class they already have rather than as a second one.
 *
 * Google itself is faked. The value of a real call here would be testing
 * Google, and the cost would be a test that needs a Workspace account and
 * cannot run twice; what is worth pinning is which calls we make, in what
 * order, with what.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const KEY = Buffer.alloc(32, 3).toString("base64");

vi.mock("~/env", async (importOriginal) => {
  const actual = await importOriginal<{ env: Record<string, unknown> }>();
  return {
    env: {
      ...actual.env,
      GOOGLE_CALENDAR_SYNC_ENABLED: true,
      CALENDAR_TOKEN_KEY: KEY,
    },
  };
});

/** The fake Google: records what it was asked to do and answers plausibly. */
const calls = {
  inserted: [] as Array<{ calendarId: string; body: GoogleBody }>,
  patched: [] as Array<{ eventId: string; body: GoogleBody }>,
  deleted: [] as string[],
  calendarsCreated: 0,
  reset() {
    this.inserted = [];
    this.patched = [];
    this.deleted = [];
    this.calendarsCreated = 0;
  },
};

interface GoogleBody {
  summary: string;
  transparency: string;
  start: { dateTime: string };
  location?: string;
}

let nextGoogleId = 0;

vi.mock("./google", () => ({
  CALENDAR_SCOPE: "https://www.googleapis.com/auth/calendar.app.created",
  GoogleError: class GoogleError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly permanent: boolean,
    ) {
      super(message);
    }
  },
  refreshAccessToken: () =>
    Promise.resolve({ access_token: "fresh-token", expires_in: 3600 }),
  createCalendar: () => {
    calls.calendarsCreated += 1;
    return Promise.resolve({ id: "cal_plannr" });
  },
  getCalendar: (_token: string, id: string) => Promise.resolve({ id }),
  deleteCalendar: () => Promise.resolve(),
  insertEvent: (_token: string, calendarId: string, body: GoogleBody) => {
    calls.inserted.push({ calendarId, body });
    return Promise.resolve({ id: `g_${++nextGoogleId}` });
  },
  patchEvent: (
    _token: string,
    _calendarId: string,
    eventId: string,
    body: GoogleBody,
  ) => {
    calls.patched.push({ eventId, body });
    return Promise.resolve({ id: eventId });
  },
  deleteEvent: (_token: string, _calendarId: string, eventId: string) => {
    calls.deleted.push(eventId);
    return Promise.resolve();
  },
  revokeToken: () => Promise.resolve(),
}));

const { db } = await import("~/server/db");
const { regenerateOccurrences } = await import("../occurrences");
const { seal } = await import("./crypto");
const { drain, disconnect, enqueueForEvents, reconcile, sweepStaleConnections } =
  await import("./sync");

const TZ = "Asia/Kolkata";
const HOUR = 3_600_000;
/** Comfortably inside the sync horizon, and clear of midnight. */
const CLASS_AT = new Date(Date.now() + 3 * 24 * HOUR);

let orgId: string;
let groupId: string;
let roomId: string;
let facultyId: string;
let eventId: string;
let connectionId: string;
let otherConnectionId: string;
let studentId: string;

beforeEach(async () => {
  calls.reset();

  const org = await db.organization.upsert({
    where: { slug: "cal-itest" },
    update: {},
    create: { slug: "cal-itest", name: "Calendar Org", timezone: TZ },
  });
  orgId = org.id;

  await db.calendarSyncTask.deleteMany({ where: { connection: { orgId } } });
  await db.calendarMirror.deleteMany({ where: { connection: { orgId } } });
  await db.calendarConnection.deleteMany({ where: { orgId } });
  await db.event.deleteMany({ where: { orgId } });
  await db.group.deleteMany({ where: { orgId } });
  await db.programme.deleteMany({ where: { orgId } });
  await db.room.deleteMany({ where: { orgId } });
  await db.building.deleteMany({ where: { orgId } });

  const student = await db.user.upsert({
    where: { email: "cal-student@plannr-demo.invalid" },
    update: {},
    create: { email: "cal-student@plannr-demo.invalid", name: "The Student", orgId },
  });
  const lecturer = await db.user.upsert({
    where: { email: "cal-lecturer@plannr-demo.invalid" },
    update: {},
    create: { email: "cal-lecturer@plannr-demo.invalid", name: "The Lecturer", orgId },
  });
  const bystander = await db.user.upsert({
    where: { email: "cal-bystander@plannr-demo.invalid" },
    update: {},
    create: { email: "cal-bystander@plannr-demo.invalid", name: "The Bystander", orgId },
  });

  const profile = await db.studentProfile.upsert({
    where: { userId: student.id },
    update: {},
    create: { userId: student.id, orgId, prn: "99940199001" },
  });
  studentId = profile.id;
  const faculty = await db.facultyProfile.upsert({
    where: { userId: lecturer.id },
    update: {},
    create: { userId: lecturer.id, orgId, shortName: "Dr. Rao" },
  });
  facultyId = faculty.id;

  const building = await db.building.create({ data: { orgId, name: "Main" } });
  const room = await db.room.create({
    data: { orgId, buildingId: building.id, code: "C-1", capacity: 40, floor: 0, type: "LECTURE" },
  });
  roomId = room.id;

  const programme = await db.programme.create({
    data: { orgId, code: "CAL", name: "Calendar Studies" },
  });
  const group = await db.group.create({
    data: { orgId, programmeId: programme.id, name: "CAL-A" },
  });
  groupId = group.id;
  await db.studentGroupMembership.create({
    data: { studentId: profile.id, groupId: group.id },
  });

  connectionId = (await connect(student.id, "sub-student")).id;
  // Somebody with a connected calendar and no business in this class, so
  // "everyone got it" cannot pass by writing to everyone.
  otherConnectionId = (await connect(bystander.id, "sub-bystander")).id;

  const event = await db.event.create({
    data: {
      orgId,
      roomId,
      groupId,
      facultyId,
      title: "Calendars, Applied",
      kind: "CLASS",
      status: "CONFIRMED",
      startTime: CLASS_AT,
      endTime: new Date(CLASS_AT.getTime() + HOUR),
      timezone: TZ,
    },
  });
  eventId = event.id;
  await regenerateOccurrences(db, event.id);
});

function connect(userId: string, googleSub: string) {
  return db.calendarConnection.create({
    data: {
      userId,
      orgId,
      googleSub,
      googleEmail: `${googleSub}@plannr-demo.invalid`,
      refreshToken: seal("refresh-token"),
      calendarId: "cal_plannr",
      status: "ACTIVE",
    },
  });
}

const pendingFor = (connection: string) =>
  db.calendarSyncTask.count({
    where: { connectionId: connection, status: "PENDING" },
  });

describe("what an edit to the timetable owes people's calendars", () => {
  it("queues the class for everyone in the room", async () => {
    expect(await pendingFor(connectionId)).toBe(1);
  });

  it("queues nothing for somebody not involved", async () => {
    // The audience is the point: a lecture is not broadcast to the institution.
    expect(await pendingFor(otherConnectionId)).toBe(0);
  });

  it("collapses repeated edits into one piece of work", async () => {
    // Five edits before the cron next runs must not mean five reconciles.
    for (let i = 0; i < 4; i++) await regenerateOccurrences(db, eventId);
    expect(await pendingFor(connectionId)).toBe(1);
  });
});

describe("draining the queue", () => {
  it("writes the class into the calendar and remembers it did", async () => {
    const report = await drain(db);

    expect(report.inserted).toBe(1);
    expect(calls.inserted).toHaveLength(1);
    expect(calls.inserted[0]?.body.summary).toBe("Calendars, Applied");
    expect(calls.inserted[0]?.calendarId).toBe("cal_plannr");

    const mirrors = await db.calendarMirror.findMany({ where: { connectionId } });
    expect(mirrors).toHaveLength(1);
    expect(await pendingFor(connectionId)).toBe(0);
  });

  it("does nothing at all the second time", async () => {
    await drain(db);
    calls.reset();

    // The digest is what makes a resync of an untouched timetable free — the
    // property the whole nightly sweep depends on being affordable.
    await reconcile(db, connectionId, eventId);
    expect(calls.inserted).toHaveLength(0);
    expect(calls.patched).toHaveLength(0);
    expect(calls.deleted).toHaveLength(0);
  });
});

describe("when a class is cancelled", () => {
  beforeEach(async () => {
    await drain(db);
    calls.reset();

    await db.eventException.create({
      data: { eventId, originalStart: CLASS_AT, type: "CANCELLED" },
    });
    await regenerateOccurrences(db, eventId);
  });

  it("tells the people who were going to be there", async () => {
    expect(await pendingFor(connectionId)).toBe(1);
  });

  it("changes the class they already have rather than adding another", async () => {
    // A delete-and-recreate would lose whatever reminder they had set, and for
    // a moment show nothing at all where the class used to be.
    await drain(db);
    expect(calls.patched).toHaveLength(1);
    expect(calls.inserted).toHaveLength(0);
    expect(calls.deleted).toHaveLength(0);
  });

  it("says it is cancelled, and stops holding the hour", async () => {
    await drain(db);
    expect(calls.patched[0]?.body.summary).toBe("Cancelled — Calendars, Applied");
    expect(calls.patched[0]?.body.transparency).toBe("transparent");
  });
});

describe("when a class is rescheduled", () => {
  const MOVED_TO = new Date(CLASS_AT.getTime() + 4 * HOUR);

  beforeEach(async () => {
    await drain(db);
    calls.reset();

    await db.eventException.create({
      data: {
        eventId,
        originalStart: CLASS_AT,
        type: "MODIFIED",
        newStartTime: MOVED_TO,
        newEndTime: new Date(MOVED_TO.getTime() + HOUR),
      },
    });
    await regenerateOccurrences(db, eventId);
  });

  it("moves the entry that is already there", async () => {
    await drain(db);

    // Keyed on the *original* start, so the moved sitting is recognised as the
    // same one — occurrence ids are reissued by every regeneration and would
    // have made this a delete and a re-create.
    expect(calls.patched).toHaveLength(1);
    expect(calls.inserted).toHaveLength(0);
    expect(calls.patched[0]?.body.start.dateTime).toBe(MOVED_TO.toISOString());

    const mirrors = await db.calendarMirror.findMany({ where: { connectionId } });
    expect(mirrors).toHaveLength(1);
    expect(mirrors[0]?.originalStart).toEqual(CLASS_AT);
  });

  it("follows a move to another room", async () => {
    const elsewhere = await db.room.create({
      data: { orgId, buildingId: (await db.building.findFirstOrThrow({ where: { orgId } })).id, code: "C-2", capacity: 30, floor: 1, type: "LECTURE" },
    });
    await db.eventException.updateMany({
      where: { eventId, originalStart: CLASS_AT },
      data: { newRoomId: elsewhere.id },
    });
    await regenerateOccurrences(db, eventId);
    await drain(db);

    expect(calls.patched.at(-1)?.body.location).toBe("C-2");
  });
});

describe("when somebody stops being entitled to a class", () => {
  beforeEach(async () => {
    await drain(db);
    calls.reset();
  });

  it("takes it out of their calendar when they leave the group", async () => {
    await db.studentGroupMembership.deleteMany({ where: { studentId, groupId } });

    // They hold a mirror, so they are still in the audience — which is the
    // only reason there is anything left to tell them.
    await regenerateOccurrences(db, eventId);
    await drain(db);

    expect(calls.deleted).toHaveLength(1);
    expect(await db.calendarMirror.count({ where: { connectionId } })).toBe(0);
  });

  it("takes it out when the class is deleted outright", async () => {
    // What deleting a group or a room does: tell people first, while there is
    // still a record of who was in the room, then delete. The task outliving
    // the event it names is exactly what the plain `eventId` column buys.
    await enqueueForEvents(db, [eventId]);
    await db.event.delete({ where: { id: eventId } });
    await drain(db);

    expect(calls.deleted).toHaveLength(1);
    expect(await db.calendarMirror.count({ where: { connectionId } })).toBe(0);
  });

  it("sweeps up after a deletion nobody announced", async () => {
    // The safety net, and the reason the sweep is not merely an optimisation:
    // an event removed by a path that forgot to enqueue would otherwise sit in
    // somebody's calendar for ever, since no future edit can name a row that
    // is gone.
    await db.event.delete({ where: { id: eventId } });
    await db.calendarConnection.update({
      where: { id: connectionId },
      data: { syncedAt: new Date(Date.now() - 25 * HOUR) },
    });

    await sweepStaleConnections(db);
    await drain(db);

    expect(calls.deleted).toHaveLength(1);
    expect(await db.calendarMirror.count({ where: { connectionId } })).toBe(0);
  });
});

describe("disconnecting", () => {
  it("removes the calendar and forgets the work", async () => {
    await drain(db);
    const connection = await db.calendarConnection.findUniqueOrThrow({
      where: { id: connectionId },
      select: { userId: true },
    });

    await disconnect(db, connection.userId);

    const after = await db.calendarConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(after.status).toBe("PAUSED");
    expect(after.calendarId).toBeNull();
    expect(await db.calendarMirror.count({ where: { connectionId } })).toBe(0);
    expect(await db.calendarSyncTask.count({ where: { connectionId } })).toBe(0);
  });

  it("stops a disconnected calendar being written to again", async () => {
    const connection = await db.calendarConnection.findUniqueOrThrow({
      where: { id: connectionId },
      select: { userId: true },
    });
    await disconnect(db, connection.userId);
    calls.reset();

    await regenerateOccurrences(db, eventId);
    await drain(db);

    expect(calls.inserted).toHaveLength(0);
    expect(calls.patched).toHaveLength(0);
  });
});
