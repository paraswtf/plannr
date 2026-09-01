import { describe, expect, it } from "vitest";

import { chipsThatFit, monthLayout } from "./month-layout";

/**
 * Filing a month's classes into cells.
 *
 * Everything in here is a decision that can be got quietly wrong and would not
 * show up in a screenshot: which day a sitting belongs to when read five and a
 * half hours ahead of UTC, which cells belong to the month and which are the
 * neighbours' lead-in, and how many chips are drawn before the rest become a
 * number.
 */

const IST = "Asia/Kolkata";
const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

const sitting = (startIso: string, minutes = 60) => ({
  start: at(startIso),
  end: new Date(at(startIso).getTime() + minutes * 60_000),
});

// Wednesday 12 August 2026, 11:30 IST.
const NOW = at("2026-08-12T06:00:00Z");

describe("monthLayout", () => {
  it("opens the grid on the Monday before the first, and runs whole weeks", () => {
    const { weeks, from, to } = monthLayout(NOW, [], NOW, IST);
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
    expect(from.toISOString()).toBe("2026-07-26T18:30:00.000Z");
    expect(weeks).toHaveLength(6);
    for (const week of weeks) expect(week).toHaveLength(7);
    expect((to.getTime() - from.getTime()) / 86_400_000).toBe(42);
  });

  it("marks the neighbours' days as outside the month", () => {
    const { weeks } = monthLayout(NOW, [], NOW, IST);
    // Monday 27 July — the lead-in.
    expect(weeks[0]![0]!.inMonth).toBe(false);
    // Saturday 1 August, the first day that is genuinely this month's.
    expect(weeks[0]![5]!.inMonth).toBe(true);
  });

  it("marks today, and nothing else", () => {
    const { weeks } = monthLayout(NOW, [], NOW, IST);
    const today = weeks.flat().filter((cell) => cell.isToday);
    expect(today).toHaveLength(1);
    expect(today[0]!.day.toISOString()).toBe("2026-08-11T18:30:00.000Z");
  });

  it("files a sitting under the local day it starts on", () => {
    // 23:30 IST on 12 August is 18:00 UTC on the 12th — the same date by luck.
    // 00:30 IST on 13 August is 19:00 UTC on the *12th*, and filing by the UTC
    // day would put it on the wrong cell. This is the case the whole function
    // exists to get right.
    const lateNight = sitting("2026-08-12T19:00:00Z");
    const { weeks } = monthLayout(NOW, [lateNight], NOW, IST);
    const cells = weeks.flat();
    const thirteenth = cells.find(
      (cell) => cell.day.toISOString() === "2026-08-12T18:30:00.000Z",
    );
    expect(thirteenth!.events).toHaveLength(1);
    const twelfth = cells.find(
      (cell) => cell.day.toISOString() === "2026-08-11T18:30:00.000Z",
    );
    expect(twelfth!.events).toHaveLength(0);
  });

  it("shows one more than the cap rather than saying '+1 more'", () => {
    const cap = chipsThatFit();
    const day = "2026-08-12T04:00:00Z";
    const events = Array.from({ length: cap + 1 }, (_, i) =>
      sitting(new Date(at(day).getTime() + i * 3_600_000).toISOString()),
    );
    const cell = cellFor(
      monthLayout(NOW, events, NOW, IST),
      "2026-08-11T18:30:00.000Z",
    );
    // "+1 more" taking the space the extra chip would have occupied is silly.
    expect(cell.shown).toBe(cap + 1);
    expect(cell.more).toBe(0);
  });

  it("falls back to the cap plus a count once there are two too many", () => {
    const cap = chipsThatFit();
    const day = "2026-08-12T04:00:00Z";
    const events = Array.from({ length: cap + 4 }, (_, i) =>
      sitting(new Date(at(day).getTime() + i * 1_800_000).toISOString()),
    );
    const cell = cellFor(
      monthLayout(NOW, events, NOW, IST),
      "2026-08-11T18:30:00.000Z",
    );
    expect(cell.shown).toBe(cap);
    expect(cell.more).toBe(4);
    // Nothing is lost — the chips drawn plus the ones counted are all of them.
    expect(cell.shown + cell.more).toBe(cell.events.length);
  });

  it("files a sitting that began before the grid under its first day", () => {
    // The grid opens on Monday 27 July 2026. A class running from 23:30 on
    // Sunday the 26th into Monday overlaps the window, so the server returns it
    // and the header counts it — and filing it under the 26th would leave that
    // count standing over a chip nobody can see.
    const overnight = {
      start: at("2026-07-26T18:00:00Z"),
      end: at("2026-07-26T19:30:00Z"),
    };
    const { weeks } = monthLayout(NOW, [overnight], NOW, IST);
    const drawn = weeks.flat().reduce((n, cell) => n + cell.events.length, 0);
    expect(drawn).toBe(1);
    expect(weeks[0]![0]!.events).toHaveLength(1);
  });

  it("leaves nothing counted but undrawn, for any month", () => {
    // The property behind the case above: every event the caller hands over is
    // filed in exactly one cell, so a header count can never exceed what the
    // grid draws.
    const spread = Array.from({ length: 60 }, (_, i) =>
      sitting(
        new Date(
          at("2026-07-20T04:00:00Z").getTime() + i * 18 * HOUR,
        ).toISOString(),
      ),
    );
    const { weeks } = monthLayout(NOW, spread, NOW, IST);
    const drawn = weeks.flat().reduce((n, cell) => n + cell.events.length, 0);
    const inWindow = spread.filter(
      (e) => e.start < monthLayout(NOW, [], NOW, IST).to,
    ).length;
    expect(drawn).toBe(inWindow);
  });

  it("draws only the rows a short month needs", () => {
    // February 2027: 28 days beginning on a Monday, so exactly four rows and no
    // trailing week of greyed-out days.
    const february = at("2027-02-10T06:00:00Z");
    expect(monthLayout(february, [], february, IST).weeks).toHaveLength(4);
  });
});

describe("chipsThatFit", () => {
  it("always leaves room for at least one", () => {
    expect(chipsThatFit()).toBeGreaterThanOrEqual(1);
    // Even a cell squeezed below one chip's height must not report zero, or a
    // busy day would be nothing but a "+N more".
    expect(chipsThatFit(10)).toBe(1);
  });
});

function cellFor(layout: ReturnType<typeof monthLayout>, iso: string) {
  const cell = layout.weeks.flat().find((c) => c.day.toISOString() === iso);
  if (!cell) throw new Error(`no cell for ${iso}`);
  return cell;
}
