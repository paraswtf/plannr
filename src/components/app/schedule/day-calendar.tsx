"use client";

import { useEffect, useRef } from "react";

import { useLongPress } from "~/components/ui/use-long-press";
import { courseTone } from "~/lib/course-colour";
import { decimalHour, formatHourLabel } from "~/lib/dates";
import { blockPaint, NowMark } from "./block-paint";
import {
  blockHeight,
  dayWindow,
  fitLines,
  GUTTER,
  packOverlaps,
  ROW_HEIGHT,
} from "./day-layout";

/**
 * One day, drawn down the page.
 *
 * The same arithmetic as the rooms grid — decimal local hours against a fixed
 * pixel height per hour — with a single column instead of one per room, so a
 * lecture's height is how long it lasts and the gaps between them are the gaps
 * in the day. A red line marks the present, which is the one thing a student
 * opening this screen is really asking about.
 */

export interface DayCalendarEvent {
  id: string;
  start: Date;
  end: Date;
  title: string;
  roomCode?: string | null;
  /** The subject taught, which decides the block's colour. Null for a booking. */
  courseTitle?: string | null;
  /** Whatever the viewer's perspective wants said about it, most useful first. */
  lines?: string[];
}

// Re-exported because the geometry moved into the pure module beside this one
// and three files import it from here today. Both names mean what they always
// meant.
export { GUTTER, ROW_HEIGHT };

export function DayCalendar({
  events,
  timeZone,
  now,
  /** Whether the day on screen is the one the clock is in. */
  isToday = true,
  rowHeight = ROW_HEIGHT,
  frame,
  centreOnNow = true,
  onCentred,
  onEventClick,
  onEventPress,
}: {
  events: DayCalendarEvent[];
  timeZone: string;
  now: Date;
  isToday?: boolean;
  rowHeight?: number;
  /**
   * The hours to draw, when the screen wants a say in them.
   *
   * Left alone, a day works out its own window from what is on it, which is
   * right for a day standing on its own. It is wrong for a day on a rail: three
   * days each choosing their own window put 09:00 at a different height in
   * each, so the hour axis shears as the finger drags across it and the whole
   * page changes height at the end. The screen hands all three the same window
   * instead. Named `frame` rather than `window` because the effect below asks
   * the real one how tall the screen is.
   */
  frame?: { startHour: number; endHour: number };
  /**
   * Whether to bring the present into view on mount.
   *
   * Owned by the screen rather than decided here, because this component is
   * mounted again every time the answer it is drawing changes — switching to a
   * colleague's day takes the calendar down to a skeleton and brings it back —
   * and a scroll on each of those is the page jumping under somebody who only
   * tapped an avatar. The screen knows which mount is an arrival; this one
   * cannot.
   */
  centreOnNow?: boolean;
  /** Called once the present has been centred, so it is not done twice. */
  onCentred?: () => void;
  onEventClick?: (event: DayCalendarEvent) => void;
  /** A press-and-hold or a right-click on a block. */
  onEventPress?: (event: DayCalendarEvent) => void;
}) {
  const nowRef = useRef<HTMLDivElement>(null);

  const { startHour, endHour } =
    frame ?? dayWindow(events, isToday ? now : null, timeZone);
  const height = (endHour - startHour) * rowHeight;

  const nowHour = decimalHour(now, timeZone);
  const showNow = isToday && nowHour >= startHour && nowHour <= endHour;

  // Bring the present into view on arrival, but only when it is not already
  // there — nobody wants the page to jump under them for no reason.
  useEffect(() => {
    if (!centreOnNow) return;
    const line = nowRef.current;
    // No now-line means the day on screen is not today, and there is nothing
    // to centre on. Deliberately *not* reported: the arrival has not happened
    // yet, so the screen keeps asking, and the first mount that does draw the
    // present — pressing Today from a day the screen opened on ahead of itself
    // — is the one that gets the scroll.
    if (!line) return;
    onCentred?.();
    const box = line.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      line.scrollIntoView({ block: "center" });
    }
    // Once per arrival, where an arrival is `centreOnNow` becoming true. It
    // used to be once per *mount*, which was the same thing back when every
    // change of day took the calendar down to a skeleton and built it again.
    // On a rail it does not: stepping onto today from the day beside it reuses
    // this component, so a mount-only effect would never run and `Today`,
    // reached by swiping, would quietly stop finding the present. The callbacks
    // are deliberately not tracked — a new `onCentred` identity every render is
    // not a second arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreOnNow]);

  return (
    <div className="relative" style={{ height }}>
      <HourGrid
        startHour={startHour}
        endHour={endHour}
        rowHeight={rowHeight}
        nowHour={showNow ? nowHour : undefined}
      />

      {packOverlaps(events).map(({ event, column, columns }) => (
        <DayBlock
          key={event.id}
          event={event}
          column={column}
          columns={columns}
          startHour={startHour}
          rowHeight={rowHeight}
          timeZone={timeZone}
          now={now}
          onClick={onEventClick}
          onPress={onEventPress}
        />
      ))}

      {showNow && (
        <div
          ref={nowRef}
          className="pointer-events-none absolute right-0 z-[5] flex items-center"
          style={{ left: 0, top: (nowHour - startHour) * rowHeight }}
        >
          <span
            className="text-bad text-right font-mono text-[11px] font-semibold"
            style={{ width: GUTTER - 12 }}
          >
            {formatHourLabel(now, timeZone)}
          </span>
          <span className="bg-red ml-[6px] h-[7px] w-[7px] shrink-0 rounded-full" />
          <span className="bg-red h-[2px] flex-1" />
        </div>
      )}
    </div>
  );
}

/**
 * One sitting.
 *
 * Its own component because the press-and-hold gesture is a hook, and a hook
 * cannot be called inside the `.map()` that draws these. That is the right
 * shape anyway: the gesture's state belongs to the block that owns it.
 */
function DayBlock({
  event,
  column,
  columns,
  startHour,
  rowHeight,
  timeZone,
  now,
  onClick,
  onPress,
}: {
  event: DayCalendarEvent;
  column: number;
  columns: number;
  startHour: number;
  rowHeight: number;
  timeZone: string;
  now: Date;
  onClick?: (event: DayCalendarEvent) => void;
  onPress?: (event: DayCalendarEvent) => void;
}) {
  const press = useLongPress(onPress ? () => onPress(event) : undefined);

  const from = decimalHour(event.start, timeZone);
  const to = decimalHour(event.end, timeZone) || 24;
  const live = event.start <= now && now < event.end;
  const past = event.end <= now;
  const tone = courseTone(event.courseTitle);
  const span = to - from;

  // A plain hyphen and no spaces, the house's way of writing a range.
  const when = `${formatHourLabel(event.start, timeZone)}-${formatHourLabel(event.end, timeZone)}`;
  const room = [when, event.roomCode].filter(Boolean).join(" · ");
  const lines = fitLines(span, rowHeight, event.lines ?? []);

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(event) : undefined}
      {...press}
      /*
       * Hover darkens a shade and a press gives a touch, both on the inside of
       * the box: its top, height, left and width are arithmetic and stay put.
       * The focus ring is drawn inset, inside the course's own hairline, so a
       * neighbouring block or the edge of the page cannot paint over it.
       */
      className="plr-clip absolute overflow-hidden rounded-xl px-3 py-2 text-left select-none hover:brightness-[0.97] focus-visible:outline-offset-[-3px] active:scale-[0.985]"
      style={{
        top: (from - startHour) * rowHeight + 2,
        height: blockHeight(span, rowHeight),
        left: `calc(${GUTTER}px + ${(column / columns) * 100}% - ${(GUTTER * column) / columns}px)`,
        width: `calc(${(1 / columns) * 100}% - ${GUTTER / columns}px - 4px)`,
        /*
         * The subject's own colour, with "happening now" over the top of it.
         * No gold here: the campus timetable picks your classes out of
         * everybody else's, and on your own schedule they are all yours — or,
         * under "view as", all somebody else's, which gold would misname.
         */
        ...blockPaint(tone, { live, past: past && !live }),
        cursor: onClick ? "pointer" : "default",
        // iOS answers a long press on its own, with a magnifier and a callout
        // menu. The gesture is ours here, so both go; `select-none` above is
        // the other half, or the press starts selecting the title under the
        // finger. `touch-action` is deliberately left alone — pinning it would
        // cost the page the vertical scroll a thumb needs to read the day.
        WebkitTouchCallout: "none",
      }}
    >
      {/*
       * Solid inks on the course fill, title and body, both of which the
       * palette's own test holds above 4.5:1 on every tone. The tiers are
       * weight now rather than alpha: muted and faint over a saturated fill
       * came out near 2:1. The sizes are `fitLines`'s and stay exactly as
       * they are.
       */}
      <span className="text-title block truncate text-[13px] leading-tight font-semibold">
        {event.title}
      </span>
      {span >= 0.5 && (
        <span className="text-ink mt-0.5 block truncate font-mono text-[11px] font-medium">
          {live && <NowMark />}
          {room}
        </span>
      )}
      {lines.map((line) => (
        <span key={line} className="text-ink mt-0.5 block truncate text-[11px]">
          {line}
        </span>
      ))}
    </button>
  );
}

/**
 * The hours down the side and the lines they name.
 *
 * Its own component so the loading state can draw the identical frame: the
 * point of a skeleton is that nothing moves when the real thing replaces it,
 * and two copies of this arithmetic would drift the first time one changed.
 */
export function HourGrid({
  startHour,
  endHour,
  rowHeight = ROW_HEIGHT,
  nowHour,
}: {
  startHour: number;
  endHour: number;
  rowHeight?: number;
  /**
   * Where the now-line's own time label sits, when there is one. An hour
   * label within a few pixels of it steps aside rather than printing "10am"
   * under "10:05am" in the same gutter.
   */
  nowHour?: number;
}) {
  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i,
  );

  return (
    <>
      {hours.map((hour) => (
        <div key={hour}>
          <div
            className="text-faint absolute -translate-y-1/2 font-mono text-[11px]"
            style={{
              top: (hour - startHour) * rowHeight,
              left: 0,
              width: GUTTER - 12,
              // Hidden rather than removed, so the gutter keeps its shape.
              // The day's now row is placed by its top, not its middle, so its
              // label is centred half a line below the now position.
              visibility: clashesWithNow(
                hour,
                nowHour,
                rowHeight,
                NOW_LABEL_DROP,
              )
                ? "hidden"
                : undefined,
            }}
          >
            <span className="block text-right">
              {formatHourLabel(new Date(Date.UTC(2000, 0, 1, hour, 0)), "UTC")}
            </span>
          </div>
          <div
            className="absolute right-0"
            style={{
              top: (hour - startHour) * rowHeight,
              left: GUTTER,
              boxShadow: "inset 0 1px 0 var(--hair-soft)",
              height: 1,
            }}
          />
          {hour < endHour && (
            <div
              className="absolute right-0"
              style={{
                top: (hour - startHour + 0.5) * rowHeight,
                left: GUTTER,
                // The half hour: the faintest slate there is, under the hour.
                boxShadow: "inset 0 1px 0 var(--tint-hover)",
                height: 1,
              }}
            />
          )}
        </div>
      ))}
    </>
  );
}

/**
 * Whether an hour label would collide with the now-line's label: closer than
 * a line of 11px type, measured in pixels so it holds at any row height.
 * Shared with the week, whose gutter has the same two labels in it.
 *
 * Both are compared by their centres. An hour label is centred on its rule;
 * the now-label is centred on the now position in the week (translated up by
 * half), but in the day it hangs `labelDrop` pixels below it, and a test that
 * ignored that hid the wrong labels by half a line. The threshold is one line
 * box of 11px type at the inherited 1.5 leading (16.5px), rounded up: any
 * nearer and the two lines overlap.
 */
export function clashesWithNow(
  hour: number,
  nowHour: number | undefined,
  rowHeight: number,
  labelDrop = 0,
): boolean {
  return (
    nowHour !== undefined &&
    Math.abs((hour - nowHour) * rowHeight - labelDrop) < 17
  );
}

/**
 * How far below the now position the day's now-label is centred. The now row
 * is placed at that position by its top and centres its children, and its
 * height is its tallest child: the label's 16.5px line box (11px type at 1.5).
 * The line itself is not moved to match; its top is the arithmetic.
 */
const NOW_LABEL_DROP = 16.5 / 2;
