/**
 * A colour per subject, so a week of blocks reads as a pattern rather than a
 * wall of identical tiles.
 *
 * The same shape the app already uses for every tinted surface — a pale fill
 * with a saturated hairline over it, the pair documented on `--mine-fill` /
 * `--mine-ring` in `globals.css`. Pale is not a stylistic preference here: the
 * title on a block is `--app-ink`, so the fill has to stay light enough that
 * the text on top of it is the same contrast it was on `--card-soft`. All the
 * distinguishing work is done by the ring.
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
 * Six rather than as many as there are courses, for the reason the avatar tones
 * give one file over: a colour is a memory aid, not an identifier. What
 * somebody learns is "Design Thinking is the green one", and that only has to
 * hold among the handful of subjects on screen at once. The name is on the
 * block and in the key for anybody who needs to be sure.
 *
 * Chosen under simulated colour blindness, not by eye, and that changed the
 * answer completely. The first version of this palette picked six hues evenly
 * around the wheel with the reserved wedges cut out, which looked fine and was
 * nearly useless: run through a dichromat simulation, its green landed 2.4 ΔE
 * from the live red and 3.6 from the "yours" gold — under a just-noticeable
 * difference of about 2.3. For roughly one man in fifty, every green block on
 * the timetable was the class happening right now, or one of their own.
 *
 * So the separation is measured with the deficiency applied, over normal
 * vision, protanopia and deuteranopia at once, and the worst case across all
 * three is what was maximised. That is why the lightnesses are spread from L*20
 * to L*57 rather than sitting in one band: red-green deficiency collapses the
 * wheel towards a single blue-yellow axis, so hue alone cannot carry six
 * categories, and lightness is what is left. It is also why there is no true
 * red and no amber here — those are spoken for by "happening now" and "one of
 * yours", and a course wearing either would be answering a question it was not
 * asked. The worst pair now sits at 15.8 ΔE2000, about seven times the
 * threshold. `course-colour.test.ts` holds all of that.
 */
const TONES: readonly CourseTone[] = [
  { fill: "rgba(43, 41, 101, 0.14)", ring: "#2b2965" }, // indigo
  { fill: "rgba(74, 38, 51, 0.14)", ring: "#4a2633" }, // plum
  { fill: "rgba(22, 90, 25, 0.14)", ring: "#165a19" }, // green
  { fill: "rgba(59, 84, 206, 0.14)", ring: "#3b54ce" }, // blue
  { fill: "rgba(41, 122, 163, 0.14)", ring: "#297aa3" }, // sky
  { fill: "rgba(49, 155, 116, 0.14)", ring: "#319b74" }, // sea
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

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    // djb2, near enough: cheap, stable, and spread well enough for eight buckets.
    hash = (hash * 33 + key.charCodeAt(i)) % 100_000_007;
  }
  return TONES[hash % TONES.length]!;
}
