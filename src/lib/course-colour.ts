/**
 * A colour per subject, so a week of blocks reads as a pattern rather than a
 * wall of identical tiles.
 *
 * A fill and a hairline over it, the pair `--mine-fill` / `--mine-ring` set the
 * shape of. The fill is opaque and carries the colour; the ring is the same hue
 * taken much darker, which is what keeps a block's edge legible against the one
 * beside it. Both are light enough that the title and subtitle drawn on top
 * stay readable, which the test measures rather than assumes.
 *
 * Two colours are deliberately missing from the palette. Amber, because gold
 * already means "one of yours" on the campus timetable, and red, because red
 * already means "happening now" — a course that borrowed either would be
 * answering a question it was not asked.
 */

export interface CourseTone {
  /** A tint to lay under the block. Pale enough to leave the ink alone. */
  fill: string;
  /** The hairline drawn over it, which is what actually tells them apart. */
  ring: string;
}

/**
 * What a class with no subject attached looks like: exactly what every class
 * looked like before there were any colours.
 *
 * Not a fallback so much as the common case. `Event.courseId` is nullable by
 * design — a room booking teaches nothing — and on this deployment it is also
 * null for every class the timetable sync added, which is most of them. So the
 * honest answer for "no course" is the neutral the grid has always used, and
 * the key on the timetable says how many of the blocks on screen are in it.
 */
export const NO_COURSE: CourseTone = {
  fill: "var(--card-soft)",
  ring: "var(--card-ring)",
};

/**
 * The palette, as fill-and-ring pairs.
 *
 * The first version of this was six low-alpha tints, and it was rejected for
 * not being distinct enough — correctly, and the reason was not the hues. A
 * fill of `rgba(22,90,25,0.14)` over a white surface composites to #dee8df:
 * eighty-six per cent background, a pale grey with a rumour of green in it. All
 * six came out between #de and #e9 in every channel. The hue was chosen with
 * care and then almost entirely thrown away by the alpha. So these are opaque,
 * and the difference is not subtle.
 *
 * Eight of them, spread over the arc from yellow-green round to pink. Two
 * stretches of the wheel are missing on purpose: amber, because gold means "one
 * of your own classes", and red, because red means "happening right now". Those
 * two are the only colours on the grid whose meaning cannot be recovered from
 * anywhere else on the screen, so nothing else may come near them.
 *
 * Chosen by search rather than by eye, maximising the worst pair under normal
 * vision subject to three floors that are checked, not assumed: every pair
 * stays apart for a dichromat too, every colour stays clear of the two reserved
 * ones under every kind of vision, and the block's own ink stays readable on
 * top. The numbers that came out — worst pair 15.6 ΔE2000 normally and 5.1
 * under simulated protanopia and deuteranopia, 12.1 from gold, 14.1 from red,
 * text between 4.7:1 and 9.8:1 — are all held by the test.
 *
 * That 5.1 is the honest trade in this design. Six colours *fully* separated
 * for a dichromat exist, and this app shipped them, and they were the washed
 * out ones: red-green deficiency folds the wheel onto a single blue-yellow
 * axis, so demanding full separation between courses forces every tone into a
 * narrow, muted band. The line drawn instead is about what a colour is being
 * asked to carry. Which subject a block teaches is written on the block and
 * listed in the key, so a colour that is merely similar costs a reader a glance
 * at the label. "Yours" and "happening now" are written nowhere else, so those
 * keep the full separation and the courses take the looser floor.
 */
const TONES: readonly CourseTone[] = [
  { fill: "#8da524", ring: "#333d02" }, // moss
  { fill: "#40f8d4", ring: "#13816c" }, // mint
  { fill: "#63effc", ring: "#137d86" }, // ice
  { fill: "#29abb7", ring: "#034045" }, // teal
  { fill: "#7dc7fa", ring: "#0b5e8a" }, // sky
  { fill: "#8e9cf8", ring: "#3026a4" }, // periwinkle
  { fill: "#d77ce0", ring: "#6b0774" }, // orchid
  { fill: "#fbafdb", ring: "#a6207d" }, // blossom
];

/** Exported for the test, which cares that they stay far apart. */
export const COURSE_TONES = TONES;

/**
 * What a course is keyed on: its title, folded.
 *
 * The title rather than the `Course.id`, which is the more obvious choice and
 * the wrong one. A course row is unique per semester *and* per programme, so
 * its id changes at every rollover — a palette hashed on it would repaint the
 * whole timetable in January — and the same subject taught to two programmes
 * would come out as two colours in one grid. Keyed on the title, "Design
 * Thinking" is the same colour next term and in every programme that teaches
 * it, which is what somebody means when they say a course has a colour.
 *
 * The cost is that two genuinely different courses sharing a title share a
 * colour. They are the same subject taught to different cohorts, so that is
 * the right way round.
 */
export const courseKey = (title: string) =>
  title.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The tone for a subject. The same one every time, on every device, on every
 * screen that draws it.
 *
 * Hashed rather than handed out in order, because order changes: a timetable
 * filtered to one building, a week with a cancellation in it, or a student who
 * drops an elective would otherwise repaint every block on screen — which is
 * precisely the thing that stops a colour being worth anything.
 */
export function courseTone(title: string | null | undefined): CourseTone {
  if (!title) return NO_COURSE;
  const key = courseKey(title);
  if (key === "") return NO_COURSE;

  /*
   * FNV-1a with a final avalanche, rather than the djb2 that was here.
   *
   * djb2 taken modulo a prime on every iteration keeps the number small and
   * leaves most of its entropy in the high bits — and the bucket is chosen from
   * the low ones. On a corpus of plausible course titles it clumped. This
   * spreads, and the avalanche is what makes two titles differing by one letter
   * land in unrelated places, which is the case a college's course list is full
   * of: "Data Structures I" and "Data Structures II".
   */
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;

  return TONES[hash % TONES.length]!;
}
