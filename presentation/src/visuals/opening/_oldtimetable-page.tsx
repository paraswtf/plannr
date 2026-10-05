"use client";

import { useId, useLayoutEffect, useRef } from "react";

import {
  cellRect,
  LAYOUT,
  MRBS_CSS,
  mrbsHtml,
  PINNED,
  VIEW,
} from "./_mrbs-snapshot";

/**
 * The page inside OldTimetable's browser: the college's timetable page itself
 * (see _mrbs-snapshot.ts), laid out in a 1440px window and scaled down to fit
 * this one. It lives in a shadow root, so none of the deck's styles reach it
 * and it renders exactly as the site does. Hover works as it does there: a
 * booking's full name and faculty come up in the browser's own tooltip, and
 * the slot under the pointer and its time go pink.
 *
 * Classes carry the hooks OldTimetable animates:
 *   .ot-page (the page, revealed top-down as it loads, see PAINT),
 *   .ot-progress, .ot-status (with .ot-status-wait / .ot-status-data),
 *   .ot-dim (with its .ot-hole-<id> openings, see HOLES)
 */

export { VIEW };

/** The browser's content area on the slide: the frame is 800 tall, its bar 52. */
export const CONTENT = { width: 940, height: 748 } as const;

/** Page pixels to canvas pixels. */
export const SCALE = CONTENT.width / VIEW.width;

/** A box in page pixels. */
export interface PageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The parts of the page a callout rings, in page pixels. Under the callouts
 * the page is washed back, except through these, which OldTimetable opens
 * (`.ot-hole-<callout id>`) as each callout lands.
 */
export const HOLES = [
  {
    // The row of rooms, from the first to the table's edge.
    id: "one-page",
    x: LAYOUT.roomsLeft,
    y: LAYOUT.tableTop,
    w: LAYOUT.tableRight - LAYOUT.roomsLeft,
    h: LAYOUT.headBottom - LAYOUT.tableTop,
  },
  // A booking whose name runs out of room before it reaches the faculty.
  { id: "tiny-type", ...cellRect(PINNED.room, PINNED.start) },
  // The colour key: every division in the college, on every visit.
  { id: "loads-all", ...LAYOUT.colour },
] as const satisfies readonly (PageRect & { id: string })[];

/**
 * How far down the page has painted at each moment of the load, in page
 * pixels: the banner, the calendars and title, the room names, the rows of
 * the table a few at a time, then the rest.
 */
export const PAINT = [
  LAYOUT.bannerBottom,
  LAYOUT.tableTop,
  LAYOUT.headBottom,
  ...[2, 3, 5, 8, 9, 12, 14, 15, 18, 21, 23, 26, 27].map(
    (rows) => LAYOUT.headBottom + rows * LAYOUT.rowH,
  ),
  VIEW.height,
] as const;

let html: string | null = null;

export function MrbsPage() {
  const host = useRef<HTMLDivElement>(null);
  const maskId = `ot-wash-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    html ??= mrbsHtml();
    root.innerHTML = `<style>${MRBS_CSS}</style>${html}`;
    // A copy, not the site: nothing in it navigates, submits, opens or takes
    // the keyboard from the deck. Hover is all it answers to.
    root
      .querySelectorAll("input, select")
      .forEach((field) => field.setAttribute("tabindex", "-1"));
    const block = (e: Event) => e.preventDefault();
    const kinds = ["click", "auxclick", "mousedown", "submit", "dragstart"];
    kinds.forEach((kind) => root.addEventListener(kind, block));
    return () => kinds.forEach((kind) => root.removeEventListener(kind, block));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-white">
      <div
        className="absolute top-0 left-0"
        style={{
          width: VIEW.width,
          height: VIEW.height,
          transform: `scale(${SCALE})`,
          transformOrigin: "0 0",
        }}
      >
        {/* A picture of a page, to the screen reader; to the pointer, the page. */}
        <div
          ref={host}
          aria-hidden
          className="ot-page absolute inset-0"
          style={{ clipPath: "inset(0px 0px 100% 0px)" }}
        />

        {/*
          Washes the page back towards the stage under the callouts, with a
          hole for each thing a callout rings, so what it points at stays in
          full colour while the rest of the page steps back.
        */}
        <svg
          className="ot-dim pointer-events-none absolute inset-0"
          width={VIEW.width}
          height={VIEW.height}
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          style={{ opacity: 0 }}
          aria-hidden
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <rect width={VIEW.width} height={VIEW.height} fill="#fff" />
              {HOLES.map((h) => (
                <rect
                  key={h.id}
                  className={`ot-hole-${h.id}`}
                  x={h.x - 3}
                  y={h.y - 3}
                  width={h.w + 6}
                  height={h.h + 6}
                  rx={6}
                  fill="#000"
                  style={{ opacity: 0 }}
                />
              ))}
            </mask>
          </defs>
          <rect
            width={VIEW.width}
            height={VIEW.height}
            fill="#f2f3f6"
            fillOpacity={0.66}
            mask={`url(#${maskId})`}
          />
        </svg>
      </div>

      {/* Loading: the blue strip under the address bar, and the status bubble */}
      <div
        className="ot-progress absolute top-0 left-0"
        style={{
          height: 3,
          width: CONTENT.width,
          background: "#1a73e8",
          transformOrigin: "0 50%",
          transform: "scaleX(0)",
        }}
      />
      <div
        className="ot-status absolute"
        style={{
          left: 0,
          bottom: 0,
          padding: "3px 8px",
          background: "#f2f2f2",
          color: "#333",
          fontFamily: "-apple-system, system-ui, sans-serif",
          fontSize: 12,
          boxShadow: "inset 0 0 0 1px #c9c9c9",
          borderTopRightRadius: 4,
          opacity: 0,
        }}
      >
        <span className="ot-status-wait">
          Waiting for time-table.sicsr.ac.in…
        </span>
        <span className="ot-status-data" style={{ display: "none" }}>
          Transferring data from time-table.sicsr.ac.in…
        </span>
      </div>
    </div>
  );
}
