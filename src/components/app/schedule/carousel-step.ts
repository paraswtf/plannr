/**
 * Where the rail has come to rest, and what that means.
 *
 * The gesture itself is the browser's — a scroll-snapping rail does the
 * following, the rubber band, the momentum and the interruption, all on the
 * compositor, which is the only way any of it survives a hundred absolutely
 * positioned lectures being dragged at once. All that is left for us is
 * reading, after the scrolling stops, which pane it stopped on.
 *
 * Pure, because it is the one part that can be tested: happy-dom has no layout
 * engine and no scrolling, so a rail that landed on tomorrow and a rail that
 * never moved are the same zeroes to it.
 */

/** The pane on screen, and one either way. */
export const OFFSETS = [-1, 0, 1] as const;
export type Offset = (typeof OFFSETS)[number];

/** Which of the three is the one being read. Always the middle. */
export const CENTRE = 1;

/**
 * How near a snap point counts as having landed, in pixels.
 *
 * Not zero, because `scrollLeft` is a subpixel number on a device whose pane
 * width rarely divides into whole ones — a rail perfectly at rest routinely
 * reads 359.66 out of 360. Not large either: everything between the snap
 * points is a gesture still in flight, and answering while a finger is still
 * moving would step the day out from under it.
 */
export const SNAP_TOLERANCE = 2;

/** Where the rail sits when the pane on screen is the one being read. */
export const restingAt = (paneWidth: number) => paneWidth * CENTRE;

/**
 * Which way the rail has moved, or zero if it has not finished moving.
 *
 * Beyond a neighbour is still a neighbour: an overscroll or a hurried flick can
 * leave the rail past the end, and stepping two days for one gesture is not
 * what anybody meant by it.
 */
export function stepFrom(scrollLeft: number, paneWidth: number): -1 | 0 | 1 {
  if (!(paneWidth > 0)) return 0;

  const at = scrollLeft / paneWidth;
  const nearest = Math.round(at);
  // Between two panes: still travelling, or a finger holding it there.
  if (Math.abs(at - nearest) * paneWidth > SNAP_TOLERANCE) return 0;

  const by = nearest - CENTRE;
  if (by === 0) return 0;
  return by < 0 ? -1 : 1;
}
