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

/**
 * What the three faculty demos share: one browser window, the same size and
 * in the same place on all three slides, so it holds still while the page
 * inside it changes, and the Plannr web app's top bar inside it.
 *
 * The window fills the 960 × 844 box. Everything in a page is laid out in the
 * page's own pixels (PAGE) and drawn ZOOM times larger, like a browser zoomed
 * to 120%, so app-sized text still reads from the back of the room.
 */

export const FRAME = { width: 960, height: 760 } as const;
/** How much larger than its own pixels the page is drawn on the canvas. */
export const ZOOM = 1.2;
/** The page under the browser's 52px toolbar, in page pixels. */
export const PAGE = {
  width: FRAME.width / ZOOM,
  height: (FRAME.height - 52) / ZOOM,
} as const;
/** The app's own top bar, inside the page. */
export const TOPBAR = 58;

export const INK = {
  title: "#0d1117",
  ink: "#2c3135",
  muted: "rgba(44,49,53,0.6)",
  faint: "rgba(44,49,53,0.42)",
  hair: "rgba(68,88,121,0.16)",
  ring: "rgba(68,88,121,0.26)",
  paper: "#eef0f3",
  slate: "#445879",
  green: "#4e7d3a",
  red: "#dc3848",
} as const;

/** Colour per teaching group, from the app's course palette. */
export const GROUP_TONES = {
  "BCA-A": { fill: "#7dc7fa", ring: "#0b5e8a" }, // sky
  "BCA-B": { fill: "#fbafdb", ring: "#a6207d" }, // blossom
  "BBA(IT)-A": { fill: "#8e9cf8", ring: "#3026a4" }, // periwinkle
} as const;
export type GroupId = keyof typeof GROUP_TONES;

/** The white card the app draws on its paper background. */
export const CARD: CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 1px 1px rgba(16,24,40,0.03), 0 4px 14px -6px rgba(16,24,40,0.08)`,
};

const TABS: { label: string; icon: IconName }[] = [
  { label: "My week", icon: "calendar" },
  { label: "Schedule", icon: "plus" },
  { label: "Lectures", icon: "receipt" },
];

/**
 * The browser window and the app chrome. `children` are absolutely placed in
 * page pixels; `overlay` sits over the top bar too (cursors, banners).
 */
export function FacultyBrowser({
  flipId,
  path,
  tab,
  user,
  role,
  children,
}: {
  flipId?: string;
  path: string;
  tab: 0 | 1 | 2;
  user: string;
  role: string;
  children: ReactNode;
}) {
  return (
    <BrowserFrame
      url={`plannr.paraswtf.com/${path}`}
      width={FRAME.width}
      height={FRAME.height}
      flipId={flipId}
      contentStyle={{ background: INK.paper, color: INK.title }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left overflow-hidden"
        style={{
          width: PAGE.width,
          height: PAGE.height,
          transform: `scale(${ZOOM})`,
        }}
      >
        {children}
        {/* The app bar, over the page so a banner can slide out from under it. */}
        <div
          className="absolute inset-x-0 top-0 z-20 flex items-center px-5"
          style={{
            height: TOPBAR,
            background: "#ffffff",
            boxShadow: `inset 0 -1px 0 ${INK.hair}`,
          }}
        >
          <span className="flex items-center gap-2.5">
            <PlannrMark height={24} />
            <span className="font-display text-[19px] font-bold tracking-[-0.02em]">
              Plannr
            </span>
          </span>
          <span className="ml-8 flex items-center gap-1">
            {TABS.map((t, i) => (
              <span
                key={t.label}
                className="flex items-center gap-1.5 rounded-[10px] px-3 py-[7px] text-[15px] font-semibold"
                style={
                  i === tab
                    ? { background: "rgba(68,88,121,0.1)", color: INK.slate }
                    : { color: INK.faint }
                }
              >
                <Icon name={t.icon} size={16} stroke={2} />
                {t.label}
              </span>
            ))}
          </span>
          <span className="ml-auto flex items-center gap-2.5">
            <span className="flex flex-col items-end leading-tight">
              <span className="text-[14px] font-semibold">{user}</span>
              <span className="text-[12px]" style={{ color: INK.muted }}>
                {role}
              </span>
            </span>
            <span
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[14px] font-bold text-white"
              style={{ background: INK.slate }}
            >
              {initials(user)}
            </span>
          </span>
        </div>
      </div>
    </BrowserFrame>
  );
}

function initials(name: string) {
  const words = name.replace(/^(Prof|Dr)\.\s*/, "").split(/\s+/);
  return words
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The root every demo shares: the 960 × 844 box with the window centred in
 * it, so the window lands in the same place on each slide.
 */
export function DemoBox({
  scope,
  children,
}: {
  scope: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div
      ref={scope}
      className="relative flex h-full w-full items-center justify-center"
    >
      {children}
    </div>
  );
}

/**
 * A mouse pointer. Place it with `x`/`y` (page pixels, its tip); move it with
 * GSAP on `x`/`y` offsets from there. Hidden until a build shows it.
 */
export function Cursor({
  x,
  y,
  className,
}: {
  x: number;
  y: number;
  className?: string;
}) {
  return (
    <div
      data-cursor
      className={`pointer-events-none absolute z-30 ${className ?? ""}`}
      style={{ left: x - 5, top: y - 3, width: 30, height: 34, opacity: 0 }}
    >
      <span
        data-ripple
        className="absolute rounded-full"
        style={{
          left: 5 - 18,
          top: 3 - 18,
          width: 36,
          height: 36,
          background: "rgba(68,88,121,0.28)",
          opacity: 0,
        }}
      />
      <svg
        width="30"
        height="34"
        viewBox="0 0 30 34"
        className="absolute inset-0"
        aria-hidden
      >
        <path
          d="M5 3 L5 27 L11 21.4 L15.2 30.6 L19.4 28.8 L15.3 19.8 L23.4 19.8 Z"
          fill="#ffffff"
          stroke="#0d1117"
          strokeWidth="1.6"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 3px 5px rgba(16,24,40,0.28))" }}
        />
      </svg>
    </div>
  );
}

/** A press: the pointer dips and a ring spreads from its tip. */
export function click(
  tl: gsap.core.Timeline,
  cursor: string,
  at?: number | string,
) {
  tl.to(
    cursor,
    {
      scale: 0.86,
      duration: 0.09,
      ease: "power2.in",
      transformOrigin: "5px 3px",
    },
    at,
  );
  tl.fromTo(
    `${cursor} [data-ripple]`,
    { scale: 0.2, opacity: 0.9 },
    {
      scale: 1.5,
      opacity: 0,
      duration: 0.45,
      ease: "power2.out",
      immediateRender: false,
    },
    "<",
  );
  tl.to(cursor, { scale: 1, duration: 0.16, ease: "power2.out" }, "<0.09");
}

/**
 * The app's toast, as Plannr's own toaster draws it: a white card with a
 * hairline and a soft shadow, rising from the bottom of the page.
 */
export function Toast({
  icon = "checkCircle",
  children,
  className,
  style,
}: {
  icon?: IconName;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      data-toast
      className={`absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-[14px] py-3 pr-5 pl-3.5 text-[17px] font-semibold whitespace-nowrap ${className ?? ""}`}
      style={{
        bottom: 18,
        transform: "translateY(110px)",
        background: "#ffffff",
        color: INK.title,
        boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 2px 4px rgba(16,24,40,0.04), 0 18px 40px -14px rgba(16,24,40,0.28)`,
        ...style,
      }}
    >
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
        style={{ background: "rgba(78,125,58,0.13)", color: INK.green }}
      >
        <Icon name={icon} size={19} stroke={2.2} />
      </span>
      {children}
    </div>
  );
}

/**
 * Something a slide does on its own as it arrives, before any build: plays
 * once when the slide becomes active, and is simply finished when the slide
 * is reached on a later build or drawn in the presenter's preview.
 *
 * Touch different elements here than in the slide's builds (wrap an element
 * and give each its own layer), so the two timelines never fight.
 */
export function useIntro(
  scope: RefObject<Element | null>,
  {
    active,
    step,
    delay = 0.55,
  }: { active: boolean; step: number; delay?: number },
  build: (tl: gsap.core.Timeline) => void,
) {
  const { instant } = useDeckRuntime();
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ paused: true });
      tl.to({}, { duration: delay });
      build(tl);
      timeline.current = tl;
      return () => {
        tl.kill();
        timeline.current = null;
      };
    },
    { scope },
  );

  useGSAP(
    () => {
      const tl = timeline.current;
      if (!tl) return;
      if (instant || step > 0) tl.progress(1);
      else if (active && tl.progress() === 0 && !tl.isActive()) tl.play();
    },
    { dependencies: [active, instant, step] },
  );
}
