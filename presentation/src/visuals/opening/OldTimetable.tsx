"use client";

import { useRef } from "react";

import { gsap, MORPH, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import {
  BROWSER_SHADOW,
  BrowserBar,
  PHONE_BODY,
  PHONE_SCREEN,
  StatusBar,
} from "~/ui/frames";
import { Icon, type IconName } from "~/ui/icon";

import {
  CONTENT,
  DEVICES,
  MrbsPage,
  PAINT,
  PHONE_K,
  PHONE_STATUS,
  RING_PAD,
  ringRect,
  ringStrokes,
  TARGETS,
  VIEW,
  type Device,
  type PageRect,
  type RingId,
} from "./_oldtimetable-page";

export interface OldTimetableProps {
  step: number;
  active: boolean;
  /** Put on the device, so it can travel between slides. */
  flipId?: string;
}

/**
 * The college's timetable today: the real page from time-table.sicsr.ac.in
 * (an MRBS install), copied one to one, in a browser window marked "Not
 * secure" (it is plain HTTP). Every room in the college across one screen,
 * names cut off mid-word, no way to see only your classes. Hovering a booking
 * shows its full name and faculty, as it does on the site.
 *
 * `flipId` goes on the device: the next slide (three-apps) draws a small
 * timetable window with the same id, so this window shrinks into it.
 *
 * Builds (steps = 5):
 *   0: the page loads in (slowly): a progress strip, then the page painting
 *      top-down, the table a few rows at a time. Plays on arrival.
 *   1: the page washes back and the first callout is pinned on: one page for
 *      everybody (the row of rooms).
 *   2: the window becomes a phone. Its frame closes into an iPhone while the
 *      page re-flows into a phone's 980px window and shrinks onto the screen,
 *      every name now cut to a few letters, the first callout riding along.
 *      Then: desktop-sized text on a phone (a booking cut short).
 *   3: on the phone: it loads everything (the colour key of every division).
 *   4: back to the desktop window, the callouts travelling with it, and the
 *      last one: plain HTTP (the "Not secure" label in the address bar).
 * Each ring opens a clear window in the wash, so what it points at keeps its
 * colour.
 */

/** The 960 × 844 box the side layout gives us. */
const BOX = { width: 960, height: 844 } as const;
const URL =
  "time-table.sicsr.ac.in/day.php?year=2026&month=10&day=06&area=1&room=29";

/** The desktop browser window, in box pixels. */
const DESK = {
  x: 10,
  y: 22,
  w: CONTENT.width,
  h: CONTENT.height + 52,
  bar: 52,
  radius: 18,
} as const;

/** The phone it turns into: PhoneFrame's iPhone, against the box's right edge. */
const K = PHONE_K;
const PHONE = {
  x: DESK.x + DESK.w - PHONE_BODY.width * K,
  y: 12,
  w: PHONE_BODY.width * K,
  h: PHONE_BODY.height * K,
  radius: PHONE_BODY.radius * K,
  bezel: PHONE_BODY.bezel * K,
  screenRadius: PHONE_BODY.screenRadius * K,
  status: PHONE_STATUS * K,
} as const;

/** Safari's bottom bar, with the home indicator under it, in phone pixels. */
const SAFARI_H = 100;

/** Where the page's (0, 0) falls in the box, on each device. */
const ORIGIN: Record<Device, { x: number; y: number }> = {
  desktop: { x: DESK.x, y: DESK.y + DESK.bar },
  phone: { x: PHONE.x + PHONE.bezel, y: PHONE.y + PHONE.bezel + PHONE.status },
};

/** A part of the page, on a device, in box pixels, with room around it. */
function onPage(device: Device, rect: PageRect, pad = 0) {
  const { scale } = DEVICES[device];
  const o = ORIGIN[device];
  return {
    x: o.x + rect.x * scale - pad,
    y: o.y + rect.y * scale - pad,
    w: rect.w * scale + pad * 2,
    h: rect.h * scale + pad * 2,
  };
}

/** Each part of the device, in each shape; the morph tweens between them. */
const SHAPE = {
  device: {
    desktop: {
      left: DESK.x,
      top: DESK.y,
      width: DESK.w,
      height: DESK.h,
      borderRadius: DESK.radius,
      backgroundColor: "#ffffff",
    },
    phone: {
      left: PHONE.x,
      top: PHONE.y,
      width: PHONE.w,
      height: PHONE.h,
      borderRadius: PHONE.radius,
      backgroundColor: "#1f2329",
    },
  },
  screen: {
    desktop: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      borderRadius: DESK.radius,
    },
    phone: {
      left: PHONE.bezel,
      top: PHONE.bezel,
      right: PHONE.bezel,
      bottom: PHONE.bezel,
      borderRadius: PHONE.screenRadius,
    },
  },
  viewport: { desktop: { top: DESK.bar }, phone: { top: PHONE.status } },
  page: {
    desktop: {
      width: DEVICES.desktop.width,
      height: DEVICES.desktop.height,
      scale: DEVICES.desktop.scale,
    },
    phone: {
      width: DEVICES.phone.width,
      height: DEVICES.phone.height,
      scale: DEVICES.phone.scale,
    },
  },
} as const;

/** A shadow written in phone pixels, at the phone's size on the canvas. */
const atPhoneSize = (shadow: string) =>
  shadow.replace(/(-?[\d.]+)px/g, (_, n: string) => `${+n * K}px`);

type CalloutId = RingId | "insecure";

interface Point {
  x: number;
  y: number;
}

/** The "Not secure" label in the window's address bar. */
const insecure = { x: DESK.x + 194, y: DESK.y + 9, w: 120, h: 34 };

/** Beside the phone, the chips end here, each level with what it points at. */
const RIGHT = 540;

/**
 * The chips: where each sits beside the desktop page and beside the phone.
 * Each is drawn where it first appears and moved by transform after that.
 */
const CHIPS: Record<
  CalloutId,
  {
    text: string;
    icon: IconName;
    w: number;
    h: number;
    at: Partial<Record<Device, Point>>;
    first: Device;
    /** The point the chip grows from: where its leader meets it. */
    origin: string;
  }
> = {
  // Over the three month calendars, big enough to hide them whole.
  "one-page": {
    text: "One page for the whole college",
    icon: "grid",
    w: 470,
    h: 64,
    at: { desktop: { x: 476, y: 132 }, phone: { x: RIGHT - 470, y: 161 } },
    first: "desktop",
    origin: "224px 64px",
  },
  // On the desktop, in the table's empty evening rows.
  "tiny-type": {
    text: "Desktop-sized text, on a phone",
    icon: "phone",
    w: 470,
    h: 60,
    at: { desktop: { x: 176, y: 535 }, phone: { x: RIGHT - 470, y: 262 } },
    first: "phone",
    origin: "100% 50%",
  },
  // On the desktop, under the end of the page.
  "loads-all": {
    text: "Loads everything, every visit",
    icon: "download",
    w: 470,
    h: 60,
    at: { desktop: { x: 405, y: 758 }, phone: { x: RIGHT - 470, y: 386 } },
    first: "phone",
    origin: "100% 50%",
  },
  // Hung under the label, wide enough to cover the banner's title and short
  // of its first divider, so no word or line pokes out.
  insecure: {
    text: "Not secure: plain HTTP",
    icon: "alert",
    w: 388,
    h: 60,
    at: { desktop: { x: 58, y: 80 } },
    first: "desktop",
    origin: "206px 0px",
  },
};

/** How far a chip has moved from where it is drawn, on a device. */
function offset(id: CalloutId, device: Device) {
  const { at, first } = CHIPS[id];
  const to = at[device]!;
  const from = at[first]!;
  return { x: to.x - from.x, y: to.y - from.y };
}

/** A leader, from the pin on the ring to the chip, with an optional bend. */
const path = (pin: Point, to: Point, bend?: Point) =>
  bend
    ? `M${pin.x},${pin.y} Q${bend.x},${bend.y} ${to.x},${to.y}`
    : `M${pin.x},${pin.y} L${to.x},${to.y}`;

const ring = (id: RingId, device: Device) =>
  onPage(device, TARGETS[device][id], RING_PAD[id]);
const mid = (r: { y: number; h: number }) => r.y + r.h / 2;

const LEADERS: { id: CalloutId; device: Device; d: string }[] = (() => {
  const rooms = {
    desktop: ring("one-page", "desktop"),
    phone: ring("one-page", "phone"),
  };
  const cell = {
    desktop: ring("tiny-type", "desktop"),
    phone: ring("tiny-type", "phone"),
  };
  const key = {
    desktop: ring("loads-all", "desktop"),
    phone: ring("loads-all", "phone"),
  };
  const foot = (r: { x: number; y: number; w: number; h: number }) => ({
    x: r.x + r.w / 2,
    y: r.y + r.h,
  });
  return [
    // Between the day's title and its links, straight down to the rooms.
    {
      id: "one-page",
      device: "desktop",
      d: path({ x: 700, y: rooms.desktop.y }, { x: 700, y: 132 + 64 }),
    },
    {
      id: "one-page",
      device: "phone",
      d: path(
        { x: rooms.phone.x, y: mid(rooms.phone) },
        { x: RIGHT, y: mid(rooms.phone) },
      ),
    },
    // Out of the foot of the cell and round into the chip.
    {
      id: "tiny-type",
      device: "desktop",
      d: path(
        foot(cell.desktop),
        { x: 176, y: 565 },
        { x: foot(cell.desktop).x, y: 565 },
      ),
    },
    {
      id: "tiny-type",
      device: "phone",
      d: path(
        foot(cell.phone),
        { x: RIGHT, y: 292 },
        { x: foot(cell.phone).x, y: 292 },
      ),
    },
    // Down past the end of the trailer's links, crossing only its rules.
    {
      id: "loads-all",
      device: "desktop",
      d: path({ x: 640, y: key.desktop.y + key.desktop.h }, { x: 640, y: 758 }),
    },
    {
      id: "loads-all",
      device: "phone",
      d: path(
        { x: key.phone.x, y: mid(key.phone) },
        { x: RIGHT, y: mid(key.phone) },
      ),
    },
    {
      id: "insecure",
      device: "desktop",
      d: path(
        { x: insecure.x + insecure.w / 2, y: insecure.y + insecure.h },
        { x: insecure.x + insecure.w / 2, y: 80 },
      ),
    },
  ];
})();

/** The deck's accent, as hex: these are drawn in SVG over the page. */
const ACCENT = "#c8305f";
const RINGS: RingId[] = ["one-page", "tiny-type", "loads-all"];

export function OldTimetable({ step, active, flipId }: OldTimetableProps) {
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
      const page = q(".ot-page");
      const progress = q(".ot-progress");
      const status = q(".ot-status");
      const paintTo = (y: number) => ({
        clipPath: `inset(0px 0px ${Math.max(0, VIEW.height - y).toFixed(2)}px 0px)`,
      });

      tl.set(page, paintTo(0), 0);
      tl.set(status, { opacity: 1 }, 0.08);
      tl.fromTo(
        progress,
        { scaleX: 0, opacity: 1 },
        { scaleX: 0.24, duration: 0.45, ease: "power2.out" },
        0.08,
      );
      // First paint: the banner. Then the calendars and the day's title,
      // then the room names.
      const [banner, header, rooms, ...rest] = PAINT;
      tl.set(page, paintTo(banner), 0.5);
      tl.to(
        progress,
        { scaleX: 0.42, duration: 0.45, ease: "power1.inOut" },
        0.55,
      );
      tl.set(page, paintTo(header), 0.68);
      tl.set(q(".ot-status-wait"), { display: "none" }, 0.74);
      tl.set(q(".ot-status-data"), { display: "inline" }, 0.74);
      tl.set(page, paintTo(rooms), 0.9);

      // The table paints top-down, a few rows at a time, unevenly; the
      // colour key and the links under it come last.
      const gaps = [
        0.1, 0.06, 0.12, 0.07, 0.11, 0.06, 0.1, 0.09, 0.07, 0.12, 0.06, 0.09,
        0.08,
      ];
      let t = 1.0;
      rest.forEach((y, i) => {
        tl.set(page, paintTo(y), t);
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
    // Chips first seen beside the phone start there.
    for (const id of ["tiny-type", "loads-all"] as const) {
      gsap.set(`.ot-chip-${id}`, offset(id, "phone"));
    }
    // Later tweens on the same properties must not render at build time.
    const later = { immediateRender: false } as const;

    const draw = (id: CalloutId, device: Device, at: number) => {
      tl.fromTo(
        `.ot-line-${id}-${device}`,
        { drawSVG: "0% 0%", autoAlpha: 0 },
        {
          drawSVG: "0% 100%",
          autoAlpha: 1,
          duration: 0.5,
          ease: "power3.out",
          ...later,
        },
        at,
      );
    };
    // A leader lets go of its chip and runs back into its ring.
    const retract = (id: CalloutId, device: Device, at: number) => {
      tl.fromTo(
        `.ot-line-${id}-${device}`,
        { drawSVG: "0% 100%", autoAlpha: 1 },
        {
          drawSVG: "0% 0%",
          autoAlpha: 0,
          duration: 0.3,
          ease: "power2.in",
          ...later,
        },
        at,
      );
    };
    const land = (id: CalloutId, device: Device, at: number) => {
      if (id === "insecure") {
        tl.fromTo(
          ".ot-pin-insecure",
          // The origin goes in the "from" state: given only in the "to",
          // GSAP would shift the ring to hide the change of origin. The ring
          // lands from a little larger, like a loupe settling on the page.
          { scale: 1.18, opacity: 0, transformOrigin: "50% 50%" },
          { scale: 1, opacity: 1, duration: 0.5, ease: "deck.enter" },
          at,
        );
      } else {
        tl.fromTo(
          `.ot-hole-${id}`,
          { opacity: 0 },
          { opacity: 1, duration: 0.45, ease: "power2.out" },
          at,
        );
        tl.fromTo(
          `.ot-ring-${id}`,
          { scale: 1.18, opacity: 0, transformOrigin: "50% 50%" },
          { scale: 1, opacity: 1, duration: 0.5, ease: "deck.enter" },
          at,
        );
      }
      draw(id, device, at + 0.18);
      tl.fromTo(
        `.ot-chip-${id}`,
        { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.4)" },
        at + 0.55,
      );
    };

    /*
     * The window and the phone are one object. Its box, corners and body
     * colour travel; the page inside is laid out in a narrowing window
     * (1440 to 980 page pixels) as its scale shrinks, so it re-flows on the
     * way; the rings and their windows in the wash move with the page, and
     * the chips travel to their places beside it.
     */
    const morph = (from: Device, to: Device, at: number, rings: RingId[]) => {
      const travel = { ...MORPH, ...later };
      tl.fromTo(
        ".ot-device",
        SHAPE.device[from],
        { ...SHAPE.device[to], ...travel },
        at,
      );
      tl.fromTo(
        ".ot-screen",
        SHAPE.screen[from],
        { ...SHAPE.screen[to], ...travel },
        at,
      );
      tl.fromTo(
        ".ot-viewport",
        SHAPE.viewport[from],
        { ...SHAPE.viewport[to], ...travel },
        at,
      );
      tl.fromTo(
        ".ot-scaler",
        SHAPE.page[from],
        { ...SHAPE.page[to], ...travel },
        at,
      );

      // The window's toolbar and edge give way to the phone's titanium body,
      // its status bar and Safari's bar, as the shape nears the phone's.
      const phone = to === "phone";
      const leave = { duration: 0.35, ease: "power1.in", ...later };
      const arrive = { duration: 0.4, ease: "power1.out", ...later };
      tl.fromTo(
        ".ot-desk-chrome",
        { opacity: phone ? 1 : 0 },
        { opacity: phone ? 0 : 1, ...(phone ? leave : arrive) },
        phone ? at : at + 0.55,
      );
      tl.fromTo(
        ".ot-phone-chrome",
        { opacity: phone ? 0 : 1 },
        { opacity: phone ? 1 : 0, ...(phone ? arrive : leave) },
        phone ? at + 0.55 : at,
      );

      for (const id of rings) {
        tl.fromTo(
          [`.ot-ring-${id} rect`, `.ot-hole-${id}`],
          { attr: ringRect(id, from) },
          { attr: ringRect(id, to), ...travel },
          at,
        );
        const a = ringStrokes(from);
        const b = ringStrokes(to);
        tl.fromTo(
          `.ot-ring-${id} .ot-ring-line`,
          { attr: { "stroke-width": a.line } },
          { attr: { "stroke-width": b.line }, ...travel },
          at,
        );
        tl.fromTo(
          `.ot-ring-${id} .ot-ring-halo`,
          { attr: { "stroke-width": a.halo } },
          { attr: { "stroke-width": b.halo }, ...travel },
          at,
        );
        tl.fromTo(
          `.ot-chip-${id}`,
          offset(id, from),
          { ...offset(id, to), ...travel },
          at,
        );
      }
    };

    // 1: one page for everybody.
    tl.to(".ot-dim", { opacity: 1, duration: 0.6, ease: "power2.out" }, 0);
    land("one-page", "desktop", 0.15);
    mark();

    // 2: the same page, on a phone.
    let t = tl.duration();
    retract("one-page", "desktop", t);
    morph("desktop", "phone", t + 0.15, ["one-page"]);
    t += 0.15 + MORPH.duration;
    draw("one-page", "phone", t - 0.05);
    land("tiny-type", "phone", t + 0.05);
    mark();

    // 3: and it loads everything.
    land("loads-all", "phone", tl.duration());
    mark();

    // 4: back to the window, for the last one.
    t = tl.duration();
    RINGS.forEach((id) => retract(id, "phone", t));
    morph("phone", "desktop", t + 0.15, RINGS);
    t += 0.15 + MORPH.duration;
    RINGS.forEach((id, i) => draw(id, "desktop", t - 0.05 + i * 0.06));
    land("insecure", "desktop", t + 0.05);
    mark();
  });

  return (
    <div
      ref={ref}
      className="absolute top-0 left-0"
      style={{ width: BOX.width, height: BOX.height }}
    >
      <div
        data-flip-id={flipId}
        className="ot-device absolute"
        style={{ ...SHAPE.device.desktop }}
      >
        {/* The window's edge and shadow; the phone's titanium body and its. */}
        <div
          className="ot-desk-chrome pointer-events-none absolute inset-0"
          style={{ borderRadius: "inherit", boxShadow: BROWSER_SHADOW }}
        />
        <div
          className="ot-phone-chrome pointer-events-none absolute inset-0"
          style={{
            borderRadius: "inherit",
            background: PHONE_BODY.background,
            boxShadow: atPhoneSize(`${PHONE_BODY.edge}, ${PHONE_BODY.shadow}`),
            opacity: 0,
          }}
        />
        <div
          data-enter
          className="ot-screen absolute overflow-hidden bg-white"
          style={{ ...SHAPE.screen.desktop }}
        >
          <div
            className="ot-viewport absolute inset-x-0 bottom-0"
            style={{ ...SHAPE.viewport.desktop }}
          >
            <MrbsPage />
          </div>
          <div className="ot-desk-chrome absolute inset-x-0 top-0">
            <BrowserBar url={URL} insecure />
          </div>
          <PhoneBars />
        </div>
      </div>

      <svg
        data-no-enter
        className="pointer-events-none absolute inset-0"
        width={BOX.width}
        height={BOX.height}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        aria-hidden
      >
        {LEADERS.map(({ id, device, d }) => (
          <g key={`${id}-${device}`}>
            {/* A pale halo keeps the line clean where it crosses the page. */}
            <path
              className={`ot-line-${id}-${device}`}
              d={d}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.9}
              strokeWidth={8}
              strokeLinecap="round"
              style={{ visibility: "hidden" }}
            />
            <path
              className={`ot-line-${id}-${device}`}
              d={d}
              fill="none"
              stroke={ACCENT}
              strokeWidth={3}
              strokeLinecap="round"
              style={{ visibility: "hidden" }}
            />
          </g>
        ))}
        <g className="ot-pin-insecure" style={{ opacity: 0 }}>
          <rect
            x={insecure.x - 1.5}
            y={insecure.y - 1.5}
            width={insecure.w + 3}
            height={insecure.h + 3}
            rx={9.5}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.9}
            strokeWidth={3}
          />
          <rect
            x={insecure.x}
            y={insecure.y}
            width={insecure.w}
            height={insecure.h}
            rx={8}
            fill="none"
            stroke={ACCENT}
            strokeWidth={3}
          />
        </g>
      </svg>

      {(Object.keys(CHIPS) as CalloutId[]).map((id) => {
        const c = CHIPS[id];
        const at = c.at[c.first]!;
        return (
          <div
            key={id}
            data-no-enter
            className={`ot-chip-${id} bg-raised text-fg absolute flex items-center justify-center gap-3.5 rounded-xl whitespace-nowrap`}
            style={{
              left: at.x,
              top: at.y,
              width: c.w,
              height: c.h,
              padding: "0 24px 0 18px",
              boxShadow: "inset 0 0 0 1px var(--line-strong), var(--shadow-2)",
              transformOrigin: c.origin,
              opacity: 0,
            }}
          >
            <Icon name={c.icon} size={28} className="text-accent" />
            <span className="font-body text-[26px] font-semibold tracking-[-0.01em]">
              {c.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The phone's own furniture, drawn in phone pixels and scaled to the phone:
 * the status bar (on the page's banner colour, which Safari carries up behind
 * it) with the island, and Safari's address bar floating over the foot of the
 * page with the home indicator under it. Each is pinned to its edge of the
 * screen, so it sits right while the screen is still changing shape.
 */
function PhoneBars() {
  return (
    <>
      <div
        className="ot-phone-chrome pointer-events-none absolute inset-x-0 top-0"
        style={{ height: PHONE.status, background: "#4b667b", opacity: 0 }}
      >
        <div
          className="absolute top-0 left-1/2"
          style={{
            width: PHONE_SCREEN.width,
            height: PHONE_STATUS,
            transform: `translateX(-50%) scale(${K})`,
            transformOrigin: "50% 0",
          }}
        >
          <StatusBar ink="#ffffff" />
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black"
            style={PHONE_BODY.island}
          />
        </div>
      </div>
      <div
        className="ot-phone-chrome pointer-events-none absolute inset-x-0 bottom-0"
        style={{ height: SAFARI_H * K, opacity: 0 }}
      >
        <div
          className="absolute bottom-0 left-1/2"
          style={{
            width: PHONE_SCREEN.width,
            height: SAFARI_H,
            transform: `translateX(-50%) scale(${K})`,
            transformOrigin: "50% 100%",
          }}
        >
          <div
            className="absolute flex items-center gap-2.5 rounded-full"
            style={{
              left: 12,
              right: 12,
              bottom: 30,
              height: 50,
              padding: "0 16px",
              background: "rgba(249,249,251,0.92)",
              boxShadow:
                "inset 0 0 0 0.5px rgba(0,0,0,0.08), 0 8px 24px -6px rgba(16,24,40,0.25)",
              color: "rgba(60,60,67,0.6)",
              fontFamily: "-apple-system, system-ui, sans-serif",
              fontSize: 15,
            }}
          >
            <Icon name="chevronLeft" size={20} stroke={2} />
            <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap">
              <span className="flex shrink-0 items-center gap-1 font-semibold text-[#c5221f]">
                <Icon name="alert" size={15} stroke={2.2} />
                Not Secure
              </span>
              <span className="h-3.5 w-px shrink-0 bg-current opacity-40" />
              <span className="truncate">time-table.sicsr.ac.in</span>
            </span>
            <Icon name="rotate" size={18} stroke={2} />
          </div>
          <div
            className="phone-home-indicator absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              bottom: 8,
              width: 134,
              height: 5,
              background: "rgba(13,17,23,0.85)",
            }}
          />
        </div>
      </div>
    </>
  );
}
