/**
 * How the whole timetable is made to fit one screen.
 *
 * Two regimes, and they meet rather than switch. Columns narrow first, because
 * narrowing costs nothing legible — a 60px column is a smaller column, whereas
 * a 60% grid is smaller *text*. Only once the columns have hit a floor does the
 * whole thing zoom out instead.
 *
 * Pure and DOM-free so the arithmetic can actually be tested: everything in
 * here is a number in, a number out, and the one place that measures a real
 * element is the hook next door.
 */

/**
 * Narrowest a room column may be *laid out* before the grid starts zooming out
 * instead of narrowing further.
 *
 * Two independent reasons land on the same number, which is why it is this one.
 * A room code is three or four characters at 13px in the display face — about
 * 23px for "403", 31px for "K-Lab2" — and with the header's padding that wants
 * something near 40. And 40px is the touch target this app uses everywhere
 * else, so at the floor a column is still something a thumb can land on.
 *
 * Below the floor the code is not clipped, it is drawn smaller. Shrinking a
 * room code keeps it right; clipping it makes it wrong, and "40…" and "4…" are
 * two different rooms in the same building.
 */
export const MIN_COLUMN = 40;

/**
 * The header row's height, stated rather than measured.
 *
 * The box around the transform has to reserve the grid's rendered height, and
 * that has to be arithmetic — measuring it would mean a second observation
 * whose result feeds the scale, which is the loop this design exists without.
 * So the row is *given* this height and its cells centre inside it, and the
 * number is true by construction rather than by luck. The same trade as
 * `chipsThatFit` in the month layout, for the same reason.
 */
export const HEADER_HEIGHT = 42;

/**
 * The grid's vertical budget. Written once — in `globals.css`, where it can
 * differ between a phone and a laptop, because the page header above it does —
 * and read both by the scroller's own ceiling and by the probe that turns it
 * into a number.
 */
export const CEILING = "var(--tt-ceiling)";

export interface Fit {
  /** Layout width of one room column, in px. */
  column: number;
  /** What the grid is multiplied by on screen. Never above 1. */
  scale: number;
  /** The grid's untransformed size — what the transformed box is laid out at. */
  width: number;
  height: number;
}

export function fitFor({
  available,
  rooms,
  gutter,
  ceiling,
  bodyHeight,
}: {
  available: number;
  rooms: number;
  gutter: number;
  ceiling: number;
  bodyHeight: number;
}): Fit {
  const columns = Math.max(1, rooms);
  const tall = HEADER_HEIGHT + bodyHeight;

  // Whole pixels, so the `1fr` in the grid template absorbs the remainder. A
  // fractional column would let the inner box overshoot its container by a hair
  // and grow the very scrollbar this mode promises will never appear.
  const column = Math.max(
    MIN_COLUMN,
    Math.floor((available - gutter) / columns),
  );
  const wide = gutter + columns * column;

  /*
   * Never bigger than life, fits the width, and fits the height.
   *
   * The height term is the user's own ask — "the entire table is shrunk to the
   * screen size" — and it is also what makes the transform safe. A grid that
   * fits in both axes never scrolls, and a grid that never scrolls never
   * activates `position: sticky`, which is the one thing a scaled ancestor
   * would have got wrong.
   */
  const scale = Math.min(1, available / wide, ceiling / tall);

  return { column, scale, width: wide, height: tall };
}

/** Smallest a label is worth drawing at, in rendered pixels. */
const LEGIBLE_PX = 8;

/**
 * Whether text at `fontPx` is still worth drawing once the grid is scaled.
 *
 * The precedent is in the grid already, one axis over: `RangeBlock` only spells
 * a span out once the block is tall enough, and below that it is a bare tint.
 * The same rule applied to width instead of height — and a block with no room
 * for words is not nothing, because the fill still says whose class it is and
 * the ring still says whether it is running.
 */
export const legible = (fontPx: number, scale: number) =>
  fontPx * scale >= LEGIBLE_PX;
