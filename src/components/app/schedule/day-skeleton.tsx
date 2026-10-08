import { Skeleton } from "~/components/ui/skeleton";
import { GUTTER, HourGrid, ROW_HEIGHT } from "./day-calendar";

/**
 * The day while it is still being fetched.
 *
 * This exists because the honest alternative was worse than blinking. Switching
 * day used to keep the previous day's classes on screen under the new day's
 * date — React Query's `placeholderData` — so a Tuesday with nothing on it
 * showed Monday's four lectures, and there was no way to tell that from a real
 * answer. A student reading it had no reason to doubt it.
 *
 * So: the same frame, drawn from the same `HourGrid`, with the classes replaced
 * by shapes that are obviously not classes. Nothing about it can be mistaken
 * for a lecture, and nothing moves when the real day arrives.
 */

/**
 * Where the placeholder blocks sit, as fractions of the window.
 *
 * Fractions rather than hours so the shapes stay spread across whatever window
 * the previous day left behind, and fixed rather than random so a re-render
 * during loading does not reshuffle them.
 */
const BLOCKS = [
  { at: 0.08, span: 0.13 },
  { at: 0.3, span: 0.09 },
  { at: 0.52, span: 0.17 },
];

export function DaySkeleton({
  startHour = 8,
  endHour = 18,
  rowHeight = ROW_HEIGHT,
}: {
  startHour?: number;
  endHour?: number;
  rowHeight?: number;
}) {
  const span = Math.max(1, endHour - startHour);
  const height = span * rowHeight;

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading this day"
      className="relative"
      style={{ height }}
    >
      <HourGrid startHour={startHour} endHour={endHour} rowHeight={rowHeight} />

      {BLOCKS.map((block) => (
        // An opaque base under the shared pulse, so the hour rules do not
        // show through a shape that stands in for a solid block. The paper,
        // because the day is drawn straight on it: a white base came out the
        // same grey as the ground once the wash was over it, and vanished.
        <div
          key={block.at}
          className="bg-paper absolute overflow-hidden rounded-xl"
          style={{
            top: block.at * height + 2,
            height: block.span * height - 4,
            left: GUTTER,
            right: 4,
          }}
        >
          <Skeleton className="h-full w-full" />
        </div>
      ))}
    </div>
  );
}
