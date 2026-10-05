"use client";

import {
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { PlannrMark } from "~/ui/brand";
import { BrowserFrame } from "~/ui/frames";
import { Icon, type IconName } from "~/ui/icon";
import { courseTone } from "~/ui/mock";

/**
 * The pieces the three coordinator demos share: one browser window, in one
 * place, drawn in Plannr's desktop look, plus the cursor and a week grid.
 *
 * All three demos sit in FeatureShowcase's 960 × 844 box. The window is the
 * same size at the same spot on all three, so when the deck moves from one
 * feature to the next it holds still and only its page changes.
 *
 * Everything is laid out from constants rather than measured, so a flight
 * from one element to another is plain arithmetic and lands on the pixel.
 */

/** The box FeatureShowcase gives a visual. */
export const BOX = { w: 960, h: 844 } as const;
/** The browser window, in box coordinates. */
export const FRAME = { x: 15, y: 40, w: 930, h: 620 } as const;
/** The browser's tab strip and URL bar. */
const FRAME_BAR = 52;
/** The page inside the window: its size, and where it starts in the box. */
export const PAGE = {
  w: FRAME.w,
  h: FRAME.h - FRAME_BAR,
  x: FRAME.x,
  y: FRAME.y + FRAME_BAR,
} as const;
/** Height of the app's own top bar inside the page. */
export const APP_BAR = 64;
/** Below the window: the strip where each demo says what happened. */
export const STRIP = {
  y: FRAME.y + FRAME.h + 36,
  h: BOX.h - (FRAME.y + FRAME.h + 36),
} as const;

export const URL = "plannr.paraswtf.com/manage";

/** Where a page point sits in the box (for things that fly out of the window). */
export const toBox = (p: { x: number; y: number }) => ({
  x: p.x + PAGE.x,
  y: p.y + PAGE.y,
});

/** Delay before a demo plays on arrival: the slide's morph is ~0.95s. */
const INTRO_DELAY = 0.8;

/**
 * The stage: the window in its fixed place, and what goes around it.
 * `overlay` is drawn over the whole box (above the window), for things that
 * leave the page; `strip` sits under the window.
 */
export function Stage({
  flipId,
  children,
  strip,
  overlay,
  stageRef,
}: {
  flipId?: string;
  children: ReactNode;
  strip?: ReactNode;
  overlay?: ReactNode;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={stageRef}
      className="relative shrink-0"
      style={{ width: BOX.w, height: BOX.h }}
    >
      <BrowserFrame
        url={URL}
        width={FRAME.w}
        height={FRAME.h}
        flipId={flipId}
        className="absolute"
        style={{ left: FRAME.x, top: FRAME.y }}
        contentStyle={{ background: "var(--paper)", color: "var(--app-title)" }}
      >
        {/* Its own stacking context, so the page's z-indices stay under the overlay. */}
        {/* data-enter: the page fades in as the window lands, so it never hard-cuts. */}
        <div data-enter className="absolute inset-0 isolate">
          {children}
        </div>
      </BrowserFrame>
      {strip && (
        <div
          className="absolute inset-x-0"
          style={{ top: STRIP.y, height: STRIP.h }}
        >
          {strip}
        </div>
      )}
      {overlay && (
        <div className="pointer-events-none absolute inset-0">{overlay}</div>
      )}
    </div>
  );
}

/** Plannr's desktop top bar: mark, page title, a context chip, and actions on the right. */
export function AppBar({
  title,
  chip,
  sub,
  right,
}: {
  title: ReactNode;
  chip?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className="absolute inset-x-0 top-0 flex items-center gap-4 bg-white px-5"
      style={{ height: APP_BAR, boxShadow: "inset 0 -1px 0 var(--hair)" }}
    >
      <PlannrMark height={26} />
      <span className="font-display text-[22px] font-bold tracking-[-0.02em]">
        {title}
      </span>
      {chip && (
        <span
          className="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[14px] font-semibold"
          style={{ background: "rgba(68,88,121,0.1)", color: "var(--slate)" }}
        >
          {chip}
        </span>
      )}
      {sub && (
        <span className="font-mono text-[14px] text-[rgba(44,49,53,0.55)]">
          {sub}
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">{right}</span>
    </div>
  );
}

export interface Grid {
  /** Card position in page coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  gutter: number;
  header: number;
  rowH: number;
  colW: number;
  startHour: number;
  hours: number;
  days: string[];
}

export function makeGrid(o: {
  x: number;
  y: number;
  w: number;
  gutter: number;
  header?: number;
  rowH: number;
  startHour?: number;
  hours?: number;
  days?: string[];
}): Grid {
  const days = o.days ?? ["Mon 5", "Tue 6", "Wed 7", "Thu 8", "Fri 9"];
  const header = o.header ?? 40;
  const hours = o.hours ?? 6;
  return {
    x: o.x,
    y: o.y,
    w: o.w,
    gutter: o.gutter,
    header,
    rowH: o.rowH,
    colW: (o.w - o.gutter) / days.length,
    startHour: o.startHour ?? 9,
    hours,
    h: header + hours * o.rowH,
    days,
  };
}

/** A class's box in the grid, in page coordinates. */
export function cell(g: Grid, col: number, hour: number) {
  const inset = { x: 4, y: 3 };
  return {
    x: g.x + g.gutter + col * g.colW + inset.x,
    y: g.y + g.header + (hour - g.startHour) * g.rowH + inset.y,
    w: g.colW - inset.x * 2,
    h: g.rowH - inset.y * 2,
  };
}

/** The white card with day headings, hour labels and hairlines. */
export function WeekGrid({ g, today }: { g: Grid; today?: number }) {
  return (
    <div
      className="absolute rounded-[14px] bg-white"
      style={{
        left: g.x,
        top: g.y,
        width: g.w,
        height: g.h,
        boxShadow:
          "inset 0 0 0 1px var(--card-ring), 0 2px 10px rgba(13,17,23,0.05)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 flex"
        style={{ height: g.header, boxShadow: "inset 0 -1px 0 var(--hair)" }}
      >
        <div style={{ width: g.gutter }} />
        {g.days.map((d, i) => {
          const [name, num] = d.split(" ");
          return (
            <div
              key={d}
              className="flex flex-1 items-center justify-center gap-1.5"
            >
              <span className="text-[14px] font-semibold text-[rgba(44,49,53,0.6)]">
                {name}
              </span>
              <span
                className="font-display flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold"
                style={
                  i === today
                    ? { background: "var(--slate)", color: "#fff" }
                    : undefined
                }
              >
                {num}
              </span>
            </div>
          );
        })}
      </div>
      {Array.from({ length: g.hours }, (_, i) => (
        <div key={i}>
          <span
            className="absolute -translate-y-1/2 text-right font-mono text-[12px] text-[rgba(44,49,53,0.45)]"
            style={{
              top: g.header + i * g.rowH,
              left: 0,
              width: g.gutter - 10,
            }}
          >
            {i === 0 ? "" : `${g.startHour + i}:00`}
          </span>
          {i > 0 && (
            <div
              className="absolute right-0"
              style={{
                left: g.gutter,
                top: g.header + i * g.rowH,
                height: 1,
                background: "var(--hair)",
              }}
            />
          )}
        </div>
      ))}
      {g.days.slice(1).map((d, i) => (
        <div
          key={d}
          className="absolute bottom-0"
          style={{
            left: g.gutter + (i + 1) * g.colW,
            top: g.header,
            width: 1,
            background: "rgba(68,88,121,0.1)",
          }}
        />
      ))}
      <div
        className="absolute bottom-0"
        style={{
          left: g.gutter,
          top: g.header,
          width: 1,
          background: "rgba(68,88,121,0.1)",
        }}
      />
    </div>
  );
}

export interface ClassDef {
  id: string;
  title: string;
  col: number;
  hour: number;
  room: string;
  who?: string;
}

/** The inside of a class block: title, then room and teacher in mono. */
export function BlockFace({
  c,
  tone,
  size = "md",
}: {
  c: Pick<ClassDef, "title" | "room" | "who">;
  tone?: { fill: string; ring: string };
  size?: "sm" | "md";
}) {
  const t = tone ?? courseTone(c.title);
  const sm = size === "sm";
  // Narrow columns: give the long words a place to break (soft hyphens).
  const title = sm
    ? c.title
        .replace("Technologies", "Tech\u00ADno\u00ADlogies")
        .replace("Communication", "Communi\u00ADcation")
    : c.title;
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[10px] text-left"
      style={{
        background: t.fill,
        boxShadow: `inset 0 0 0 1px ${t.ring}`,
        color: "#0d1117",
        padding: sm ? "6px 8px" : "8px 11px",
      }}
    >
      <span
        lang="en"
        className={`leading-tight font-semibold ${sm ? "line-clamp-2 text-[13px]" : "block truncate text-[16px]"}`}
      >
        {title}
      </span>
      <span
        className={`mt-1 block truncate font-mono text-[rgba(44,49,53,0.75)] ${sm ? "text-[11px]" : "text-[13px]"}`}
      >
        {[c.room, c.who].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

/** A class block placed on a grid. Extra children are drawn over it. */
export function Block({
  g,
  c,
  className,
  style,
  children,
  size,
  bare,
}: {
  g: Grid;
  c: ClassDef;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  size?: "sm" | "md";
  /** Leave the face out: the children draw it. */
  bare?: boolean;
}) {
  const r = cell(g, c.col, c.hour);
  return (
    <div
      className={`absolute ${className ?? ""}`}
      style={{ left: r.x, top: r.y, width: r.w, height: r.h, ...style }}
    >
      {!bare && <BlockFace c={c} size={size} />}
      {children}
    </div>
  );
}

/**
 * The pointer, tip at the element's top-left. Nest it: move the outer
 * wrapper in one timeline and the inner in another, and they add up.
 */
export function Cursor({
  className,
  innerClassName,
  style,
}: {
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`pointer-events-none absolute top-0 left-0 z-50 ${className ?? ""}`}
      style={style}
    >
      <div className={innerClassName}>
        <svg
          width="30"
          height="38"
          viewBox="0 0 15 19"
          className="cur-svg block"
          style={{
            transformOrigin: "2px 2px",
            filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.3))",
            marginLeft: -2,
            marginTop: -2,
          }}
          aria-hidden
        >
          <path
            d="M1 1v14.2l3.6-3.5 2.4 5.6 2.4-1-2.4-5.5h5z"
            fill="#0d1117"
            stroke="#fff"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

/** A dark pill under the window: an icon and a line, for what just happened. */
export function StatusPill({
  icon,
  tone,
  children,
  className,
  style,
}: {
  icon: IconName;
  tone: "good" | "bad" | "accent";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const color =
    tone === "good"
      ? "var(--good)"
      : tone === "bad"
        ? "var(--bad)"
        : "var(--coordinators)";
  return (
    <div
      className={`t-small inline-flex items-center gap-3 rounded-full py-3 pr-7 pl-4 text-[24px] font-medium text-white ${className ?? ""}`}
      style={{
        background: `color-mix(in srgb, ${color} 14%, var(--ink-1))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent), 0 18px 40px rgba(0,0,0,0.35)`,
        ...style,
      }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ background: color, color: "#0d1117" }}
      >
        <Icon name={icon} size={20} stroke={2.4} />
      </span>
      {children}
    </div>
  );
}

/**
 * A demo's opening act, played once when the slide arrives on its first
 * build: a drag, a queue filling up. useSteps cannot hold it, since its
 * first state is the start of its timeline, so it is a timeline of its own.
 *
 * It jumps to its end when the slide is entered on a later build, shown in
 * a preview or a snapshot, or when the presenter moves on before it ends.
 *
 * Call it before useSteps. When a build carries on from where the intro left
 * an element, give that tween explicit start values (`fromTo`, with
 * `immediateRender: false`): on a jump straight to a later build the intro
 * lands first and the builds then draw over it, and going back restores the
 * intro's end state.
 */
export function useIntro(
  scope: RefObject<Element | null>,
  step: number,
  active: boolean,
  build: (tl: gsap.core.Timeline) => void,
) {
  const { instant } = useDeckRuntime();
  const intro = useRef<gsap.core.Timeline | null>(null);
  const first = useRef({ step, active, instant });

  useGSAP(
    () => {
      const { step: s, active: a, instant: i } = first.current;
      const play = s === 0 && a && !i;
      const tl = gsap.timeline({
        paused: !play,
        delay: play ? INTRO_DELAY : 0,
      });
      build(tl);
      intro.current = tl;
      if (!play) tl.progress(1);
      return () => {
        tl.kill();
        intro.current = null;
      };
    },
    { scope },
  );

  useGSAP(
    () => {
      if (
        (step > 0 || instant) &&
        intro.current &&
        intro.current.progress() < 1
      ) {
        intro.current.progress(1);
      }
    },
    { dependencies: [step, instant] },
  );
}
