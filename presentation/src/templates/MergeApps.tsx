"use client";

import { useId, useRef, type ReactNode } from "react";

import { gsap, MotionPathPlugin } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import {
  APP_TILE,
  GMAIL_M,
  MARK_SIZE,
  MOODLE_CAP,
  MOODLE_M,
  MOODLE_VIEWBOX,
  WHATSAPP,
} from "~/ui/brand-marks";
import type { IconName } from "~/ui/icon";
import { SAFE } from "~/ui/layout";
import { TIMETABLE_MARK, TimetableMarkDetail } from "~/ui/timetable-mark";

import { ACCENT, useEntrance } from "./_closing-motion";

export interface MergeAppsProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  /**
   * The apps people juggle today, left to right. Up to four are drawn; each
   * one's logo is chosen by its icon: a grid or calendar is the timetable
   * site, whatsapp or message is the class group, a cap or book is Moodle, a
   * mail or inbox is Gmail.
   */
  apps: { name: ReactNode; does: ReactNode; icon: IconName }[];
  /** Under the merged mark: "One place. One source of truth." */
  tagline: ReactNode;
  /** 0: the separate apps. 1: they merge into Plannr. Steps = 2. */
  step: number;
}

/*
 * The four shapes of public/logo.svg (167 × 194), in the order the file paints
 * them, with their gradients. The logos below are placed in the same space,
 * so each one morphs into its piece of the mark without moving its frame.
 */
const MARK = [
  {
    d: "M7.6932e-06 122C9.43137e-06 112.059 8.05889 104 18 104L85 104C94.9411 104 103 112.059 103 122L103 176C103 185.941 94.9411 194 85 194L28 194C12.536 194 -2.7038e-06 181.464 0 166L7.6932e-06 122Z",
    from: [4.5, 111],
    to: [43.5, 181.5],
    stops: ["#445879", "#222C3E"],
  },
  {
    d: "M7 16C7 7.16344 14.1634 0 23 0H135C152.673 0 167 14.3269 167 32V37C167 54.6731 152.673 69 135 69H23C14.1634 69 7 61.8366 7 53V16Z",
    from: [25.5, -9.00006],
    to: [158.784, 26.7483],
    stops: ["#DB2D5C", "#701B81"],
  },
  {
    d: "M103 48C103 35.8497 93.1503 26 81 26L58 26C45.8497 26 36 35.8497 36 48C36 48 36 163 36 173C36 183 22.5 191 18.4902 192.344C21.4592 193.416 24.6614 194 28 194L85 194C94.9411 194 103 185.941 103 176L103 48Z",
    from: [61, 194],
    to: [61, 90.5],
    stops: ["#445879", "#212E44"],
  },
  {
    d: "M135 58C152.674 58 167 43.6733 167 26V97C167 114.673 152.674 129 135 129H77C64.8496 129 55 119.15 55 107V80C55 67.8496 64.8496 58 77 58H135Z",
    from: [165, 85],
    to: [114.113, 136.353],
    stops: ["#FEB64F", "#F7286D"],
  },
] as const;

type Glyph = "timetable" | "whatsapp" | "moodle" | "email";

/* Canvas geometry, for up to four tiles in a row. */
const LOCAL = { cx: 84, cy: 97 };
const TILE = 240;
const TILE_Y = 572;
const SPREAD = 360;
const LABEL_W = 340;
const GLYPH_SCALE = 0.8;
/** A tile, in the mark's units: the logos are placed in it as the intro
 * slide's app icons place them in theirs. */
const TILE_LOCAL = {
  size: TILE / GLYPH_SCALE,
  left: LOCAL.cx - TILE / GLYPH_SCALE / 2,
  top: LOCAL.cy - TILE / GLYPH_SCALE / 2,
};
const MARK_H = 330;
const MARK_SCALE = MARK_H / 194;
const MARK_CENTRE = { x: 960, y: 560 };
const MARK_ORIGIN = {
  x: MARK_CENTRE.x - (167 / 2) * MARK_SCALE,
  y: MARK_CENTRE.y - (194 / 2) * MARK_SCALE,
};

/** Tile i of n, centred on the canvas. */
const tileX = (i: number, n: number) => 960 + (i - (n - 1) / 2) * SPREAD;
const startOf = (i: number, n: number) => ({
  x: tileX(i, n) - LOCAL.cx * GLYPH_SCALE,
  y: TILE_Y - LOCAL.cy * GLYPH_SCALE,
  s: GLYPH_SCALE,
});
const transformOf = (t: { x: number; y: number; s: number }) =>
  `translate(${t.x} ${t.y}) scale(${t.s})`;

/* ------------------------------------------------------------------------ */
/* The logos, as parts that morph.                                          */

/** A shape of a logo that travels and becomes a piece of the mark. */
interface Part {
  d: string;
  /** Its fill, as stops along `line` (a flat colour is two equal stops). */
  stops: [offset: number, color: string][];
  line: [x1: number, y1: number, x2: number, y2: number];
  /** Not drawn at rest: it fills an outline mark in as the morph begins. */
  fillIn?: boolean;
}

interface Look {
  /** The tile behind the logo, as the app's own icon has it. */
  tile: string;
  /** The piece of the mark the logo becomes. */
  piece: number;
  parts: Part[];
}

/** A box's placement in the mark's units: scale, then offset. */
interface Placement {
  s: number;
  x: number;
  y: number;
}

/** A path in its own units, carried into the mark's: one part per subpath,
 * so each morphs on its own. */
function placed(d: string, at: Placement): string[] {
  return MotionPathPlugin.stringToRawPath(d).map((segment) => {
    for (let i = 0; i < segment.length; i += 2) {
      segment[i] = (segment[i] ?? 0) * at.s + at.x;
      segment[i + 1] = (segment[i + 1] ?? 0) * at.s + at.y;
    }
    return MotionPathPlugin.rawPathToString([segment]);
  });
}

const flat = (color: string): Part["stops"] => [
  [0, color],
  [1, color],
];

/** Centred in the tile at `width` of it, `box` being the mark's own size. */
function centred(box: { width: number; height: number }, width: number) {
  const s = (TILE_LOCAL.size * width) / box.width;
  return {
    s,
    x: LOCAL.cx - (box.width * s) / 2,
    y: LOCAL.cy - (box.height * s) / 2,
  };
}

/* Where each logo sits, as on the intro slide's app icons (see
 * visuals/opening/_app-icons.tsx). */
const AT_TIMETABLE = centred(TIMETABLE_MARK, MARK_SIZE.timetable);
const AT_GMAIL = centred(GMAIL_M, MARK_SIZE.gmail);
const AT_WHATSAPP = centred({ width: 24, height: 24 }, MARK_SIZE.whatsapp);
const AT_MOODLE = (() => {
  const [vx = 0, vy = 0, vw = 1] = MOODLE_VIEWBOX.split(" ").map(Number);
  const s = TILE_LOCAL.size / vw;
  return { s, x: TILE_LOCAL.left - vx * s, y: TILE_LOCAL.top - vy * s };
})();

/*
 * Which logo becomes which piece: the timetable's window the mark's base, the
 * Gmail M its top bar, the WhatsApp bubble its stem, Moodle's "m" and cap its
 * bright block. Each goes the way its colour already leans: Moodle's orange
 * to the orange block, Gmail's red to the berry bar, the timetable's slate
 * to the slate base.
 */
const LOOKS: Record<Glyph, Look> = {
  timetable: {
    tile: APP_TILE.timetable,
    piece: 0,
    parts: placed(TIMETABLE_MARK.window, AT_TIMETABLE).map((d) => {
      const [x1, y1, x2, y2] = TIMETABLE_MARK.line;
      const at = AT_TIMETABLE;
      return {
        d,
        stops: TIMETABLE_MARK.stops.map(([o, c]) => [o, c] as [number, string]),
        line: [
          x1 * at.s + at.x,
          y1 * at.s + at.y,
          x2 * at.s + at.x,
          y2 * at.s + at.y,
        ] as Part["line"],
      };
    }),
  },
  email: {
    tile: APP_TILE.gmail,
    piece: 1,
    parts: GMAIL_M.parts.flatMap(({ d, stops, line: [x1, y1, x2, y2] }) =>
      placed(d, AT_GMAIL).map((shape) => ({
        d: shape,
        stops:
          stops.length > 1
            ? stops.map(([o, c]) => [o, c] as [number, string])
            : flat(stops[0]?.[1] ?? "#fc413d"),
        line: [
          x1 * AT_GMAIL.s + AT_GMAIL.x,
          y1 * AT_GMAIL.s + AT_GMAIL.y,
          x2 * AT_GMAIL.s + AT_GMAIL.x,
          y2 * AT_GMAIL.s + AT_GMAIL.y,
        ] as Part["line"],
      })),
    ),
  },
  whatsapp: {
    tile: APP_TILE.whatsapp,
    piece: 2,
    parts: [
      {
        // The ring's outer edge, the last of WhatsApp's three subpaths: the
        // bubble, solid, in its own green.
        d: placed(WHATSAPP, AT_WHATSAPP).at(-1) ?? "",
        stops: [
          [0, "#00ec71"],
          [1, "#00db41"],
        ],
        line: [84, 0, 84, 194],
        fillIn: true,
      },
    ],
  },
  moodle: {
    tile: APP_TILE.moodle,
    piece: 3,
    parts: [
      ...placed(MOODLE_CAP, AT_MOODLE).map((d) => ({
        d,
        stops: flat("#333333"),
        line: [84, 0, 84, 194] as Part["line"],
      })),
      ...placed(MOODLE_M, AT_MOODLE).map((d) => ({
        d,
        stops: flat("#f48020"),
        line: [84, 0, 84, 194] as Part["line"],
      })),
    ],
  },
};

const ORDER: Glyph[] = ["timetable", "whatsapp", "moodle", "email"];

function glyphFor(icon: IconName, index: number): Glyph {
  if (icon === "grid" || icon === "calendar") return "timetable";
  if (icon === "whatsapp" || icon === "message") return "whatsapp";
  if (icon === "cap" || icon === "book") return "moodle";
  if (icon === "mail" || icon === "inbox") return "email";
  return ORDER[index % ORDER.length] ?? "timetable";
}

/** A mix of two hex colours, `t` of the way from a to b. */
function mix(a: string, b: string, t: number) {
  const ch = (hex: string, i: number) =>
    parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${out.join("")}`;
}

/**
 * The deck's thesis as one motion: the timetable site, the class WhatsApp
 * group, Moodle and Gmail collapse into a single Plannr mark.
 *
 * Build 0 sets the apps out as their own icons, in their own colours: the
 * same logos the intro slide shows (ui/brand-marks.ts), and the timetable as
 * a small copy of its page. Build 1 lets them go: the tiles slide in and
 * dissolve, the logos travel to the middle, and as they travel each one
 * morphs (MorphSVG) into its piece of the mark, every shape of it changing
 * from its brand's colours into the mark's own gradient on the way (an
 * outline mark, WhatsApp's, first fills in solid). The pieces lock together
 * with a pulse of one accent ring, and the tagline rises underneath.
 */
export function MergeApps({ title, apps, tagline, step }: MergeAppsProps) {
  const root = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shown = apps.slice(0, ORDER.length);
  const n = shown.length;
  const glyphs = shown.map((a, i) => glyphFor(a.icon, i));

  // Each app's logo, painted in the order of the pieces it becomes, so the
  // overlaps at the end are the mark's own.
  const groups = glyphs
    .map((glyph, slot) => ({ glyph, slot, look: LOOKS[glyph] }))
    .sort((a, b) => a.look.piece - b.look.piece);
  // Every part, in paint order, with the piece it ends as and its stops'
  // colours at the end: the piece's gradient, the stops spread over it.
  let next = 0;
  const parts = groups.flatMap(({ look }) =>
    look.parts.map((part) => ({ ...part, piece: look.piece, id: next++ })),
  );
  const stopsAtEnd = parts.flatMap(({ piece, stops }) => {
    const [a, b] = MARK[piece]?.stops ?? MARK[0].stops;
    return stops.map((_, j) => {
      const t = stops.length > 1 ? j / (stops.length - 1) : 0;
      return { offset: t, color: mix(a, b, t) };
    });
  });

  const firstStep = useRef(step).current;
  useEntrance(root, (tl) => {
    if (firstStep > 0) {
      tl.from(".ma-all", { opacity: 0, duration: 0.7, ease: "power1.out" });
      return;
    }
    tl.from(".ma-head-in > *", {
      y: 36,
      opacity: 0,
      duration: 0.9,
      ease: "deck.enter",
      stagger: 0.08,
    });
    shown.forEach((_, i) => {
      const at = 0.3 + i * 0.1;
      tl.from(
        `.ma-tile-in-${i}`,
        { y: 80, opacity: 0, duration: 1, ease: "deck.enter" },
        at,
      );
      tl.from(
        `.ma-enter-${i}`,
        { y: 80, opacity: 0, duration: 1, ease: "deck.enter" },
        at,
      );
      tl.from(
        `.ma-label-in-${i}`,
        { y: 30, opacity: 0, duration: 0.9, ease: "deck.enter" },
        at + 0.18,
      );
    });
  });

  useSteps(
    root,
    step,
    (tl, mark) => {
      const travellers = gsap.utils.toArray<SVGGElement>(
        ".ma-travel",
        root.current,
      );
      const shapes = gsap.utils.toArray<SVGPathElement>(
        ".ma-part",
        root.current,
      );
      tl.addLabel("m");

      // The apps let go: labels drop away, tiles slide in towards the middle
      // and dissolve. An outline logo fills in first, then the details that
      // are not part of any piece fade.
      tl.to(
        ".ma-label",
        { y: 28, opacity: 0, duration: 0.45, ease: "power2.in", stagger: 0.04 },
        "m",
      );
      const tiles = shown.map((_, i) => `.ma-tile-${i}`).join(",");
      tl.to(
        tiles,
        {
          x: (i: number) => (960 - tileX(i, n)) * 0.35,
          scale: 0.72,
          duration: 0.7,
          ease: "power2.in",
        },
        "m",
      );
      tl.to(
        tiles,
        { opacity: 0, duration: 0.42, ease: "power1.in" },
        "m+=0.08",
      );
      tl.to(
        ".ma-fill-in",
        { opacity: 1, duration: 0.22, ease: "power1.out" },
        "m",
      );
      tl.to(
        ".ma-detail",
        { opacity: 0, duration: 0.36, ease: "power1.in" },
        "m+=0.12",
      );

      // The logos travel into the mark's place, each app's frame moving from
      // its tile to the mark. The frames are proxies written to the
      // transform attribute, so the SVG's own coordinates are never
      // second-guessed by a transform origin.
      const frames = travellers.map((g) => ({
        ...startOf(Number(g.dataset.slot ?? 0), n),
      }));
      tl.to(
        frames,
        {
          x: MARK_ORIGIN.x,
          y: MARK_ORIGIN.y,
          s: MARK_SCALE,
          duration: 1.25,
          ease: "deck.morph",
          onUpdate: () =>
            travellers.forEach((g, k) => {
              const f = frames[k];
              if (f) g.setAttribute("transform", transformOf(f));
            }),
        },
        "m+=0.05",
      );

      // And morph, every shape of a logo into its piece of the mark, in
      // shape and in colour.
      const pieceOf = (i: number) => MARK[parts[i]?.piece ?? 0] ?? MARK[0];
      shapes.forEach((p, i) => {
        tl.to(
          p,
          {
            morphSVG: { shape: pieceOf(i).d, shapeIndex: "auto" },
            duration: 1.05,
            ease: "power3.inOut",
          },
          "m+=0.22",
        );
      });
      tl.to(
        gsap.utils.toArray<SVGLinearGradientElement>(".ma-grad", root.current),
        {
          attr: {
            x1: (i: number) => pieceOf(i).from[0],
            y1: (i: number) => pieceOf(i).from[1],
            x2: (i: number) => pieceOf(i).to[0],
            y2: (i: number) => pieceOf(i).to[1],
          },
          duration: 1.05,
          ease: "power3.inOut",
        },
        "m+=0.22",
      );
      tl.to(
        gsap.utils.toArray<SVGStopElement>(".ma-grad stop", root.current),
        {
          attr: {
            offset: (i: number) => stopsAtEnd[i]?.offset ?? 0,
            "stop-color": (i: number) =>
              stopsAtEnd[i]?.color ?? MARK[0].stops[0],
          },
          duration: 1,
          ease: "power2.inOut",
        },
        "m+=0.3",
      );

      // They lock together: a beat of scale and one ring going out.
      const lockOrigin = `${MARK_CENTRE.x} ${MARK_CENTRE.y}`;
      tl.to(
        ".ma-lock",
        {
          scale: 1.045,
          svgOrigin: lockOrigin,
          duration: 0.18,
          ease: "power2.out",
        },
        "m+=1.22",
      );
      tl.to(
        ".ma-lock",
        { scale: 1, svgOrigin: lockOrigin, duration: 0.55, ease: "power3.out" },
        "m+=1.4",
      );
      tl.to(
        ".ma-ring",
        { opacity: 0.85, duration: 0.08, ease: "none" },
        "m+=1.2",
      );
      tl.to(
        ".ma-ring",
        { attr: { r: MARK_H * 1.6 }, duration: 1.2, ease: "power2.out" },
        "m+=1.28",
      );
      tl.to(
        ".ma-ring",
        { opacity: 0, duration: 0.8, ease: "power2.out" },
        "m+=1.32",
      );
      tl.fromTo(
        ".ma-tagline",
        { y: 44, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: "deck.enter",
          immediateRender: true,
        },
        "m+=1.35",
      );
      mark();
    },
    [shown.length, glyphs.join()],
  );

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <div className="ma-all absolute inset-0">
        <header
          className="absolute"
          style={{ left: SAFE.x, top: SAFE.top, right: SAFE.x }}
        >
          <div className="ma-head-in flex flex-col">
            <h1 className="t-title text-fg text-balance">{title}</h1>
          </div>
        </header>

        {shown.map((a, i) => {
          const look = LOOKS[glyphs[i] ?? "timetable"];
          return (
            <div key={i}>
              <div
                className={`ma-tile-${i} absolute`}
                style={{
                  left: tileX(i, n) - TILE / 2,
                  top: TILE_Y - TILE / 2,
                  width: TILE,
                  height: TILE,
                }}
              >
                <div
                  className={`ma-tile-in-${i} h-full w-full rounded-[54px]`}
                  style={{
                    background: look.tile,
                    boxShadow:
                      "inset 0 0 0 1px var(--line), inset 0 1px 0 rgba(255,255,255,0.6), var(--shadow-2)",
                  }}
                />
              </div>
              <div
                className="ma-label absolute flex flex-col items-center text-center"
                style={{
                  left: tileX(i, n) - LABEL_W / 2,
                  width: LABEL_W,
                  top: TILE_Y + TILE / 2 + 34,
                }}
              >
                <div className={`ma-label-in-${i} flex flex-col items-center`}>
                  <span className="font-display text-fg text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
                    {a.name}
                  </span>
                  <span className="text-muted mt-2 text-[26px] leading-[1.35] text-balance">
                    {a.does}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        <svg
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={1920}
          height={1080}
          viewBox="0 0 1920 1080"
          fill="none"
          aria-hidden
        >
          <defs>
            {parts.map(({ id, stops, line: [x1, y1, x2, y2] }) => (
              <linearGradient
                key={id}
                id={`${uid}-g${id}`}
                className="ma-grad"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                gradientUnits="userSpaceOnUse"
              >
                {stops.map(([offset, color], j) => (
                  <stop key={j} offset={offset} stopColor={color} />
                ))}
              </linearGradient>
            ))}
          </defs>

          <circle
            className="ma-ring"
            cx={MARK_CENTRE.x}
            cy={MARK_CENTRE.y}
            r={MARK_H * 0.64}
            stroke={ACCENT}
            strokeWidth={2.5}
            style={{ opacity: 0 }}
          />

          <g className="ma-lock">
            {groups.map(({ glyph, slot }) => (
              <g key={glyph} className={`ma-enter-${slot}`}>
                <g
                  className="ma-travel"
                  data-slot={slot}
                  transform={transformOf(startOf(slot, n))}
                >
                  {parts
                    .filter((p) => p.piece === LOOKS[glyph].piece)
                    .map(({ id, d, fillIn }) => (
                      <path
                        key={id}
                        className={`ma-part ${fillIn ? "ma-fill-in" : ""}`}
                        d={d}
                        fill={`url(#${uid}-g${id})`}
                        style={fillIn ? { opacity: 0 } : undefined}
                      />
                    ))}
                  <Detail glyph={glyph} />
                </g>
              </g>
            ))}
          </g>
        </svg>

        <p
          className="ma-tagline font-display text-fg absolute text-center"
          style={{
            left: SAFE.x,
            right: SAFE.x,
            top: MARK_CENTRE.y + MARK_H / 2 + 56,
            fontSize: 60,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
          }}
        >
          {tagline}
        </p>
      </div>
    </div>
  );
}

/**
 * What makes a logo read that is no piece of the mark; it fades as the morph
 * starts. The timetable site: everything on its window (ui/timetable-mark).
 * WhatsApp: its white mark on the green (the green bubble fills in under it
 * first).
 */
function Detail({ glyph }: { glyph: Glyph }) {
  if (glyph === "timetable") {
    const at = AT_TIMETABLE;
    return (
      <g
        className="ma-detail"
        transform={`translate(${at.x} ${at.y}) scale(${at.s})`}
      >
        <TimetableMarkDetail />
      </g>
    );
  }
  if (glyph === "whatsapp") {
    return (
      <g className="ma-detail">
        <path
          d={WHATSAPP}
          fill="#ffffff"
          transform={`translate(${AT_WHATSAPP.x} ${AT_WHATSAPP.y}) scale(${AT_WHATSAPP.s})`}
        />
      </g>
    );
  }
  return null;
}
