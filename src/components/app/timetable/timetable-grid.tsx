"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLongPress } from "~/components/ui/use-long-press";
import { decimalHour, formatHourLabel, SNAP_MINUTES } from "~/lib/dates";
import { CEILING, HEADER_HEIGHT, legible } from "./compact-fit";
import { useCompactFit } from "./use-compact-fit";
import { useNow } from "./use-now";

/**
 * Rooms × time grid.
 *
 * A CSS grid provides the column structure; event blocks are absolutely
 * positioned inside their column so a booking's height encodes its duration.
 * All arithmetic is in decimal local hours (9.5 = 09:30), which is the unit the
 * whole screen thinks in.
 *
 * Everything on it is draggable, in quarter-hour steps:
 *   · empty space  — press and pull to sweep out a new span
 *   · a chosen span — either edge to resize it, its middle to move it
 *   · a booked block — to move it to another time or another room
 *
 * Which of those are live depends on the callbacks the parent supplies. A drag
 * across columns is resolved from the column rectangles measured when the drag
 * begins, so it does not depend on what happens to be on top of the pointer.
 */

export interface GridRoom {
  id: string;
  code: string;
}

export interface GridEvent {
  occurrenceId: string;
  /** The event behind the occurrence — what an edit is addressed to. */
  eventId: string;
  roomId: string;
  start: Date;
  end: Date;
  /** Where the recurrence rule put this occurrence, for single-occurrence edits. */
  originalStart: Date;
  title: string;
  subtitle?: string | null;
  isRecurring?: boolean;
  kind?: string;
  roomCode?: string;
  facultyName?: string | null;
  /** Every group attending — more than one for a combined lecture. */
  groupNames?: string[];
  /** One of the viewer's own — a class they attend or teach. Drawn in gold. */
  isMine?: boolean;
  /**
   * Whether a register has already been taken for this sitting, or null for a
   * viewer not entitled to know. Null and false are deliberately different: the
   * panel says "register taken" on true and says nothing on either of the
   * others, rather than telling a student a lecture went unregistered.
   */
  attendanceMarked?: boolean | null;
}

/** A span of one room's column, in decimal local hours. */
export interface GridRange {
  roomId: string;
  startHour: number;
  endHour: number;
}

interface TimetableGridProps {
  rooms: GridRoom[];
  events: GridEvent[];
  timeZone: string;
  /** Working window in decimal local hours. */
  startHour: number;
  endHour: number;
  /** Pixel height of one hour. */
  rowHeight?: number;
  /** Show the now-line when the grid is displaying today. */
  showNowLine?: boolean;
  onEventClick?: (event: GridEvent) => void;
  /** A press-and-hold or a right-click on a booked block. */
  onEventPress?: (event: GridEvent) => void;
  /** Enables dragging booked blocks to a new time or room. */
  onEventMove?: (event: GridEvent, target: GridRange) => void;
  /** Enables drag-to-select; called with the snapped span as it settles. */
  onRangeSelect?: (range: GridRange) => void;
  /** The span to draw as chosen — the parent owns it once it has been taken. */
  selection?: GridRange | null;
  /**
   * Rooms that cannot take what is being booked — too small, or missing the kit
   * asked for. Drawn as struck out, and neither sweepable nor droppable.
   */
  unavailableRoomIds?: ReadonlySet<string>;
  /** Minutes a drag snaps to. */
  snapMinutes?: number;
  /**
   * Fit the whole grid on screen rather than letting it scroll.
   *
   * Two regimes, and they meet rather than switch: the columns narrow first,
   * and only once they have hit a floor does the whole thing zoom out. See
   * `compact-fit.ts`, which owns the arithmetic and explains the floor.
   */
  compact?: boolean;
}

/**
 * Column geometry, as CSS variables rather than numbers, because a phone cannot
 * spare 62px for the hour gutter and three separate things — the grid template,
 * the scrolling width and the now-line — have to agree on whatever it is. All
 * the drag arithmetic measures the columns it finds, so none of it cares.
 */
const GEOMETRY =
  "[--tt-gutter:46px] [--tt-column:104px] sm:[--tt-gutter:62px] sm:[--tt-column:118px]";
/** Pointer travel before a press on a block counts as a move rather than a click. */
const MOVE_THRESHOLD = 4;

type Drag =
  | {
      kind: "range";
      /** `create` sweeps a new span; the others drag one edge of the current one. */
      mode: "create" | "start" | "end";
      roomId: string;
      /** Step indices from `startHour`. The anchor is the edge staying put. */
      anchor: number;
      focus: number;
    }
  | {
      kind: "move";
      /** The block being moved, or null when it is the chosen span itself. */
      event: GridEvent | null;
      roomId: string;
      first: number;
      length: number;
      /** Steps between the block's top and where it was grabbed. */
      grab: number;
      originX: number;
      originY: number;
      moved: boolean;
    };

interface ColumnBox {
  roomId: string;
  left: number;
  right: number;
  top: number;
  /** As drawn, which under compact mode is not the height it was laid out at. */
  height: number;
}

export function TimetableGrid({
  rooms,
  events,
  timeZone,
  startHour,
  endHour,
  rowHeight = 60,
  showNowLine = false,
  onEventClick,
  onEventPress,
  onEventMove,
  onRangeSelect,
  selection,
  unavailableRoomIds,
  snapMinutes = SNAP_MINUTES,
  compact = false,
}: TimetableGridProps) {
  const now = useNow(30_000);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<ColumnBox[]>([]);
  // Set when a drag ends somewhere new, so the click that follows the release
  // does not also open what was just moved.
  const movedRef = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ roomId: string; step: number } | null>(
    null,
  );

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = Math.floor(startHour); h < endHour; h++) out.push(h);
    return out;
  }, [startHour, endHour]);

  const bodyHeight = (endHour - startHour) * rowHeight;

  const byRoom = useMemo(() => {
    const map = new Map<string, GridEvent[]>();
    for (const event of events) {
      const list = map.get(event.roomId);
      if (list) list.push(event);
      else map.set(event.roomId, [event]);
    }
    return map;
  }, [events]);

  // One snap step in hours, and how many whole steps fit in the working window.
  // The epsilon keeps a clean division (10 hours of quarter-hour steps) from
  // losing its last step to floating point.
  const step = snapMinutes / 60;
  const stepCount = Math.max(
    1,
    Math.floor((endHour - startHour) / step + 1e-6),
  );

  // Abandon a half-finished drag on escape, matching every other dismissal.
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  /** Freezes where the columns are, so a drag can cross them without hit-testing. */
  const measureColumns = () => {
    const nodes =
      rootRef.current?.querySelectorAll<HTMLElement>("[data-room-id]") ?? [];
    columnsRef.current = [...nodes].map((node) => {
      const box = node.getBoundingClientRect();
      return {
        roomId: node.dataset.roomId!,
        left: box.left,
        right: box.right,
        top: box.top,
        height: box.height,
      };
    });
  };

  const clampStep = (index: number) =>
    Math.min(stepCount - 1, Math.max(0, index));

  /**
   * Pixels to a step, read off the column rather than off `rowHeight`.
   *
   * `rowHeight` is what an hour was laid *out* at; the rectangle is what it was
   * *drawn* at, and compact mode puts a scale between the two. Dividing a
   * screen distance by a layout one is how a press at nine in the morning comes
   * back as half past five — and every drag path funnels through here, so it
   * would be all of them at once.
   *
   * Measuring rather than dividing by a scale keeps the promise this file has
   * always made a few lines up — "all the drag arithmetic measures the columns
   * it finds, so none of it cares" — and means nothing here has to be told the
   * scale, or told again if it ever comes from somewhere else.
   *
   * The fallback is not paranoia: a column with no height is what a test
   * environment with no layout engine reports, and what the frame before the
   * first paint reports, and dividing by it gives NaN steps rather than merely
   * wrong ones.
   */
  const stepFromTop = (
    clientY: number,
    column: { top: number; height: number },
  ) => {
    const perHour =
      column.height > 0 ? column.height / (endHour - startHour) : rowHeight;
    return clampStep(Math.floor((clientY - column.top) / perHour / step));
  };

  /** The step under the pointer within a named column, whatever it is over. */
  const stepIn = (roomId: string, clientY: number) => {
    const column = columnsRef.current.find((c) => c.roomId === roomId);
    return column ? stepFromTop(clientY, column) : 0;
  };

  /**
   * The column and step under the pointer, for drags allowed to change room.
   * A room that cannot take the booking is not a drop target, so dragging over
   * one leaves the block where it was rather than following the pointer in.
   */
  const pointAt = (clientX: number, clientY: number) => {
    const column =
      columnsRef.current.find((c) => clientX >= c.left && clientX < c.right) ??
      columnsRef.current[0];
    if (!column || unavailableRoomIds?.has(column.roomId)) return null;
    return { roomId: column.roomId, step: stepFromTop(clientY, column) };
  };

  /** The span covering both steps, end-exclusive — a click is one step long. */
  const rangeOf = (roomId: string, a: number, b: number): GridRange => ({
    roomId,
    startHour: startHour + Math.min(a, b) * step,
    endHour: startHour + (Math.max(a, b) + 1) * step,
  });

  const spanOf = (
    roomId: string,
    first: number,
    length: number,
  ): GridRange => ({
    roomId,
    startHour: startHour + first * step,
    endHour: startHour + (first + length) * step,
  });

  const stepOf = (hour: number) => Math.round((hour - startHour) / step);

  const beginDrag = (next: Drag, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    measureColumns();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(next);
  };

  /**
   * Picking a booked block up. Lifted out of the block itself so that the
   * component drawing it can stay ignorant of columns, steps and capture — all
   * it has is a pointer event and which room it is in.
   */
  const beginMove = (
    event: GridEvent,
    roomId: string,
    from: number,
    to: number,
    e: React.PointerEvent,
  ) => {
    measureColumns();
    const first = stepOf(from);
    const length = Math.max(1, Math.round((to - from) / step));
    beginDrag(
      {
        kind: "move",
        event,
        roomId,
        first,
        length,
        grab: Math.max(0, stepIn(roomId, e.clientY) - first),
        originX: e.clientX,
        originY: e.clientY,
        moved: false,
      },
      e,
    );
  };

  /** Every drag reports through here; only the mode differs. */
  const onDragMove = (e: React.PointerEvent) => {
    if (!drag) return;

    if (drag.kind === "range") {
      const at = stepIn(drag.roomId, e.clientY);
      if (drag.mode === "create") {
        if (at !== drag.focus) setDrag({ ...drag, focus: at });
        return;
      }
      // A dragged edge may not cross the one it is measured from.
      const next =
        drag.mode === "start"
          ? Math.min(at, drag.anchor)
          : Math.max(at, drag.anchor);
      if (next === drag.focus) return;
      setDrag({ ...drag, focus: next });
      onRangeSelect?.(rangeOf(drag.roomId, drag.anchor, next));
      return;
    }

    const moved =
      drag.moved ||
      Math.abs(e.clientX - drag.originX) > MOVE_THRESHOLD ||
      Math.abs(e.clientY - drag.originY) > MOVE_THRESHOLD;
    if (!moved) return;

    const point = pointAt(e.clientX, e.clientY);
    if (!point) return;
    const first = Math.min(
      Math.max(point.step - drag.grab, 0),
      Math.max(0, stepCount - drag.length),
    );
    if (
      moved === drag.moved &&
      first === drag.first &&
      point.roomId === drag.roomId
    ) {
      return;
    }
    setDrag({ ...drag, moved, first, roomId: point.roomId });
    // The chosen span belongs to the parent, so it moves live; a booked block
    // only commits on release, since moving one is a write.
    if (!drag.event) {
      onRangeSelect?.(spanOf(point.roomId, first, drag.length));
    }
  };

  const onDragEnd = () => {
    if (!drag) return;
    if (drag.kind === "range") {
      if (drag.mode === "create") {
        onRangeSelect?.(rangeOf(drag.roomId, drag.anchor, drag.focus));
        setHover(null);
      }
      setDrag(null);
      return;
    }
    if (drag.moved) {
      movedRef.current = true;
      if (drag.event) {
        onEventMove?.(drag.event, spanOf(drag.roomId, drag.first, drag.length));
      }
    }
    setDrag(null);
  };

  const nowHour = decimalHour(now, timeZone);
  const nowVisible = showNowLine && nowHour >= startHour && nowHour <= endHour;

  /**
   * How the grid is made to fit, when it is asked to.
   *
   * Null when compact is off, and every branch below reads as it always did.
   * `scale < 1` is the second regime — the zoom — and is the only case that
   * involves a transform at all.
   */
  const fit = useCompactFit({
    enabled: compact,
    rooms: rooms.length,
    bodyHeight,
    boxRef,
    probeRef,
  });
  const zoom = fit && fit.scale < 1 ? fit.scale : 1;
  const zoomed = zoom < 1;

  /**
   * A hairline is 1px because a hairline is 1px, and a scale would make it less
   * than that. The column dividers are the main structural cue in a dense grid
   * and the now-line is the one urgent mark on it, so both are drawn thicker in
   * layout so they come out right on screen.
   */
  const hair = (px: number) => px / zoom;

  const gridTemplate = `var(--tt-gutter) repeat(${rooms.length}, minmax(var(--tt-column), 1fr))`;
  const dragHandlers = {
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: () => setDrag(null),
  };

  return (
    <div ref={boxRef} className={`relative ${GEOMETRY}`}>
      {/*
       * Two device-shaped questions, answered by one element that draws nothing.
       *
       * How wide the hour gutter is at this breakpoint, and how tall the grid is
       * allowed to be on this screen. Both are written in CSS, in exactly one
       * place each, and both have to be numbers before a scale can be worked
       * out. Reading them off a probe rather than restating them in JavaScript
       * is what stops the ceiling below from becoming two truths that drift —
       * and the probe has no width, so it can never be part of the answer to
       * the width question measured on the box beside it.
       */}
      <div
        ref={probeRef}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 w-0"
        style={{ height: CEILING }}
      />
      <div
        ref={rootRef}
        // Containing the overscroll keeps a swipe that runs off the end of the
        // rooms from being read as the browser's back gesture. Only sideways:
        // once the day is taller than the box, a swipe that runs off the bottom
        // of it has to carry on down the page, which is what chaining does.
        className={`plr-scroll bg-surface overflow-auto overscroll-x-contain rounded-[var(--radius-card)] ${GEOMETRY}`}
        style={{
          boxShadow: "var(--ring), var(--shadow-card)",
          userSelect: drag ? "none" : undefined,
          /*
           * A ceiling on the height, so that the room codes can stay put.
           *
           * The header row is sticky, but sticky is measured against the nearest
           * scrolling ancestor, and that is this element: it scrolls sideways,
           * which makes it the scroller in both axes. Unbounded it has nothing to
           * scroll vertically, so the headings never move within it and the page
           * carries them off — scroll a tall grid on a phone and every column is
           * unlabelled. A ceiling gives the day somewhere to scroll and the
           * headings something to stick inside, and it costs neither the sideways
           * scroll nor the stuck hour gutter, since both belong to this same box.
           *
           * Sticking the headings to the viewport instead cannot be done from in
           * here: they would have to clear the page's own sticky header, whose
           * height is not something this component is told.
           *
           * The ceiling is one screen, less the phone's top bar and roughly the
           * page header beneath it. A default day — 08:00 to 18:00, 645px with
           * the headings — is well under that on a laptop, so a desktop grid is
           * the height it always was and never grows a second scrollbar. `svh`
           * rather than `dvh` because dvh would resize the box mid-scroll as a
           * phone's URL bar collapses, dragging the rows under the reader's
           * finger.
           *
           * The floor is what stops the ceiling from becoming the problem. A
           * phone held sideways is still a small screen — the top bar is charged
           * for, and the screen itself is only 340-odd points tall — so one
           * screen less both of those leaves under 200px, which is three hours of
           * a ten-hour day: not a calendar. A laptop window dragged to half
           * height lands in the same place. Under the floor the box goes back to
           * standing taller than the space and letting the page scroll, which is
           * what it did before there was any ceiling, so nothing is lost there
           * that was not already lost.
           */
          maxHeight: CEILING,
          /*
           * Compact takes the column width over entirely — an inline custom
           * property beats the breakpoint classes at every width — and closes
           * the horizontal scroll, which is the last channel by which content
           * could change the space it is being measured against.
           */
          ...(fit
            ? { "--tt-column": `${fit.column}px`, overflowX: "hidden" }
            : null),
        }}
      >
        {/*
         * The box the transform leaves behind.
         *
         * A scale is a paint-time operation: the element keeps its untransformed
         * border box for layout, so without this the scroller would still believe
         * its content were full size — a sideways scrollbar over a strip of empty
         * card, and a band of blank page below the grid as tall as everything the
         * zoom just saved. This block is given the *rendered* size instead. It
         * needs no clipping of its own: scaling down from the top-left corner
         * paints entirely inside it.
         */}
        <div
          style={
            zoomed && fit
              ? { width: fit.width * fit.scale, height: fit.height * fit.scale }
              : undefined
          }
        >
          <div
            style={{
              minWidth: `calc(var(--tt-gutter) + ${rooms.length} * var(--tt-column))`,
              ...(zoomed && fit
                ? {
                    width: fit.width,
                    height: fit.height,
                    transform: `scale(${fit.scale})`,
                    // The grid's origin is the corner where the gutter meets the
                    // header; any other origin would need a compensating translate.
                    transformOrigin: "0 0",
                  }
                : null),
            }}
          >
            {/* Room headers */}
            <div
              className="bg-surface sticky top-0 z-10 grid"
              style={{
                gridTemplateColumns: gridTemplate,
                boxShadow: `0 ${hair(1)}px 0 var(--hair)`,
                // Given the height `compact-fit` reserves for it rather than
                // left to its own padding, so the box around the transform can
                // be sized by arithmetic instead of a second measurement.
                height: HEADER_HEIGHT,
              }}
            >
              {/* Holds the corner over the sticky gutter as the rooms slide past. */}
              <div className="bg-surface sticky left-0 z-1" />
              {rooms.map((room) => {
                const unavailable = unavailableRoomIds?.has(room.id);
                return (
                  <div
                    key={room.id}
                    title={
                      unavailable ? "Does not fit this booking" : undefined
                    }
                    className="font-display flex items-center justify-center px-1 text-center font-bold"
                    style={{
                      color: unavailable ? "var(--faint)" : "var(--app-title)",
                      textDecoration: unavailable ? "line-through" : undefined,
                      // Shrunk to fit the column rather than clipped by it. A
                      // room code is the only thing naming the column, and
                      // "40…" and "4…" are two rooms in the same building.
                      fontSize: fit
                        ? Math.max(8, Math.min(13, fit.column / 3.4))
                        : 13,
                    }}
                  >
                    {/*
                     * The ellipsis has to live on a block, not on this flex
                     * box: `text-overflow` applies to a block container's own
                     * inline content, and a flex container's text sits in an
                     * anonymous item it cannot reach. Clipped without it, a
                     * long code comes out as another room's — "K-Lab" for
                     * "K-Lab2" — which is the one failure this header must not
                     * have, and the reason the codes shrink rather than crop.
                     */}
                    <span className="block max-w-full truncate">
                      {room.code}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Body */}
            <div
              className="relative grid"
              style={{ gridTemplateColumns: gridTemplate, height: bodyHeight }}
            >
              {/*
               * Hour gutter. It is stuck to the left edge of the scroller: on a
               * narrow screen only two or three rooms are on show at once, and a
               * block whose hour has scrolled out of sight tells you nothing. The
               * background is what the room columns pass behind.
               */}
              <div
                className="bg-surface sticky left-0 z-8"
                style={{ boxShadow: "inset -1px 0 0 var(--hair-soft)" }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="text-faint absolute right-2 -translate-y-1/2 font-mono text-[11px]"
                    style={{ top: (hour - startHour) * rowHeight }}
                  >
                    {formatHourLabel(
                      new Date(Date.UTC(2000, 0, 1, hour, 0)),
                      "UTC",
                    )}
                  </div>
                ))}
              </div>

              {rooms.map((room, index) => {
                const unavailable = unavailableRoomIds?.has(room.id) ?? false;
                const creating =
                  drag?.kind === "range" && drag.roomId === room.id
                    ? drag
                    : null;
                const moving =
                  drag?.kind === "move" && drag.moved ? drag : null;
                const pending = creating
                  ? rangeOf(room.id, creating.anchor, creating.focus)
                  : selection?.roomId === room.id
                    ? selection
                    : null;
                const movePreview =
                  moving?.event && moving.roomId === room.id
                    ? spanOf(room.id, moving.first, moving.length)
                    : null;
                const ghost =
                  onRangeSelect && !drag && hover?.roomId === room.id
                    ? rangeOf(room.id, hover.step, hover.step)
                    : null;

                return (
                  <div
                    key={room.id}
                    data-room-id={room.id}
                    className="relative"
                    style={{
                      // Every column draws the divider on its own left edge — bar
                      // the first, whose left edge is the gutter's right edge, and
                      // the gutter already draws that one. It has to: it is stuck
                      // to the left of the scroller and the columns slide behind
                      // it, so a divider belonging to the first column would slide
                      // away with it and leave the gutter's edge bare. Drawing both
                      // is what made this the one divider in the grid at 2px.
                      boxShadow:
                        index === 0
                          ? undefined
                          : `inset ${hair(1)}px 0 0 var(--hair-soft)`,
                      // Hatched rather than merely pale: a room that cannot take
                      // this booking should not read as one that is simply free.
                      backgroundImage: unavailable
                        ? `repeating-linear-gradient(45deg, rgba(68,88,121,0.06) 0 ${hair(5)}px, transparent ${hair(5)}px ${hair(11)}px)`
                        : undefined,
                    }}
                  >
                    {/*
                     * Hour lines, with a fainter one on the half hour so a
                     * quarter-hour drag has something to read against. Purely
                     * decorative — the drag surface below takes the input.
                     */}
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="pointer-events-none absolute w-full"
                        style={{
                          top: (hour - startHour) * rowHeight,
                          height: rowHeight,
                          boxShadow: `inset 0 ${hair(1)}px 0 var(--hair-soft)`,
                        }}
                      >
                        {/*
                         * The half-hour rule is there "so a quarter-hour drag
                         * has something to read against", which is exactly what
                         * stops being readable once the grid is zoomed out. A
                         * compact grid wants quieter rules anyway.
                         */}
                        {zoom >= 0.8 && (
                          <div
                            className="absolute w-full"
                            style={{
                              top: rowHeight / 2,
                              boxShadow: `inset 0 ${hair(1)}px 0 rgba(68,88,121,0.05)`,
                            }}
                          />
                        )}
                      </div>
                    ))}

                    {/*
                     * Drag surface for a new span. It sits under the blocks so
                     * pressing one of those picks the block up instead, but pointer
                     * capture means a sweep that starts on empty space may run
                     * straight over them. Touch is left alone: taking the gesture
                     * would cost the page its vertical scroll and the grid its
                     * sideways one, so a tap picks a single step instead.
                     */}
                    {onRangeSelect && !unavailable && (
                      <div
                        className="absolute inset-0 touch-auto"
                        style={{ cursor: "cell" }}
                        onPointerDown={(e) => {
                          if (e.pointerType === "touch" || e.button !== 0)
                            return;
                          measureColumns();
                          // The surface is `absolute inset-0` of its column, so its
                          // own rectangle is the column's — measured, like the rest.
                          const at = stepFromTop(
                            e.clientY,
                            e.currentTarget.getBoundingClientRect(),
                          );
                          beginDrag(
                            {
                              kind: "range",
                              mode: "create",
                              roomId: room.id,
                              anchor: at,
                              focus: at,
                            },
                            e,
                          );
                        }}
                        onPointerMove={(e) => {
                          if (drag) return onDragMove(e);
                          // The surface is `absolute inset-0` of its column, so its
                          // own rectangle is the column's — measured, like the rest.
                          const at = stepFromTop(
                            e.clientY,
                            e.currentTarget.getBoundingClientRect(),
                          );
                          if (hover?.roomId !== room.id || hover.step !== at) {
                            setHover({ roomId: room.id, step: at });
                          }
                        }}
                        onPointerLeave={() => {
                          if (!drag) setHover(null);
                        }}
                        onPointerUp={(e) => {
                          if (drag) return onDragEnd();
                          if (e.pointerType === "touch") {
                            measureColumns();
                            const at = stepFromTop(
                              e.clientY,
                              e.currentTarget.getBoundingClientRect(),
                            );
                            onRangeSelect(rangeOf(room.id, at, at));
                          }
                        }}
                        onPointerCancel={() => setDrag(null)}
                      />
                    )}

                    {(byRoom.get(room.id) ?? []).map((event) => (
                      <EventBlock
                        key={event.occurrenceId}
                        event={event}
                        roomId={room.id}
                        startHour={startHour}
                        rowHeight={rowHeight}
                        timeZone={timeZone}
                        now={now}
                        beingMoved={
                          moving?.event?.occurrenceId === event.occurrenceId
                        }
                        grabbing={drag?.kind === "move"}
                        zoom={zoom}
                        movedRef={movedRef}
                        onEventClick={onEventClick}
                        onEventPress={onEventPress}
                        onEventMove={onEventMove}
                        onBeginMove={beginMove}
                        dragHandlers={dragHandlers}
                      />
                    ))}

                    {ghost && (
                      <RangeBlock
                        range={ghost}
                        gridStartHour={startHour}
                        rowHeight={rowHeight}
                        tone="ghost"
                      />
                    )}
                    {movePreview && (
                      <RangeBlock
                        range={movePreview}
                        gridStartHour={startHour}
                        rowHeight={rowHeight}
                        tone="pending"
                      />
                    )}
                    {pending && !movePreview && (
                      <RangeBlock
                        range={pending}
                        gridStartHour={startHour}
                        rowHeight={rowHeight}
                        tone="pending"
                        grabbing={drag?.kind === "move" && !drag.event}
                        onBodyDown={
                          onRangeSelect
                            ? (e) => {
                                if (
                                  e.pointerType === "touch" ||
                                  e.button !== 0
                                ) {
                                  return;
                                }
                                measureColumns();
                                const first = stepOf(pending.startHour);
                                const length = Math.max(
                                  1,
                                  stepOf(pending.endHour) - first,
                                );
                                beginDrag(
                                  {
                                    kind: "move",
                                    event: null,
                                    roomId: room.id,
                                    first,
                                    length,
                                    grab: Math.max(
                                      0,
                                      stepIn(room.id, e.clientY) - first,
                                    ),
                                    originX: e.clientX,
                                    originY: e.clientY,
                                    moved: false,
                                  },
                                  e,
                                );
                              }
                            : undefined
                        }
                        onEdgeDown={
                          onRangeSelect
                            ? (edge, e) => {
                                if (
                                  e.pointerType === "touch" ||
                                  e.button !== 0
                                ) {
                                  return;
                                }
                                measureColumns();
                                const first = stepOf(pending.startHour);
                                const last = stepOf(pending.endHour) - 1;
                                beginDrag(
                                  {
                                    kind: "range",
                                    mode: edge,
                                    roomId: room.id,
                                    anchor: edge === "start" ? last : first,
                                    focus: edge === "start" ? first : last,
                                  },
                                  e,
                                );
                              }
                            : undefined
                        }
                        dragHandlers={dragHandlers}
                      />
                    )}
                  </div>
                );
              })}

              {nowVisible && (
                <div
                  className="pointer-events-none absolute right-0 z-[5] flex items-center"
                  style={{
                    left: "var(--tt-gutter)",
                    top: (nowHour - startHour) * rowHeight,
                  }}
                >
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      background: "var(--red)",
                      width: hair(7),
                      height: hair(7),
                      marginLeft: hair(-3.5),
                    }}
                  />
                  <span
                    className="flex-1"
                    style={{ background: "var(--red)", height: hair(2) }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DragHandlers {
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}

/**
 * One booked block.
 *
 * Its own component because the press-and-hold gesture is a hook, and a hook
 * cannot be called inside the `.map()` that draws these — which is the right
 * shape anyway, the gesture's state belonging to the block that owns it.
 *
 * The two sets of pointer handlers are composed by hand rather than by spread,
 * because both want the same four events and the order matters: the press is
 * offered every one first, and the drag machine sees them unchanged afterwards.
 * They cannot fight, and the reason is worth stating rather than trusting —
 * `useLongPress` arms its timer for everything except a mouse, and `beginMove`
 * below refuses everything except a mouse and a pen. So on the pointer that
 * drags there is no timer, and on the pointer that holds there is no drag.
 */
function EventBlock({
  event,
  roomId,
  startHour,
  rowHeight,
  timeZone,
  now,
  beingMoved,
  grabbing,
  zoom,
  movedRef,
  onEventClick,
  onEventPress,
  onEventMove,
  onBeginMove,
  dragHandlers,
}: {
  event: GridEvent;
  roomId: string;
  startHour: number;
  rowHeight: number;
  timeZone: string;
  now: Date;
  beingMoved: boolean;
  grabbing: boolean;
  /** What the grid is drawn at, so a block knows if its words will be read. */
  zoom: number;
  /** Set by a drag that landed somewhere, so the release does not also click. */
  movedRef: React.RefObject<boolean>;
  onEventClick?: (event: GridEvent) => void;
  onEventPress?: (event: GridEvent) => void;
  onEventMove?: (event: GridEvent, target: GridRange) => void;
  onBeginMove: (
    event: GridEvent,
    roomId: string,
    from: number,
    to: number,
    e: React.PointerEvent,
  ) => void;
  dragHandlers: DragHandlers;
}) {
  const press = useLongPress(
    onEventPress ? () => onEventPress(event) : undefined,
  );

  const from = decimalHour(event.start, timeZone);
  const to = decimalHour(event.end, timeZone);
  const live = event.start <= now && now < event.end;

  return (
    <button
      type="button"
      onClick={() => {
        // The release that ended a move also fires a click.
        if (movedRef.current) {
          movedRef.current = false;
          return;
        }
        onEventClick?.(event);
      }}
      onContextMenu={(e) => {
        // Not while a block is being dragged. The mouse's right button can be
        // pressed mid-drag, and answering it would put a modal over a move that
        // is still running underneath and would commit itself on release.
        if (grabbing) {
          e.preventDefault();
          return;
        }
        press.onContextMenu(e);
      }}
      onPointerDown={(e) => {
        press.onPointerDown(e);
        if (!onEventMove || e.pointerType === "touch" || e.button !== 0) return;
        onBeginMove(event, roomId, from, to, e);
      }}
      onPointerMove={(e) => {
        press.onPointerMove(e);
        if (onEventMove) dragHandlers.onPointerMove(e);
      }}
      onPointerUp={() => {
        press.onPointerUp();
        if (onEventMove) dragHandlers.onPointerUp();
      }}
      onPointerCancel={() => {
        press.onPointerCancel();
        if (onEventMove) dragHandlers.onPointerCancel();
      }}
      onPointerLeave={press.onPointerLeave}
      // Blocks cover most of a column, so pinning touch to one axis here would
      // leave a phone unable to scroll the grid sideways at all. A touch never
      // starts a drag anyway — and the hold above answers `pointercancel`, so
      // a scroll that claims the finger cancels the press rather than fighting
      // it.
      className="plr-clip absolute inset-x-1 touch-auto overflow-hidden rounded-lg px-2 py-1.5 text-left select-none"
      style={{
        top: (from - startHour) * rowHeight + 2,
        height: Math.max(22, (to - from) * rowHeight - 4),
        /*
         * Two separate questions, answered in two places, so a block that is
         * both still says both: the fill is whose class it is — gold for the
         * viewer's own — and the ring is whether it is running right now.
         * Letting either one win outright would take the gold off the very
         * block somebody is looking for, or drop the now-marker from the only
         * class it matters most on.
         */
        background: event.isMine
          ? "var(--mine-fill)"
          : live
            ? "rgba(220,56,72,0.10)"
            : "var(--card-soft)",
        boxShadow: live
          ? "inset 0 0 0 1px var(--red)"
          : event.isMine
            ? "inset 0 0 0 1px var(--mine-ring)"
            : "inset 0 0 0 1px var(--card-ring)",
        opacity: beingMoved ? 0.35 : 1,
        cursor: onEventMove
          ? grabbing
            ? "grabbing"
            : "grab"
          : onEventClick
            ? "pointer"
            : "default",
        // iOS answers a long press with a magnifier and a callout menu of its
        // own. The gesture is ours here, so both go, and `select-none` above is
        // the other half — without it the press starts selecting the title
        // under the finger.
        WebkitTouchCallout: "none",
      }}
    >
      {/*
       * Below its threshold a label is not shrunk, it is dropped — the same
       * rule `RangeBlock` already applies one axis over, where a quarter-hour
       * span "is a bare tint" rather than text it has no room for.
       *
       * A block with no words is not nothing. The fill still says whose class
       * it is and the ring still says whether it is running, which is what
       * turns a zoomed-out grid into an occupancy map of the campus — a
       * question the full-size one cannot answer at all.
       */}
      {legible(12, zoom) && (
        <span className="text-title block truncate text-[12px] leading-tight font-semibold">
          {event.title}
        </span>
      )}
      {event.subtitle && to - from >= 0.75 && legible(11, zoom) && (
        <span className="text-muted block truncate text-[11px]">
          {event.subtitle}
        </span>
      )}
    </button>
  );
}

/**
 * The block drawn for a span: faint under the cursor, solid once the range is
 * being dragged or has been taken. A taken range is grabbable in the middle and
 * carries a bar on each edge for dragging that end somewhere else.
 */
function RangeBlock({
  range,
  gridStartHour,
  rowHeight,
  tone,
  grabbing = false,
  onBodyDown,
  onEdgeDown,
  dragHandlers,
}: {
  range: GridRange;
  gridStartHour: number;
  rowHeight: number;
  tone: "ghost" | "pending";
  grabbing?: boolean;
  onBodyDown?: (e: React.PointerEvent) => void;
  onEdgeDown?: (edge: "start" | "end", e: React.PointerEvent) => void;
  dragHandlers?: DragHandlers;
}) {
  const height = (range.endHour - range.startHour) * rowHeight;
  // A quarter-hour block is barely taller than its own text, so the range only
  // spells itself out once there is room; below that it is a bare tint.
  const label = `${hourLabel(range.startHour)} – ${hourLabel(range.endHour)}`;
  const roomForLabel = height >= 30;
  const handleHeight = Math.max(5, Math.min(11, (height - 6) / 3));

  return (
    <div
      className="pointer-events-none absolute inset-x-1 z-6 overflow-hidden rounded-lg px-1.5 py-0.5"
      style={{
        top: (range.startHour - gridStartHour) * rowHeight + 2,
        height: Math.max(9, height - 4),
        background:
          tone === "pending" ? "rgba(68,88,121,0.16)" : "rgba(68,88,121,0.07)",
        boxShadow:
          tone === "pending"
            ? "inset 0 0 0 2px var(--slate)"
            : "inset 0 0 0 1px var(--slate-muted)",
      }}
    >
      {onBodyDown && (
        <div
          className="pointer-events-auto absolute inset-0 touch-auto"
          style={{ cursor: grabbing ? "grabbing" : "grab" }}
          onPointerDown={onBodyDown}
          {...dragHandlers}
        />
      )}

      {/*
       * Centred, so it sits clear of the grab bars on both edges rather than
       * being struck through by the top one.
       */}
      {roomForLabel && (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-2"
          style={{
            color: tone === "pending" ? "var(--slate)" : "var(--faint)",
          }}
        >
          <span className="truncate font-mono text-[10.5px] font-bold">
            {tone === "pending" ? label : "+ book"}
          </span>
        </span>
      )}

      {onEdgeDown && (
        <>
          <ResizeHandle
            edge="start"
            height={handleHeight}
            onDown={onEdgeDown}
            dragHandlers={dragHandlers}
          />
          <ResizeHandle
            edge="end"
            height={handleHeight}
            onDown={onEdgeDown}
            dragHandlers={dragHandlers}
          />
        </>
      )}
    </div>
  );
}

/**
 * The grab bar on one edge of a chosen span. It answers to a mouse only, so it
 * claims no touch gesture: swallowing them would leave a thumb unable to scroll
 * the page or the grid wherever a chosen span happens to lie.
 */
function ResizeHandle({
  edge,
  height,
  onDown,
  dragHandlers,
}: {
  edge: "start" | "end";
  height: number;
  onDown: (edge: "start" | "end", e: React.PointerEvent) => void;
  dragHandlers?: DragHandlers;
}) {
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 flex touch-auto items-center justify-center"
      style={{
        [edge === "start" ? "top" : "bottom"]: 0,
        height,
        cursor: "ns-resize",
      }}
      onPointerDown={(e) => onDown(edge, e)}
      {...dragHandlers}
    >
      <span
        className="rounded-full"
        style={{ height: 3, width: 26, background: "var(--slate)" }}
      />
    </div>
  );
}

/** Formats a decimal local hour without needing a concrete day. */
function hourLabel(hour: number) {
  const minutes = Math.round(hour * 60);
  return formatHourLabel(
    new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)),
    "UTC",
  );
}
