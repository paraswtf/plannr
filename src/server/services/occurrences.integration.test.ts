import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import {
  regenerateOccurrences,
  splitSeriesAt,
} from "~/server/services/occurrences";
import {
  EventKind,
  EventStatus,
  ExceptionType,
  RoomType,
} from "../../../generated/prisma";

/**
 * Registers outliving edits to the class they were taken in.
 *
 * A register hangs off an occurrence row (`AttendanceSession` cascades from
 * `EventOccurrence`), and regeneration used to delete every row of a series and
 * make new ones, so any edit at all (calling one sitting off, moving one,
 * renaming the class) erased every register ever taken for it. These pin the
 * rows to their sittings instead.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const WEEK = 7 * 86_400_000;
const HOUR = 3_600_000;

let orgId: string;
let groupId: string;
let roomA: string;
let roomB: string;

/** Next week's Monday-ish slot at 10:00 in Kolkata, as a fixed instant. */
function firstSitting() {
  const d = new Date(Date.now() + WEEK);
  d.setUTCHours(4, 30, 0, 0);
  return d;
}

async function weeklyClass(count = 4) {
  const start = firstSitting();
  const event = await db.event.create({
    data: {
      orgId,
      kind: EventKind.CLASS,
      status: EventStatus.CONFIRMED,
      title: "Data Structures",
      roomId: roomA,
      groupId,
      startTime: start,
      endTime: new Date(start.getTime() + HOUR),
      timezone: TZ,
      rrule: `FREQ=WEEKLY;COUNT=${count}`,
    },
  });
  await regenerateOccurrences(db, event.id);
  return event;
}

const sittingsOf = (eventId: string) =>
  db.eventOccurrence.findMany({
    where: { eventId },
    orderBy: { start: "asc" },
    include: { _count: { select: { attendance: true } } },
  });

async function registerOn(occurrenceId: string) {
  return db.attendanceSession.create({
    data: { orgId, occurrenceId, groupId },
  });
}

const registersLeft = (id: string) =>
  db.attendanceSession.count({ where: { id } });

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: "regen-itest" },
    update: {},
    create: { slug: "regen-itest", name: "Regeneration Org", timezone: TZ },
  });
  orgId = org.id;

  await db.attendanceSession.deleteMany({ where: { orgId } });
  await db.event.deleteMany({ where: { orgId } });
  await db.group.deleteMany({ where: { orgId } });

  const building = await db.building.upsert({
    where: { orgId_name: { orgId, name: "Regen Block" } },
    update: {},
    create: { orgId, name: "Regen Block" },
  });
  const room = async (code: string) =>
    (
      await db.room.upsert({
        where: { orgId_code: { orgId, code } },
        update: {},
        create: {
          orgId,
          code,
          buildingId: building.id,
          floor: 1,
          capacity: 60,
          type: RoomType.LECTURE,
        },
      })
    ).id;
  roomA = await room("RG-1");
  roomB = await room("RG-2");

  const programme = await db.programme.upsert({
    where: { orgId_code: { orgId, code: "RG" } },
    update: {},
    create: { orgId, code: "RG", name: "Regeneration" },
  });
  groupId = (
    await db.group.create({
      data: { orgId, programmeId: programme.id, name: "RG-A" },
    })
  ).id;
});

describe("a register taken in a class", () => {
  it("survives the series being regenerated with nothing changed", async () => {
    const event = await weeklyClass();
    const [first] = await sittingsOf(event.id);
    const register = await registerOn(first!.id);

    await regenerateOccurrences(db, event.id);

    const after = await sittingsOf(event.id);
    expect(after).toHaveLength(4);
    expect(after[0]!.id).toBe(first!.id);
    expect(await registersLeft(register.id)).toBe(1);
  });

  it("survives another sitting being called off", async () => {
    const event = await weeklyClass();
    const [first, second] = await sittingsOf(event.id);
    const register = await registerOn(first!.id);

    await db.eventException.create({
      data: {
        eventId: event.id,
        originalStart: second!.start,
        type: ExceptionType.CANCELLED,
      },
    });
    await regenerateOccurrences(db, event.id);

    const after = await sittingsOf(event.id);
    expect(after.map((s) => s.id)).toEqual(
      expect.arrayContaining([first!.id, second!.id]),
    );
    expect(after.find((s) => s.id === second!.id)!.status).toBe("CANCELLED");
    expect(await registersLeft(register.id)).toBe(1);
  });

  it("moves with its own sitting when that sitting is moved", async () => {
    const event = await weeklyClass();
    const [first] = await sittingsOf(event.id);
    const register = await registerOn(first!.id);

    await db.eventException.create({
      data: {
        eventId: event.id,
        originalStart: first!.start,
        type: ExceptionType.MODIFIED,
        newRoomId: roomB,
        newStartTime: new Date(first!.start.getTime() + HOUR),
        newEndTime: new Date(first!.end.getTime() + HOUR),
      },
    });
    await regenerateOccurrences(db, event.id);

    const moved = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: first!.id },
      include: { _count: { select: { attendance: true } } },
    });
    expect(moved.roomId).toBe(roomB);
    expect(moved.start.getTime()).toBe(first!.start.getTime() + HOUR);
    expect(moved._count.attendance).toBe(1);
    expect(await registersLeft(register.id)).toBe(1);
    expect(await sittingsOf(event.id)).toHaveLength(4);
  });

  it("survives its sitting being called off and then restored", async () => {
    const event = await weeklyClass();
    const [first] = await sittingsOf(event.id);
    const register = await registerOn(first!.id);

    const cancelled = await db.eventException.create({
      data: {
        eventId: event.id,
        originalStart: first!.start,
        type: ExceptionType.CANCELLED,
      },
    });
    await regenerateOccurrences(db, event.id);
    const ghost = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: first!.id },
    });
    expect(ghost.status).toBe("CANCELLED");

    await db.eventException.delete({ where: { id: cancelled.id } });
    await regenerateOccurrences(db, event.id);

    const restored = await db.eventOccurrence.findUniqueOrThrow({
      where: { id: first!.id },
    });
    expect(restored.status).toBe("CONFIRMED");
    expect(await registersLeft(register.id)).toBe(1);
    expect(await sittingsOf(event.id)).toHaveLength(4);
  });

  it("survives the whole series moving room, on the same rows", async () => {
    const event = await weeklyClass();
    const before = await sittingsOf(event.id);
    const register = await registerOn(before[2]!.id);

    await db.event.update({ where: { id: event.id }, data: { roomId: roomB } });
    await regenerateOccurrences(db, event.id);

    const after = await sittingsOf(event.id);
    expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(after.every((s) => s.roomId === roomB)).toBe(true);
    expect(await registersLeft(register.id)).toBe(1);
  });

  it("is kept, as history, when the series is retimed away from it", async () => {
    const event = await weeklyClass();
    const [first, second] = await sittingsOf(event.id);
    const register = await registerOn(first!.id);

    // An hour later, every week: every natural start moves, so no row still
    // stands for its sitting.
    await db.event.update({
      where: { id: event.id },
      data: {
        startTime: new Date(event.startTime.getTime() + HOUR),
        endTime: new Date(event.endTime.getTime() + HOUR),
      },
    });
    await regenerateOccurrences(db, event.id);

    const after = await sittingsOf(event.id);
    // The four new sittings, and the one that was held and has a register.
    expect(after).toHaveLength(5);
    const kept = after.find((s) => s.id === first!.id)!;
    expect(kept.start.getTime()).toBe(first!.start.getTime());
    expect(kept.exceptionId).toBeNull();
    expect(after.some((s) => s.id === second!.id)).toBe(false);
    expect(await registersLeft(register.id)).toBe(1);
  });

  it("stays with its sitting when the series is split before it", async () => {
    const event = await weeklyClass();
    const sittings = await sittingsOf(event.id);
    const third = sittings[2]!;
    const register = await registerOn(third.id);

    const tail = await splitSeriesAt(db, event.id, third.start, {
      roomId: roomB,
    });

    expect(await sittingsOf(event.id)).toHaveLength(2);
    const tailSittings = await sittingsOf(tail);
    expect(tailSittings).toHaveLength(2);
    const carried = tailSittings.find((s) => s.id === third.id)!;
    expect(carried.roomId).toBe(roomB);
    expect(carried._count.attendance).toBe(1);
    expect(await registersLeft(register.id)).toBe(1);
  });
});
