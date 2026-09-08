import { readFileSync } from "node:fs";

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
/**
 * Inverted here rather than transcribed, and that is not tidiness.
 *
 * This constant was originally pasted from a reference and was not the inverse
 * of the matrix above it. Nothing caught it: the simulation still returned
 * plausible-looking colours, an independent reviewer using the same published
 * constant computed the same numbers, and two implementations agreeing on a
 * shared bad input is not agreement about anything. Under it, white simulated
 * to magenta. Derived from `XYZ_LMS`, the pair cannot drift apart again, and
 * the achromatic test below is the one line that would have caught it.
 */
function invert(m: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

const LMS_XYZ = invert(XYZ_LMS);

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

/** Every unordered pair, which is what most of the assertions below walk. */
function pairs<T>(list: readonly T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) out.push([list[i]!, list[j]!]);
  }
  return out;
}

/**
 * The two colours a course may never come near, as they are actually drawn.
 *
 * The fills, not the rings, because the fill is what a block is: a course tone
 * has to be unmistakable against the gold a class of your own is filled with,
 * and against the red one that is running now. Kept in step with `globals.css`
 * by the test below that reads them back out of it.
 */
const GOLD_FILL = "#ffc667"; // --mine-fill: one of yours
const LIVE_FILL = "#ffa7a4"; // --live-fill: happening now
const GOLD_RING = "#d99425"; // --mine-ring

/** Relative luminance, for the contrast the block's own text has to keep. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => toLinear(channel(hex, at))) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (one: string, two: string) => {
  const a = luminance(one);
  const b = luminance(two);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

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

describe("the simulator itself", () => {
  it("leaves grey alone, which is the whole of the sanity check", () => {
    /*
     * A dichromat sees no colour on the grey axis to lose, so a correct
     * simulation returns it untouched. This test exists because the matrix
     * below the fold was once not the inverse of the one above it, and under it
     * white came back as magenta — which silently invalidated every
     * accessibility number this file produced, and got a perfectly safe palette
     * rejected. It costs three lines and it is the only thing standing between
     * a plausible-looking simulation and a fictional one.
     */
    // True greys only. `--app-ink` looks neutral and is not — it is faintly
    // blue, and a correct simulation moves it a little, which is the point.
    for (const grey of [
      "#ffffff",
      "#cccccc",
      "#808080",
      "#333333",
      "#000000",
    ]) {
      for (const vision of ["protanopia", "deuteranopia"] as const) {
        const seen = seenAs(grey, vision);
        expect(deltaE(grey, seen), `${grey} under ${vision}`).toBeLessThan(1.5);
      }
    }
  });

  it("does lose the colour it is supposed to lose", () => {
    // The other half: a simulation that changed nothing would also pass the
    // test above. Red and green are what red-green deficiency confuses.
    expect(
      deltaE("#dc3848", seenAs("#dc3848", "deuteranopia")),
    ).toBeGreaterThan(20);
  });
});

describe("telling them apart", () => {
  const fills = COURSE_TONES.map((tone) => tone.fill);

  it("makes any two courses obviously different colours", () => {
    // The bar the first attempt failed. Twelve is a long way past the ~2.3 a
    // difference has to clear to be noticeable at all — these are meant to be
    // told apart across a room, not squinted at.
    for (const [a, b] of pairs(fills)) {
      expect(deltaE(a, b), `${a} vs ${b}`).toBeGreaterThan(12);
    }
  });

  it("keeps them apart for a dichromat too, if not as far", () => {
    /*
     * The honest floor, and lower than the one above on purpose. Red-green
     * deficiency folds the wheel onto roughly one blue-yellow axis, so eight
     * colours cannot all stay far apart in it; demanding they did is what
     * produced the washed-out palette this replaced. Which subject a block
     * teaches is written on the block and in the key, so a colour that is only
     * similar costs a glance. The two below cost nothing less than the meaning.
     */
    for (const [a, b] of pairs(fills)) {
      for (const vision of ["protanopia", "deuteranopia"] as const) {
        expect(
          deltaE(seenAs(a, vision), seenAs(b, vision)),
          `${a} vs ${b} under ${vision}`,
        ).toBeGreaterThan(4.5);
      }
    }
  });

  it("never goes near gold or red, for anybody", () => {
    // Gold is "one of yours" and red is "happening now" — the only two things
    // on the grid that are said in colour and nowhere else. Checked with the
    // deficiency applied, because that is where the last palette broke.
    for (const tone of COURSE_TONES) {
      for (const reserved of [GOLD_FILL, LIVE_FILL]) {
        expect(
          apart(tone.fill, reserved),
          `${tone.fill} vs ${reserved}`,
        ).toBeGreaterThan(10);
      }
      expect(
        apart(tone.ring, GOLD_RING),
        `${tone.ring} vs the gold ring`,
      ).toBeGreaterThan(10);
    }
  });

  it("gives every tone its own ring, not just its own fill", () => {
    // Two slots share a hue and are told apart by weight; their rings have to
    // follow, or the key draws the same swatch twice.
    for (const [a, b] of pairs(COURSE_TONES.map((tone) => tone.ring))) {
      expect(deltaE(a, b), `${a} vs ${b}`).toBeGreaterThan(8);
    }
  });

  it("spreads a real timetable across most of the palette", () => {
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
    expect(
      new Set(term.map((t) => courseTone(t).fill)).size,
    ).toBeGreaterThanOrEqual(5);
  });

  it("does not put near-identical titles in the same place", () => {
    // A course list is full of these, and a hash without an avalanche step
    // sends them to neighbouring buckets.
    expect(courseTone("Data Structures I").fill).not.toBe(
      courseTone("Data Structures II").fill,
    );
  });
});

describe("staying out of the way of the words", () => {
  it("leaves the block's own text readable on every fill", () => {
    // The fills are opaque now, so this is a real question rather than a
    // formality: the title and the subtitle are drawn straight onto them.
    for (const tone of COURSE_TONES) {
      expect(
        contrast(tone.fill, "#2c3135"),
        `ink on ${tone.fill}`,
      ).toBeGreaterThan(4.5);
      expect(
        contrast(tone.fill, "#0d1117"),
        `title on ${tone.fill}`,
      ).toBeGreaterThan(4.5);
    }
  });

  it("keeps the reserved fills readable too, now they are opaque as well", () => {
    for (const fill of [GOLD_FILL, LIVE_FILL]) {
      expect(contrast(fill, "#2c3135"), `ink on ${fill}`).toBeGreaterThan(4.5);
    }
  });
});

describe("the reserved colours this file measures against", () => {
  it("are the ones the stylesheet actually draws", () => {
    /*
     * Everything above is only as true as these two constants. They are the
     * gold a class of your own is filled with and the red a running one is, and
     * if the stylesheet moves and this file does not, every distance in this
     * suite quietly starts describing colours nobody is looking at. The last
     * time a constant in here drifted from its source it invalidated the whole
     * file and nothing noticed for two commits.
     */
    const css = readFileSync("src/styles/globals.css", "utf8");
    const token = (name: string) =>
      new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();

    expect(token("mine-fill")).toBe(GOLD_FILL);
    expect(token("live-fill")).toBe(LIVE_FILL);
    expect(token("mine-ring")).toBe(GOLD_RING);
  });
});

describe("courseKey", () => {
  it("folds the ways the same title gets written", () => {
    expect(courseKey("  Design   Thinking ")).toBe("design thinking");
  });
});
