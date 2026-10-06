"use client";

import { useId, useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";
import { SAFE } from "~/ui/layout";

import { ACCENT, useEntrance } from "./_closing-motion";

export interface MergeAppsProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  /**
   * The apps people juggle today, left to right. Up to four are drawn; each
   * one's glyph is chosen by its icon: a grid or calendar is the timetable,
   * whatsapp or message is the class group, a cap or book is Moodle, a mail
   * or inbox is email.
   */
  apps: { name: ReactNode; does: ReactNode; icon: IconName }[];
  /** Under the merged mark: "One place. One source of truth." */
  tagline: ReactNode;
  /** 0: the separate apps. 1: they merge into Plannr. Steps = 2. */
  step: number;
}

/*
 * The four shapes of public/logo.svg (167 × 194), in the order the file paints
 * them, with their gradients. The glyphs below are drawn in the same space, so
 * each one morphs into its piece of the mark without moving its frame.
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

/*
 * The glyphs, in the mark's coordinate space. Each solid silhouette is one
 * path, so it can morph cleanly; the details that make it read (the grid,
 * the envelope's flap, the handset, the tassel) sit on top and fade as the
 * morph begins. Four apps, four pieces of the mark, one each:
 *
 *   timetable: the grid's body → the mark's lower-left block (path 0)
 *   email:     the envelope → the mark's top bar (path 1)
 *   whatsapp:  the speech bubble → the mark's stem (path 2). Without the
 *              class group, a double-period class in the grid becomes it.
 *   moodle:    the mortarboard → the mark's right-hand block (path 3)
 */
const GLYPH = {
  timetableBody:
    "M26 18H142C155.255 18 166 28.7452 166 42V152C166 165.255 155.255 176 142 176H26C12.7452 176 2 165.255 2 152V42C2 28.7452 12.7452 18 26 18Z",
  timetableClass:
    "M58 62H69C73.9706 62 78 66.0294 78 71V121C78 125.971 73.9706 130 69 130H58C53.0294 130 49 125.971 49 121V71C49 66.0294 53.0294 62 58 62Z",
  envelope:
    "M22 36H146C157.046 36 166 44.9543 166 56V138C166 149.046 157.046 158 146 158H22C10.9543 158 2 149.046 2 138V56C2 44.9543 10.9543 36 22 36Z",
  cap: "M2 74L84 40L166 74L128 89.76V132C128 146 108 156 84 156C60 156 40 146 40 132V89.76Z",
  /** A circle with WhatsApp's tail at its lower left. */
  bubble: "M57.03 160.76A72 72 0 1 0 22.94 132.15L10 178Z",
};

/**
 * What each glyph looks like as an app. The apps people juggle today are
 * drawn in greys, steps of the stage's slate, so the only colour in the
 * picture is the one they become: the Plannr mark.
 */
const LOOK: Record<Glyph, { stops: [string, string] }> = {
  timetable: { stops: ["#7c8596", "#4f5868"] },
  whatsapp: { stops: ["#959dab", "#687182"] },
  moodle: { stops: ["#a4abb8", "#7a8393"] },
  email: { stops: ["#8f97a6", "#626b7b"] },
};
/** The double-period class, when it is a piece of its own. */
const CLASS_STOPS: [string, string] = ["#f4f5f8", "#d6dae1"];

const ORDER: Glyph[] = ["timetable", "whatsapp", "moodle", "email"];

function glyphFor(icon: IconName, index: number): Glyph {
  if (icon === "grid" || icon === "calendar") return "timetable";
  if (icon === "whatsapp" || icon === "message") return "whatsapp";
  if (icon === "cap" || icon === "book") return "moodle";
  if (icon === "mail" || icon === "inbox") return "email";
  return ORDER[index % ORDER.length] ?? "timetable";
}

interface Piece {
  glyph: Glyph;
  shape: string;
  /** The gradient's line, in the glyph's space: x1, y1, x2, y2. */
  vector: [number, number, number, number];
  stops: [string, string];
}

/** The mark's four pieces, in its paint order: which app each comes from. */
function piecesFor(glyphs: Glyph[]): Piece[] {
  const stem: Piece = glyphs.includes("whatsapp")
    ? {
        glyph: "whatsapp",
        shape: GLYPH.bubble,
        vector: [84, 22, 84, 178],
        stops: LOOK.whatsapp.stops,
      }
    : {
        glyph: "timetable",
        shape: GLYPH.timetableClass,
        vector: [63, 62, 63, 130],
        stops: CLASS_STOPS,
      };
  return [
    {
      glyph: "timetable",
      shape: GLYPH.timetableBody,
      vector: [84, 18, 84, 176],
      stops: LOOK.timetable.stops,
    },
    {
      glyph: "email",
      shape: GLYPH.envelope,
      vector: [84, 36, 84, 158],
      stops: LOOK.email.stops,
    },
    stem,
    {
      glyph: "moodle",
      shape: GLYPH.cap,
      vector: [84, 40, 84, 156],
      stops: LOOK.moodle.stops,
    },
  ];
}

/* Canvas geometry, for up to four tiles in a row. */
const LOCAL = { cx: 84, cy: 97 };
const TILE = 240;
const TILE_Y = 572;
const SPREAD = 360;
const LABEL_W = 340;
const GLYPH_SCALE = 0.8;
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

/**
 * The deck's thesis as one motion: the timetable site, the class WhatsApp
 * group, Moodle and the inbox collapse into a single Plannr mark.
 *
 * Build 0 sets the apps out as tiles. Build 1 lets the tiles go: the glyphs
 * travel to the middle, and as they travel each one morphs (MorphSVG) into
 * its piece of the mark (the grid becomes the mark's base, the speech bubble
 * its stem, the envelope its top bar, the cap its bright block), changing
 * from grey into the mark's own gradients on the way. The pieces lock
 * together with a pulse of one accent ring, and the tagline rises underneath.
 */
export function MergeApps({ title, apps, tagline, step }: MergeAppsProps) {
  const root = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shown = apps.slice(0, ORDER.length);
  const n = shown.length;
  const glyphs = shown.map((a, i) => glyphFor(a.icon, i));
  const slot = (g: Glyph) => Math.max(0, glyphs.indexOf(g));

  // Which tile each of the mark's four pieces starts in.
  const pieces = piecesFor(glyphs);
  const pieceSlot = pieces.map((p) => slot(p.glyph));
  const pieceStart = pieceSlot.map((i) => startOf(i, n));
  // With the class group drawn, the grid's class is no longer a piece of the
  // mark, only part of how the grid reads.
  const classInGrid = glyphs.includes("whatsapp");

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
      const paths = gsap.utils.toArray<SVGPathElement>(
        ".ma-piece",
        root.current,
      );
      tl.addLabel("m");

      // The apps let go: labels drop away, tiles slide in towards the middle
      // and dissolve, the glyphs shed their details.
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
        ".ma-detail",
        { opacity: 0, duration: 0.4, ease: "power1.in" },
        "m",
      );

      // The glyphs travel into the mark's place, each piece's frame moving
      // from its tile to the mark. The frames are proxies written to the
      // transform attribute, so the SVG's own coordinates are never
      // second-guessed by a transform origin.
      const frames = travellers.map((_, k) => ({
        ...(pieceStart[k] ?? startOf(0, n)),
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

      // And morph into the mark's shapes and colours on the way.
      paths.forEach((p, k) => {
        const target = MARK[k];
        if (!target) return;
        tl.to(
          p,
          {
            morphSVG: { shape: target.d, shapeIndex: "auto" },
            duration: 1.05,
            ease: "power3.inOut",
          },
          "m+=0.22",
        );
      });
      const piece = (i: number) => MARK[i] ?? MARK[0];
      tl.to(
        gsap.utils.toArray<SVGLinearGradientElement>(".ma-grad", root.current),
        {
          attr: {
            x1: (i: number) => piece(i).from[0],
            y1: (i: number) => piece(i).from[1],
            x2: (i: number) => piece(i).to[0],
            y2: (i: number) => piece(i).to[1],
          },
          duration: 1.05,
          ease: "power3.inOut",
        },
        "m+=0.22",
      );
      // Stops run g0's start, g0's end, g1's start…
      tl.to(
        gsap.utils.toArray<SVGStopElement>(".ma-grad stop", root.current),
        {
          attr: {
            "stop-color": (i: number): string =>
              piece(Math.floor(i / 2)).stops[i % 2 === 0 ? 0 : 1],
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
                  className={`ma-tile-in-${i} bg-raised h-full w-full rounded-[58px]`}
                  style={{
                    boxShadow:
                      "inset 0 0 0 1px var(--line), inset 0 1px 0 #ffffff, var(--shadow-2)",
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
            {pieces.map(({ vector: [x1, y1, x2, y2] }, k) => (
              <linearGradient
                key={k}
                id={`${uid}-g${k}`}
                className="ma-grad"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor={pieces[k]?.stops[0]} />
                <stop offset="1" stopColor={pieces[k]?.stops[1]} />
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
            {MARK.map((_, k) => (
              <g key={k} className={`ma-enter-${pieceSlot[k]}`}>
                <g
                  className="ma-travel"
                  transform={transformOf(pieceStart[k] ?? startOf(0, n))}
                >
                  <path
                    className="ma-piece"
                    d={pieces[k]?.shape}
                    fill={`url(#${uid}-g${k})`}
                  />
                  <GlyphDetail
                    glyph={pieces[k]?.glyph ?? "timetable"}
                    piece={k}
                    classInGrid={classInGrid}
                  />
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

/** What makes each silhouette read as its app; fades as the morph starts. */
function GlyphDetail({
  glyph,
  piece,
  classInGrid,
}: {
  glyph: Glyph;
  piece: number;
  classInGrid: boolean;
}) {
  if (glyph === "timetable" && piece === 0) {
    return (
      <g className="ma-detail">
        <path
          d="M26 18H142C155.255 18 166 28.7452 166 42V56H2V42C2 28.7452 12.7452 18 26 18Z"
          fill="#3a414d"
        />
        <circle cx="22" cy="37" r="5" fill="#c9ced8" />
        <circle cx="38" cy="37" r="5" fill="#c9ced8" opacity="0.55" />
        <path
          d="M43 56V176M84 56V176M125 56V176M2 96H166M2 136H166"
          stroke="#2a303a"
          strokeOpacity="0.45"
          strokeWidth="2.5"
        />
        <rect
          x="90"
          y="102"
          width="29"
          height="28"
          rx="7"
          fill="#ffffff"
          opacity="0.32"
        />
        <rect
          x="131"
          y="142"
          width="29"
          height="28"
          rx="7"
          fill="#ffffff"
          opacity="0.2"
        />
        <rect
          x="8"
          y="142"
          width="29"
          height="28"
          rx="7"
          fill="#ffffff"
          opacity="0.2"
        />
        {classInGrid && <path d={GLYPH.timetableClass} fill="#e9ecf1" />}
      </g>
    );
  }
  if (glyph === "whatsapp") {
    return (
      <g className="ma-detail">
        {/* The handset, centred in the bubble. */}
        <g transform="translate(50 60)">
          <Icon name="call" size={68} weight="fill" color="#ffffff" />
        </g>
      </g>
    );
  }
  if (glyph === "email") {
    return (
      <g className="ma-detail">
        <path
          d="M18 54L84 104L150 54"
          stroke="#ffffff"
          strokeOpacity="0.85"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 142L62 104M150 142L106 104"
          stroke="#ffffff"
          strokeOpacity="0.32"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (glyph === "moodle") {
    return (
      <g className="ma-detail">
        <path d="M2 74L84 40L166 74L84 108Z" fill="#ffffff" opacity="0.2" />
        <path
          d="M84 74L146 88V126"
          stroke="#3a414d"
          strokeOpacity="0.75"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="146" cy="132" r="9" fill="#3a414d" opacity="0.75" />
        <circle cx="84" cy="74" r="7" fill="#3a414d" opacity="0.75" />
      </g>
    );
  }
  return null;
}
