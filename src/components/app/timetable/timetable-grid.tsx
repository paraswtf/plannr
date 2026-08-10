"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { decimalHour, formatHourLabel, SNAP_MINUTES } from "~/lib/dates";
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
  /** Enables dragging booked blocks to a new time or room. */
  onEventMove?: (event: GridEvent, target: GridRange) => void;
  /** Enables drag-to-select; called with the snapped span as it settles. */
  onRangeSelect?: (range: GridRange) => void;
  /** The span to draw as chosen — the parent owns it once it has been taken. */
  selection?: GridRange | null;
  /** Minutes a drag snaps to. */
  snapMinutes?: number;
}

const GUTTER = 62;
const MIN_COLUMN = 118;
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
  onEventMove,
  onRangeSelect,
  selection,
  snapMinutes = SNAP_MINUTES,
}: TimetableGridProps) {
  const now = useNow(30_000);
  const rootRef = useRef<HTMLDivElement>(null);
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
      };
    });
  };

  const clampStep = (index: number) =>
    Math.min(stepCount - 1, Math.max(0, index));

  const stepFromTop = (clientY: number, top: number) =>
    clampStep(Math.floor((clientY - top) / rowHeight / step));

  /** The step under the pointer within a named column, whatever it is over. */
  const stepIn = (roomId: string, clientY: number) => {
    const column = columnsRef.current.find((c) => c.roomId === roomId);
    return column ? stepFromTop(clientY, column.top) : 0;
  };

  /** The column and step under the pointer, for drags allowed to change room. */
  const pointAt = (clientX: number, clientY: number) => {
    const column =
      columnsRef.current.find((c) => clientX >= c.left && clientX < c.right) ??
      columnsRef.current[0];
    if (!column) return null;
    return { roomId: column.roomId, step: stepFromTop(clientY, column.top) };
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

  const gridTemplate = `${GUTTER}px repeat(${rooms.length}, minmax(${MIN_COLUMN}px, 1fr))`;
  const dragHandlers = {
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: () => setDrag(null),
  };

  return (
    <div
      ref={rootRef}
      className="plr-scroll bg-surface overflow-x-auto rounded-[var(--radius-card)]"
      style={{
        boxShadow: "var(--ring), var(--shadow-card)",
        userSelect: drag ? "none" : undefined,
      }}
    >
      <div style={{ minWidth: GUTTER + rooms.length * MIN_COLUMN }}>
        {/* Room headers */}
        <div
          className="bg-surface sticky top-0 z-10 grid"
          style={{
            gridTemplateColumns: gridTemplate,
            boxShadow: "0 1px 0 var(--hair)",
          }}
        >
          <div />
          {rooms.map((room) => (
            <div
              key={room.id}
              className="font-display text-title px-2 py-3 text-center text-[13px] font-bold"
            >
              {room.code}
            </div>
          ))}
        </div>

        {/* Body */}
        <div
          className="relative grid"
          style={{ gridTemplateColumns: gridTemplate, height: bodyHeight }}
        >
          {/* Hour gutter */}
          <div className="relative">
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

          {rooms.map((room) => {
            const creating =
              drag?.kind === "range" && drag.roomId === room.id ? drag : null;
            const moving = drag?.kind === "move" && drag.moved ? drag : null;
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
                style={{ boxShadow: "inset 1px 0 0 var(--hair-soft)" }}
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
                      boxShadow: "inset 0 1px 0 var(--hair-soft)",
                    }}
                  >
                    <div
                      className="absolute w-full"
                      style={{
                        top: rowHeight / 2,
                        boxShadow: "inset 0 1px 0 rgba(68,88,121,0.05)",
                      }}
                    />
                  </div>
                ))}

                {/*
                 * Drag surface for a new span. It sits under the blocks so
                 * pressing one of those picks the block up instead, but pointer
                 * capture means a sweep that starts on empty space may run
                 * straight over them. Touch is left alone: taking the gesture
                 * would cost the page its vertical scroll, so a tap picks a
                 * single step instead.
                 */}
                {onRangeSelect && (
                  <div
                    className="absolute inset-0"
                    style={{ cursor: "cell", touchAction: "pan-y" }}
                    onPointerDown={(e) => {
                      if (e.pointerType === "touch" || e.button !== 0) return;
                      measureColumns();
                      const at = stepFromTop(
                        e.clientY,
                        e.currentTarget.getBoundingClientRect().top,
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
                      const at = stepFromTop(
                        e.clientY,
                        e.currentTarget.getBoundingClientRect().top,
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
                          e.currentTarget.getBoundingClientRect().top,
                        );
                        onRangeSelect(rangeOf(room.id, at, at));
                      }
                    }}
                    onPointerCancel={() => setDrag(null)}
                  />
                )}

                {(byRoom.get(room.id) ?? []).map((event) => {
                  const from = decimalHour(event.start, timeZone);
                  const to = decimalHour(event.end, timeZone);
                  const live = event.start <= now && now < event.end;
                  const beingMoved =
                    moving?.event?.occurrenceId === event.occurrenceId;
                  return (
                    <button
                      key={event.occurrenceId}
                      type="button"
                      onClick={() => {
                        // The release that ended a move also fires a click.
                        if (movedRef.current) {
                          movedRef.current = false;
                          return;
                        }
                        onEventClick?.(event);
                      }}
                      onPointerDown={(e) => {
                        if (
                          !onEventMove ||
                          e.pointerType === "touch" ||
                          e.button !== 0
                        ) {
                          return;
                        }
                        measureColumns();
                        const first = stepOf(from);
                        const length = Math.max(
                          1,
                          Math.round((to - from) / step),
                        );
                        beginDrag(
                          {
                            kind: "move",
                            event,
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
                      }}
                      {...(onEventMove ? dragHandlers : {})}
                      className="plr-clip absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1.5 text-left"
                      style={{
                        top: (from - startHour) * rowHeight + 2,
                        height: Math.max(22, (to - from) * rowHeight - 4),
                        background: live
                          ? "rgba(220,56,72,0.10)"
                          : "var(--card-soft)",
                        boxShadow: live
                          ? "inset 0 0 0 1px var(--red)"
                          : "inset 0 0 0 1px var(--card-ring)",
                        opacity: beingMoved ? 0.35 : 1,
                        touchAction: "pan-y",
                        cursor: onEventMove
                          ? drag?.kind === "move"
                            ? "grabbing"
                            : "grab"
                          : onEventClick
                            ? "pointer"
                            : "default",
                      }}
                    >
                      <span className="text-title block truncate text-[12px] leading-tight font-semibold">
                        {event.title}
                      </span>
                      {event.subtitle && to - from >= 0.75 && (
                        <span className="text-muted block truncate text-[11px]">
                          {event.subtitle}
                        </span>
                      )}
                    </button>
                  );
                })}

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
                            if (e.pointerType === "touch" || e.button !== 0) {
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
                            if (e.pointerType === "touch" || e.button !== 0) {
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
                left: GUTTER,
                top: (nowHour - startHour) * rowHeight,
              }}
            >
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: "var(--red)", marginLeft: -3.5 }}
              />
              <span
                className="h-[2px] flex-1"
                style={{ background: "var(--red)" }}
              />
            </div>
          )}
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
          className="pointer-events-auto absolute inset-0"
          style={{
            cursor: grabbing ? "grabbing" : "grab",
            touchAction: "none",
          }}
          onPointerDown={onBodyDown}
          {...dragHandlers}
        />
      )}

      {roomForLabel && (
        <span
          className="pointer-events-none relative block truncate text-center font-mono text-[10.5px] leading-[15px] font-bold"
          style={{
            color: tone === "pending" ? "var(--slate)" : "var(--faint)",
          }}
        >
          {tone === "pending" ? label : "+ book"}
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

/** The grab bar on one edge of a chosen span. */
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
      className="pointer-events-auto absolute inset-x-0 flex items-center justify-center"
      style={{
        [edge === "start" ? "top" : "bottom"]: 0,
        height,
        cursor: "ns-resize",
        touchAction: "none",
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
