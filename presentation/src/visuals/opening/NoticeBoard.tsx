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
 * The materials are drawn, not photographed: woven felt lit from the top
 * left and dotted with the holes of notices long gone, brushed aluminium
 * rails, moulded plastic corner caps, paper with a grain the print sits in,
 * and glossy push pins. The textures are SVG noise baked into images, so they
 * are painted once and only move with the board.
 *
 * Builds: on step 1 the sheet is put on the board and pinned at its corners.
 * It is made to be IssueWall's root cause, which brings the board itself in
 * on that step.
 */

/** The board, in canvas pixels, and its aluminium frame. */
const BOARD = { width: 1040, height: 660 } as const;
const FRAME = 20;
const FELT = {
  width: BOARD.width - FRAME * 2,
  height: BOARD.height - FRAME * 2,
} as const;
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

/** Everything is lit from the top left, the way the light falls on a wall. */
const LIGHT = 225;

/* ------------------------------ textures ------------------------------- */

/** An SVG as a CSS image, so the browser paints it once and keeps it. */
const image = (svg: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** The same pseudo-random numbers on every load (mulberry32). */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where earlier notices were pinned: four holes at the corners of each (some
 * were only ever pinned along the top), and a few strays.
 */
function oldHoles() {
  const r = random(20261006);
  const holes: [number, number][] = [];
  for (let n = 0; n < 12; n++) {
    const w = 120 + r() * 250;
    const h = 90 + r() * 210;
    const x = 16 + r() * (FELT.width - w - 32);
    const y = 16 + r() * (FELT.height - h - 32);
    const corners: [number, number][] = [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ];
    const kept = r() < 0.3 ? 2 : 4;
    for (const [cx, cy] of corners.slice(0, kept))
      holes.push([cx + (r() - 0.5) * 5, cy + (r() - 0.5) * 5]);
  }
  for (let n = 0; n < 18; n++)
    holes.push([12 + r() * (FELT.width - 24), 12 + r() * (FELT.height - 24)]);
  return holes;
}
const HOLES = oldHoles();

/**
 * The felt: fine fibres laid along the rows of the weave, bump-lit so they
 * catch the light, dyed green, a little uneven in tone across the board, and
 * pricked with old pin holes.
 */
const FELT_TEXTURE =
  image(`<svg xmlns="http://www.w3.org/2000/svg" width="${FELT.width}" height="${FELT.height}">
<filter id="f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.55 1.5" numOctaves="3" seed="4" result="fibre"/>
<feDiffuseLighting in="fibre" surfaceScale="1.25" diffuseConstant="1.12" lighting-color="#ffffff" result="lit"><feDistantLight azimuth="${LIGHT}" elevation="52"/></feDiffuseLighting>
<feFlood flood-color="#287159" result="dye"/>
<feBlend in="lit" in2="dye" mode="multiply" result="cloth"/>
<feTurbulence type="fractalNoise" baseFrequency="0.005 0.008" numOctaves="2" seed="11" result="slow"/>
<feColorMatrix in="slow" type="matrix" values="0.3 0 0 0 0.82  0.3 0 0 0 0.82  0.3 0 0 0 0.82  0 0 0 0 1" result="tone"/>
<feBlend in="cloth" in2="tone" mode="multiply"/>
</filter>
<rect width="100%" height="100%" filter="url(#f)"/>
<g fill="#ffffff" fill-opacity="0.09">${HOLES.map(
    ([x, y]) =>
      `<circle cx="${(x + 0.4).toFixed(1)}" cy="${(y + 0.9).toFixed(1)}" r="1.5"/>`,
  ).join("")}</g>
<g fill="#04140e" fill-opacity="0.7">${HOLES.map(
    ([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.05"/>`,
  ).join("")}</g>
</svg>`);

/**
 * Brushing on aluminium: long, fine streaks along a rail. `along` is the
 * axis the rail runs on; the tile repeats along it.
 */
function brushed(along: "x" | "y") {
  const [w, h] = along === "x" ? [640, 24] : [24, 640];
  const frequency = along === "x" ? "0.003 0.95" : "0.95 0.003";
  return image(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<filter id="b" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="2" seed="2" stitchTiles="stitch"/>
<feColorMatrix type="matrix" values="0.9 0 0 0 0.05  0.9 0 0 0 0.05  0.9 0 0 0 0.05  0 0 0 0 1"/>
</filter>
<rect width="100%" height="100%" filter="url(#b)"/>
</svg>`);
}
const BRUSHED = { x: brushed("x"), y: brushed("y") };

/** Paper: an even, fine grain, nearly white, laid over the print. */
const PAPER_GRAIN =
  image(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
<filter id="p" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="8" stitchTiles="stitch"/>
<feColorMatrix type="matrix" values="-0.1 0 0 0 1  -0.1 0 0 0 1  -0.1 0 0 0 1  0 0 0 0 1"/>
</filter>
<rect width="100%" height="100%" filter="url(#p)"/>
</svg>`);

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
      { y: -110, scale: 1.08, rotation: TILT - 5 },
      {
        y: 0,
        scale: 1,
        rotation: TILT,
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
    // ...its shadow drawing in under it as it comes to lie on the felt...
    tl.fromTo(
      ".nb-shadow-held",
      { opacity: 1 },
      { opacity: 0, duration: 0.9, ease: "deck.morph", immediateRender: true },
      at,
    );
    tl.fromTo(
      ".nb-shadow-flat",
      { opacity: 0 },
      { opacity: 1, duration: 0.9, ease: "deck.morph", immediateRender: true },
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
      tl.fromTo(
        pin.querySelector(".nb-pin-dimple"),
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.25,
          ease: "power2.out",
          immediateRender: true,
        },
        t + 0.1,
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
      {/* Hung on the wall: a soft shadow, and a tighter one where it nearly touches */}
      <div
        className="absolute inset-0 rounded-md"
        style={{
          boxShadow:
            "var(--shadow-2), 0px 2px 3px rgba(16, 24, 40, 0.14), 0px 10px 16px -8px rgba(16, 24, 40, 0.22)",
        }}
      />

      {/* The felt, set back under the frame */}
      <div
        className="absolute overflow-hidden"
        style={{
          inset: FRAME,
          backgroundColor: "#1d5c4a",
          backgroundImage: FELT_TEXTURE,
          backgroundSize: "100% 100%",
        }}
      >
        {/*
          The rows of the weave; the room's light falling off across the
          board; and the frame's lip shading the felt along its top and left
          edges.
        */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.09) 0px 1px, rgba(0, 0, 0, 0) 1px 3px), linear-gradient(150deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0) 40%, rgba(0, 0, 0, 0.1) 100%)",
            boxShadow:
              "inset 0 6px 7px -3px rgba(0, 0, 0, 0.55), inset 5px 0 6px -3px rgba(0, 0, 0, 0.45), inset 0 -3px 4px -2px rgba(0, 0, 0, 0.3), inset -3px 0 4px -2px rgba(0, 0, 0, 0.3)",
          }}
        />
      </div>

      <Rail side="top" />
      <Rail side="bottom" />
      <Rail side="left" />
      <Rail side="right" />

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
          className="nb-sheet absolute inset-0"
          style={{ transform: `rotate(${TILT}deg)`, willChange: "transform" }}
        >
          <div
            className="nb-shadow-held absolute inset-0"
            style={{ boxShadow: HELD, opacity: 0 }}
          />
          <div
            className="nb-shadow-flat absolute inset-0"
            style={{ boxShadow: FLAT }}
          />
          <div className="absolute inset-0 bg-white" />
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
          <Paper />
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

/**
 * The paper itself, over the print: its grain, and a sheet that never lies
 * quite flat (a little brighter where it faces the light, a little darker
 * towards the foot). Multiplied in, so it darkens the ink and the white
 * alike, as paper does.
 */
function Paper() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: [
          "linear-gradient(168deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.025) 50%, rgba(0, 0, 0, 0.07) 100%)",
          PAPER_GRAIN,
        ].join(", "),
        boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.06)",
        mixBlendMode: "multiply",
      }}
    />
  );
}

type Side = "top" | "bottom" | "left" | "right";

/**
 * Each rail of the frame: where it lies, which way its profile runs (outer
 * edge first), and the profile itself, an extrusion's bright lip, its face,
 * the step down, and the dark edge against the felt. The top faces the
 * light; the bottom faces away from it.
 */
const RAILS: Record<
  Side,
  { box: CSSProperties; across: string; along: "x" | "y"; profile: string }
> = {
  top: {
    box: { left: 0, right: 0, top: 0, height: FRAME },
    across: "180deg",
    along: "x",
    profile:
      "#e6e9ec 0px, #fdfdfe 2px, #eef0f2 6px, #d3d7dc 11px, #c1c6cd 15px, #e2e5e8 18px, #8a919a 20px",
  },
  bottom: {
    box: { left: 0, right: 0, bottom: 0, height: FRAME },
    across: "0deg",
    along: "x",
    profile:
      "#c9cdd2 0px, #e1e4e8 2px, #d4d8dc 6px, #babfc6 11px, #a8afb7 15px, #c7ccd2 18px, #7b838d 20px",
  },
  left: {
    box: { top: 0, bottom: 0, left: 0, width: FRAME },
    across: "90deg",
    along: "y",
    profile:
      "#dfe2e6 0px, #f7f8f9 2px, #e5e8eb 6px, #cbd0d6 11px, #bac0c7 15px, #d6dadf 18px, #848b95 20px",
  },
  right: {
    box: { top: 0, bottom: 0, right: 0, width: FRAME },
    across: "270deg",
    along: "y",
    profile:
      "#d4d8dc 0px, #e9ecee 2px, #dcdfe3 6px, #c3c8ce 11px, #b1b7bf 15px, #cdd2d7 18px, #7f8790 20px",
  },
};

/**
 * One side of the frame: brushed aluminium. Over the profile, the brushing,
 * and the window's reflection sliding along the metal in two soft bands.
 */
function Rail({ side }: { side: Side }) {
  const { box, across, along, profile } = RAILS[side];
  const length = along === "x" ? "90deg" : "180deg";
  return (
    <div
      className="absolute"
      style={{
        ...box,
        backgroundImage: [
          BRUSHED[along],
          `linear-gradient(${length}, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.5) 22%, rgba(255, 255, 255, 0) 46%, rgba(255, 255, 255, 0.3) 74%, rgba(255, 255, 255, 0) 100%)`,
          `linear-gradient(${across}, ${profile})`,
        ].join(", "),
        backgroundSize:
          along === "x"
            ? "640px 100%, 100% 100%, 100% 100%"
            : "100% 640px, 100% 100%, 100% 100%",
        backgroundRepeat:
          along === "x"
            ? "repeat-x, no-repeat, no-repeat"
            : "repeat-y, no-repeat, no-repeat",
        backgroundBlendMode: "soft-light, soft-light, normal",
      }}
    />
  );
}

type Corner = "tl" | "tr" | "bl" | "br";

/**
 * A cap's outline, drawn for its corner rather than mirrored into place, so
 * the light and the shadow fall the same way on all four.
 */
function capPath(corner: Corner) {
  const { arm, thick } = CAP;
  const right = corner === "tr" || corner === "br";
  const bottom = corner === "bl" || corner === "br";
  const p = (x: number, y: number) =>
    `${right ? arm - x : x},${bottom ? arm - y : y}`;
  return `M${p(0, 14)} Q${p(0, 0)} ${p(14, 0)} L${p(arm, 0)} L${p(arm, thick - 6)} Q${p(arm, thick)} ${p(arm - 8, thick)} L${p(thick + 10, thick)} Q${p(thick, thick)} ${p(thick, thick + 10)} L${p(thick, arm - 8)} Q${p(thick, arm)} ${p(thick - 6, arm)} L${p(0, arm)} Z`;
}

/**
 * A grey plastic cap over one corner of the frame: moulded, so its edges are
 * rounded over (a bevel caught by the light) and its face has the fine matte
 * grain of the mould.
 */
function Cap({ corner, id }: { corner: Corner; id: string }) {
  const { arm } = CAP;
  const place = {
    tl: { left: -3, top: -3 },
    tr: { right: -3, top: -3 },
    bl: { left: -3, bottom: -3 },
    br: { right: -3, bottom: -3 },
  }[corner];
  const key = `nb-cap-${id}-${corner}`;
  return (
    <svg
      aria-hidden
      className="absolute"
      width={arm}
      height={arm}
      viewBox={`0 0 ${arm} ${arm}`}
      style={{ ...place, overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`${key}-fill`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#babdc2" />
          <stop offset="0.5" stopColor="#a1a5ab" />
          <stop offset="1" stopColor="#8a8f95" />
        </linearGradient>
        <filter
          id={`${key}-mould`}
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          {/* The rounded edge, read from the outline */}
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="edge" />
          <feSpecularLighting
            in="edge"
            surfaceScale="3"
            specularConstant="0.75"
            specularExponent="14"
            lightingColor="#ffffff"
            result="lit"
          >
            <feDistantLight azimuth={LIGHT} elevation="38" />
          </feSpecularLighting>
          <feComposite
            in="lit"
            in2="SourceAlpha"
            operator="in"
            result="sheen"
          />
          {/* The mould's matte grain */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.4"
            numOctaves="2"
            seed="5"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0"
            result="speckle"
          />
          <feComposite
            in="speckle"
            in2="SourceAlpha"
            operator="in"
            result="grain"
          />
          <feMerge result="cap">
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="grain" />
            <feMergeNode in="sheen" />
          </feMerge>
          {/* Standing a little proud of the frame */}
          <feDropShadow
            dx="0.8"
            dy="1.6"
            stdDeviation="1.4"
            floodOpacity="0.3"
          />
        </filter>
      </defs>
      <path
        d={capPath(corner)}
        fill={`url(#${key}-fill)`}
        stroke="rgba(40, 46, 56, 0.3)"
        strokeWidth={0.8}
        filter={`url(#${key}-mould)`}
      />
    </svg>
  );
}

/**
 * A push pin, seen from the front: a glossy plastic head, with a sharp
 * highlight where it faces the light, a softer sheen round it, the room
 * reflected faintly in its lower edge, and two shadows, a tight one where it
 * meets the paper and a softer one cast further off.
 */
function Pin({ x, y, id }: { x: number; y: number; id: string }) {
  return (
    <span
      className="nb-pin absolute"
      style={{ left: x - 15, top: y - 15, width: 30, height: 30 }}
    >
      {/* The paper dented round the pin, once it is pushed in */}
      <span
        className="nb-pin-dimple absolute rounded-full"
        style={{
          left: -5,
          top: -5,
          width: 40,
          height: 40,
          background:
            "radial-gradient(circle, rgba(0, 0, 0, 0.16) 0px, rgba(0, 0, 0, 0.06) 8px, rgba(0, 0, 0, 0) 20px)",
        }}
      />
      <span className="nb-pin-shadow absolute inset-0">
        <span
          className="absolute rounded-full"
          style={{
            left: 11,
            top: 13,
            width: 24,
            height: 16,
            background: "rgba(12, 16, 24, 0.26)",
            filter: "blur(3.5px)",
          }}
        />
        <span
          className="absolute rounded-full"
          style={{
            left: 7,
            top: 9,
            width: 19,
            height: 15,
            background: "rgba(12, 16, 24, 0.42)",
            filter: "blur(1.2px)",
          }}
        />
      </span>
      <svg
        aria-hidden
        className="nb-pin-head absolute inset-0"
        viewBox="0 0 30 30"
      >
        <defs>
          <radialGradient id={`nb-pin-${id}`} cx="0.36" cy="0.32" r="0.72">
            <stop offset="0" stopColor="#ff9fbd" />
            <stop offset="0.3" stopColor="#d6416f" />
            <stop offset="0.68" stopColor="#b42955" />
            <stop offset="1" stopColor="#6c1230" />
          </radialGradient>
          <radialGradient id={`nb-pin-spot-${id}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="15" cy="15" r="11.5" fill={`url(#nb-pin-${id})`} />
        {/* The room, faint in the lower edge */}
        <path
          d="M23.8,17.6 A9.6,9.6 0 0 1 16.6,24.4"
          fill="none"
          stroke="#ffc2d4"
          strokeOpacity={0.4}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
        <circle
          cx="15"
          cy="15"
          r="11.2"
          fill="none"
          stroke="#4f0b22"
          strokeOpacity={0.45}
          strokeWidth={0.7}
        />
        <ellipse
          cx="12.4"
          cy="11.4"
          rx="6.2"
          ry="4.4"
          fill="#ffffff"
          opacity={0.16}
        />
        <ellipse
          cx="11.2"
          cy="10.2"
          rx="3.4"
          ry="2.4"
          fill={`url(#nb-pin-spot-${id})`}
          transform="rotate(-28 11.2 10.2)"
        />
      </svg>
    </span>
  );
}
