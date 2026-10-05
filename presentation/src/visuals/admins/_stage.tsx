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

/**
 * What the two admin console demos share: one browser window, in one place,
 * in Plannr's admin look, plus a pointer and the "play on arrival" hook.
 *
 * Both demos sit in FeatureShowcase's 960 × 844 box with the window at the
 * same size and spot, so moving from the dashboard to the import the window
 * holds still and only its page changes.
 */

/** The box FeatureShowcase gives a visual. */
export const BOX = { w: 960, h: 844 } as const;
/** The browser window, in box coordinates: centred on the text column beside it. */
export const FRAME = { x: 15, y: 96, w: 930, h: 650 } as const;
const FRAME_BAR = 52;
/** The page inside the window, and where it starts in the box. */
export const PAGE = {
  w: FRAME.w,
  h: FRAME.h - FRAME_BAR,
  x: FRAME.x,
  y: FRAME.y + FRAME_BAR,
} as const;
/** The app's own top bar inside the page. */
export const APP_BAR = 60;
/** Page padding around the cards. */
export const PAD = 16;

export const URL = "plannr.paraswtf.com/admin";

/** Delay before a demo plays on arrival: the slide's morph is ~0.95s. */
const INTRO_DELAY = 0.55;

/** Hairline-ringed white card, as the app draws them. */
export const CARD_SHADOW =
  "inset 0 0 0 1px var(--card-ring), 0 2px 10px rgba(16,24,40,0.05)";

export function Stage({
  flipId,
  children,
  overlay,
  stageRef,
}: {
  flipId?: string;
  children: ReactNode;
  /** Drawn over the whole box, above the window: things that come from outside it. */
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
        <div className="absolute inset-0 isolate">{children}</div>
      </BrowserFrame>
      {overlay && (
        <div className="pointer-events-none absolute inset-0">{overlay}</div>
      )}
    </div>
  );
}

/** The admin console's top bar: mark, page title, term chip, and the right side. */
export function AdminBar({
  title,
  right,
}: {
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className="absolute inset-x-0 top-0 z-10 flex items-center gap-4 bg-white px-5"
      style={{ height: APP_BAR, boxShadow: "inset 0 -1px 0 var(--hair)" }}
    >
      <PlannrMark height={26} />
      <span className="font-display text-[22px] font-bold tracking-[-0.02em]">
        {title}
      </span>
      <span
        className="rounded-full px-3 py-1 font-mono text-[13.5px] font-semibold"
        style={{ background: "rgba(68,88,121,0.1)", color: "var(--slate)" }}
      >
        Monsoon term · 2026
      </span>
      <span className="ml-auto flex items-center gap-3">
        {right}
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold text-white"
          style={{ background: "var(--slate)" }}
        >
          P
        </span>
      </span>
    </div>
  );
}

/**
 * The pointer, tip at the element's top-left. Nest it: move the outer
 * wrapper in one timeline and press the inner `.cur-svg` in another.
 */
export function Cursor({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`pointer-events-none absolute top-0 left-0 z-50 ${className ?? ""}`}
      style={style}
    >
      <svg
        width="30"
        height="38"
        viewBox="0 0 15 19"
        className="cur-svg block"
        style={{
          transformOrigin: "2px 2px",
          filter: "drop-shadow(0 3px 6px rgba(16,24,40,0.28))",
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
  );
}

/**
 * A demo's opening act, played once when the slide arrives on its first
 * build. It is its own timeline beside the build timeline, and must touch
 * only elements the builds never touch.
 *
 * It jumps to its end when the slide is entered on a later build, shown in a
 * preview or a snapshot, or when the presenter moves on before it ends. Call
 * it before useSteps.
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

/** A soft endless pulse on `selector`, only while the slide is on screen. */
export function usePulse(
  scope: RefObject<Element | null>,
  active: boolean,
  selector: string,
) {
  useGSAP(
    () => {
      if (!active) return;
      const t = gsap.fromTo(
        selector,
        { scale: 1, opacity: 0.55 },
        {
          scale: 2.6,
          opacity: 0,
          duration: 1.4,
          ease: "power1.out",
          repeat: -1,
          transformOrigin: "50% 50%",
        },
      );
      return () => {
        t.kill();
      };
    },
    { scope, dependencies: [active] },
  );
}
