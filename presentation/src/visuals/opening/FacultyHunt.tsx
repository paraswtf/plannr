"use client";

import { useRef, type CSSProperties } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { BrowserFrame } from "~/ui/frames";
import { Icon } from "~/ui/icon";

import { BOOKINGS, cellRect, LAYOUT, VIEW } from "./_mrbs-snapshot";
import { MrbsStatic } from "./_mrbs-static";

export interface FacultyHuntProps {
  step: number;
  active: boolean;
}

/**
 * A student trying to find one teacher on the college's real timetable page
 * (see _mrbs-snapshot.ts). The page has no place for a person, and its cells
 * cut every name off, so the only way to read one is the browser's tooltip:
 * rest the pointer on a class and, two seconds later, the full entry comes up.
 * The hover is mocked step by step, as the site behaves: the link underlines,
 * its row's time turns pink, and the tooltip waits its two seconds.
 *
 * Builds (steps = 3):
 *   0: the question: "Where is Dr. Nagane right now?" at 11:44.
 *   1: if you know their classes: hover each BCA Sem VII class in the 11:30
 *      row until the name turns up (the third one, in 702).
 *   2: if you don't: the window steps back to the whole day and the pointer
 *      hovers every class on it, in real time, two seconds still on each,
 *      while the counters run towards what that adds up to: 100 classes and
 *      3:20 of waiting (over five minutes, with the moving and the reading).
 *
 * The page is the site's own, so these are real classes, rooms and names.
 */

/* Canvas pixels inside the 960 x 844 box. */
const BOX = { width: 960, height: 844 } as const;
const WIN = { top: 226, width: 960, height: 470, bar: 52 } as const;
const VIEWPORT = { width: WIN.width, height: WIN.height - WIN.bar } as const;

/** How long the browser waits before a tooltip, and how long one is read:
 * properly in build 1, at a glance in build 2's sweep. */
const DELAY = 2;
const READ = 1.1;
const GLANCE = 0.7;
/** Build 2's sweep: the move between classes, and the wait for the build
 * (the zoom out) to land before it starts. */
const MOVE = 0.45;
const SETTLE = 1.5;

type Booking = (typeof BOOKINGS)[number];

const minutes = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};
/** A booking's row in the table: the half-hours from 07:30. */
const rowOf = (b: Booking) => (minutes(b[1]) - (7 * 60 + 30)) / 30;
const rectOf = (b: Booking) => cellRect(b[0], b[1]);
const byColumn = (p: Booking, q: Booking) => rectOf(p).x - rectOf(q).x;

function booking(room: string, start: string): Booking {
  const b = BOOKINGS.find(([r, s]) => r === room && s === start);
  if (!b) throw new Error(`No booking in ${room} at ${start}`);
  return b;
}

/** Where the pointer rests on a class: on its name, near the top. */
function tipOf(b: Booking) {
  const r = rectOf(b);
  return { x: r.x + r.w * 0.4, y: r.y + 9 };
}

/* Build 1: the BCA Sem VII classes in the 11:30 row, left to right. Their
 * cells read "BCA S em VII" and no more; the third is Dr. Nagane's. */
const HUNT = [
  booking("306 (48)", "11:30"),
  booking("402 (28)", "11:30"),
  booking("702 (44)", "11:30"),
] as const;
const FOUND = HUNT[HUNT.length - 1]!;

/* Build 2: every class on the page, row by row, left to right. */
const ALL = [...BOOKINGS].sort((p, q) => rowOf(p) - rowOf(q) || byColumn(p, q));

/* Dr. Nagane's day: 702 from 10:30 to 12:30, two bookings back to back. */
const THEIRS = (() => {
  const first = rectOf(booking("702 (44)", "10:30"));
  const second = rectOf(FOUND);
  return { ...first, h: second.y + second.h - first.y };
})();

/** Where the window looks: a zoom, and the page point at its top-left. */
interface View {
  k: number;
  x: number;
  y: number;
}
/** Build 1: the thirteen rooms from 305 to 704, edge to edge, from the room
 * names down past the 11:30 row, big enough to read. */
const CLOSE: View = (() => {
  const left = rectOf(booking("305 (48)", "11:30")).x;
  const right = rectOf(booking("705 (34)", "08:00")).x;
  return { k: VIEWPORT.width / (right - left), x: left, y: LAYOUT.tableTop };
})();
/** Build 2: the whole day, every room across. */
const WHOLE: View = { k: WIN.width / VIEW.width, x: 0, y: 236 };
const layerAt = ({ k, x, y }: View) => ({ x: -x * k, y: -y * k, scale: k });

/* The site's own hover, from its stylesheet: the link underlines, and the
 * row's time cell goes pink with dark text (`tr:hover td.row_labels`). */
const ROW_HOVER = { background: "#ffc0da", ink: "#0B263B" } as const;

/* The deck's good, as hex, for the found rings. Keep in step with --good in
 * globals.css. */
const GOOD = "#2f7a4b";

/* The tooltip, as macOS draws the browser's: a dark, translucent, blurred
 * plate with light text, in page pixels (it zooms with the window). */
const TIP = { width: 246, below: 22 } as const;
const TOOLTIP: CSSProperties = {
  maxWidth: TIP.width,
  padding: "3px 7px 4px",
  borderRadius: 5,
  background: "rgba(34,34,36,0.8)",
  backdropFilter: "blur(14px) saturate(1.5)",
  WebkitBackdropFilter: "blur(14px) saturate(1.5)",
  boxShadow:
    "inset 0 0 0 0.5px rgba(255,255,255,0.24), 0 0 0 0.5px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.28)",
  color: "#ececec",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
  fontSize: 12,
  lineHeight: "14.5px",
  // The site's titles keep their double spaces, and so does the tooltip.
  whiteSpace: "pre-wrap",
};

/** Under the pointer, kept inside the window's left and right edges. */
function tooltipAt(b: Booking, view: View) {
  const tip = tipOf(b);
  const left = view.x + 8;
  const right = view.x + VIEWPORT.width / view.k - 8;
  return {
    left: Math.max(left, Math.min(tip.x - 3, right - TIP.width)),
    top: tip.y + TIP.below,
  };
}

/* The pointing hand the browser shows over a link, from the deck's icon set:
 * white with a dark outline, its hotspot on the fingertip. */
const HAND = { size: 24, hotX: (116 / 256) * 24, hotY: (16 / 256) * 24 };

/* ------------------------------------------------------------------------ */

interface HoverTarget {
  link: HTMLElement;
  label: HTMLElement;
  labelLink: HTMLElement | null;
  labelBackground: string;
  labelInk: string;
}

/** The live elements a class's hover changes, inside the page's shadow root. */
function hoverTargets(page: Element | null | undefined) {
  const rows = page?.shadowRoot?.querySelectorAll<HTMLTableRowElement>(
    "#day_main > tbody > tr",
  );
  return (b: Booking): HoverTarget | null => {
    const row = rows?.[rowOf(b)];
    if (!row) return null;
    // Classes with the same title can start in the same row (the three exam
    // halls): the nth of them from the left is the nth such link.
    const twins = BOOKINGS.filter(
      ([, start, , , title]) => start === b[1] && title === b[4],
    ).sort(byColumn);
    const link = [...row.querySelectorAll<HTMLElement>("td a[title]")].filter(
      (a) => a.title === b[4],
    )[twins.indexOf(b)];
    const label = row.querySelector<HTMLElement>("td.row_labels");
    if (!link || !label) return null;
    const labelLink = label.querySelector<HTMLElement>("a");
    return {
      link,
      label,
      labelLink,
      labelBackground: getComputedStyle(label).backgroundColor,
      labelInk: labelLink ? getComputedStyle(labelLink).color : "",
    };
  };
}

function hover(
  tl: gsap.core.Timeline,
  t: HoverTarget | null,
  on: boolean,
  at: string | number,
) {
  if (!t) return;
  tl.set(t.link, { textDecoration: on ? "underline" : "none" }, at);
  tl.set(
    t.label,
    { backgroundColor: on ? ROW_HOVER.background : t.labelBackground },
    at,
  );
  if (t.labelLink)
    tl.set(t.labelLink, { color: on ? ROW_HOVER.ink : t.labelInk }, at);
}

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Writes a counter's text, found under `scope`. */
const writer = (scope: Element | null, selector: string) => (value: string) => {
  const el = scope?.querySelector(selector);
  if (el) el.textContent = value;
};

/* ------------------------------------------------------------------------ */

export function FacultyHunt({ step, active }: FacultyHuntProps) {
  const root = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();

  const builds = useSteps(root, step, (tl, mark) => {
    const scope = root.current;
    const target = hoverTargets(scope?.querySelector(".fh-page"));

    // Build 0 holds the question in the middle of the box; it travels up.
    gsap.set(".fh-question", {
      y: 300,
      scale: 1.12,
      transformOrigin: "0% 50%",
    });
    gsap.set(".fh-layer", { ...layerAt(CLOSE), transformOrigin: "0 0" });

    // 1: if you know their classes.
    tl.to(".fh-question", {
      y: 0,
      scale: 1,
      duration: 0.85,
      ease: "deck.morph",
    });
    tl.fromTo(
      ".fh-label-known",
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "-=0.35",
    );
    tl.fromTo(
      ".fh-window",
      { autoAlpha: 0, y: 60 },
      { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out" },
      "<0.05",
    );
    tl.fromTo(
      ".fh-counters",
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "<0.3",
    );

    // The hand rests on each class in turn. Nothing shows for two seconds;
    // then the tooltip, read, and on to the next, which hides it.
    const start = tipOf(HUNT[0]);
    tl.set(".fh-hand", { x: start.x - 70, y: start.y + 150 });
    tl.fromTo(
      ".fh-hand",
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.25, ease: "power1.out" },
    );
    const hovered = { n: 0 };
    const waited = { s: 0 };
    const writeHovered = writer(scope, ".fh-n-one");
    const writeWaited = writer(scope, ".fh-t-one");
    HUNT.forEach((b, i) => {
      const tip = tipOf(b);
      const t = target(b);
      tl.to(".fh-hand", {
        x: tip.x,
        y: tip.y,
        duration: i ? 0.6 : 0.75,
        ease: "deck.morph",
      });
      const at = `hover${i}`;
      tl.addLabel(at);
      hover(tl, t, true, at);
      tl.to(
        hovered,
        {
          n: i + 1,
          duration: 0.15,
          ease: "none",
          onUpdate: () => writeHovered(String(Math.round(hovered.n))),
        },
        at,
      );
      tl.to(
        waited,
        {
          s: (i + 1) * DELAY,
          duration: DELAY,
          ease: "none",
          onUpdate: () => writeWaited(clock(waited.s)),
        },
        at,
      );
      tl.fromTo(
        `.fh-tip-${i}`,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.12, ease: "power1.out" },
        `${at}+=${DELAY}`,
      );
      if (i < HUNT.length - 1) {
        tl.set(`.fh-tip-${i}`, { autoAlpha: 0 }, `${at}+=${DELAY + READ}`);
        hover(tl, t, false, `${at}+=${DELAY + READ}`);
      }
    });
    // The third is them.
    tl.fromTo(
      ".fh-ring-one",
      { autoAlpha: 0, scale: 1.12 },
      { autoAlpha: 1, scale: 1, duration: 0.35, ease: "deck.enter" },
      `+=${0.35}`,
    );
    tl.fromTo(
      ".fh-found",
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "<0.1",
    );
    mark();

    // 2: if you don't, every class on the page.
    const last = HUNT.length - 1;
    tl.addLabel("all");
    tl.to(
      ".fh-found",
      { autoAlpha: 0, y: -10, duration: 0.3, ease: "power2.in" },
      "all",
    );
    tl.to(
      [".fh-ring-one", `.fh-tip-${last}`, ".fh-hand"],
      { autoAlpha: 0, duration: 0.2, ease: "power1.in" },
      "all",
    );
    hover(tl, target(FOUND), false, "all");
    tl.to(
      ".fh-label-known",
      { autoAlpha: 0, y: -18, duration: 0.35, ease: "power2.in" },
      "all",
    );
    tl.fromTo(
      ".fh-label-all",
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "all+=0.3",
    );
    // The window steps back until the whole day is in it.
    tl.to(
      ".fh-layer",
      { ...layerAt(WHOLE), duration: 1, ease: "deck.morph" },
      "all+=0.15",
    );
    tl.set([".fh-n-one", ".fh-t-one"], { autoAlpha: 0 }, "all+=0.6");
    tl.set([".fh-n-all", ".fh-t-all"], { autoAlpha: 1 }, "all+=0.6");
    tl.fromTo(
      ".fh-of",
      { autoAlpha: 0, x: -12 },
      { autoAlpha: 1, x: 0, duration: 0.45, ease: "deck.enter" },
      "all+=0.6",
    );
    // The hand comes back on the day's first class. From there the hunt runs
    // on its own, in real time: see the loop below.
    const first = tipOf(ALL[0]!);
    tl.set(".fh-hand", { x: first.x, y: first.y }, "all+=1.15");
    tl.to(
      ".fh-hand",
      { autoAlpha: 1, duration: 0.2, ease: "power1.out" },
      "all+=1.15",
    );
    mark();
  });

  /* Build 2's hunt, at the site's own pace: to the next class, two seconds
   * still before its tooltip, a glance, on. A hundred classes take over five
   * minutes, so this is a loop of its own once the build lands, not part of
   * the build: stepping back mid-hunt must not play it backwards. It stops
   * when the slide leaves or the step changes, and under reduced motion it
   * shows where it would end. */
  useGSAP(
    () => {
      if (!active || step < 2) return;
      const scope = root.current;
      const writeHovered = writer(scope, ".fh-n-all");
      const writeWaited = writer(scope, ".fh-t-all");
      const reset = () => {
        writeHovered("0");
        writeWaited("0:00");
      };
      if (instant) {
        gsap.set(".fh-hand", { autoAlpha: 0 });
        gsap.set([".fh-wash", ".fh-ring-all"], { autoAlpha: 1 });
        writeHovered(String(ALL.length));
        writeWaited(clock(ALL.length * DELAY));
        return reset;
      }

      const target = hoverTargets(scope?.querySelector(".fh-page"));
      const tooltip = scope?.querySelector<HTMLElement>(".fh-tip-live");
      const waited = { s: 0 };
      // It starts once the window has stepped back to the whole day: if build
      // 1 is still playing (stepped through quickly), after the rest of it
      // too, so no tooltip shows for a class the window does not show yet.
      const tl = builds.current;
      const behind = tl ? Math.max(0, (tl.labels.s1 ?? 0) - tl.time()) : 0;
      const loop = gsap.timeline({ delay: SETTLE + behind });
      ALL.forEach((b, i) => {
        const t = target(b);
        if (i) {
          const tip = tipOf(b);
          loop.to(".fh-hand", {
            x: tip.x,
            y: tip.y,
            duration: MOVE,
            ease: "power2.out",
          });
        }
        const at = `class${i}`;
        loop.addLabel(at);
        hover(loop, t, true, at);
        loop.call(() => writeHovered(String(i + 1)), [], at);
        loop.to(
          waited,
          {
            s: (i + 1) * DELAY,
            duration: DELAY,
            ease: "none",
            onUpdate: () => writeWaited(clock(waited.s)),
          },
          at,
        );
        if (tooltip) {
          loop.call(() => (tooltip.textContent = b[4]), [], at);
          loop.set(tooltip, tooltipAt(b, WHOLE), at);
          loop.set(tooltip, { autoAlpha: 1 }, `${at}+=${DELAY}`);
          loop.set(tooltip, { autoAlpha: 0 }, `${at}+=${DELAY + GLANCE}`);
        }
        hover(loop, t, false, `${at}+=${DELAY + GLANCE}`);
      });
      // All hundred read; theirs were two of them. The rest steps back.
      loop.to(".fh-hand", { autoAlpha: 0, duration: 0.2, ease: "power1.in" });
      loop.fromTo(
        ".fh-wash",
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.5, ease: "power2.out" },
        "<",
      );
      loop.fromTo(
        ".fh-ring-all",
        { autoAlpha: 0, scale: 1.12 },
        { autoAlpha: 1, scale: 1, duration: 0.4, ease: "deck.enter" },
        "<0.1",
      );
      return reset;
    },
    {
      scope: root,
      dependencies: [step, active, instant],
      revertOnUpdate: true,
    },
  );

  return (
    <div
      ref={root}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div className="relative shrink-0" style={BOX}>
        {/* The question */}
        <div className="fh-question absolute top-0 left-0 flex items-start gap-5">
          <span
            className="bg-sunken text-body flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[22px]"
            style={{ boxShadow: "inset 0 0 0 1px var(--line)" }}
          >
            <Icon name="user" size={36} />
          </span>
          <div>
            <div
              className="bg-raised rounded-[22px] rounded-tl-[8px] px-8 py-6"
              style={{
                boxShadow: "inset 0 0 0 1px var(--line), var(--shadow-2)",
              }}
            >
              <div className="font-display text-fg text-[40px] leading-tight font-semibold tracking-[-0.025em] whitespace-nowrap">
                Where is Dr. Nagane right now?
              </div>
            </div>
            <div className="t-small text-muted mt-3 ml-2">
              A BCA Sem VII student <span className="tabular">· 11:44</span>
            </div>
          </div>
        </div>

        {/* What we are searching */}
        <div className="absolute left-0" style={{ top: 168 }}>
          {/* divs, not p: the global `p { text-wrap: pretty }` is unlayered
              and would beat Tailwind's nowrap, breaking the line. */}
          <div className="fh-label-known t-h3 text-fg invisible absolute top-0 left-0 whitespace-nowrap">
            If you know their classes:{" "}
            <span className="text-muted">hover each one</span>
          </div>
          <div className="fh-label-all t-h3 text-fg invisible absolute top-0 left-0 whitespace-nowrap">
            If you don&apos;t:{" "}
            <span className="text-muted">hover every class today</span>
          </div>
        </div>

        {/* The timetable site */}
        <div
          className="fh-window invisible absolute left-0"
          style={{ top: WIN.top }}
        >
          <BrowserFrame
            url="time-table.sicsr.ac.in/day.php?year=2026&month=10&day=06&area=1&room=29"
            insecure
            width={WIN.width}
            height={WIN.height}
          >
            <div className="absolute inset-0 overflow-hidden bg-white">
              <div
                className="fh-layer absolute top-0 left-0"
                style={{ width: VIEW.width, height: VIEW.height }}
              >
                <MrbsStatic className="fh-page" />
                <Wash />
                <Ring rect={rectOf(FOUND)} className="fh-ring-one" />
                <Ring rect={THEIRS} className="fh-ring-all" />
                {HUNT.map((b, i) => (
                  <Tooltip
                    key={b[0]}
                    text={b[4]}
                    at={tooltipAt(b, CLOSE)}
                    className={`fh-tip-${i}`}
                  />
                ))}
                {/* Build 2's tooltip: one, moved and refilled per class. */}
                <Tooltip
                  text=""
                  at={{ left: 0, top: 0 }}
                  className="fh-tip-live"
                />
                <Hand />
              </div>

              {/* Found, in build 1 */}
              <div
                className="fh-found bg-raised invisible absolute flex items-center gap-4 rounded-[22px] px-6"
                style={{
                  left: 16,
                  right: 16,
                  bottom: 14,
                  height: 64,
                  boxShadow: "inset 0 0 0 1px var(--line), var(--shadow-2)",
                }}
              >
                <Icon name="checkCircle" size={32} stroke={2} color={GOOD} />
                <span className="text-fg text-[24px] font-semibold tracking-[-0.01em] whitespace-nowrap">
                  Dr. Aniket Nagane
                </span>
                <span className="text-muted truncate text-[22px]">
                  Android Programming, Room 702{" "}
                  <span className="tabular">· 11:30</span>
                </span>
              </div>
            </div>
          </BrowserFrame>
        </div>

        {/* The counters, and what they add up to. Two columns from their left
            edges, so the totals build 2 adds after them move nothing. */}
        <div
          className="fh-counters invisible absolute inset-x-0 bottom-0 grid grid-cols-2 items-end"
          style={{ top: WIN.top + WIN.height + 20 }}
        >
          <div className="flex flex-col gap-2">
            <span className="t-small text-muted">Classes hovered</span>
            <span className="flex items-baseline gap-3">
              <span className="text-fg grid">
                <Counter className="fh-n-one" value="0" />
                <Counter className="fh-n-all invisible" value="0" />
              </span>
              <span className="fh-of t-body text-muted tabular invisible whitespace-nowrap">
                of {ALL.length}
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="t-small text-muted">Waiting for tooltips</span>
            <span className="flex items-baseline gap-3">
              <span className="text-fg grid">
                <Counter className="fh-t-one" value="0:00" />
                <Counter className="fh-t-all invisible" value="0:00" />
              </span>
              <span className="fh-of t-body text-accent tabular invisible whitespace-nowrap">
                of {clock(ALL.length * DELAY)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function Counter({ className, value }: { className: string; value: string }) {
  return (
    <span
      className={`t-mono col-start-1 row-start-1 text-[76px] leading-none font-semibold tracking-[-0.04em] tabular-nums ${className}`}
    >
      {value}
    </span>
  );
}

function Tooltip({
  text,
  at,
  className,
}: {
  text: string;
  at: { left: number; top: number };
  className: string;
}) {
  return (
    <div
      className={`pointer-events-none invisible absolute w-max ${className}`}
      style={{ ...TOOLTIP, left: at.left, top: at.top }}
    >
      {text}
    </div>
  );
}

function Hand() {
  return (
    <div
      className="fh-hand pointer-events-none invisible absolute top-0 left-0"
      style={{
        width: HAND.size,
        height: HAND.size,
        marginLeft: -HAND.hotX,
        marginTop: -HAND.hotY,
        filter: "drop-shadow(0 1px 1.2px rgba(0,0,0,0.35))",
      }}
    >
      <Icon
        name="hand"
        weight="fill"
        color="#ffffff"
        size={HAND.size}
        className="absolute inset-0"
      />
      <Icon
        name="hand"
        weight="regular"
        color="#111111"
        size={HAND.size}
        className="absolute inset-0"
      />
    </div>
  );
}

/** A found class, ringed in the deck's good green. */
function Ring({
  rect,
  className,
}: {
  rect: { x: number; y: number; w: number; h: number };
  className: string;
}) {
  const pad = 3;
  return (
    <div
      className={`pointer-events-none invisible absolute rounded-[5px] ${className}`}
      style={{
        left: rect.x - pad,
        top: rect.y - pad,
        width: rect.w + pad * 2,
        height: rect.h + pad * 2,
        boxShadow: `0 0 0 3px ${GOOD}`,
      }}
    />
  );
}

/** Washes the page back towards the stage, except Dr. Nagane's classes. */
function Wash() {
  const pad = 3;
  return (
    <svg
      aria-hidden
      className="fh-wash pointer-events-none invisible absolute inset-0"
      width={VIEW.width}
      height={VIEW.height}
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
    >
      <path
        fillRule="evenodd"
        fill="#f2f3f6"
        fillOpacity={0.72}
        d={[
          `M0,0H${VIEW.width}V${VIEW.height}H0Z`,
          `M${THEIRS.x - pad},${THEIRS.y - pad}`,
          `h${THEIRS.w + pad * 2}v${THEIRS.h + pad * 2}h${-(THEIRS.w + pad * 2)}Z`,
        ].join("")}
      />
    </svg>
  );
}
