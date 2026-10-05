"use client";

import { useId, useLayoutEffect, useRef } from "react";

import { PHONE_BODY, PHONE_SCREEN } from "~/ui/frames";

import {
  cellRect,
  LAYOUT,
  MRBS_CSS,
  mrbsHtml,
  PHONE_LAYOUT,
  PINNED,
  VIEW,
} from "./_mrbs-snapshot";

/**
 * The page inside OldTimetable's window: the college's timetable page itself
 * (see _mrbs-snapshot.ts), laid out in a browser-sized window and scaled to
 * the slide. It lives in a shadow root, so none of the deck's styles reach it
 * and it renders exactly as the site does. Hover works as it does there: a
 * booking's full name and faculty come up in the browser's own tooltip, and
 * the slot under the pointer and its time go pink.
 *
 * The same page serves the desktop window and the phone it turns into: the
 * window it is laid out in narrows from 1440 to 980 page pixels (a phone's
 * window for a page with no viewport tag) while its scale shrinks, so it
 * really re-flows on the way, the way a page does in a narrowing window.
 *
 * Classes carry the hooks OldTimetable animates:
 *   .ot-scaler (the window the page is laid out in, and its scale),
 *   .ot-page (the page, revealed top-down as it loads, see PAINT),
 *   .ot-dim (the wash, with its .ot-hole-<id> openings),
 *   .ot-ring-<id> (the rings, with .ot-ring-halo and .ot-ring-line inside),
 *   .ot-progress, .ot-status (with .ot-status-wait / .ot-status-data)
 */

export { VIEW };

/** The browser's content area on the slide: the frame is 800 tall, its bar 52. */
export const CONTENT = { width: 940, height: 748 } as const;

/** Page pixels to canvas pixels, in the desktop window. */
export const SCALE = CONTENT.width / VIEW.width;

/** The phone: PhoneFrame's iPhone at 820 canvas pixels tall. */
export const PHONE_K = 820 / PHONE_BODY.height;

/** The status bar the page starts under, in phone pixels. */
export const PHONE_STATUS = 54;

/**
 * How each device shows the page: the window it lays the page out in (page
 * pixels) and canvas pixels per page pixel.
 */
export const DEVICES = {
  desktop: { width: VIEW.width, height: VIEW.height, scale: SCALE },
  phone: {
    width: PHONE_LAYOUT.width,
    scale: (PHONE_SCREEN.width / PHONE_LAYOUT.width) * PHONE_K,
    height:
      (PHONE_SCREEN.height - PHONE_STATUS) *
      (PHONE_LAYOUT.width / PHONE_SCREEN.width),
  },
} as const;
export type Device = keyof typeof DEVICES;

/** A box in page pixels. */
export interface PageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RingId = "one-page" | "tiny-type" | "loads-all";

const roomRow = (l: typeof LAYOUT | typeof PHONE_LAYOUT): PageRect => ({
  x: l.roomsLeft,
  y: l.tableTop,
  w: l.tableRight - l.roomsLeft,
  h: l.headBottom - l.tableTop,
});

/**
 * What each callout rings, on each device, in page pixels: the row of rooms,
 * a booking whose name runs out of room before it reaches the faculty, and
 * the colour key of every division in the college.
 */
export const TARGETS: Record<Device, Record<RingId, PageRect>> = {
  desktop: {
    "one-page": roomRow(LAYOUT),
    "tiny-type": cellRect(PINNED.room, PINNED.start, LAYOUT),
    "loads-all": LAYOUT.colour,
  },
  phone: {
    "one-page": roomRow(PHONE_LAYOUT),
    "tiny-type": cellRect(PINNED.room, PINNED.start, PHONE_LAYOUT),
    "loads-all": PHONE_LAYOUT.colour,
  },
};

/** The room a ring leaves around its target, in canvas pixels. */
export const RING_PAD: Record<RingId, number> = {
  "one-page": 2,
  "tiny-type": 2,
  "loads-all": 3,
};

/**
 * A ring's rectangle, as SVG attributes in page pixels. The padding and the
 * corner are set in canvas pixels, so they read the same at either scale.
 */
export function ringRect(id: RingId, device: Device) {
  const { scale } = DEVICES[device];
  const r = TARGETS[device][id];
  const pad = RING_PAD[id] / scale;
  return {
    x: r.x - pad,
    y: r.y - pad,
    width: r.w + pad * 2,
    height: r.h + pad * 2,
    rx: (device === "desktop" ? 8 : 4) / scale,
  };
}

/** A ring's line and the pale halo under it, 3 and 7 canvas pixels wide. */
export function ringStrokes(device: Device) {
  const { scale } = DEVICES[device];
  return { line: 3 / scale, halo: 7 / scale };
}

/**
 * Where each ring first appears: the row of rooms on the desktop, the other
 * two on the phone. (OldTimetable moves them between the two.)
 */
const FIRST: Record<RingId, Device> = {
  "one-page": "desktop",
  "tiny-type": "phone",
  "loads-all": "phone",
};
const RING_IDS = Object.keys(FIRST) as RingId[];

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

/** The deck's accent, as hex: these are drawn in SVG over the page. */
const ACCENT = "#c8305f";

/** Tall enough to cover the page in either window. */
const WASH = { width: VIEW.width, height: 2000 } as const;

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

  const { width, height, scale } = DEVICES.desktop;
  return (
    <div className="absolute inset-0 overflow-hidden bg-white">
      <div
        className="ot-scaler absolute top-0 left-0"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
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
          className="ot-dim pointer-events-none absolute top-0 left-0"
          width={WASH.width}
          height={WASH.height}
          viewBox={`0 0 ${WASH.width} ${WASH.height}`}
          style={{ opacity: 0 }}
          aria-hidden
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <rect width={WASH.width} height={WASH.height} fill="#fff" />
              {RING_IDS.map((id) => (
                <rect
                  key={id}
                  className={`ot-hole-${id}`}
                  {...ringRect(id, FIRST[id])}
                  fill="#000"
                  style={{ opacity: 0 }}
                />
              ))}
            </mask>
          </defs>
          <rect
            width={WASH.width}
            height={WASH.height}
            fill="#f2f3f6"
            fillOpacity={0.66}
            mask={`url(#${maskId})`}
          />
        </svg>

        {/* The rings, in the page's own pixels so they ride along with it. */}
        <svg
          data-no-enter
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          width={WASH.width}
          height={WASH.height}
          viewBox={`0 0 ${WASH.width} ${WASH.height}`}
          aria-hidden
        >
          {RING_IDS.map((id) => {
            const strokes = ringStrokes(FIRST[id]);
            const rect = ringRect(id, FIRST[id]);
            return (
              <g key={id} className={`ot-ring-${id}`} style={{ opacity: 0 }}>
                <rect
                  className="ot-ring-halo"
                  {...rect}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.9}
                  strokeWidth={strokes.halo}
                />
                <rect
                  className="ot-ring-line"
                  {...rect}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={strokes.line}
                />
              </g>
            );
          })}
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
