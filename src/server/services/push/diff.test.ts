import { describe, expect, it } from "vitest";

import { diffSittings, messagesFor, type Sitting, type Voice } from "./diff";

const NOW = new Date("2026-11-02T04:00:00Z"); // Mon 09:30 in Kolkata
const at = (day: number, hour: number) =>
  new Date(Date.UTC(2026, 10, day, hour - 6, 30)); // wall-clock IST

const sit = (
  day: number,
  hour: number,
  over: Partial<Sitting> = {},
): Sitting => ({
  start: at(day, hour),
  end: at(day, hour + 1),
  roomId: "r402",
  facultyId: "f1",
  status: "CONFIRMED",
  ...over,
});

const voice: Voice = {
  title: "Design Thinking",
  timezone: "Asia/Kolkata",
  roomName: (id) => id.replace("r", ""),
};

describe("diffSittings", () => {
  it("sees nothing when nothing changed", () => {
    expect(diffSittings([sit(4, 9)], [sit(4, 9)], NOW)).toEqual([]);
  });

  it("calls a class that went to a new hour and room a move", () => {
    const changes = diffSittings(
      [sit(4, 9)],
      [sit(4, 11, { roomId: "r403" })],
      NOW,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("MOVED");
  });

  it("calls a sitting that turned CANCELLED a cancellation", () => {
    const changes = diffSittings(
      [sit(4, 9)],
      [sit(4, 9, { status: "CANCELLED" })],
      NOW,
    );
    expect(changes.map((c) => c.kind)).toEqual(["CANCELLED"]);
  });

  it("calls the reverse a restoration", () => {
    const changes = diffSittings(
      [sit(4, 9, { status: "CANCELLED" })],
      [sit(4, 9)],
      NOW,
    );
    expect(changes.map((c) => c.kind)).toEqual(["RESTORED"]);
  });

  it("calls a brand-new sitting an addition", () => {
    expect(diffSittings([], [sit(5, 9)], NOW).map((c) => c.kind)).toEqual([
      "ADDED",
    ]);
  });

  it("pairs a whole series that shifted into moves, in order", () => {
    const changes = diffSittings(
      [sit(4, 9), sit(5, 9)],
      [sit(4, 10), sit(5, 10)],
      NOW,
    );
    expect(changes.map((c) => c.kind)).toEqual(["MOVED", "MOVED"]);
  });

  it("notices a teacher change at the same time and place", () => {
    const changes = diffSittings(
      [sit(4, 9)],
      [sit(4, 9, { facultyId: "f2" })],
      NOW,
    );
    expect(changes).toHaveLength(1);
    expect(messagesFor(changes, voice)[0]!.title).toMatch(/teacher changed/);
  });

  it("ignores the past and anything beyond a fortnight", () => {
    expect(
      diffSittings([sit(1, 9), sit(28, 9)], [sit(1, 11), sit(28, 11)], NOW),
    ).toEqual([]);
  });
});

describe("messagesFor", () => {
  it("says where and when a class moved to, and where it was", () => {
    const [m] = messagesFor(
      diffSittings([sit(4, 9)], [sit(4, 11, { roomId: "r403" })], NOW),
      voice,
    );
    expect(m!.title).toBe("Design Thinking has moved");
    expect(m!.body).toContain("11:00-12:00");
    expect(m!.body).toContain("room 403");
    expect(m!.body).toContain("was Wed 4 Nov, 09:00-10:00, room 402");
  });

  it("says a cancelled class will not take place", () => {
    const [m] = messagesFor(
      diffSittings([sit(4, 9)], [sit(4, 9, { status: "CANCELLED" })], NOW),
      voice,
    );
    expect(m!.title).toBe("Design Thinking is cancelled");
    expect(m!.body).toContain("will not take place");
  });

  it("sends one summary when a lot changed at once", () => {
    const before = [sit(3, 9), sit(4, 9), sit(5, 9), sit(6, 9)];
    const after = before.map((s) => sit(s.start.getUTCDate(), 11));
    const messages = messagesFor(diffSittings(before, after, NOW), voice);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.title).toBe("Design Thinking: 4 classes changed");
  });
});
