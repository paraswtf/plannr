"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { PhoneFrame, StatusBar } from "~/ui/frames";
import { Icon } from "~/ui/icon";
import { courseTone, MockTabBar } from "~/ui/mock";
import { useIntro } from "~/visuals/faculty/_shell";

import {
  DayBlock,
  type DayFrame,
  Finger,
  HourGrid,
  Meta,
  Notice,
  PHONE_HEIGHT,
  SCREEN_W,
  yOf,
} from "./_phone-kit";

export interface PhoneCourseworkProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between slides. */
  flipId?: string;
}

/** Today, 9am to 4pm, compact: the work due sits under it. */
const DAY: DayFrame = { top: 134, startHour: 9, endHour: 16, rowH: 48 };
/** Tonight's deadline, on the day, just under the last class. */
const CHIP_Y = yOf(DAY, DAY.endHour) + 24;
/** "Coming up": the work due in the next week, from every course. */
const COMING = { head: 516, card: 548, row: 64 };

/** The bottom sheet a test result opens in, and how far it hides below. */
const SHEET_TOP = 372;
const SHEET_HIDE = 600;
const BANNER_TOP = 50;
/** The score, as the sheet draws it: display type, 60px. */
const SCORE = { left: 24, top: SHEET_TOP + 96, size: 60 };
/** The course page's marks card and its rows. */
const MARKS = { top: 312, head: 46, row: 44, scoreX: 286 };
/** Where the score lands: the unit test's row, at 20px. */
const SCORE_TO = {
  x: MARKS.scoreX - SCORE.left,
  y: MARKS.top + MARKS.head + (MARKS.row - 20) / 2 - SCORE.top,
  scale: 20 / SCORE.size,
};
const BUTTON_Y = SHEET_TOP + 352;

/** Where the finger touches, in screen pixels. */
const TAP_BANNER = { x: 210, y: BANNER_TOP + 46 };
const TAP_BUTTON = { x: 196, y: BUTTON_Y + 25 };

const INK = "#0d1117";
const MUTED = "rgba(44,49,53,0.6)";
const HAIR = "rgba(68,88,121,0.14)";
const DUE = { bg: "#fff3dc", ink: "#7a4a00", ring: "#d99425" } as const;
const CARD_SHADOW =
  "inset 0 0 0 1px rgba(68,88,121,0.2), 0 2px 10px rgba(13,17,23,0.05)";

const COMING_UP: {
  dow: string;
  date: number;
  course: string;
  what: string;
  tag: ReactNode;
  test?: boolean;
}[] = [
  {
    dow: "Thu",
    date: 27,
    course: "Web Technologies",
    what: "11:15am in Lab 2",
    tag: "Unit test",
    test: true,
  },
  {
    dow: "Fri",
    date: 28,
    course: "Business Analytics",
    what: "Case study 2",
    tag: "Due 5pm",
  },
  {
    dow: "Mon",
    date: 31,
    course: "Data Mining",
    what: "Assignment 2",
    tag: "Due 11:59pm",
  },
];

/**
 * Coursework on a student's own day: deadlines and tests from every course
 * beside their classes, marks the day they are entered, and each course's
 * attendance, marks and work due on one page.
 *
 * Builds (steps = 3):
 *   0: today's classes, tonight's deadline on the day, and what is coming up
 *      this week from every course. The deadlines arrive on their own.
 *   1: a notification, "Marks entered": tap it, and the result rises in a
 *      sheet, 17 of 20, with the next test's date and room.
 *   2: open the course: the Data Mining page pushes in, the score travels
 *      from the sheet into its row, attendance (15 of 18, 83%) fills, and the
 *      rest of the marks and the assignment due settle into place.
 */
export function PhoneCoursework({
  step,
  active,
  flipId,
}: PhoneCourseworkProps) {
  const ref = useRef<HTMLDivElement>(null);

  // On arrival: the work due drops into the day, then the week's list fills.
  useIntro(ref, { active, step }, (tl) => {
    const at = tl.duration();
    tl.fromTo(
      ".cw-in-chip",
      { opacity: 0, x: 48 },
      { opacity: 1, x: 0, duration: 0.6, ease: "deck.enter" },
      at,
    );
    tl.fromTo(
      ".cw-in-head",
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      at + 0.3,
    );
    tl.fromTo(
      ".cw-in-row",
      { opacity: 0, x: 64 },
      {
        opacity: 1,
        x: 0,
        duration: 0.65,
        ease: "deck.enter",
        stagger: 0.14,
      },
      at + 0.4,
    );
  });

  useSteps(ref, step, (tl, mark) => {
    gsap.set(".cw-finger", { x: TAP_BANNER.x, y: TAP_BANNER.y, scale: 1.3 });
    gsap.set(".cw-banner", { y: -220 });
    gsap.set(".cw-backdrop", { opacity: 0 });
    gsap.set([".cw-sheet", ".cw-scorewrap"], { y: SHEET_HIDE });
    gsap.set(".cw-entered", { scale: 0.6, opacity: 0 });
    gsap.set(".cw-score", { x: 0, y: 0, scale: 1, transformOrigin: "0% 0%" });
    gsap.set(".cw-page", { x: SCREEN_W });
    gsap.set(".cw-today", { x: 0 });
    gsap.set(".cw-meter", { scaleX: 0, transformOrigin: "0% 50%" });
    gsap.set(".cw-settle", { y: 22, opacity: 0 });
    gsap.set(".cw-due", { y: 60, opacity: 0 });
    gsap.set(".cw-new", { scale: 0, opacity: 0 });

    // 1 — the marks are in: the notification drops, is tapped, and the
    // result rises in a sheet over the day.
    tl.to(".cw-banner", { y: 0, duration: 0.7, ease: "power3.out" });
    tl.to(
      ".cw-finger",
      { opacity: 1, scale: 1, duration: 0.22, ease: "power2.out" },
      "+=0.45",
    );
    tl.to([".cw-finger", ".cw-banner-card"], {
      scale: 0.95,
      duration: 0.12,
      ease: "power1.out",
    });
    tl.addLabel("open");
    tl.to(
      ".cw-finger",
      { opacity: 0, scale: 1.2, duration: 0.25, ease: "power1.out" },
      "open",
    );
    tl.to(".cw-banner", { y: -220, duration: 0.45, ease: "power2.in" }, "open");
    tl.to(".cw-backdrop", { opacity: 1, duration: 0.4 }, "open+=0.1");
    tl.to(
      [".cw-sheet", ".cw-scorewrap"],
      { y: 0, duration: 0.8, ease: "power3.out" },
      "open+=0.15",
    );
    tl.to(
      ".cw-entered",
      { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2)" },
      "open+=0.75",
    );
    mark();

    // 2 — open the course: the page pushes in, the sheet drops away, and the
    // score flies out of it into its row; the rest settles round it.
    tl.set(".cw-finger", { x: TAP_BUTTON.x, y: TAP_BUTTON.y, scale: 1.3 });
    tl.to(".cw-finger", {
      opacity: 1,
      scale: 1,
      duration: 0.22,
      ease: "power2.out",
    });
    tl.to([".cw-finger", ".cw-button"], {
      scale: 0.95,
      duration: 0.12,
      ease: "power1.out",
    });
    tl.addLabel("push");
    tl.to(
      ".cw-finger",
      { opacity: 0, scale: 1.2, duration: 0.25, ease: "power1.out" },
      "push",
    );
    tl.to(".cw-button", { scale: 1, duration: 0.2 }, "push");
    tl.to(
      ".cw-sheet",
      { y: SHEET_HIDE, duration: 0.6, ease: "power2.in" },
      "push+=0.05",
    );
    tl.to(".cw-backdrop", { opacity: 0, duration: 0.5 }, "push+=0.15");
    tl.to(
      ".cw-page",
      { x: 0, duration: 0.75, ease: "power3.inOut" },
      "push+=0.1",
    );
    tl.to(
      ".cw-today",
      { x: -SCREEN_W * 0.3, duration: 0.75, ease: "power3.inOut" },
      "push+=0.1",
    );
    tl.to(
      ".cw-score",
      {
        x: SCORE_TO.x,
        y: SCORE_TO.y,
        scale: SCORE_TO.scale,
        duration: 1.0,
        ease: "power3.inOut",
      },
      "push+=0.2",
    );
    tl.to(
      ".cw-meter",
      { scaleX: 1, duration: 0.9, ease: "power2.out" },
      "push+=0.75",
    );
    tl.to(
      ".cw-settle",
      {
        y: 0,
        opacity: 1,
        duration: 0.55,
        ease: "deck.enter",
        stagger: 0.09,
      },
      "push+=0.8",
    );
    tl.to(
      ".cw-due",
      { y: 0, opacity: 1, duration: 0.7, ease: "deck.enter" },
      "push+=1.05",
    );
    tl.to(
      ".cw-new",
      { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2)" },
      "push+=1.2",
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
        <div className="absolute inset-0 isolate overflow-hidden">
          {/* Today: the classes, and the work due beside them. */}
          <div
            className="cw-today absolute inset-0"
            style={{ background: "var(--paper)" }}
          >
            <div
              className="absolute inset-x-0 flex items-end justify-between px-5"
              style={{ top: 62 }}
            >
              <div>
                <div className="text-[13.5px] font-medium text-[rgba(44,49,53,0.58)]">
                  Tue 25 Aug
                </div>
                <div className="font-display text-[30px] leading-tight font-bold tracking-[-0.02em] text-[#0d1117]">
                  Today
                </div>
              </div>
              <span
                className="mb-1 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-mono text-[12.5px] font-semibold"
                style={{
                  color: "var(--slate)",
                  boxShadow: "inset 0 0 0 1px rgba(68,88,121,0.28)",
                }}
              >
                <Icon name="users" size={14} stroke={2} />
                BCA-A
              </span>
            </div>

            <HourGrid frame={DAY} />
            <DayBlock
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
            />
            <DayBlock
              frame={DAY}
              start={11.25}
              end={12.25}
              title="Web Technologies"
              room="Lab 2"
            />
            <DayBlock
              frame={DAY}
              start={13.5}
              end={14.5}
              title="Data Mining"
              room="301"
            />
            <DayBlock
              frame={DAY}
              start={15}
              end={16}
              title="Business Analytics"
              room="304"
            />

            {/* Tonight's deadline, on the same day as the classes. */}
            <div
              className="absolute right-[10px] left-[54px] flex items-center"
              style={{ top: CHIP_Y - 16 }}
            >
              <span
                className="cw-in-chip flex items-center gap-1.5 rounded-full py-[7px] pr-3.5 pl-2.5 text-[13.5px] font-semibold"
                style={{
                  background: DUE.bg,
                  color: DUE.ink,
                  boxShadow: `inset 0 0 0 1px ${DUE.ring}`,
                }}
              >
                <Icon name="file" size={15} stroke={2} />
                <Meta text="Due 11:59pm · Web Tech project" />
              </span>
              <span
                className="cw-in-chip ml-2 h-0 flex-1"
                style={{ borderTop: `2px dashed ${DUE.ring}` }}
              />
            </div>

            {/* The week ahead, from every course, in one list. */}
            <div
              className="cw-in-head absolute inset-x-0 flex items-baseline justify-between px-5"
              style={{ top: COMING.head }}
            >
              <span className="font-display text-[19px] font-bold tracking-[-0.01em] text-[#0d1117]">
                Coming up
              </span>
              <span
                className="text-[13px] font-medium"
                style={{ color: MUTED }}
              >
                From 3 courses
              </span>
            </div>
            <div
              className="absolute"
              style={{ top: COMING.card, left: 12, right: 12 }}
            >
              {COMING_UP.map((item, i) => (
                <ComingRow key={item.course} item={item} first={i === 0} />
              ))}
            </div>
          </div>

          {/* The course page, waiting off to the right. */}
          <div
            className="cw-page absolute inset-0 z-10"
            style={{
              background: "var(--paper)",
              boxShadow: "-12px 0 30px -12px rgba(16,24,40,0.25)",
            }}
          >
            <CoursePage />
          </div>

          <div className="absolute inset-x-0 top-0 z-[12]">
            <StatusBar time="12:40" />
          </div>
          <div className="absolute inset-0 z-[14]">
            <MockTabBar active={0} />
          </div>

          {/* The day, dimmed under the sheet. */}
          <div
            className="cw-backdrop absolute inset-0 z-20"
            style={{ background: "rgba(13,17,23,0.34)" }}
          />

          <ResultSheet />

          {/* The score: drawn in the sheet, it flies to the course page. */}
          <div
            className="cw-scorewrap pointer-events-none absolute z-[35]"
            style={{ left: SCORE.left, top: SCORE.top }}
          >
            <div
              className="cw-score font-display leading-none font-bold tracking-[-0.02em] whitespace-nowrap tabular-nums"
              style={{ fontSize: SCORE.size, color: INK }}
            >
              17<span style={{ color: "rgba(44,49,53,0.4)" }}>/20</span>
            </div>
          </div>

          {/* The marks are in. */}
          <div
            className="cw-banner absolute inset-x-2.5 z-40"
            style={{ top: BANNER_TOP }}
          >
            <Notice
              className="cw-banner-card"
              title="Marks entered"
              time="now"
              body={
                <>
                  Data Mining unit test 1: <b>17 of 20</b>. Entered by Prof.
                  Iyer.
                </>
              }
              style={{
                background: "rgba(255,255,255,0.97)",
                boxShadow:
                  "0 18px 40px -12px rgba(16,24,40,0.32), inset 0 0 0 1px rgba(68,88,121,0.14)",
              }}
            />
          </div>

          <Finger className="cw-finger" />
        </div>
      </PhoneFrame>
    </div>
  );
}

function Swatch({ course, style }: { course: string; style?: CSSProperties }) {
  const tone = courseTone(course);
  return (
    <span
      className="shrink-0 rounded-full"
      style={{
        background: tone.fill,
        boxShadow: `inset 0 0 0 1px ${tone.ring}`,
        ...style,
      }}
    />
  );
}

function ComingRow({
  item,
  first,
}: {
  item: (typeof COMING_UP)[number];
  first: boolean;
}) {
  return (
    <div
      className="cw-in-row flex items-center gap-3 rounded-[14px] bg-white px-3.5"
      style={{
        height: COMING.row - 6,
        marginTop: first ? 0 : 6,
        boxShadow: CARD_SHADOW,
      }}
    >
      <span className="flex w-[34px] shrink-0 flex-col items-center leading-none">
        <span className="text-[12px] font-medium" style={{ color: MUTED }}>
          {item.dow}
        </span>
        <span className="font-display mt-1 text-[19px] font-bold text-[#0d1117]">
          {item.date}
        </span>
      </span>
      <Swatch course={item.course} style={{ width: 6, height: 34 }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-[18px] font-semibold text-[#0d1117]">
          {item.course}
        </span>
        <span
          className="mt-[3px] block truncate text-[13px] leading-[16px]"
          style={{ color: MUTED }}
        >
          {item.what}
        </span>
      </span>
      {item.test ? (
        <span
          className="shrink-0 rounded-[7px] px-2 py-[5px] text-[12.5px] leading-none font-semibold text-white"
          style={{ background: "var(--red)" }}
        >
          {item.tag}
        </span>
      ) : (
        <span
          className="shrink-0 rounded-full px-2.5 py-[5px] text-[12.5px] leading-none font-semibold"
          style={{
            background: DUE.bg,
            color: DUE.ink,
            boxShadow: `inset 0 0 0 1px ${DUE.ring}`,
          }}
        >
          {item.tag}
        </span>
      )}
    </div>
  );
}

/** A test's result, the moment it is entered, with the next test ahead. */
function ResultSheet() {
  return (
    <div
      className="cw-sheet absolute inset-x-0 bottom-0 z-30 rounded-t-[30px] bg-white"
      style={{
        top: SHEET_TOP,
        boxShadow: "0 -16px 40px -12px rgba(16,24,40,0.3)",
      }}
    >
      <span
        className="absolute left-1/2 -ml-[19px] h-[5px] w-[38px] rounded-full"
        style={{ top: 9, background: "rgba(68,88,121,0.25)" }}
      />
      <div className="absolute inset-x-6" style={{ top: 30 }}>
        <div className="flex items-center justify-between">
          <span
            className="flex items-center gap-2 text-[14.5px] font-semibold"
            style={{ color: MUTED }}
          >
            <Swatch course="Data Mining" style={{ width: 12, height: 12 }} />
            Data Mining
          </span>
          <span
            className="cw-entered flex items-center gap-1 rounded-full px-2.5 py-[5px] text-[12.5px] leading-none font-semibold"
            style={{
              background: "rgba(78,125,58,0.13)",
              color: "var(--green)",
            }}
          >
            <Icon name="check" size={13} stroke={2.6} />
            Entered today
          </span>
        </div>
        <div className="font-display mt-2 text-[26px] leading-tight font-bold tracking-[-0.02em] text-[#0d1117]">
          Unit test 1
        </div>
      </div>

      {/* The score itself is the travelling layer over this spot. */}
      <div
        className="absolute flex items-end justify-end"
        style={{ top: 96, right: 24, height: SCORE.size - 6 }}
      >
        <span className="font-display text-[24px] leading-none font-bold text-[rgba(44,49,53,0.55)]">
          85%
        </span>
      </div>
      <div
        className="absolute inset-x-6 text-[14.5px]"
        style={{ top: 96 + SCORE.size + 14, color: MUTED }}
      >
        Entered by Prof. Iyer at 12:38pm
      </div>

      <div
        className="absolute inset-x-6 h-px"
        style={{ top: 208, background: HAIR }}
      />

      <div className="absolute inset-x-6" style={{ top: 226 }}>
        <div className="text-[13.5px] font-semibold" style={{ color: MUTED }}>
          Next test
        </div>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <div className="text-[20px] leading-tight font-bold text-[#0d1117]">
              Unit test 2
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[15.5px] font-medium text-[rgba(44,49,53,0.82)]">
              <Icon name="calendar" size={16} stroke={2} />
              Thu 17 Sep, 11am
            </div>
            <div className="mt-1 text-[14px]" style={{ color: MUTED }}>
              Units 4 to 6
            </div>
          </div>
          <span
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[14px] font-semibold"
            style={{
              color: "var(--slate)",
              boxShadow: "inset 0 0 0 1px rgba(68,88,121,0.28)",
            }}
          >
            <Icon name="door" size={15} stroke={2} />
            Lab 2
          </span>
        </div>
      </div>

      <div
        className="cw-button absolute inset-x-6 flex items-center justify-center gap-2 rounded-[14px] text-[16px] font-semibold text-white"
        style={{
          top: BUTTON_Y - SHEET_TOP,
          height: 50,
          background: "var(--slate)",
          boxShadow: "0 8px 18px -8px rgba(68,88,121,0.6)",
        }}
      >
        Open Data Mining
        <Icon name="chevronRight" size={16} stroke={2.4} />
      </div>
    </div>
  );
}

const MARK_ROWS: {
  label: string;
  value?: ReactNode;
  later?: string;
  flying?: boolean;
}[] = [
  { label: "Unit test 1", flying: true },
  {
    label: "Assignment 1",
    value: (
      <>
        8<span style={{ color: "rgba(44,49,53,0.4)" }}>/10</span>
      </>
    ),
  },
  { label: "Unit test 2", later: "Thu 17 Sep" },
  { label: "End term", later: "Thu 19 Nov" },
];

/** One course, the way the app's course and attendance pages show it. */
function CoursePage() {
  return (
    <>
      <div
        className="absolute flex items-center gap-1 text-[15px] font-semibold"
        style={{ top: 60, left: 14, color: "var(--slate)" }}
      >
        <Icon name="chevronLeft" size={16} stroke={2.4} />
        Today
      </div>
      <div className="absolute inset-x-5" style={{ top: 90 }}>
        <div className="flex items-center gap-2.5">
          <Swatch course="Data Mining" style={{ width: 16, height: 16 }} />
          <span className="font-display text-[29px] leading-tight font-bold tracking-[-0.02em] text-[#0d1117]">
            Data Mining
          </span>
        </div>
        <div
          className="mt-0.5 text-[14.5px] font-medium"
          style={{ color: MUTED }}
        >
          <Meta text="Prof. Iyer · BCA-A" />
        </div>
      </div>

      {/* Attendance: the number first, then the bar against the pass mark. */}
      <div
        className="absolute rounded-[16px] bg-white"
        style={{
          top: 164,
          left: 14,
          right: 14,
          height: 134,
          padding: "14px 16px",
          boxShadow: CARD_SHADOW,
        }}
      >
        <div className="text-[13.5px] font-semibold" style={{ color: MUTED }}>
          Attendance
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span
            className="font-display text-[34px] leading-none font-bold tracking-[-0.02em]"
            style={{ color: "var(--green)" }}
          >
            83%
          </span>
          <span
            className="text-[14px] font-medium"
            style={{ color: "rgba(44,49,53,0.75)" }}
          >
            15 attended of 18 taken
          </span>
        </div>
        <div
          className="relative mt-4 h-2 rounded-full"
          style={{ background: "rgba(68,88,121,0.14)" }}
        >
          <div
            className="cw-meter h-2 rounded-full"
            style={{ width: "83%", background: "var(--green)" }}
          />
          <span
            className="absolute -top-1 h-4 w-[2px] rounded-full"
            style={{ left: "75%", background: "var(--slate)" }}
          />
        </div>
        <div className="mt-3 text-[13px]" style={{ color: MUTED }}>
          <Meta text="75% needed · 30 lectures this term" />
        </div>
      </div>

      {/* Marks so far: each test the day it is entered. */}
      <div
        className="absolute rounded-[16px] bg-white"
        style={{
          top: MARKS.top,
          left: 14,
          right: 14,
          height: MARKS.head + MARKS.row * MARK_ROWS.length + 4,
          boxShadow: CARD_SHADOW,
        }}
      >
        <div
          className="flex items-center justify-between px-4"
          style={{ height: MARKS.head }}
        >
          <span
            className="text-[13.5px] font-semibold"
            style={{ color: MUTED }}
          >
            Marks so far
          </span>
          <span className="cw-settle text-[14px] font-semibold text-[#0d1117]">
            25 of 30
          </span>
        </div>
        {MARK_ROWS.map((row) => (
          <div
            key={row.label}
            className={`relative flex items-center px-4 ${row.flying ? "" : "cw-settle"}`}
            style={{ height: MARKS.row, boxShadow: `inset 0 1px 0 ${HAIR}` }}
          >
            <span className="text-[15.5px] font-semibold text-[#0d1117]">
              {row.label}
            </span>
            {row.flying && (
              <span
                className="cw-new ml-2 rounded-[7px] px-2 py-[4px] text-[11.5px] leading-none font-semibold text-white"
                style={{ background: "var(--green)" }}
              >
                New
              </span>
            )}
            {row.value && (
              <span
                className="font-display absolute text-[20px] leading-none font-bold tracking-[-0.02em] text-[#0d1117] tabular-nums"
                style={{ left: MARKS.scoreX - 14 }}
              >
                {row.value}
              </span>
            )}
            {row.later && (
              <span
                className="absolute flex items-center gap-1.5 text-[14px] font-medium"
                style={{ left: MARKS.scoreX - 14 - 34, color: MUTED }}
              >
                <Icon name="calendar" size={15} stroke={2} />
                {row.later}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* The work still due for this course. */}
      <div
        className="cw-due absolute"
        style={{
          top: MARKS.top + MARKS.head + MARKS.row * MARK_ROWS.length + 20,
          left: 14,
          right: 14,
        }}
      >
        <div
          className="mb-2 px-2 text-[13.5px] font-semibold"
          style={{ color: MUTED }}
        >
          Work due
        </div>
        <div className="flex flex-col gap-2">
          <DueRow
            title="Assignment 2"
            when="Due Mon 31 Aug, 11:59pm"
            left="In 6 days"
            soon
          />
          <DueRow
            title="Mini project"
            when="Due Fri 18 Sep, 5pm"
            left="In 24 days"
          />
        </div>
      </div>
    </>
  );
}

function DueRow({
  title,
  when,
  left,
  soon,
}: {
  title: string;
  when: string;
  left: string;
  /** Due within the week: in the deadline's amber. */
  soon?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-[16px] px-4"
      style={{
        height: 62,
        background: soon ? DUE.bg : "#ffffff",
        boxShadow: soon ? `inset 0 0 0 1px ${DUE.ring}` : CARD_SHADOW,
      }}
    >
      <span
        className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] bg-white"
        style={{
          color: soon ? DUE.ink : "var(--slate)",
          boxShadow: `inset 0 0 0 1px ${soon ? DUE.ring : "rgba(68,88,121,0.28)"}`,
        }}
      >
        <Icon name="file" size={19} stroke={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] leading-[19px] font-semibold text-[#0d1117]">
          {title}
        </span>
        <span
          className="mt-[2px] block text-[13.5px] leading-[17px]"
          style={{ color: soon ? DUE.ink : MUTED }}
        >
          {when}
        </span>
      </span>
      <span
        className="shrink-0 text-[13.5px] font-semibold"
        style={{ color: soon ? DUE.ink : MUTED }}
      >
        {left}
      </span>
    </div>
  );
}
