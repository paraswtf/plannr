"use client";

import { useId, useLayoutEffect, useRef, type CSSProperties } from "react";

import { useSteps } from "~/deck/useSteps";

import { LAYOUT, MRBS_CSS, mrbsHtml, VIEW } from "./_mrbs-snapshot";

/**
 * The root cause, as a picture: the college's timetable page, printed and
 * pinned to a notice board like the green felt ones in every corridor. The
 * page is the same copy of time-table.sicsr.ac.in as on the intro slide (see
 * _mrbs-snapshot.ts), drawn in a shadow root and shrunk onto a sheet of paper.
 *
 * Builds: on step 1 the sheet is put on the board and pinned at its corners.
 * It is made to be IssueWall's root cause, which brings the board itself in
 * on that step.
 */

/** The board, in canvas pixels, and its aluminium frame. */
const BOARD = { width: 1040, height: 660 } as const;
const FRAME = 20;
/** The plastic caps over the frame's corners: their arms, and how thick. */
const CAP = { arm: 60, thick: 30 } as const;

/** The printout: the page down to its last line, on paper with a margin. */
const PAGE = { width: VIEW.width, height: LAYOUT.end + 9 } as const;
const MARGIN = 12;
/** Canvas pixels per page pixel. */
const K = 500 / PAGE.height;
const SHEET = {
  width: Math.round(PAGE.width * K + MARGIN * 2),
  height: Math.round(PAGE.height * K + MARGIN * 2),
} as const;
/** Pinned by hand, so a little askew. */
const TILT = -1.2;
/** How far in from each corner a pin goes through the paper. */
const PIN_IN = 15;
const PINS = [
  { x: PIN_IN, y: PIN_IN },
  { x: SHEET.width - PIN_IN, y: PIN_IN },
  { x: PIN_IN, y: SHEET.height - PIN_IN },
  { x: SHEET.width - PIN_IN, y: SHEET.height - PIN_IN },
] as const;

/** The sheet's shadow while it is held, and once it lies flat on the felt. */
const HELD =
  "0px 26px 40px rgba(10, 30, 24, 0.34), 0px 8px 14px rgba(10, 30, 24, 0.2)";
const FLAT =
  "0px 5px 12px rgba(10, 30, 24, 0.34), 0px 1px 2px rgba(10, 30, 24, 0.3)";

let html: string | null = null;

export function NoticeBoard({ step }: { step: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const id = useId().replace(/[^\w-]/g, "");

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    html ??= mrbsHtml();
    root.innerHTML = `<style>${MRBS_CSS}</style>${html}`;
  }, []);

  useSteps(ref, step, (tl, mark) => {
    // Brought up to the board by hand, from a little above and nearer...
    const at = 0.95;
    tl.fromTo(
      ".nb-sheet",
      { y: -110, scale: 1.08, rotation: TILT - 5, boxShadow: HELD },
      {
        y: 0,
        scale: 1,
        rotation: TILT,
        boxShadow: FLAT,
        duration: 0.9,
        ease: "deck.morph",
        immediateRender: true,
      },
      at,
    );
    tl.fromTo(
      ".nb-sheet",
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: "power1.out", immediateRender: true },
      at,
    );
    // ...then pinned, one corner after another: each pin pushed in, its
    // shadow closing up under it as it goes.
    const pins = ref.current?.querySelectorAll(".nb-pin") ?? [];
    pins.forEach((pin, i) => {
      const t = at + 0.82 + i * 0.13;
      tl.fromTo(
        pin.querySelector(".nb-pin-head"),
        { scale: 1.9, y: -16, opacity: 0 },
        {
          scale: 1,
          y: 0,
          opacity: 1,
          duration: 0.34,
          ease: "back.out(2.6)",
          immediateRender: true,
        },
        t,
      );
      tl.fromTo(
        pin.querySelector(".nb-pin-shadow"),
        { x: 9, y: 12, opacity: 0 },
        {
          x: 0,
          y: 0,
          opacity: 1,
          duration: 0.3,
          ease: "power2.out",
          immediateRender: true,
        },
        t + 0.04,
      );
    });
    mark();
  });

  return (
    <div
      ref={ref}
      role="img"
      aria-label="The timetable page, printed and pinned to a notice board"
      className="relative"
      style={{ width: BOARD.width, height: BOARD.height }}
    >
      {/* The aluminium frame: four rails, each lit across its profile. */}
      <div
        className="absolute inset-0 rounded-md"
        style={{ boxShadow: "var(--shadow-2)" }}
      />
      <Rail side="top" />
      <Rail side="bottom" />
      <Rail side="left" />
      <Rail side="right" />

      {/* The felt, set back under the frame */}
      <div
        className="absolute overflow-hidden"
        style={{
          inset: FRAME,
          background:
            "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.07) 0 1px, transparent 1px 3px), #1d5c4a",
          boxShadow:
            "inset 0 3px 9px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(0, 0, 0, 0.3)",
        }}
      >
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full"
          style={{ mixBlendMode: "overlay", opacity: 0.55 }}
        >
          <filter id={`nb-felt-${id}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves={3}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#nb-felt-${id})`} />
        </svg>
      </div>

      {/* The printout, pinned */}
      <div
        className="absolute"
        style={{
          left: (BOARD.width - SHEET.width) / 2,
          top: (BOARD.height - SHEET.height) / 2,
          width: SHEET.width,
          height: SHEET.height,
        }}
      >
        <div
          className="nb-sheet absolute inset-0 bg-white"
          style={{ boxShadow: FLAT, transform: `rotate(${TILT}deg)` }}
        >
          <div className="absolute overflow-hidden" style={{ inset: MARGIN }}>
            <div
              className="absolute top-0 left-0"
              style={{
                width: PAGE.width,
                height: PAGE.height,
                transform: `scale(${K})`,
                transformOrigin: "0 0",
              }}
            >
              <div ref={host} aria-hidden inert className="absolute inset-0" />
            </div>
          </div>
          {PINS.map((pin, i) => (
            <Pin key={i} x={pin.x} y={pin.y} id={`${id}-${i}`} />
          ))}
        </div>
      </div>

      <Cap corner="tl" id={id} />
      <Cap corner="tr" id={id} />
      <Cap corner="bl" id={id} />
      <Cap corner="br" id={id} />
    </div>
  );
}

type Side = "top" | "bottom" | "left" | "right";

/** Where each rail lies, and which way its profile runs (outer edge first). */
const RAILS: Record<Side, { box: CSSProperties; across: string }> = {
  top: { box: { left: 0, right: 0, top: 0, height: FRAME }, across: "180deg" },
  bottom: {
    box: { left: 0, right: 0, bottom: 0, height: FRAME },
    across: "0deg",
  },
  left: { box: { top: 0, bottom: 0, left: 0, width: FRAME }, across: "90deg" },
  right: {
    box: { top: 0, bottom: 0, right: 0, width: FRAME },
    across: "270deg",
  },
};

/** One side of the frame: brushed aluminium, lit from above. */
function Rail({ side }: { side: Side }) {
  const { box, across } = RAILS[side];
  // From the outer edge in: a bright lip, the face, a darker inner edge.
  const profile =
    side === "bottom"
      ? "#e9ecef, #cdd2d8 55%, #b9bfc6"
      : "#fbfcfd, #dfe3e7 55%, #c4cad1";
  return (
    <div
      className="absolute"
      style={{
        ...box,
        background: `linear-gradient(${across}, ${profile})`,
        boxShadow: "inset 0 0 0 1px rgba(40, 52, 68, 0.12)",
      }}
    />
  );
}

/** A grey plastic cap over one corner of the frame. */
function Cap({
  corner,
  id,
}: {
  corner: "tl" | "tr" | "bl" | "br";
  id: string;
}) {
  const { arm, thick } = CAP;
  const flip = {
    tl: "none",
    tr: "scaleX(-1)",
    bl: "scaleY(-1)",
    br: "scale(-1, -1)",
  }[corner];
  const place = {
    tl: { left: -3, top: -3 },
    tr: { right: -3, top: -3 },
    bl: { left: -3, bottom: -3 },
    br: { right: -3, bottom: -3 },
  }[corner];
  return (
    <svg
      aria-hidden
      className="absolute"
      width={arm}
      height={arm}
      viewBox={`0 0 ${arm} ${arm}`}
      style={{ ...place, transform: flip, overflow: "visible" }}
    >
      <defs>
        <linearGradient
          id={`nb-cap-${id}-${corner}`}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0" stopColor="#c3c6cb" />
          <stop offset="0.55" stopColor="#a2a6ac" />
          <stop offset="1" stopColor="#8d9298" />
        </linearGradient>
      </defs>
      <path
        d={`M0,14 Q0,0 14,0 L${arm},0 L${arm},${thick - 6} Q${arm},${thick} ${arm - 8},${thick} L${thick + 10},${thick} Q${thick},${thick} ${thick},${thick + 10} L${thick},${arm - 8} Q${thick},${arm} ${thick - 6},${arm} L0,${arm} Z`}
        fill={`url(#nb-cap-${id}-${corner})`}
        stroke="rgba(40, 46, 56, 0.28)"
        strokeWidth={1}
        style={{ filter: "drop-shadow(0 2px 2px rgba(0, 0, 0, 0.22))" }}
      />
    </svg>
  );
}

/** A push pin, seen from the front: a glossy head and its shadow. */
function Pin({ x, y, id }: { x: number; y: number; id: string }) {
  return (
    <span
      className="nb-pin absolute"
      style={{ left: x - 15, top: y - 15, width: 30, height: 30 }}
    >
      <span
        className="nb-pin-shadow absolute rounded-full"
        style={{
          left: 9,
          top: 12,
          width: 22,
          height: 15,
          background: "rgba(16, 20, 28, 0.36)",
          filter: "blur(2.5px)",
        }}
      />
      <svg
        aria-hidden
        className="nb-pin-head absolute inset-0"
        viewBox="0 0 30 30"
      >
        <defs>
          <radialGradient id={`nb-pin-${id}`} cx="0.38" cy="0.34" r="0.7">
            <stop offset="0" stopColor="#f2a3bb" />
            <stop offset="0.38" stopColor="#c8305f" />
            <stop offset="1" stopColor="#7d1a3a" />
          </radialGradient>
        </defs>
        <circle cx="15" cy="15" r="11.5" fill={`url(#nb-pin-${id})`} />
        <ellipse
          cx="11.4"
          cy="10.6"
          rx="3.6"
          ry="2.4"
          fill="#ffffff"
          opacity={0.6}
        />
      </svg>
    </span>
  );
}
