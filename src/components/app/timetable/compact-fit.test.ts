import { describe, expect, it } from "vitest";

import { fitFor, legible, HEADER_HEIGHT, MIN_COLUMN } from "./compact-fit";

/**
 * The arithmetic behind compact mode.
 *
 * Worth testing on its own because none of it can be tested where it runs:
 * happy-dom has no layout engine, so a grid that fits and a grid that overflows
 * are the same zeroes to it. Everything geometric about this feature is either
 * proved here as numbers or is not proved at all.
 *
 * The property that matters is the one the whole mode promises: whatever comes
 * in, the rendered grid fits the space in both axes.
 */

/** A ten-hour day at the grid's default 60px an hour. */
const BODY = 600;
const GUTTER = 46;

const fit = (available: number, rooms: number, ceiling = 700) =>
  fitFor({ available, rooms, gutter: GUTTER, ceiling, bodyHeight: BODY });

describe("the two regimes", () => {
  it("narrows the columns first, and does not zoom while it can", () => {
    // A phone with seven rooms: 312px of room space over seven columns is 44
    // each, which fits — so nothing is scaled and the only change is that the
    // columns are narrower than the 104 they would be normally.
    const f = fit(358, 7);
    expect(f.column).toBe(44);
    expect(f.scale).toBe(1);
    expect(f.width).toBeLessThanOrEqual(358);
  });

  it("zooms out once even the floor will not fit", () => {
    // The same phone with fourteen rooms: 22px a column is past the floor, so
    // the columns stop at 40 and the whole grid shrinks instead.
    const f = fit(358, 14);
    expect(f.column).toBe(MIN_COLUMN);
    expect(f.scale).toBeLessThan(1);
    expect(f.width * f.scale).toBeCloseTo(358, 0);
  });

  it("never enlarges a grid that already fits", () => {
    // A laptop with four rooms has room to spare, and a compact mode that blew
    // the timetable up to fill it would be a different screen, not a small one.
    expect(fit(1200, 4).scale).toBe(1);
  });
});

describe("what it promises, for any screen and any college", () => {
  it("fits both axes, always", () => {
    for (const available of [280, 320, 358, 390, 640, 900, 1124, 1600]) {
      for (const rooms of [1, 2, 5, 8, 14, 23, 40, 75]) {
        for (const ceiling of [420, 560, 700, 900]) {
          const f = fitFor({
            available,
            rooms,
            gutter: GUTTER,
            ceiling,
            bodyHeight: BODY,
          });
          const where = `${available}px / ${rooms} rooms / ${ceiling} ceiling`;
          expect(f.width * f.scale, where).toBeLessThanOrEqual(available + 0.5);
          expect(f.height * f.scale, where).toBeLessThanOrEqual(ceiling + 0.5);
          expect(f.scale, where).toBeGreaterThan(0);
          expect(f.scale, where).toBeLessThanOrEqual(1);
          expect(f.column, where).toBeGreaterThanOrEqual(MIN_COLUMN);
        }
      }
    }
  });

  it("gets wider as the screen does, and never jumps backwards", () => {
    // The boundary between the regimes is a bend rather than a switch, so a
    // window dragged slowly wider must never make a column suddenly narrower —
    // which is what a hysteresis band would be needed to hide.
    let previous = 0;
    for (let available = 200; available <= 1400; available += 1) {
      const f = fit(available, 12);
      const rendered = f.column * f.scale;
      expect(rendered + 1e-6).toBeGreaterThanOrEqual(previous);
      previous = rendered;
    }
  });

  it("survives a screen shorter than the grid's own header", () => {
    const f = fit(358, 8, 30);
    expect(f.height * f.scale).toBeLessThanOrEqual(30.5);
    expect(Number.isFinite(f.scale)).toBe(true);
  });

  it("does not divide by a college with no rooms in it", () => {
    const f = fit(358, 0);
    expect(Number.isFinite(f.column)).toBe(true);
    expect(Number.isFinite(f.scale)).toBe(true);
    expect(f.height).toBe(HEADER_HEIGHT + BODY);
  });
});

describe("legible", () => {
  it("stops drawing text before it becomes a smudge", () => {
    // 12px block titles survive to about two thirds; the 11px subtitle goes
    // sooner, which is the right order — the title is the one worth keeping.
    expect(legible(12, 1)).toBe(true);
    expect(legible(12, 0.7)).toBe(true);
    expect(legible(12, 0.6)).toBe(false);
    expect(legible(11, 0.7)).toBe(false);
  });
});
