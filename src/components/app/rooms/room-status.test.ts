import { describe, expect, it } from "vitest";

import { roomStatus, type RoomOccurrence } from "./room-status";

const IST = "Asia/Kolkata";
const at = (iso: string) => new Date(iso);

const booking = (
  startIso: string,
  endIso: string,
  title = "Database Systems",
): RoomOccurrence => ({
  roomId: "r1",
  start: at(startIso),
  end: at(endIso),
  title,
});

// 11:15 IST on 13 Oct 2026 (05:45 UTC).
const NOW = at("2026-10-13T05:45:00Z");

describe("roomStatus", () => {
  it("reports a free room with nothing else booked", () => {
    const status = roomStatus([], NOW, IST);
    expect(status.label).toBe("free now");
    expect(status.line).toBe("no more bookings today");
    expect(status.load).toBe(0);
  });

  it("reports a room that is in use right now", () => {
    // 11:00-12:00 IST spans the current time.
    const status = roomStatus(
      [booking("2026-10-13T05:30Z", "2026-10-13T06:30Z")],
      NOW,
      IST,
    );
    expect(status.label).toBe("in use");
    expect(status.tone).toBe("red");
    expect(status.line).toContain("until 12pm");
  });

  it("warns when a booking starts within the hour", () => {
    // Starts 12:00 IST, 45 minutes away.
    const status = roomStatus(
      [booking("2026-10-13T06:30Z", "2026-10-13T07:30Z", "Marketing")],
      NOW,
      IST,
    );
    expect(status.label).toBe("booked soon");
    expect(status.tone).toBe("orange");
    expect(status.line).toContain("Marketing");
  });

  it("stays free when the next booking is more than an hour away", () => {
    // Starts 14:00 IST, well over an hour away.
    const status = roomStatus(
      [booking("2026-10-13T08:30Z", "2026-10-13T09:30Z", "Soft Skills")],
      NOW,
      IST,
    );
    expect(status.label).toBe("free now");
    expect(status.line).toContain("next: Soft Skills");
  });

  it("prefers the in-use booking over an imminent one", () => {
    const status = roomStatus(
      [
        booking("2026-10-13T05:30Z", "2026-10-13T06:30Z", "Current"),
        booking("2026-10-13T06:30Z", "2026-10-13T07:30Z", "Next"),
      ],
      NOW,
      IST,
    );
    expect(status.label).toBe("in use");
    expect(status.line).toContain("Current");
  });

  it("computes load as a fraction of the working day", () => {
    const status = roomStatus(
      [
        booking("2026-10-13T02:30Z", "2026-10-13T04:30Z"), // 2h
        booking("2026-10-13T08:30Z", "2026-10-13T11:30Z"), // 3h
      ],
      NOW,
      IST,
      10,
    );
    expect(status.load).toBeCloseTo(0.5, 5);
  });

  it("never reports a load above one", () => {
    const status = roomStatus(
      [booking("2026-10-13T00:00Z", "2026-10-13T20:00Z")],
      NOW,
      IST,
      10,
    );
    expect(status.load).toBe(1);
  });

  it("does not depend on the order it receives bookings", () => {
    const shuffled = roomStatus(
      [
        booking("2026-10-13T08:30Z", "2026-10-13T09:30Z", "Later"),
        booking("2026-10-13T05:30Z", "2026-10-13T06:30Z", "Now"),
      ],
      NOW,
      IST,
    );
    expect(shuffled.label).toBe("in use");
    expect(shuffled.line).toContain("Now");
  });
});
