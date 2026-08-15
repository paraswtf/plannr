import { describe, expect, it } from "vitest";

import {
  checkPlacement,
  solve,
  type SolveInput,
  type SolverRequirement,
  type SolverRoom,
} from "./solve";

/**
 * The solver is pure, so these read as "this demand, these rooms, what came
 * out" — no database, no fixtures, no clock.
 */

const room = (
  id: string,
  overrides: Partial<SolverRoom> = {},
): SolverRoom => ({
  id,
  code: id.toUpperCase(),
  capacity: 60,
  type: "LECTURE",
  features: [],
  ...overrides,
});

const requirement = (
  id: string,
  overrides: Partial<SolverRequirement> = {},
): SolverRequirement => ({
  id,
  groupId: "g1",
  subject: `Subject ${id}`,
  sessionsPerWeek: 1,
  durationMinutes: 60,
  facultyIds: [],
  requiredFeatures: [],
  roomType: null,
  minCapacity: null,
  preferredRoomId: null,
  ...overrides,
});

const input = (over: Partial<SolveInput> = {}): SolveInput => ({
  requirements: [],
  rooms: [room("r1")],
  groupSizes: {},
  busy: [],
  pinned: [],
  options: {
    workingDays: [1, 2, 3, 4, 5],
    dayStartMinutes: 9 * 60,
    dayEndMinutes: 17 * 60,
    slotMinutes: 60,
    maxPerDay: 0,
    spreadAcrossDays: true,
  },
  ...over,
});

/** Every (resource, day, interval) a result occupies, for clash assertions. */
const claims = (result: ReturnType<typeof solve>) =>
  result.sessions
    .filter((s) => s.dayOfWeek !== null)
    .flatMap((s) => {
      const keys = [`group:${s.groupId}`, `room:${s.roomId}`].concat(
        s.facultyIds.map((f) => `faculty:${f}`),
      );
      return keys.map((key) => ({
        key,
        day: s.dayOfWeek!,
        start: s.startMinutes!,
        end: s.startMinutes! + s.durationMinutes,
      }));
    });

const hasClash = (result: ReturnType<typeof solve>): boolean => {
  const all = claims(result);
  return all.some((a, i) =>
    all.some(
      (b, j) =>
        i !== j &&
        a.key === b.key &&
        a.day === b.day &&
        a.start < b.end &&
        b.start < a.end,
    ),
  );
};

describe("solve", () => {
  it("places every session when there is room", () => {
    const result = solve(
      input({
        requirements: [requirement("a", { sessionsPerWeek: 3 })],
      }),
    );

    expect(result.placed).toBe(3);
    expect(result.unplaced).toBe(0);
    expect(hasClash(result)).toBe(false);
  });

  it("never double-books a room, a group or a teacher", () => {
    const result = solve(
      input({
        rooms: [room("r1"), room("r2")],
        requirements: [
          requirement("a", { groupId: "g1", sessionsPerWeek: 4, facultyIds: ["f1"] }),
          requirement("b", { groupId: "g1", sessionsPerWeek: 4, facultyIds: ["f2"] }),
          requirement("c", { groupId: "g2", sessionsPerWeek: 4, facultyIds: ["f1"] }),
        ],
      }),
    );

    expect(result.unplaced).toBe(0);
    expect(hasClash(result)).toBe(false);
  });

  it("spreads a subject's weekly sessions across different days", () => {
    const result = solve(
      input({ requirements: [requirement("a", { sessionsPerWeek: 4 })] }),
    );

    const days = result.sessions.map((s) => s.dayOfWeek);
    expect(new Set(days).size).toBe(4);
  });

  it("stacks sessions on one day when spreading is switched off", () => {
    const result = solve(
      input({
        requirements: [requirement("a", { sessionsPerWeek: 3 })],
        options: {
          ...input().options,
          spreadAcrossDays: false,
        },
      }),
    );

    expect(new Set(result.sessions.map((s) => s.dayOfWeek)).size).toBe(1);
  });

  it("only uses rooms with the features a session asks for", () => {
    const result = solve(
      input({
        rooms: [
          room("plain"),
          room("kitted", { features: ["PROJECTOR", "COMPUTERS"] }),
        ],
        requirements: [
          requirement("a", { sessionsPerWeek: 2, requiredFeatures: ["PROJECTOR"] }),
        ],
      }),
    );

    expect(result.placed).toBe(2);
    expect(result.sessions.every((s) => s.roomId === "kitted")).toBe(true);
  });

  it("respects the room type a session asks for", () => {
    const result = solve(
      input({
        rooms: [room("hall", { type: "LECTURE_HALL" }), room("lab", { type: "LAB" })],
        requirements: [requirement("a", { roomType: "LAB" })],
      }),
    );

    expect(result.sessions[0]!.roomId).toBe("lab");
  });

  it("puts a class in a room that can seat it", () => {
    const result = solve(
      input({
        rooms: [room("small", { capacity: 20 }), room("big", { capacity: 120 })],
        groupSizes: { g1: 90 },
        requirements: [requirement("a")],
      }),
    );

    expect(result.sessions[0]!.roomId).toBe("big");
  });

  it("prefers the smallest room that fits, keeping the big ones free", () => {
    const result = solve(
      input({
        rooms: [
          room("tiny", { capacity: 10 }),
          room("medium", { capacity: 40 }),
          room("huge", { capacity: 400 }),
        ],
        groupSizes: { g1: 30 },
        requirements: [requirement("a")],
      }),
    );

    expect(result.sessions[0]!.roomId).toBe("medium");
  });

  it("uses the preferred room when it fits", () => {
    const result = solve(
      input({
        rooms: [room("r1", { capacity: 30 }), room("r2", { capacity: 200 })],
        requirements: [requirement("a", { preferredRoomId: "r2" })],
      }),
    );

    expect(result.sessions[0]!.roomId).toBe("r2");
  });

  it("reports why a session could not be placed at all", () => {
    const result = solve(
      input({
        rooms: [room("r1", { capacity: 20 })],
        groupSizes: { g1: 200 },
        requirements: [requirement("a")],
      }),
    );

    expect(result.unplaced).toBe(1);
    expect(result.sessions[0]!.reason).toMatch(/too small/i);
  });

  it("reports missing kit rather than a bare 'no room'", () => {
    const result = solve(
      input({
        rooms: [room("r1")],
        requirements: [requirement("a", { requiredFeatures: ["PROJECTOR"] })],
      }),
    );

    expect(result.sessions[0]!.reason).toMatch(/projector/i);
  });

  it("treats the live timetable as occupied", () => {
    const result = solve(
      input({
        rooms: [room("r1")],
        requirements: [requirement("a", { sessionsPerWeek: 1 })],
        busy: [
          // The whole of Monday and Tuesday in the only room.
          { dayOfWeek: 1, startMinutes: 9 * 60, endMinutes: 17 * 60, roomId: "r1" },
          { dayOfWeek: 2, startMinutes: 9 * 60, endMinutes: 17 * 60, roomId: "r1" },
        ],
      }),
    );

    expect(result.sessions[0]!.dayOfWeek).toBe(3);
  });

  it("keeps a teacher out of two rooms at once with the live timetable", () => {
    const result = solve(
      input({
        rooms: [room("r1"), room("r2")],
        requirements: [requirement("a", { facultyIds: ["f1"] })],
        busy: [
          {
            dayOfWeek: 1,
            startMinutes: 9 * 60,
            endMinutes: 10 * 60,
            roomId: "r2",
            facultyIds: ["f1"],
            label: "Statistics",
          },
        ],
      }),
    );

    const session = result.sessions[0]!;
    expect(session.dayOfWeek === 1 && session.startMinutes === 9 * 60).toBe(false);
  });

  it("leaves pinned sessions alone and schedules around them", () => {
    const result = solve(
      input({
        rooms: [room("r1")],
        requirements: [requirement("a", { sessionsPerWeek: 1 })],
        pinned: [
          {
            sessionId: "s-pinned",
            requirementId: "other",
            dayOfWeek: 1,
            startMinutes: 9 * 60,
            durationMinutes: 8 * 60,
            roomId: "r1",
            groupId: "g1",
            facultyIds: [],
          },
        ],
      }),
    );

    // Pinned sessions are the caller's to keep; only new work comes back.
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.dayOfWeek).not.toBe(1);
  });

  it("honours the daily cap per group", () => {
    const result = solve(
      input({
        rooms: [room("r1")],
        requirements: [requirement("a", { sessionsPerWeek: 5 })],
        options: { ...input().options, maxPerDay: 1, spreadAcrossDays: false },
      }),
    );

    const perDay = new Map<number, number>();
    for (const s of result.sessions) {
      if (s.dayOfWeek === null) continue;
      perDay.set(s.dayOfWeek, (perDay.get(s.dayOfWeek) ?? 0) + 1);
    }
    expect([...perDay.values()].every((n) => n <= 1)).toBe(true);
  });

  it("says so when a session is longer than the working day", () => {
    const result = solve(
      input({
        requirements: [requirement("a", { durationMinutes: 12 * 60 })],
      }),
    );

    expect(result.sessions[0]!.reason).toMatch(/no slot long enough/i);
  });

  it("is deterministic — the same demand gives the same timetable", () => {
    const build = () =>
      input({
        rooms: [room("r1"), room("r2", { features: ["PROJECTOR"] })],
        groupSizes: { g1: 40, g2: 55 },
        requirements: [
          requirement("a", { groupId: "g1", sessionsPerWeek: 3, facultyIds: ["f1"] }),
          requirement("b", { groupId: "g2", sessionsPerWeek: 2, requiredFeatures: ["PROJECTOR"] }),
          requirement("c", { groupId: "g1", sessionsPerWeek: 2, facultyIds: ["f2"] }),
        ],
      });

    expect(solve(build()).sessions).toEqual(solve(build()).sessions);
  });

  it("does not depend on the order the demand was typed in", () => {
    const rooms = [room("r1"), room("r2")];
    const reqs = [
      requirement("a", { groupId: "g1", sessionsPerWeek: 2 }),
      requirement("b", { groupId: "g2", sessionsPerWeek: 2 }),
      requirement("c", { groupId: "g3", sessionsPerWeek: 2 }),
    ];

    const forwards = solve(input({ rooms, requirements: reqs }));
    const backwards = solve(input({ rooms, requirements: [...reqs].reverse() }));

    expect(forwards.sessions).toEqual(backwards.sessions);
  });

  it("moves a placed session out of the way to fit a stuck one", () => {
    // One lab, one lecture room. The lab-only session must end up in the lab
    // even though a session that could go anywhere is placed first.
    const result = solve(
      input({
        rooms: [room("lab", { type: "LAB" }), room("hall", { type: "LECTURE" })],
        options: {
          ...input().options,
          workingDays: [1],
          dayStartMinutes: 9 * 60,
          dayEndMinutes: 10 * 60,
        },
        requirements: [
          requirement("flexible", { groupId: "g1" }),
          requirement("labonly", { groupId: "g2", roomType: "LAB" }),
        ],
      }),
    );

    expect(result.unplaced).toBe(0);
    expect(
      result.sessions.find((s) => s.requirementId === "labonly")!.roomId,
    ).toBe("lab");
    expect(hasClash(result)).toBe(false);
  });

  it("never reports a placement it did not make", () => {
    const result = solve(
      input({
        rooms: [room("r1")],
        options: { ...input().options, workingDays: [1], dayEndMinutes: 10 * 60 },
        requirements: [requirement("a", { sessionsPerWeek: 5, groupId: "g1" })],
      }),
    );

    expect(result.placed).toBe(1);
    expect(result.unplaced).toBe(4);
    expect(
      result.sessions.filter((s) => s.dayOfWeek === null).every((s) => s.reason),
    ).toBe(true);
  });
});

describe("checkPlacement", () => {
  const base = {
    sessionId: "s1",
    groupId: "g1",
    facultyIds: ["f1"],
    roomId: "r1",
    dayOfWeek: 1,
    startMinutes: 10 * 60,
    durationMinutes: 60,
  };
  const options = {
    workingDays: [1, 2, 3, 4, 5],
    dayStartMinutes: 9 * 60,
    dayEndMinutes: 17 * 60,
  };

  it("allows a free slot", () => {
    expect(checkPlacement(base, [], [], options).ok).toBe(true);
  });

  it("refuses a non-working day", () => {
    const result = checkPlacement({ ...base, dayOfWeek: 7 }, [], [], options);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/working day/i);
  });

  it("refuses a slot that runs past the end of the day", () => {
    const result = checkPlacement(
      { ...base, startMinutes: 16 * 60 + 30 },
      [],
      [],
      options,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/outside the working day/i);
  });

  it("catches a clash with another session in the plan", () => {
    const result = checkPlacement(
      base,
      [
        {
          sessionId: "s2",
          title: "Statistics",
          groupId: "g1",
          facultyIds: [],
          roomId: "r9",
          dayOfWeek: 1,
          startMinutes: 10 * 60 + 30,
          durationMinutes: 60,
        },
      ],
      [],
      options,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Statistics/);
  });

  it("catches a clash with the live timetable", () => {
    const result = checkPlacement(
      base,
      [],
      [
        {
          dayOfWeek: 1,
          startMinutes: 10 * 60,
          endMinutes: 11 * 60,
          roomId: "r1",
          label: "Physics",
        },
      ],
      options,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Physics/);
  });

  it("ignores the session being moved", () => {
    const result = checkPlacement(
      base,
      [
        {
          sessionId: "s1",
          title: "Itself",
          groupId: "g1",
          facultyIds: ["f1"],
          roomId: "r1",
          dayOfWeek: 1,
          startMinutes: 10 * 60,
          durationMinutes: 60,
        },
      ],
      [],
      options,
    );
    expect(result.ok).toBe(true);
  });

  it("lets two sessions touch at an endpoint", () => {
    const result = checkPlacement(
      base,
      [
        {
          sessionId: "s2",
          title: "Before",
          groupId: "g1",
          facultyIds: [],
          roomId: "r1",
          dayOfWeek: 1,
          startMinutes: 9 * 60,
          durationMinutes: 60,
        },
      ],
      [],
      options,
    );
    expect(result.ok).toBe(true);
  });
});
