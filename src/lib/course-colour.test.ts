import { describe, expect, it } from "vitest";

import {
  COURSE_TONES,
  courseKey,
  courseTone,
  NO_COURSE,
} from "./course-colour";

/**
 * The two things a course colour has to be: the same every time, and not the
 * same as the one next to it.
 *
 * Both are testable as numbers, which is the point of keeping the palette in a
 * module with no DOM in it. What is not testable here is whether eight tints
 * look right on a screen, and that has to be looked at.
 */

/**
 * Colour blindness, simulated, so the claim above can be checked rather than
 * asserted.
 *
 * Viénot, Brettel & Mollon (1999): take the colour into LMS cone space, flatten
 * the axis the missing cone would have carried, and come back. It is the
 * standard construction and it is short, which is the only reason it is
 * reasonable to have here — the alternative is a palette whose whole promise is
 * unverifiable.
 */
type Vision = "normal" | "protanopia" | "deuteranopia";

const channel = (hex: string, at: number) =>
  parseInt(hex.slice(at, at + 2), 16) / 255;
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = (c: number) => {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};
const hexOf = (rgb: number[]) =>
  "#" +
  rgb
    .map((c) =>
      Math.round(toGamma(c) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

const apply = (m: number[][], v: number[]) =>
  m.map((row) => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!);

const RGB_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.715152, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const XYZ_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];
/** Hunt-Pointer-Estevez, the cone space Viénot's projection is defined in. */
const XYZ_LMS = [
  [0.15514, 0.54312, -0.03286],
  [-0.15514, 0.45684, 0.03286],
  [0, 0, 0.01608],
];
const LMS_XYZ = [
  [2.944812, -2.298974, 3.230135],
  [1, 0, 0],
  [0, 0, 62.18806],
];

const xyzOf = (hex: string) =>
  apply(
    RGB_XYZ,
    [1, 3, 5].map((at) => toLinear(channel(hex, at))),
  );

function seenAs(hex: string, vision: Vision): string {
  if (vision === "normal") return hex;
  const [l, m, s] = apply(XYZ_LMS, xyzOf(hex)) as [number, number, number];
  const lms =
    vision === "protanopia"
      ? [2.02344 * m - 2.52581 * s, m, s]
      : [l, 0.494207 * l + 1.24827 * s, s];
  return hexOf(apply(XYZ_RGB, apply(LMS_XYZ, lms)));
}

/** CIE L*a*b*, D65. */
function labOf(hex: string): [number, number, number] {
  const [x, y, z] = xyzOf(hex) as [number, number, number];
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
  const fx = f(x / 0.95047);
  const fy = f(y);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * CIEDE2000. A just-noticeable difference is about 2.3, which is the number
 * every threshold below is a multiple of.
 */
function deltaE(one: string, two: string): number {
  const [l1, a1, b1] = labOf(one);
  const [l2, a2, b2] = labOf(two);
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1;
  const ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hp1 = ((((Math.atan2(b1, ap1) * 180) / Math.PI) % 360) + 360) % 360;
  const hp2 = ((((Math.atan2(b2, ap2) * 180) / Math.PI) % 360) + 360) % 360;
  const dL = l2 - l1;
  const dC = cp2 - cp1;
  const dh =
    cp1 * cp2 === 0 ? 0 : ((((hp2 - hp1 + 180) % 360) + 360) % 360) - 180;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(rad(dh) / 2);
  const lBar = (l1 + l2) / 2;
  const cpBar = (cp1 + cp2) / 2;
  const hBar =
    cp1 * cp2 === 0
      ? hp1 + hp2
      : (hp1 + hp2 + (Math.abs(hp1 - hp2) > 180 ? 360 : 0)) / 2;
  const t =
    1 -
    0.17 * Math.cos(rad(hBar - 30)) +
    0.24 * Math.cos(rad(2 * hBar)) +
    0.32 * Math.cos(rad(3 * hBar + 6)) -
    0.2 * Math.cos(rad(4 * hBar - 63));
  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sC = 1 + 0.045 * cpBar;
  const sH = 1 + 0.015 * cpBar * t;
  const rt =
    cpBar > 0
      ? -2 *
        Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7)) *
        Math.sin(rad(60 * Math.exp(-(((hBar - 275) / 25) ** 2))))
      : 0;
  return Math.sqrt(
    (dL / sL) ** 2 +
      (dC / sC) ** 2 +
      (dH / sH) ** 2 +
      rt * (dC / sC) * (dH / sH),
  );
}

/** How far apart two colours are for the reader who sees them worst. */
const apart = (one: string, two: string) =>
  Math.min(
    ...VISIONS.map((vision) =>
      deltaE(seenAs(one, vision), seenAs(two, vision)),
    ),
  );

const VISIONS: Vision[] = ["normal", "protanopia", "deuteranopia"];

/** What each of the two reserved colours means, and must go on meaning. */
const GOLD = "#d99425"; // --mine-ring: one of yours
const RED = "#dc3848"; // --red: happening now

describe("the same colour every time", () => {
  it("gives a subject the same tone on every screen it is drawn on", () => {
    expect(courseTone("Design Thinking")).toEqual(
      courseTone("Design Thinking"),
    );
  });

  it("does not care how the title was typed", () => {
    // The same course reached through two screens should not come back in two
    // colours because one of them had a trailing space.
    const plain = courseTone("Design Thinking");
    expect(courseTone("  design thinking  ")).toEqual(plain);
    expect(courseTone("Design  Thinking")).toEqual(plain);
  });

  it("survives the thing that repaints a palette hashed on position", () => {
    // A timetable filtered to one building, or a student dropping an elective,
    // changes which courses are on screen. None of the others may move.
    const term = ["Data Structures", "Design Thinking", "Statistics"];
    const before = term.map(courseTone);
    // The first one drops out; the two that remain must not move.
    const after = term.slice(1).map(courseTone);
    expect(after).toEqual(before.slice(1));
  });
});

describe("a class with no subject", () => {
  it("looks exactly like every class did before there were colours", () => {
    // Not an edge case: `Event.courseId` is null for anything the sync adds.
    expect(courseTone(null)).toBe(NO_COURSE);
    expect(courseTone(undefined)).toBe(NO_COURSE);
    expect(courseTone("")).toBe(NO_COURSE);
    expect(courseTone("   ")).toBe(NO_COURSE);
    expect(NO_COURSE.fill).toBe("var(--card-soft)");
  });
});

describe("telling them apart, including for the readers who cannot", () => {
  /*
   * Every threshold below is measured with the deficiency applied — normal
   * vision, protanopia and deuteranopia, worst case wins — because the first
   * version of this palette passed a normal-vision check comfortably and was
   * still broken. Its green sat 2.4 from the live red for a deuteranope and 3.6
   * from the "yours" gold for a protanope, against a just-noticeable difference
   * of 2.3. A test that only looks at colour the way most people see it will
   * certify exactly that palette again.
   */

  it("keeps every pair of rings apart for everybody", () => {
    for (let i = 0; i < COURSE_TONES.length; i++) {
      for (let j = i + 1; j < COURSE_TONES.length; j++) {
        const a = COURSE_TONES[i]!.ring;
        const b = COURSE_TONES[j]!.ring;
        // Five times the threshold, at the worst pair for the worst reader.
        expect(apart(a, b), `${a} vs ${b}`).toBeGreaterThan(12);
      }
    }
  });

  it("leaves gold and red alone, because both already mean something", () => {
    // Gold is "one of yours" and red is "happening now" — the two signals a
    // block is allowed to carry that are not about which subject it teaches.
    for (const tone of COURSE_TONES) {
      expect(apart(tone.ring, GOLD), `${tone.ring} vs gold`).toBeGreaterThan(
        15,
      );
      expect(apart(tone.ring, RED), `${tone.ring} vs red`).toBeGreaterThan(11);
    }
  });

  it("does not lean on hue alone, which is the thing that fails", () => {
    // Red-green deficiency folds the wheel onto roughly one blue-yellow axis,
    // so six categories cannot be carried by hue however evenly it is spread.
    // What is left is lightness, and these have to actually use it.
    const lightness = COURSE_TONES.map((tone) => labOf(tone.ring)[0]);
    const spread = Math.max(...lightness) - Math.min(...lightness);
    expect(spread).toBeGreaterThan(30);
  });

  it("spreads a real timetable across most of the palette", () => {
    // A semester's worth of subjects. Some sharing a tone is expected and fine
    // — the name is on the block — but a palette that collapsed to two would
    // not be worth drawing.
    const term = [
      "Design Thinking",
      "Data Structures",
      "Operating Systems",
      "Discrete Mathematics",
      "Database Management Systems",
      "Computer Networks",
      "Software Engineering",
      "Machine Learning",
      "Web Technologies",
      "Statistics for Computing",
    ];
    const used = new Set(term.map((t) => courseTone(t).ring));
    expect(used.size).toBeGreaterThanOrEqual(4);
  });
});

describe("staying out of the way of the words", () => {
  it("keeps every fill pale enough to leave the block's ink alone", () => {
    // The title on a block is `--app-ink` and stays there. The fill is a tint
    // under it, not a colour it has to be read against, so the contrast is the
    // surface's and nothing here can quietly break it.
    for (const tone of COURSE_TONES) {
      const alpha = Number(/([\d.]+)\)$/.exec(tone.fill)?.[1]);
      expect(alpha, tone.fill).toBeGreaterThan(0);
      expect(alpha, tone.fill).toBeLessThanOrEqual(0.16);
    }
  });
});

describe("courseKey", () => {
  it("folds the ways the same title gets written", () => {
    expect(courseKey("  Design   Thinking ")).toBe("design thinking");
  });
});
