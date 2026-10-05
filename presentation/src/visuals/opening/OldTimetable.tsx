"use client";

import { useRef } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { BrowserFrame } from "~/ui/frames";
import { Icon, type IconName } from "~/ui/icon";

import { HOLES, MrbsPage, PAGE, PINNED } from "./_oldtimetable-page";

export interface OldTimetableProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
  /**
   * One callout per build (the slide then has steps: 5, with the step-1 note
   * split into four). Without it, step 1 pins all four, paced to the speaker.
   */
  stepped?: boolean;
}

/**
 * The college's timetable today, recreated: an MRBS install at time-
 * table.sicsr.ac.in, in a BrowserFrame marked "Not secure" (it is plain
 * HTTP). A dense rooms-by-time grid of tiny, cryptic cells ("BCA-A SEM VII
 * DT (PK) 301"), no way to see only your classes.
 *
 * `flipId` goes on the BrowserFrame: the next slide (three-apps) draws a small
 * timetable window with the same id, so this window shrinks into it.
 *
 * Builds (steps = 2):
 *   0 — the page, as it loads in (slowly): a progress strip, then the banner,
 *       then the table painting in, a few rows at a time. Plays on arrival.
 *   1 — the page washes back towards the stage and callouts are pinned onto
 *       it, about a sentence apart: one page for everybody, type too small
 *       for a phone, the whole college loaded on every visit, plain HTTP.
 *       Each ring opens a clear window in the wash, so the thing it points
 *       at keeps its colour. With `stepped`, steps 1–4 pin one each.
 */

/** The 960 × 844 box the side layout gives us, and the window inside it. */
const BOX = { width: 960, height: 844 } as const;
const FRAME = {
  left: 10,
  top: 22,
  width: PAGE.width,
  height: PAGE.height + 52,
} as const;
/** Where the page's (0, 0) lands in the box. */
const ORIGIN = { x: FRAME.left, y: FRAME.top + 52 } as const;

interface Point {
  x: number;
  y: number;
}

interface Callout {
  id: string;
  text: string;
  icon: IconName;
  /** The chip's top-left, in box pixels. */
  chip: Point;
  /** A fixed chip width (content centred), when it must cover something. */
  width?: number;
  /** Where the leader line meets the chip. */
  anchor: Point;
  /** What it points at: a dot, or a ring around a label. */
  pin: Point;
  ring?: { x: number; y: number; w: number; h: number };
}

/** The cell with "BCA-A SEM VII DT (PK) 301" in it. */
const pinnedCell = {
  x: ORIGIN.x + PAGE.timeW + PINNED.col * PAGE.colW - 2,
  y: ORIGIN.y + PAGE.gridTop + PAGE.headH + PINNED.row * PAGE.rowH - 2,
  w: PAGE.colW + 4,
  h: PINNED.span * PAGE.rowH + 4,
};
/** The row of room names, from the first room to the window's edge. */
const roomHeader = {
  x: ORIGIN.x + PAGE.timeW - 2,
  y: ORIGIN.y + PAGE.gridTop - 2,
  w: PAGE.width - PAGE.bar - PAGE.timeW + 4,
  h: PAGE.headH + 4,
};
/** The "Done: every room…" bubble the page shows once it has loaded. */
const doneBubble = {
  x: ORIGIN.x - 3,
  y: ORIGIN.y + PAGE.height - PAGE.doneH - 3,
  w: PAGE.doneW + 6,
  h: PAGE.doneH + 6,
};
/** The "Not secure" label in the frame's address bar. */
const insecure = { x: FRAME.left + 194, y: FRAME.top + 9, w: 120, h: 34 };

const CALLOUTS: Callout[] = [
  {
    id: "one-page",
    text: "One page for the whole college",
    icon: "grid",
    chip: { x: 392, y: 292 },
    anchor: { x: 760, y: 292 },
    pin: { x: 790, y: roomHeader.y + roomHeader.h },
    ring: roomHeader,
  },
  {
    id: "tiny-type",
    text: "Desktop-sized text, on a phone",
    icon: "phone",
    chip: { x: 236, y: 452 },
    anchor: { x: 236, y: 482 },
    pin: { x: pinnedCell.x + pinnedCell.w / 2, y: pinnedCell.y + pinnedCell.h },
    ring: pinnedCell,
  },
  {
    id: "loads-all",
    text: "Loads everything, every visit",
    icon: "download",
    chip: { x: 150, y: 690 },
    anchor: { x: doneBubble.x + doneBubble.w / 2 + 20, y: 750 },
    pin: { x: doneBubble.x + doneBubble.w / 2 + 20, y: doneBubble.y },
    ring: doneBubble,
  },
  {
    id: "insecure",
    text: "Not secure: plain HTTP",
    icon: "alert",
    // Hung straight under the ring, wide enough to cover the whole banner
    // title, so the short leader crosses no page text and no word pokes out.
    chip: { x: 58, y: 82 },
    width: 422,
    anchor: { x: insecure.x + insecure.w / 2, y: 82 },
    pin: { x: insecure.x + insecure.w / 2, y: insecure.y + insecure.h },
    ring: insecure,
  },
];

/** The deck's accent, as hex: these are drawn in SVG over the page. */
const ACCENT = "#c8305f";
const HOLE_IDS = new Set<string>(HOLES.map((h) => h.id));

/** A soft elbow from the pin to the chip. */
function leaderPath(from: Point, to: Point) {
  const vertical = Math.abs(to.y - from.y) > Math.abs(to.x - from.x);
  const c = vertical ? { x: from.x, y: to.y } : { x: to.x, y: from.y };
  return `M${from.x},${from.y} Q${c.x},${c.y} ${to.x},${to.y}`;
}

export function OldTimetable({
  step,
  active,
  flipId,
  stepped = false,
}: OldTimetableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const load = useRef<gsap.core.Timeline | null>(null);
  const stepAtMount = useRef(step);
  const activeAtMount = useRef(active);
  const instantAtMount = useRef(instant);

  // The page loading in. Not a build: it plays by itself on arrival.
  useGSAP(
    () => {
      const q = gsap.utils.selector(ref);
      const tl = gsap.timeline({ paused: true });
      const rows = q(".ot-rows");
      const progress = q(".ot-progress");
      const status = q(".ot-status");

      tl.set(
        [q(".ot-band"), q(".ot-nav"), q(".ot-thead"), q(".ot-bars")],
        { autoAlpha: 0 },
        0,
      );
      tl.set(rows, { clipPath: "inset(0px 0px 100% 0px)" }, 0);
      tl.set(status, { opacity: 1 }, 0.08);
      tl.fromTo(
        progress,
        { scaleX: 0, opacity: 1 },
        { scaleX: 0.24, duration: 0.45, ease: "power2.out" },
        0.08,
      );
      tl.set(q(".ot-band"), { autoAlpha: 1 }, 0.5);
      tl.to(
        progress,
        { scaleX: 0.42, duration: 0.45, ease: "power1.inOut" },
        0.55,
      );
      tl.set(q(".ot-nav"), { autoAlpha: 1 }, 0.68);
      tl.set(q(".ot-status-wait"), { display: "none" }, 0.74);
      tl.set(q(".ot-status-data"), { display: "inline" }, 0.74);
      tl.set([q(".ot-thead"), q(".ot-bars")], { autoAlpha: 1 }, 0.9);

      // The table paints top-down, a few rows at a time, unevenly.
      const painted = [2, 3, 5, 8, 9, 12, 14, 15, 18, 21, 23, 26, PAGE.rows];
      const gaps = [
        0.1, 0.06, 0.12, 0.07, 0.11, 0.06, 0.1, 0.09, 0.07, 0.12, 0.06, 0.09,
      ];
      let t = 1.0;
      painted.forEach((n, i) => {
        const hidden = 100 - (n / PAGE.rows) * 100;
        tl.set(
          rows,
          { clipPath: `inset(0px 0px ${hidden.toFixed(3)}% 0px)` },
          t,
        );
        t += gaps[i] ?? 0.08;
      });
      tl.to(progress, { scaleX: 0.88, duration: t - 1.0, ease: "none" }, 1.0);
      tl.to(progress, { scaleX: 1, duration: 0.14, ease: "power1.out" }, t);
      tl.to(
        progress,
        { opacity: 0, duration: 0.3, ease: "power1.out" },
        t + 0.14,
      );
      tl.to(
        status,
        { opacity: 0, duration: 0.2, ease: "power1.out" },
        t + 0.05,
      );

      load.current = tl;
      if (instantAtMount.current || stepAtMount.current > 0) tl.progress(1);
      else if (activeAtMount.current) tl.delay(0.25).play();
      return () => {
        tl.kill();
        load.current = null;
      };
    },
    { scope: ref },
  );

  // Arriving later (a preview that becomes the slide), or snapping to it.
  useGSAP(
    () => {
      const tl = load.current;
      if (!tl) return;
      // A build that starts before the arrival has finished lands it first.
      if (instant || step > 0) tl.progress(1);
      else if (active && tl.progress() === 0 && !tl.isActive()) tl.play();
    },
    { dependencies: [active, instant, step] },
  );

  useSteps(ref, step, (tl, mark) => {
    tl.to(".ot-dim", { opacity: 1, duration: 0.6, ease: "power2.out" }, 0);
    CALLOUTS.forEach((c, i) => {
      // Stepped: each callout is its own build. Otherwise one build, paced
      // about a sentence apart, so each lands as the speaker reaches it.
      const at = stepped ? (i === 0 ? 0.15 : tl.duration()) : 0.15 + i * 1.8;
      if (c.id === "loads-all") {
        tl.fromTo(
          ".ot-done",
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
          at,
        );
      }
      if (HOLE_IDS.has(c.id)) {
        tl.fromTo(
          `.ot-hole-${c.id}`,
          { opacity: 0 },
          { opacity: 1, duration: 0.45, ease: "power2.out" },
          at,
        );
      }
      tl.fromTo(
        `.ot-pin-${c.id}`,
        // The origin goes in the "from" state: given only in the "to", GSAP
        // would shift the pin to hide the change of origin. The ring lands
        // from a little larger, like a loupe settling onto the page.
        { scale: 1.18, opacity: 0, transformOrigin: "50% 50%" },
        { scale: 1, opacity: 1, duration: 0.5, ease: "deck.enter" },
        at,
      );
      tl.fromTo(
        `.ot-line-${c.id}`,
        { drawSVG: "0% 0%", autoAlpha: 0 },
        {
          drawSVG: "0% 100%",
          autoAlpha: 1,
          duration: 0.5,
          ease: "power3.out",
        },
        at + 0.18,
      );
      tl.fromTo(
        `.ot-chip-${c.id}`,
        { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.4)" },
        at + 0.55,
      );
      if (stepped) mark();
    });
    if (!stepped) mark();
  });

  return (
    <div
      ref={ref}
      className="absolute top-0 left-0"
      style={{ width: BOX.width, height: BOX.height }}
    >
      <BrowserFrame
        flipId={flipId}
        url="time-table.sicsr.ac.in/day.php?year=2026&month=8&day=13"
        insecure
        width={FRAME.width}
        height={FRAME.height}
        style={{ position: "absolute", left: FRAME.left, top: FRAME.top }}
      >
        <MrbsPage />
      </BrowserFrame>

      <svg
        data-no-enter
        className="pointer-events-none absolute inset-0"
        width={BOX.width}
        height={BOX.height}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        aria-hidden
      >
        {CALLOUTS.map((c) => (
          <g key={c.id}>
            {/* A pale halo keeps the line clean where it crosses page text. */}
            <path
              className={`ot-line-${c.id}`}
              d={leaderPath(c.pin, c.anchor)}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.9}
              strokeWidth={8}
              strokeLinecap="round"
              style={{ visibility: "hidden" }}
            />
            <path
              className={`ot-line-${c.id}`}
              d={leaderPath(c.pin, c.anchor)}
              fill="none"
              stroke={ACCENT}
              strokeWidth={3}
              strokeLinecap="round"
              style={{ visibility: "hidden" }}
            />
            <g className={`ot-pin-${c.id}`} style={{ opacity: 0 }}>
              {c.ring ? (
                <>
                  <rect
                    x={c.ring.x - 1.5}
                    y={c.ring.y - 1.5}
                    width={c.ring.w + 3}
                    height={c.ring.h + 3}
                    rx={9.5}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity={0.9}
                    strokeWidth={3}
                  />
                  <rect
                    x={c.ring.x}
                    y={c.ring.y}
                    width={c.ring.w}
                    height={c.ring.h}
                    rx={8}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={3}
                  />
                </>
              ) : (
                <>
                  <circle
                    cx={c.pin.x}
                    cy={c.pin.y}
                    r={9}
                    fill={ACCENT}
                    stroke="#ffffff"
                    strokeWidth={3}
                  />
                </>
              )}
            </g>
          </g>
        ))}
      </svg>

      {CALLOUTS.map((c) => (
        <div
          key={c.id}
          data-no-enter
          className={`ot-chip-${c.id} bg-raised text-fg absolute flex items-center gap-3.5 rounded-[12px] whitespace-nowrap`}
          style={{
            left: c.chip.x,
            top: c.chip.y,
            width: c.width,
            justifyContent: c.width ? "center" : undefined,
            height: 60,
            padding: "0 24px 0 18px",
            boxShadow: "inset 0 0 0 1px var(--line-strong), var(--shadow-2)",
            transformOrigin: `${c.anchor.x - c.chip.x}px ${c.anchor.y - c.chip.y}px`,
            opacity: 0,
          }}
        >
          <Icon name={c.icon} size={28} className="text-accent" />
          <span className="font-body text-[26px] font-semibold tracking-[-0.01em]">
            {c.text}
          </span>
        </div>
      ))}
    </div>
  );
}
