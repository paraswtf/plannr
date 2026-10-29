"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { PhoneFrame, StatusBar } from "~/ui/frames";
import { Icon } from "~/ui/icon";
import { courseTone, LIVE, MockTabBar } from "~/ui/mock";

import {
  BlockTag,
  DayBlock,
  type DayFrame,
  Finger,
  HourGrid,
  Meta,
  PHONE_HEIGHT,
  SCREEN_H,
  SCREEN_W,
  Toast,
  yOf,
} from "./_phone-kit";

export interface PhoneMyDayProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
  /**
   * The things Plannr does not do yet: the offline toast, tomorrow's test tag
   * and its deadline chip. Default true; pass false where the slide claims
   * only what is built.
   */
  extras?: boolean;
  /**
   * Whose day this is, when it is not the signed-in student's own (a
   * coordinator looking at a group): a pill on the header's date line,
   * "Viewing BCA-A" with the group icon, at the date's size or larger so it
   * reads from the back of the room. Unset, the header is as it was.
   */
  viewing?: string;
}

/** The day, inside each pane of the rail: 9am to 5pm. */
const DAY: DayFrame = { top: 18, startHour: 9, endHour: 17, rowH: 68 };
/** Where the rail of days starts on the screen. */
const RAIL_TOP = 196;
/** The week strip: five days across, one chip each. */
const STRIP = { top: 126, inset: 16 };
const CHIP_W = (SCREEN_W - STRIP.inset * 2) / 5;
const WEEK = [
  { d: "Mon", n: 10 },
  { d: "Tue", n: 11 },
  { d: "Wed", n: 12 },
  { d: "Thu", n: 13 },
  { d: "Fri", n: 14 },
];
/** 9:48am: twelve minutes before Design Thinking. */
const NOW = 9.8;
const INK = "#0d1117";
const DT = courseTone("Design Thinking");

/** Where the finger touches, in screen pixels. */
const SWIPE = { from: 330, to: 72, y: 470 };
const TODAY_BTN = { x: 336, y: 92 };

/**
 * Plannr's own day view on a phone: only your classes, in their course
 * colours, the next one lit.
 *
 * Builds (steps = 3):
 *   0: today's classes, the next one picked out.
 *   1: swipe to tomorrow: the day actually slides across (real travel, not a cross-fade).
 *   2: the "now" line and a next-class card: room, teacher, minutes until it starts.
 *
 * Today and tomorrow are two panes on one rail, header and timeline both: a
 * swipe translates the rail, so the whole day travels under the finger.
 */
export function PhoneMyDay({
  step,
  flipId,
  extras = true,
  viewing,
}: PhoneMyDayProps) {
  const ref = useRef<HTMLDivElement>(null);

  useSteps(ref, step, (tl, mark) => {
    gsap.set(".md-finger", { x: SWIPE.from, y: SWIPE.y, scale: 1.3 });
    gsap.set(".md-today", { opacity: 0, scale: 0.8 });
    gsap.set(".md-offline", { y: 60, opacity: 0 });
    gsap.set(".md-card", { y: 230, opacity: 0 });
    gsap.set(".md-nowline", { scaleX: 0, transformOrigin: "0% 50%" });
    gsap.set(".md-nowdot", { scale: 0 });
    gsap.set(".md-nowlabel", { opacity: 0, x: 8 });

    // 1 — the finger lands on the right, drags the day left, lets go; the
    // rail carries on to tomorrow under its own momentum.
    tl.to(".md-finger", {
      opacity: 1,
      scale: 1,
      duration: 0.25,
      ease: "power2.out",
    });
    tl.addLabel("drag");
    tl.to(
      ".md-finger",
      { x: SWIPE.to, duration: 0.55, ease: "power2.in" },
      "drag",
    );
    tl.to(
      ".md-rail",
      { x: SWIPE.to - SWIPE.from, duration: 0.55, ease: "power2.in" },
      "drag",
    );
    tl.addLabel("fling", "drag+=0.55");
    tl.to(
      ".md-finger",
      { opacity: 0, scale: 1.25, duration: 0.3, ease: "power1.out" },
      "fling",
    );
    tl.to(
      ".md-rail",
      { x: -SCREEN_W, duration: 0.5, ease: "power3.out" },
      "fling",
    );
    tl.to(
      ".md-pill",
      { x: CHIP_W, duration: 0.8, ease: "power3.inOut" },
      "drag+=0.15",
    );
    tl.to(".md-chip-1", { color: INK, duration: 0.3 }, "drag+=0.4");
    tl.to(".md-chip-2", { color: "#ffffff", duration: 0.3 }, "drag+=0.4");
    tl.to(
      ".md-offline",
      { y: 0, opacity: 1, duration: 0.6, ease: "deck.enter" },
      "fling+=0.2",
    );
    tl.to(
      ".md-today",
      { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" },
      "fling+=0.3",
    );
    mark();

    // 2 — tap Today: the rail slides back, then the present is drawn in and
    // the next class rises up to meet you.
    tl.set(".md-finger", { x: TODAY_BTN.x, y: TODAY_BTN.y, scale: 1.3 });
    tl.to(".md-finger", {
      opacity: 1,
      scale: 1,
      duration: 0.22,
      ease: "power2.out",
    });
    tl.to(".md-today", { scale: 0.9, duration: 0.1, ease: "power1.out" });
    tl.addLabel("back");
    tl.to(
      ".md-today",
      { opacity: 0, scale: 0.8, duration: 0.25, ease: "power1.in" },
      "back",
    );
    tl.to(
      ".md-finger",
      { opacity: 0, scale: 1.2, duration: 0.25, ease: "power1.out" },
      "back",
    );
    tl.to(".md-rail", { x: 0, duration: 0.8, ease: "power3.inOut" }, "back");
    tl.to(".md-pill", { x: 0, duration: 0.8, ease: "power3.inOut" }, "back");
    tl.to(".md-chip-1", { color: "#ffffff", duration: 0.3 }, "back+=0.25");
    tl.to(".md-chip-2", { color: INK, duration: 0.3 }, "back+=0.25");
    tl.to(
      ".md-offline",
      { y: 60, opacity: 0, duration: 0.45, ease: "power2.in" },
      "back",
    );
    tl.addLabel("now", "back+=0.75");
    tl.to(
      ".md-nowdot",
      { scale: 1, duration: 0.3, ease: "back.out(2)" },
      "now",
    );
    tl.to(
      ".md-nowline",
      { scaleX: 1, duration: 0.6, ease: "power2.out" },
      "now+=0.05",
    );
    tl.to(
      ".md-nowlabel",
      { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" },
      "now",
    );
    // The 9:48 label takes the gutter: the 10am label just below steps aside.
    tl.to(".md-pane-today .hg-10", { opacity: 0, duration: 0.3 }, "now");
    tl.to(
      ".md-cc",
      {
        backgroundColor: LIVE.fill,
        boxShadow: `inset 0 0 0 1px ${LIVE.ring}`,
        duration: 0.4,
      },
      "now+=0.15",
    );
    tl.to(
      ".md-card",
      { y: 0, opacity: 1, duration: 0.85, ease: "deck.enter" },
      "now+=0.3",
    );
    mark();
  });

  return (
    <div
      ref={ref}
      className="relative flex h-full w-full items-center justify-center"
    >
      <PhoneFrame height={PHONE_HEIGHT} flipId={flipId} statusBar={false}>
        {/* Its own stacking context, so the dynamic island stays on top. */}
        <div className="absolute inset-0 isolate">
          <StatusBar time="9:48" />

          {/* Header: the date travels with its day. */}
          <div
            className="absolute inset-x-0 overflow-hidden"
            style={{ top: 54, height: 68 }}
          >
            <div className="md-rail flex" style={{ width: SCREEN_W * 2 }}>
              <DayTitle date="Tue 11 Aug" title="Today" viewing={viewing} />
              <DayTitle date="Wed 12 Aug" title="Tomorrow" viewing={viewing} />
            </div>
          </div>
          <span
            className="md-today absolute flex items-center gap-1.5 rounded-full bg-white px-3.5 py-[7px] text-[14px] font-semibold"
            style={{
              left: TODAY_BTN.x - 42,
              top: TODAY_BTN.y - 17,
              color: "var(--slate)",
              boxShadow: "inset 0 0 0 1px rgba(68,88,121,0.28)",
            }}
          >
            <Icon name="chevronLeft" size={14} stroke={2.4} />
            Today
          </span>

          {/* The week, with the day on screen picked out. */}
          <div
            className="absolute flex"
            style={{
              top: STRIP.top,
              left: STRIP.inset,
              right: STRIP.inset,
              height: 60,
            }}
          >
            <span
              className="md-pill absolute top-0 rounded-[16px]"
              style={{
                left: CHIP_W + (CHIP_W - 54) / 2,
                width: 54,
                height: 60,
                background: "var(--slate)",
                boxShadow: "0 6px 14px rgba(68,88,121,0.3)",
              }}
            />
            {WEEK.map((day, i) => (
              <span
                key={day.d}
                className={`md-chip-${i} relative flex flex-col items-center justify-center`}
                style={{ width: CHIP_W, color: i === 1 ? "#ffffff" : INK }}
              >
                <span className="text-[12px] font-medium opacity-70">
                  {day.d}
                </span>
                <span className="font-display text-[20px] leading-tight font-bold">
                  {day.n}
                </span>
              </span>
            ))}
          </div>

          {/* The rail of days: today, then tomorrow, side by side. */}
          <div
            className="absolute inset-x-0 overflow-hidden"
            style={{ top: RAIL_TOP, height: SCREEN_H - RAIL_TOP }}
          >
            <div
              className="md-rail flex h-full"
              style={{ width: SCREEN_W * 2 }}
            >
              <Pane className="md-pane-today">
                {/* No teacher line: the now line crosses this block's lower half. */}
                <DayBlock
                  className="md-cc"
                  frame={DAY}
                  start={9}
                  end={10}
                  title="Statistics"
                  room="301"
                />
                <DayBlock
                  frame={DAY}
                  start={10}
                  end={11}
                  title="Design Thinking"
                  room="304"
                  detail="Prof. Kulkarni"
                  style={{
                    boxShadow: `inset 0 0 0 1px ${DT.ring}, 0 0 0 2.5px var(--slate), 0 10px 22px rgba(68,88,121,0.3)`,
                    zIndex: 2,
                  }}
                >
                  <BlockTag bg="var(--slate)">Next</BlockTag>
                </DayBlock>
                <DayBlock
                  frame={DAY}
                  start={11.25}
                  end={12.25}
                  title="Web Technologies"
                  room="Lab 2"
                  detail="Dr. Fernandes"
                />
                <DayBlock
                  frame={DAY}
                  start={13.5}
                  end={14.5}
                  title="Data Mining"
                  room="301"
                  detail="Prof. Iyer"
                />
                <DayBlock
                  frame={DAY}
                  start={15}
                  end={16}
                  title="Business Analytics"
                  room="304"
                  detail="Dr. Mehta"
                />

                {/* The present. */}
                <div
                  className="absolute right-0 left-0 z-[5] flex items-center"
                  style={{ top: yOf(DAY, NOW) - 5 }}
                >
                  <span
                    className="md-nowlabel py-0.5 text-right font-mono text-[11px] font-bold"
                    style={{
                      width: 54 - 10,
                      color: "var(--red)",
                      background: "var(--paper)",
                    }}
                  >
                    9:48
                  </span>
                  <span
                    className="md-nowdot ml-px h-[10px] w-[10px] shrink-0 rounded-full"
                    style={{ background: "var(--red)" }}
                  />
                  <span
                    className="md-nowline h-[2px] flex-1"
                    style={{ background: "var(--red)" }}
                  />
                </div>
              </Pane>

              <Pane>
                <DayBlock
                  frame={DAY}
                  start={9}
                  end={10}
                  title="Cyber Security"
                  room="304"
                  detail="Prof. Iyer"
                />
                {extras ? (
                  <DayBlock
                    frame={DAY}
                    start={11}
                    end={12}
                    title="Data Mining: unit test"
                    course="Data Mining"
                    room="Lab 2"
                    detail="Units 1-3 · bring your ID"
                  >
                    <BlockTag bg="var(--red)">Test</BlockTag>
                  </DayBlock>
                ) : (
                  <DayBlock
                    frame={DAY}
                    start={11}
                    end={12}
                    title="Data Mining"
                    room="Lab 2"
                    detail="Prof. Iyer"
                  />
                )}
                <DayBlock
                  frame={DAY}
                  start={12.25}
                  end={13.25}
                  title="Software Testing"
                  room="Lab 2"
                  detail="Dr. Fernandes"
                />
                <DayBlock
                  frame={DAY}
                  start={14}
                  end={15}
                  title="Business Analytics"
                  room="301"
                  detail="Dr. Mehta"
                />
                {/* A deadline, on the same day as the classes. */}
                <div
                  className="absolute right-[10px] flex items-center"
                  style={{
                    top: yOf(DAY, 15.5) - 15,
                    left: 54,
                    display: extras ? undefined : "none",
                  }}
                >
                  <span
                    className="flex items-center gap-1.5 rounded-full py-[6px] pr-3 pl-2.5 text-[12.5px] font-semibold"
                    style={{
                      background: "#fff3dc",
                      color: "#7a4a00",
                      boxShadow: "inset 0 0 0 1px #d99425",
                    }}
                  >
                    <Icon name="file" size={14} stroke={2} />
                    <Meta text="Due 3:30pm · Web Tech project" />
                  </span>
                  <span
                    className="ml-2 h-0 flex-1"
                    style={{ borderTop: "2px dashed #d99425" }}
                  />
                </div>
              </Pane>
            </div>
          </div>

          {/* Offline, and it does not matter. */}
          <Toast
            className="md-offline"
            style={{ top: 714, display: extras ? undefined : "none" }}
          >
            <Icon name="wifiOff" size={17} stroke={2} />
            <Meta text="Offline · your week is saved" />
          </Toast>

          {/* The next class, everything you need to get there. */}
          <div
            className="md-card absolute rounded-[22px] bg-white"
            style={{
              left: 8,
              right: 8,
              top: 620,
              padding: "15px 18px 16px",
              boxShadow:
                "inset 0 0 0 1px rgba(68,88,121,0.18), 0 -10px 34px -8px rgba(16,24,40,0.2)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold text-[rgba(44,49,53,0.6)]">
                <Meta text="Next class · 10am" />
              </span>
              <span
                className="rounded-full px-2.5 py-[4px] font-mono text-[13px] font-bold text-white"
                style={{ background: "var(--red)" }}
              >
                in 12 min
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              <span
                className="h-[26px] w-[6px] rounded-full"
                style={{
                  background: DT.fill,
                  boxShadow: `inset 0 0 0 1px ${DT.ring}`,
                }}
              />
              <span className="font-display text-[25px] leading-none font-bold tracking-[-0.02em] text-[#0d1117]">
                Design Thinking
              </span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-[14.5px] font-medium text-[rgba(44,49,53,0.8)]">
              <span className="flex items-center gap-1.5">
                <Icon name="door" size={17} stroke={2} />
                Room 304
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="user" size={17} stroke={2} />
                Prof. Kulkarni
              </span>
            </div>
          </div>

          <MockTabBar active={0} />
          <Finger className="md-finger" />
        </div>
      </PhoneFrame>
    </div>
  );
}

function DayTitle({
  date,
  title,
  viewing,
}: {
  date: string;
  title: string;
  viewing?: string;
}) {
  return (
    <div className="shrink-0 px-5 pt-2" style={{ width: SCREEN_W }}>
      <div className="flex h-[22px] items-center gap-2.5 text-[13.5px] leading-[20px] font-medium text-[rgba(44,49,53,0.58)]">
        {date}
        {/* Someone else's day: the pill travels with it. */}
        {viewing && (
          <span
            className="md-viewing flex items-center gap-1.5 rounded-full bg-white px-2.5 py-[2px] text-[15px] leading-[18px] font-semibold"
            style={{
              color: "var(--slate)",
              boxShadow: "inset 0 0 0 1px rgba(68,88,121,0.32)",
            }}
          >
            <Icon name="users" size={16} stroke={2.2} />
            <span>
              Viewing <span className="font-mono">{viewing}</span>
            </span>
          </span>
        )}
      </div>
      <div className="font-display text-[30px] leading-tight font-bold tracking-[-0.02em] text-[#0d1117]">
        {title}
      </div>
    </div>
  );
}

function Pane({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative h-full shrink-0 ${className ?? ""}`}
      style={{ width: SCREEN_W }}
    >
      <HourGrid frame={DAY} />
      {children}
    </div>
  );
}
