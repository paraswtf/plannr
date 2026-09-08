/**
 * When a sideways drag is a sideways drag, and when it is somebody reading.
 *
 * The rail used to be a scroll-snapping scroller, which was the right instinct
 * — hand the axis to the compositor and it costs nothing per frame — and the
 * wrong trade. A scroller's axis lock belongs to the browser: it decides how
 * much sideways is enough, it decides it early, and once it has decided the
 * vertical component of the same drag is gone. On a screen whose whole purpose
 * is a column of text read by dragging it up the page, that is the wrong way
 * round. Reading has to be free and stepping the day has to be meant.
 *
 * So the axis is split rather than handed over. `touch-action: pan-y` gives the
 * browser the vertical outright — native, immediate, nothing of ours in the way
 * — and keeps the horizontal, which it will now never claim, for the arithmetic
 * below. The motion is still a single `translate3d` on one element, so it is
 * still one composited layer moving and not a hundred lectures being laid out.
 *
 * Pure, because this is the part with numbers in it that decide how the thing
 * feels, and happy-dom cannot drag a finger across anything.
 */

/** The pane on screen, and one either way. */
export const OFFSETS = [-1, 0, 1] as const;
export type Offset = (typeof OFFSETS)[number];

/**
 * How far a finger travels before the gesture belongs to anybody.
 *
 * The dead zone in front of every horizontal swipe, and the reason a thumb
 * drifting off vertical while reading never moves the day. Paid once: the rail
 * starts moving from where the decision was made, not from where the finger
 * went down, so what the hand feels afterwards is one-to-one.
 */
export const SLOP = 14;

/**
 * How much more sideways than up-and-down that travel has to be.
 *
 * Twice, which is a 27-degree cone either side of the horizontal. Deliberately
 * narrow: everything outside it is reading, and reading is the common case by a
 * wide margin. The cost of being wrong in that direction is a day that refuses
 * to step until asked more plainly; the cost of being wrong in the other is a
 * page that will not scroll.
 */
export const AXIS_RATIO = 2;

/** What a drag has turned out to be. */
export type Intent = "undecided" | "sideways" | "elsewhere";

/**
 * Judged once, on the first travel past the slop, and never revisited: a
 * gesture that has been decided must not change its mind halfway through and
 * start eating the scroll it already declined.
 */
export function intentOf(dx: number, dy: number): Intent {
  const across = Math.abs(dx);
  const down = Math.abs(dy);
  if (across < SLOP && down < SLOP) return "undecided";
  return across >= down * AXIS_RATIO ? "sideways" : "elsewhere";
}

/** The shortest and longest a deliberate, unhurried swipe is asked to be. */
const MIN_COMMIT = 48;
const MAX_COMMIT = 88;
/** And where between the two it lands, as a share of the pane's width. */
const COMMIT_FRACTION = 0.22;
/** A flick instead: pixels per millisecond, and the least it must still cover. */
const FLING = 0.35;
const FLING_MIN = 20;

/**
 * Whether the rail has been moved far enough, or fast enough, to let go of.
 *
 * Two ways to mean it, because there are two ways people swipe: carrying the
 * day most of the way across, or flicking it and expecting the rail to finish
 * the job. Neither is a fraction of the other, so both are asked separately.
 */
export function commits(dx: number, speed: number, width: number): boolean {
  const travelled = Math.abs(dx);
  const needed = Math.max(
    MIN_COMMIT,
    Math.min(MAX_COMMIT, width * COMMIT_FRACTION),
  );
  return travelled >= needed || (speed >= FLING && travelled >= FLING_MIN);
}

/**
 * How far the rail has moved: one to one with the hand, and never past the
 * neighbour, because past the neighbour there is nothing drawn.
 */
export function travelOf(dx: number, width: number): number {
  if (!(width > 0)) return 0;
  return Math.max(-width, Math.min(width, dx));
}

/** Which way a released drag settles: a pane over, or back where it was. */
export function landingOf(dx: number, speed: number, width: number): Offset {
  if (!commits(dx, speed, width)) return 0;
  return dx < 0 ? 1 : -1;
}
