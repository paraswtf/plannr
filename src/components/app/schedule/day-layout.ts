import { decimalHour } from "~/lib/dates";

/**
 * Arranging a day's classes on a vertical calendar.
 *
 * Two questions, both pure: how tall the day is, and — when two sittings claim
 * the same minutes — how they sit beside each other. Overlaps are not a fault
 * to be hidden: a student really can be double-booked, and the surest way for
 * them to notice is to see both.
 */

export interface DaySpan {
  start: Date;
  end: Date;
}

/**
 * The calendar's geometry, in one place because three components draw against
 * it now — the day, the week and the loading frames for both. Two copies of
 * these numbers is how a skeleton ends up a different height from the thing it
 * is standing in for.
 */

/** Width of the hour column down the left. */
export const GUTTER = 58;
/** Pixels per hour. */
export const ROW_HEIGHT = 84;
/** Enough for a title even on a fifteen-minute sitting. */
export const MIN_BLOCK = 26;
const PADDING = 16;
const TITLE_LINE = 17;
const SMALL_LINE = 15;

/** How tall a block covering `span` decimal hours is drawn. */
export function blockHeight(span: number, rowHeight: number): number {
  return Math.max(MIN_BLOCK, span * rowHeight - 4);
}

/**
 * As many of `lines` as the block can actually hold.
 *
 * Worked out from the block's height rather than guessed at: a short lecture
 * spilling its text over the one below reads far worse than one that says less.
 * `hasRoom` is whether the time-and-room line above them was drawn at all,
 * which on a very short sitting it is not.
 */
export function fitLines(
  span: number,
  rowHeight: number,
  lines: string[],
): string[] {
  const spare =
    blockHeight(span, rowHeight) -
    PADDING -
    TITLE_LINE -
    (span >= 0.5 ? SMALL_LINE : 0);
  return lines.slice(0, Math.max(0, Math.floor(spare / SMALL_LINE)));
}

export interface Placed<T> {
  event: T;
  /** Which column of its overlapping cluster this one takes, from zero. */
  column: number;
  /** How many columns that cluster needs, so a width can be worked out. */
  columns: number;
}

/**
 * Side-by-side positions for anything that overlaps.
 *
 * Events are gathered into clusters that genuinely share time, and each cluster
 * is packed into as few columns as it needs — so a day of ordinary,
 * back-to-back lectures is one full-width column, and only the classes that
 * clash are narrowed.
 */
export function packOverlaps<T extends DaySpan>(events: T[]): Array<Placed<T>> {
  const ordered = [...events].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      b.end.getTime() - a.end.getTime(),
  );

  const placed: Array<Placed<T>> = [];
  let cluster: Array<Placed<T>> = [];
  /** When each open column last finished. */
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const entry of cluster) entry.columns = columnEnds.length;
    placed.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const event of ordered) {
    if (event.start.getTime() >= clusterEnd) flush();

    let column = columnEnds.findIndex((end) => end <= event.start.getTime());
    if (column < 0) {
      column = columnEnds.length;
      columnEnds.push(0);
    }
    columnEnds[column] = event.end.getTime();
    clusterEnd = Math.max(clusterEnd, event.end.getTime());
    cluster.push({ event, column, columns: 1 });
  }
  flush();

  return placed;
}

/** The college day, when there is nothing else to go on. */
const DEFAULT_WINDOW = { startHour: 8, endHour: 18 };

/**
 * The hours the calendar should span: the college day, stretched to hold
 * whatever is actually on it and wherever the clock has got to.
 */
export function dayWindow(
  events: DaySpan[],
  now: Date | null,
  timeZone: string,
): { startHour: number; endHour: number } {
  let { startHour, endHour } = DEFAULT_WINDOW;

  for (const event of events) {
    const from = decimalHour(event.start, timeZone);
    // A sitting that runs to midnight reads as hour zero, which would fold the
    // whole day shut; it is the end of this one.
    const to = decimalHour(event.end, timeZone) || 24;
    startHour = Math.min(startHour, Math.floor(from));
    endHour = Math.max(endHour, Math.ceil(to));
  }

  if (now) {
    const hour = decimalHour(now, timeZone);
    startHour = Math.min(startHour, Math.floor(hour));
    endHour = Math.max(endHour, Math.ceil(hour));
  }

  return {
    startHour: Math.max(0, startHour),
    endHour: Math.min(24, Math.max(endHour, startHour + 1)),
  };
}
