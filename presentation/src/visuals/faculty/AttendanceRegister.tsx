"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { PhoneFrame } from "~/ui/frames";
import { Icon } from "~/ui/icon";
import { courseTone } from "~/ui/mock";

import {
  CARD,
  click,
  Cursor,
  DemoBox,
  FacultyBrowser,
  GROUP_TONES,
  INK,
  PAGE,
  Toast,
  TOPBAR,
  useIntro,
  type GroupId,
} from "./_shell";

export interface AttendanceRegisterProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between slides. */
  flipId?: string;
}

/**
 * Attendance, straight from the timetable: the register hangs off the
 * lecture, so there is nothing to set up.
 *
 * Builds (steps = 3), following the speaker's notes:
 *   0 — on arrival: the teacher's day. The 9:00 Data Mining lecture for BCA-A
 *       ends (the now line travels past it) and its register is waiting, with
 *       a Take attendance button. The pointer clicks it and the register
 *       pushes in: BCA-A's roster, everyone present, as the app seeds it.
 *   1 — mark the exceptions: two absent, one late, then Save. "Saved ·
 *       lecture 18 of 40 held", and Aarav's phone rises: his Data Mining
 *       attendance drops from 88% to 83% as the register lands.
 *   2 — a check-in code panel slides in, and the rows tick in by themselves
 *       as students enter it; the two absentees never do. "41 of 62 checked in".
 *
 * The browser frame carries `flipId`, like the other faculty demos.
 */

/* ---------- Data ---------------------------------------------------------- */

const TEACHER = "Prof. Rao";
const COURSE = "Data Mining";
const STUDENTS = 62;
const HELD = 17; // registers taken before today's
const SCHEDULED = 40;

interface Lecture {
  from: string;
  to: string;
  title: string;
  group: GroupId;
  room: string;
  size: number;
}

const DAY: Lecture[] = [
  {
    from: "9:00",
    to: "10:00",
    title: COURSE,
    group: "BCA-A",
    room: "301",
    size: 62,
  },
  {
    from: "11:00",
    to: "12:00",
    title: COURSE,
    group: "BCA-B",
    room: "302",
    size: 58,
  },
  {
    from: "14:00",
    to: "16:00",
    title: "Data Mining Lab",
    group: "BCA-A",
    room: "Lab 1",
    size: 62,
  },
  {
    from: "16:00",
    to: "17:00",
    title: "Machine Learning",
    group: "BBA(IT)-A",
    room: "304",
    size: 54,
  },
];

type Mark = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

/** The first ten of BCA-A's 62, alphabetical as the app lists them. */
const ROSTER: { name: string; prn: string }[] = [
  { name: "Aadya Pillai", prn: "24030121001" },
  { name: "Aarav Menon", prn: "24030121002" },
  { name: "Abhishek Rane", prn: "24030121004" },
  { name: "Aditi Deshmukh", prn: "24030121005" },
  { name: "Advait Chavan", prn: "24030121007" },
  { name: "Ananya Iyer", prn: "24030121008" },
  { name: "Arjun Malhotra", prn: "24030121010" },
  { name: "Aryan Shah", prn: "24030121011" },
  { name: "Ayesha Khan", prn: "24030121013" },
  { name: "Bhavya Sethi", prn: "24030121014" },
];

/** Build 1's taps, in order: row, mark, and what the screen says after. */
const TAPS: { row: number; mark: Mark; head: string; tally: string }[] = [
  {
    row: 1,
    mark: "ABSENT",
    head: "61 of 62 present",
    tally: "61 present, 1 absent",
  },
  {
    row: 4,
    mark: "ABSENT",
    head: "60 of 62 present",
    tally: "60 present, 2 absent",
  },
  {
    row: 5,
    mark: "LATE",
    head: "59 of 62 present",
    tally: "59 present, 2 absent, 1 late",
  },
];

/** Build 2: who checks in, in the order they walk in, and when. */
const CHECK_INS: { row: number; at: string; late?: boolean }[] = [
  { row: 3, at: "9:01" },
  { row: 0, at: "9:01" },
  { row: 7, at: "9:02" },
  { row: 2, at: "9:02" },
  { row: 9, at: "9:03" },
  { row: 6, at: "9:04" },
  { row: 8, at: "9:05" },
  { row: 5, at: "9:12", late: true },
];
const CHECKED_IN = 41;

const STATUSES: { value: Mark; label: string; w: number }[] = [
  { value: "PRESENT", label: "Present", w: 62 },
  { value: "ABSENT", label: "Absent", w: 56 },
  { value: "LATE", label: "Late", w: 44 },
  { value: "EXCUSED", label: "Excused", w: 64 },
];
const PRESSED: Record<Mark, CSSProperties> = {
  PRESENT: {
    background: "rgba(78,125,58,0.1)",
    color: INK.green,
    boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.3)",
  },
  ABSENT: { background: "#c42f3e", color: "#ffffff" },
  LATE: { background: INK.green, color: "#ffffff" },
  EXCUSED: { background: INK.slate, color: "#ffffff" },
};

/* ---------- Layout, in page pixels ---------------------------------------- */

const HEAD_Y = TOPBAR + 12;
const BODY_Y = TOPBAR + 76;

/** The day's lectures. */
const LIST = { x: 16, y: BODY_Y, w: 768, row: 88 };
/** The register card, the column beside it, and the sticky save bar. */
const REG = { x: 16, y: BODY_Y, w: 520, head: 54, row: 42 };
const SIDE = { x: 548, y: BODY_Y, w: 236 };
const BAR = { x: 16, h: 54, y: PAGE.height - 12 - 54, w: 520 };
const SEG_GAP = 4;
const SEG_W =
  STATUSES.reduce((s, b) => s + b.w, 0) + SEG_GAP * (STATUSES.length - 1);
const SEG_X = REG.w - 14 - SEG_W; // inside a row
const SEG_H = 28;

const rowTop = (r: number) => REG.y + REG.head + r * REG.row;

/** Page coordinates of a mark button's centre. */
function markAt(row: number, mark: Mark) {
  let x = REG.x + SEG_X;
  for (const s of STATUSES) {
    if (s.value === mark)
      return { x: x + s.w / 2, y: rowTop(row) + REG.row / 2 };
    x += s.w + SEG_GAP;
  }
  return { x, y: 0 };
}

const TAKE_W = 156;
const TAKE = {
  x: LIST.x + LIST.w - 16 - TAKE_W / 2,
  y: LIST.y + LIST.row / 2,
};
const SAVE_W = 128;
const SAVE = { x: BAR.x + BAR.w - 9 - SAVE_W / 2, y: BAR.y + BAR.h / 2 };
const NOW_FROM = LIST.y + LIST.row * 0.62;
const NOW_TO = LIST.y + LIST.row;

/** The toast floats over the two unmarked rows above the save bar. */
const TOAST_BOTTOM = 70;
const TOAST_HIDE = TOAST_BOTTOM + 90;

const START_A = { x: 560, y: 470 };
const START_B = { x: 620, y: 300 };

/* ---------- The phone (build 1), in phone pixels -------------------------- */

const PHONE_H = 452;
const PHONE_DM = { pct0: 88, pct1: 83, threshold: 75 };
const P_ROW = 62;

/* ---------- The check-in code (build 2) ------------------------------------ */

const CODE = "482916";
const QR_N = 21;
const QR_MOD = 6;
/** A QR-like square: three finder squares and a seeded scatter. */
const QR_CELLS = (() => {
  let seed = 48291;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const finder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= QR_N - 8 && y < 8) || (x < 8 && y >= QR_N - 8);
  const cells: [number, number][] = [];
  for (let y = 0; y < QR_N; y++)
    for (let x = 0; x < QR_N; x++) {
      const r = rnd();
      if (!finder(x, y) && r < 0.47) cells.push([x, y]);
    }
  return cells;
})();

/* ---------- The demo ------------------------------------------------------- */

export function AttendanceRegister({
  step,
  active,
  flipId,
}: AttendanceRegisterProps) {
  const scope = useRef<HTMLDivElement>(null);

  // 0 — the lecture ends, its register is already there; open it.
  useIntro(scope, { active, step }, (tl) => {
    tl.fromTo(
      "[data-now]",
      { y: NOW_FROM - NOW_TO },
      { y: 0, duration: 1.1, ease: "deck.morph" },
    );
    tl.to(
      "[data-live]",
      { yPercent: -100, opacity: 0, duration: 0.3, ease: "power2.in" },
      ">-0.3",
    );
    tl.fromTo(
      "[data-ended]",
      { yPercent: 100, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      "<0.15",
    );
    tl.to(
      "[data-reg-chip]",
      { scale: 0.7, opacity: 0, duration: 0.22, ease: "power2.in" },
      "<",
    );
    tl.fromTo(
      "[data-take]",
      { scale: 0.7, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" },
      ">-0.05",
    );
    tl.to(".cur-a", { opacity: 1, duration: 0.2 }, ">0.15");
    tl.to(
      ".cur-a",
      {
        x: TAKE.x - START_A.x,
        y: TAKE.y - START_A.y,
        duration: 0.8,
        ease: "deck.morph",
      },
      "<",
    );
    click(tl, ".cur-a");
    // The register pushes in, the day travels out.
    tl.to(
      "[data-day]",
      { x: -PAGE.width, duration: 0.85, ease: "deck.morph" },
      ">0.05",
    );
    tl.fromTo(
      "[data-reg]",
      { x: PAGE.width },
      { x: 0, duration: 0.85, ease: "deck.morph" },
      "<",
    );
    tl.to(
      ".cur-a",
      { x: "-=300", y: "+=60", opacity: 0, duration: 0.6, ease: "power2.out" },
      "<0.1",
    );
  });

  useSteps(scope, step, (tl, mark) => {
    // 1 — the exceptions, a tap each, then save.
    tl.to(".cur-b", { opacity: 1, duration: 0.2 });
    TAPS.forEach((t, i) => {
      const to = markAt(t.row, t.mark);
      tl.to(
        ".cur-b",
        {
          x: to.x - START_B.x,
          y: to.y - START_B.y,
          duration: i === 0 ? 0.75 : 0.55,
          ease: "deck.morph",
        },
        i === 0 ? "<" : ">0.08",
      );
      click(tl, ".cur-b");
      tl.to(
        `[data-on="${t.row}-PRESENT"]`,
        { opacity: 0, duration: 0.15, ease: "power1.out" },
        "<0.05",
      );
      tl.fromTo(
        `[data-on="${t.row}-${t.mark}"]`,
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.2)" },
        "<",
      );
      tl.set("[data-head-count]", { text: t.head }, "<");
      tl.set("[data-tally]", { text: t.tally }, "<");
    });
    tl.to(
      ".cur-b",
      {
        x: SAVE.x - START_B.x,
        y: SAVE.y - START_B.y,
        duration: 0.6,
        ease: "deck.morph",
      },
      ">0.1",
    );
    click(tl, ".cur-b");
    tl.set("[data-save-label]", { text: "Update register" }, "<0.1");
    tl.set("[data-head-who]", { text: "Last taken by you" }, "<");
    tl.to(
      "[data-tally-box]",
      { y: 0, duration: 0.35, ease: "power2.out" },
      "<",
    );
    tl.fromTo(
      "[data-saved]",
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
      "<0.05",
    );
    tl.fromTo(
      "[data-toast]",
      { y: TOAST_HIDE },
      { y: 0, duration: 0.6, ease: "power3.out" },
      "<0.05",
    );
    tl.to(
      "[data-held-old]",
      { yPercent: -100, opacity: 0, duration: 0.3, ease: "power2.in" },
      "<0.1",
    );
    tl.fromTo(
      "[data-held-new]",
      { yPercent: 100, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      "<0.15",
    );
    tl.to(
      ".cur-b",
      { x: "-=120", y: "+=90", opacity: 0, duration: 0.5, ease: "power2.out" },
      "<",
    );
    // Aarav's phone: the register reaches him at once.
    tl.fromTo(
      "[data-phone]",
      { y: 260, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, ease: "deck.enter" },
      "<0.1",
    );
    tl.addLabel("land", ">-0.15");
    tl.fromTo(
      "[data-p-older]",
      { y: 0 },
      { y: P_ROW, duration: 0.5, ease: "deck.morph" },
      "land",
    );
    tl.fromTo(
      "[data-p-new]",
      { opacity: 0, y: -14 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
      "land+=0.25",
    );
    const pct = { v: PHONE_DM.pct0 };
    tl.fromTo(
      pct,
      { v: PHONE_DM.pct0 },
      {
        v: PHONE_DM.pct1,
        duration: 0.7,
        ease: "power2.out",
        onUpdate: () => {
          const el = scope.current?.querySelector("[data-p-pct]");
          if (el) el.textContent = `${Math.round(pct.v)}%`;
        },
      },
      "land+=0.2",
    );
    tl.fromTo(
      "[data-p-meter]",
      { width: `${PHONE_DM.pct0}%` },
      { width: `${PHONE_DM.pct1}%`, duration: 0.7, ease: "power2.out" },
      "<",
    );
    tl.set(
      "[data-p-taken]",
      { text: `15 attended of ${HELD + 1} taken` },
      "<0.1",
    );
    tl.set("[data-p-count]", { text: `${HELD + 1}` }, "<");
    tl.fromTo(
      "[data-p-flash]",
      { opacity: 0 },
      {
        keyframes: [
          { opacity: 1, duration: 0.15, ease: "power2.out" },
          { opacity: 0, duration: 0.7, ease: "power2.out" },
        ],
      },
      "<",
    );
    mark();

    // 2 — students check themselves in with a code.
    tl.to("[data-phone]", {
      y: 300,
      opacity: 0,
      duration: 0.55,
      ease: "power2.in",
    });
    tl.to(
      "[data-toast]",
      { y: TOAST_HIDE, duration: 0.5, ease: "power2.in" },
      "<",
    );
    tl.to("[data-bar]", { y: 90, duration: 0.5, ease: "power2.in" }, "<0.05");
    tl.to(
      "[data-info]",
      { x: SIDE.w + 40, duration: 0.5, ease: "power2.in" },
      "<",
    );
    tl.fromTo(
      "[data-panel]",
      { x: SIDE.w + 40 },
      { x: 0, duration: 0.85, ease: "deck.enter" },
      ">-0.1",
    );
    tl.fromTo(
      "[data-qr]",
      { scale: 0.6, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.6)" },
      "<0.3",
    );
    tl.fromTo(
      "[data-digit]",
      { yPercent: 70, opacity: 0 },
      {
        yPercent: 0,
        opacity: 1,
        duration: 0.35,
        ease: "power3.out",
        stagger: 0.05,
      },
      "<0.15",
    );
    tl.fromTo(
      "[data-wait]",
      { opacity: 0, x: 26 },
      {
        opacity: 1,
        x: 0,
        duration: 0.4,
        ease: "power2.out",
        stagger: 0.04,
      },
      "<0.1",
    );
    tl.addLabel("in", ">0.15");
    const gap = 0.3;
    CHECK_INS.forEach((c, k) => {
      const at = `in+=${k * gap + (c.late ? 0.35 : 0)}`;
      tl.fromTo(
        `[data-in="${c.row}"]`,
        { opacity: 0, scale: 0.88 },
        { opacity: 1, scale: 1, duration: 0.32, ease: "back.out(2)" },
        at,
      );
    });
    const span = CHECK_INS.length * gap + 0.35;
    const n = { v: 0 };
    tl.fromTo(
      n,
      { v: 0 },
      {
        v: CHECKED_IN,
        duration: span,
        ease: "power1.out",
        onUpdate: () => {
          const el = scope.current?.querySelector("[data-checked]");
          if (el) el.textContent = `${Math.round(n.v)}`;
        },
      },
      "in",
    );
    tl.fromTo(
      "[data-checked-bar]",
      { scaleX: 0 },
      {
        scaleX: CHECKED_IN / STUDENTS,
        duration: span,
        ease: "power1.out",
        transformOrigin: "0% 50%",
      },
      "in",
    );
    mark();
  });

  return (
    <DemoBox scope={scope}>
      <FacultyBrowser
        flipId={flipId}
        path="lectures/today"
        tab={2}
        user={TEACHER}
        role="Faculty · BCA"
      >
        <Day />
        <Register />
        <Toast
          style={{
            left: REG.x + REG.w / 2,
            bottom: TOAST_BOTTOM,
            transform: `translateY(${TOAST_HIDE}px)`,
          }}
        >
          Saved · lecture {HELD + 1} of {SCHEDULED} held
        </Toast>
        <Cursor x={START_A.x} y={START_A.y} className="cur-a" />
        <Cursor x={START_B.x} y={START_B.y} className="cur-b" />
      </FacultyBrowser>

      <div
        data-phone
        className="absolute"
        style={{ right: 6, bottom: 0, opacity: 0 }}
      >
        <StudentPhone />
      </div>
    </DemoBox>
  );
}

/* ---------- Build 0: the teacher's day ------------------------------------- */

function Heading({
  over,
  title,
  right,
}: {
  over: ReactNode;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div
      className="absolute flex items-end justify-between"
      style={{ left: 16, right: 16, top: HEAD_Y, height: 52 }}
    >
      <div>
        <div
          className="text-[14px] leading-[18px] font-semibold"
          style={{ color: INK.muted }}
        >
          {over}
        </div>
        <div className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em]">
          {title}
        </div>
      </div>
      {right}
    </div>
  );
}

function Day() {
  return (
    <div data-day className="absolute inset-0">
      <Heading
        over="Wednesday 7 October"
        title="Today"
        right={
          <span
            className="flex items-center gap-2 pb-1 text-[14.5px] font-semibold"
            style={{ color: INK.ink }}
          >
            <Icon name="clipboard" size={17} stroke={2} />4 lectures, 4
            registers ready
          </span>
        }
      />
      <div
        className="absolute"
        style={{
          ...CARD,
          left: LIST.x,
          top: LIST.y,
          width: LIST.w,
          height: LIST.row * DAY.length,
        }}
      >
        {DAY.map((l, i) => (
          <DayRow key={i} lecture={l} index={i} />
        ))}
        {/* Now: travels past the 9:00 lecture as it ends. */}
        <div
          data-now
          className="absolute z-[2] flex items-center"
          style={{ left: 6, right: 0, top: LIST.row - 1, height: 2 }}
        >
          <span
            className="h-[10px] w-[10px] shrink-0 rounded-full"
            style={{ background: INK.red, boxShadow: "0 0 0 2px #ffffff" }}
          />
          <span className="h-[2px] flex-1" style={{ background: INK.red }} />
        </div>
      </div>
    </div>
  );
}

function DayRow({ lecture: l, index }: { lecture: Lecture; index: number }) {
  const tone = GROUP_TONES[l.group];
  const first = index === 0;
  return (
    <div
      className="absolute inset-x-0 flex items-center gap-4 px-4"
      style={{
        top: index * LIST.row,
        height: LIST.row,
        boxShadow: index > 0 ? `inset 0 1px 0 ${INK.hair}` : undefined,
      }}
    >
      <span className="flex w-[54px] shrink-0 flex-col leading-tight">
        <span className="font-mono text-[16px] font-bold">{l.from}</span>
        <span className="font-mono text-[13px]" style={{ color: INK.muted }}>
          {l.to}
        </span>
      </span>
      <span
        className="h-[52px] w-[5px] shrink-0 rounded-full"
        style={{
          background: tone.fill,
          boxShadow: `inset 0 0 0 1px ${tone.ring}`,
        }}
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[17px] font-semibold">{l.title}</span>
        <span
          className="mt-1 flex items-center gap-2 text-[13.5px] font-medium"
          style={{ color: INK.muted }}
        >
          <span
            className="h-[10px] w-[10px] rounded-[3px]"
            style={{
              background: tone.fill,
              boxShadow: `inset 0 0 0 1px ${tone.ring}`,
            }}
          />
          <span style={{ color: INK.ink }}>{l.group}</span>
          <span className="flex items-center gap-1">
            <Icon name="mapPin" size={13} stroke={2} />
            {l.room}
          </span>
        </span>
      </span>
      <span className="ml-auto flex items-center gap-3">
        {first && (
          <span className="relative block h-[26px] w-[118px] overflow-hidden">
            <span
              data-live
              className="absolute inset-0 flex items-center justify-end gap-1.5 text-[13.5px] font-bold"
              style={{ color: "#c42f3e" }}
            >
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: INK.red }}
              />
              Live now
            </span>
            <span
              data-ended
              className="absolute inset-0 flex items-center justify-end text-[13.5px] font-semibold opacity-0"
              style={{ color: INK.muted }}
            >
              Ended 10:00
            </span>
          </span>
        )}
        <span
          className="relative flex h-[36px] items-center justify-end"
          style={{ width: TAKE_W }}
        >
          <span
            {...(first ? { "data-reg-chip": "" } : {})}
            className="flex h-[30px] items-center gap-1.5 rounded-[9px] px-2.5 text-[13.5px] font-semibold"
            style={{
              background: "#f6f7f9",
              boxShadow: `inset 0 0 0 1px ${INK.hair}`,
              color: INK.ink,
            }}
          >
            <Icon name="clipboard" size={15} stroke={2} />
            Register
            <span
              className="font-mono text-[12.5px]"
              style={{ color: INK.muted }}
            >
              {l.size}
            </span>
          </span>
          {first && (
            <span
              data-take
              className="absolute inset-0 flex items-center justify-center gap-2 rounded-[10px] text-[14.5px] font-semibold text-white opacity-0"
              style={{
                background: INK.slate,
                boxShadow: "0 6px 14px -6px rgba(68,88,121,0.6)",
              }}
            >
              <Icon name="clipboard" size={17} stroke={2} />
              Take attendance
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

/* ---------- The register --------------------------------------------------- */

function Register() {
  return (
    <div
      data-reg
      className="absolute inset-0"
      style={{ transform: `translateX(${PAGE.width}px)` }}
    >
      <Heading
        over={`${COURSE} · Wed 7 Oct, 9:00-10:00`}
        title="Attendance"
        right={
          <span className="flex items-center gap-2.5 pb-1">
            <span
              className="rounded-[8px] px-2 py-[3px] font-mono text-[13px] font-semibold"
              style={{ background: "rgba(68,88,121,0.1)", color: INK.slate }}
            >
              301
            </span>
            <span className="text-[14px]" style={{ color: INK.muted }}>
              {TEACHER}
            </span>
          </span>
        }
      />

      {/* The roster: everyone starts present; you mark the exceptions. */}
      <div
        className="absolute overflow-hidden"
        style={{
          ...CARD,
          left: REG.x,
          top: REG.y,
          width: REG.w,
          height: PAGE.height - REG.y + 20,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        }}
      >
        <div
          className="flex items-center px-4"
          style={{ height: REG.head, boxShadow: `inset 0 -1px 0 ${INK.hair}` }}
        >
          <span className="flex flex-col leading-tight">
            <span className="font-display text-[17px] font-bold tracking-[-0.01em]">
              BCA-A
            </span>
            <span className="text-[12.5px]" style={{ color: INK.muted }}>
              <span data-head-count className="tabular-nums">
                {STUDENTS} of {STUDENTS} present
              </span>
              {" · "}
              <span data-head-who>Not taken yet</span>
            </span>
          </span>
          <span className="ml-auto flex gap-1.5">
            <SmallButton>All present</SmallButton>
            <SmallButton>All absent</SmallButton>
          </span>
        </div>
        {ROSTER.map((s, i) => (
          <RosterRow key={s.prn} index={i} name={s.name} prn={s.prn} />
        ))}
      </div>

      {/* The tally and the save, riding along the bottom. */}
      <div
        data-bar
        className="absolute z-[5] flex items-center gap-3 rounded-[16px] bg-white pr-[9px] pl-4"
        style={{
          left: BAR.x,
          top: BAR.y,
          width: BAR.w,
          height: BAR.h,
          boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 2px 4px rgba(16,24,40,0.04), 0 14px 30px -14px rgba(16,24,40,0.24)`,
        }}
      >
        <div className="relative min-w-0 flex-1">
          <div data-tally-box style={{ transform: "translateY(9px)" }}>
            <p
              data-tally
              className="text-[14px] font-medium tabular-nums"
              style={{ color: INK.ink }}
            >
              {STUDENTS} present
            </p>
            <p
              data-saved
              className="flex items-center gap-1.5 text-[12.5px] font-semibold opacity-0"
              style={{ color: INK.green }}
            >
              <Icon name="checkCircle" size={14} stroke={2} />
              Saved at 10:03, 60 of 62 counted present
            </p>
          </div>
        </div>
        <span
          className="flex h-[36px] items-center justify-center rounded-[10px] text-[14.5px] font-semibold text-white"
          style={{ width: SAVE_W, background: INK.slate }}
        >
          <span data-save-label>Save register</span>
        </span>
      </div>

      <InfoCard />
      <CheckInPanel />
    </div>
  );
}

function SmallButton({ children }: { children: string }) {
  return (
    <span
      className="flex h-[28px] items-center rounded-[9px] px-2.5 text-[12.5px] font-semibold"
      style={{ boxShadow: `inset 0 0 0 1px ${INK.ring}`, color: INK.ink }}
    >
      {children}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function RosterRow({
  index,
  name,
  prn,
}: {
  index: number;
  name: string;
  prn: string;
}) {
  const checkIn = CHECK_INS.find((c) => c.row === index);
  return (
    <div
      className="absolute inset-x-0 flex items-center gap-2.5 px-[14px]"
      style={{
        top: REG.head + index * REG.row,
        height: REG.row,
        boxShadow: index > 0 ? `inset 0 1px 0 ${INK.hair}` : undefined,
      }}
    >
      <span
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[30%] text-[11px] font-semibold"
        style={{
          background: "rgba(68,88,121,0.1)",
          color: INK.slate,
          boxShadow: `inset 0 0 0 1px ${INK.hair}`,
        }}
      >
        {initials(name)}
      </span>
      <span className="flex min-w-0 flex-col leading-[1.15]">
        <span className="truncate text-[14.5px] font-semibold">{name}</span>
        <span className="font-mono text-[11px]" style={{ color: INK.faint }}>
          {prn}
        </span>
      </span>

      {/* The four marks; present is pressed for everyone to begin with. */}
      <span
        className="absolute flex"
        style={{ left: SEG_X, top: (REG.row - SEG_H) / 2, gap: SEG_GAP }}
      >
        {STATUSES.map((s) => (
          <span
            key={s.value}
            className="relative flex items-center justify-center rounded-[8px] text-[12px] font-semibold"
            style={{
              width: s.w,
              height: SEG_H,
              color: INK.muted,
              boxShadow: `inset 0 0 0 1px ${INK.hair}`,
            }}
          >
            {s.label}
            <span
              data-on={`${index}-${s.value}`}
              className="absolute inset-0 flex items-center justify-center rounded-[8px]"
              style={{
                ...PRESSED[s.value],
                opacity: s.value === "PRESENT" ? 1 : 0,
              }}
            >
              {s.label}
            </span>
          </span>
        ))}

        {/* The code fills the register in. */}
        <span
          data-wait
          className="absolute -inset-[2px] flex items-center gap-1.5 rounded-[8px] bg-white px-2.5 text-[12px] font-semibold opacity-0"
          style={{
            color: INK.faint,
            outline: "1.5px dashed rgba(68,88,121,0.3)",
            outlineOffset: -1.5,
          }}
        >
          <Icon name="hourglass" size={13} stroke={2} />
          Not in yet
        </span>
        {checkIn && (
          <span
            data-in={index}
            className="absolute -inset-[2px] flex items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-semibold opacity-0"
            style={{
              background:
                "linear-gradient(rgba(78,125,58,0.1), rgba(78,125,58,0.1)), #ffffff",
              color: INK.green,
              boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.3)",
            }}
          >
            <Icon name="check" size={13} stroke={2.6} />
            {checkIn.late ? "Checked in late" : "Checked in"}
            <span className="ml-auto font-mono text-[11.5px] font-medium">
              {checkIn.at}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}

function InfoCard() {
  return (
    <div
      data-info
      className="absolute"
      style={{ ...CARD, left: SIDE.x, top: SIDE.y, width: SIDE.w }}
    >
      <div className="px-4 pt-3.5 pb-3">
        <div className="text-[13px] font-semibold" style={{ color: INK.muted }}>
          This course
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[17px] font-bold">
          <span
            className="h-[12px] w-[12px] rounded-[4px]"
            style={{
              background: courseTone(COURSE).fill,
              boxShadow: `inset 0 0 0 1px ${courseTone(COURSE).ring}`,
            }}
          />
          {COURSE}
        </div>
      </div>
      <div className="h-px" style={{ background: INK.hair }} />
      <div className="flex flex-col gap-2.5 px-4 py-3.5 text-[13.5px]">
        <InfoLine label="Registers taken">
          <span className="relative block h-[18px] w-[80px] overflow-hidden">
            <span data-held-old className="absolute inset-0 text-right">
              {HELD} of {SCHEDULED}
            </span>
            <span
              data-held-new
              className="absolute inset-0 text-right opacity-0"
              style={{ color: INK.green }}
            >
              {HELD + 1} of {SCHEDULED}
            </span>
          </span>
        </InfoLine>
        <InfoLine label="Students">{STUDENTS}</InfoLine>
        <InfoLine label="Below 75%">
          <span style={{ color: "#c42f3e" }}>4</span>
        </InfoLine>
      </div>
    </div>
  );
}

function InfoLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: INK.muted }}>{label}</span>
      <span className="font-mono text-[14px] font-semibold tabular-nums">
        {children}
      </span>
    </div>
  );
}

/* ---------- Build 2: the check-in code ------------------------------------- */

function CheckInPanel() {
  const size = QR_N * QR_MOD;
  const finders: [number, number][] = [
    [0, 0],
    [QR_N - 7, 0],
    [0, QR_N - 7],
  ];
  return (
    <div
      data-panel
      className="absolute flex flex-col"
      style={{
        ...CARD,
        left: SIDE.x,
        top: SIDE.y,
        width: SIDE.w,
        height: BAR.y + BAR.h - SIDE.y,
        transform: `translateX(${SIDE.w + 40}px)`,
      }}
    >
      <div className="px-4 pt-3.5">
        <div className="leading-tight">
          <div className="text-[17px] font-bold">Check-in code</div>
          <div className="mt-0.5 text-[12.5px]" style={{ color: INK.muted }}>
            Open until 9:15
          </div>
        </div>
      </div>

      <div
        data-qr
        className="mx-auto mt-4 rounded-[14px] bg-white p-2.5"
        style={{ boxShadow: `inset 0 0 0 1px ${INK.hair}` }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden
        >
          {QR_CELLS.map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x * QR_MOD}
              y={y * QR_MOD}
              width={QR_MOD}
              height={QR_MOD}
              fill={INK.title}
            />
          ))}
          {finders.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect
                x={x * QR_MOD}
                y={y * QR_MOD}
                width={7 * QR_MOD}
                height={7 * QR_MOD}
                rx={5}
                fill={INK.title}
              />
              <rect
                x={(x + 1) * QR_MOD}
                y={(y + 1) * QR_MOD}
                width={5 * QR_MOD}
                height={5 * QR_MOD}
                rx={3}
                fill="#ffffff"
              />
              <rect
                x={(x + 2) * QR_MOD}
                y={(y + 2) * QR_MOD}
                width={3 * QR_MOD}
                height={3 * QR_MOD}
                rx={2}
                fill={INK.title}
              />
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-4 flex justify-center gap-[3px] overflow-hidden font-mono text-[36px] leading-[42px] font-bold tabular-nums">
        {CODE.split("").map((d, i) => (
          <span
            key={i}
            data-digit
            className="inline-block"
            style={{ marginLeft: i === 3 ? 12 : 0 }}
          >
            {d}
          </span>
        ))}
      </div>
      <div
        className="mt-1 text-center text-[12.5px]"
        style={{ color: INK.muted }}
      >
        Students enter it in Plannr
      </div>

      <div className="mx-4 mt-auto mb-4">
        <div className="h-px" style={{ background: INK.hair }} />
        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            data-checked
            className="font-mono text-[28px] leading-none font-bold tabular-nums"
          >
            0
          </span>
          <span
            className="font-mono text-[15px] font-semibold"
            style={{ color: INK.muted }}
          >
            of {STUDENTS}
          </span>
          <span
            className="ml-auto text-[13px] font-semibold"
            style={{ color: INK.muted }}
          >
            checked in
          </span>
        </div>
        <div
          className="mt-2.5 h-[8px] overflow-hidden rounded-full"
          style={{ background: "rgba(68,88,121,0.12)" }}
        >
          <div
            data-checked-bar
            className="h-full w-full rounded-full"
            style={{ background: INK.green, transform: "scaleX(0)" }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- Build 1: the student's phone ----------------------------------- */

const PHONE_CARD: CSSProperties = {
  background: "#ffffff",
  borderRadius: 24,
  boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 2px 8px -4px rgba(16,24,40,0.12)`,
};

function StudentPhone() {
  const dm = courseTone(COURSE);
  const wt = courseTone("Web Technologies");
  return (
    <PhoneFrame height={PHONE_H} time="10:03">
      <div className="absolute inset-0" style={{ background: INK.paper }}>
        <div className="absolute" style={{ left: 24, top: 70 }}>
          <div
            className="text-[24px] font-semibold"
            style={{ color: INK.muted }}
          >
            Aarav Menon
          </div>
          <div className="font-display text-[42px] leading-tight font-bold tracking-[-0.02em]">
            Attendance
          </div>
        </div>

        {/* Data Mining: the course the register just landed in. */}
        <div
          className="absolute overflow-hidden"
          style={{ ...PHONE_CARD, left: 14, right: 14, top: 168, height: 474 }}
        >
          <span
            data-p-flash
            className="pointer-events-none absolute inset-0 opacity-0"
            style={{ background: "rgba(68,88,121,0.08)" }}
          />
          <div className="relative px-6 pt-6">
            <div className="flex items-center gap-2.5 text-[32px] font-bold">
              <span
                className="h-[18px] w-[18px] rounded-[5px]"
                style={{
                  background: dm.fill,
                  boxShadow: `inset 0 0 0 1px ${dm.ring}`,
                }}
              />
              {COURSE}
            </div>
            <div
              data-p-pct
              className="font-display mt-3 text-[104px] leading-none font-bold tracking-[-0.03em] tabular-nums"
              style={{ color: INK.green }}
            >
              {PHONE_DM.pct0}%
            </div>
            <div
              data-p-taken
              className="mt-2 text-[28px] font-medium tabular-nums"
              style={{ color: INK.ink }}
            >
              15 attended of {HELD} taken
            </div>
            <div
              className="relative mt-5 h-[12px] rounded-full"
              style={{ background: "rgba(68,88,121,0.14)" }}
            >
              <div
                data-p-meter
                className="h-full rounded-full"
                style={{ width: `${PHONE_DM.pct0}%`, background: INK.green }}
              />
              <span
                className="absolute -top-[6px] h-[24px] w-[3px] rounded-full"
                style={{
                  left: `${PHONE_DM.threshold}%`,
                  background: INK.slate,
                }}
              />
            </div>
            <div
              className="mt-4 text-[22px] whitespace-nowrap"
              style={{ color: INK.muted }}
            >
              <span data-p-count>{HELD}</span> registers taken · {SCHEDULED}{" "}
              scheduled
            </div>
          </div>

          {/* The latest lectures: today's lands on top. */}
          <div
            className="absolute inset-x-0 overflow-hidden"
            style={{ top: 344, height: P_ROW * 2 }}
          >
            <PhoneRegisterRow
              top={0}
              when="Wed 7 Oct, 9:00"
              mark="Absent"
              data="new"
            />
            <PhoneRegisterRow top={0} when="Mon 5 Oct, 9:00" mark="Present" />
            <PhoneRegisterRow
              top={P_ROW}
              when="Fri 2 Oct, 9:00"
              mark="Present"
            />
          </div>
        </div>

        <div
          className="absolute flex items-center gap-2.5 px-6 text-[26px] font-bold whitespace-nowrap"
          style={{ ...PHONE_CARD, left: 14, right: 14, top: 656, height: 100 }}
        >
          <span
            className="h-[18px] w-[18px] rounded-[5px]"
            style={{
              background: wt.fill,
              boxShadow: `inset 0 0 0 1px ${wt.ring}`,
            }}
          />
          Web Technologies
          <span
            className="font-display ml-auto text-[34px] tabular-nums"
            style={{ color: INK.green }}
          >
            92%
          </span>
        </div>
      </div>
    </PhoneFrame>
  );
}

function PhoneRegisterRow({
  top,
  when,
  mark,
  data,
}: {
  top: number;
  when: string;
  mark: "Present" | "Absent";
  data?: "new";
}) {
  const absent = mark === "Absent";
  return (
    <div
      {...(data === "new" ? { "data-p-new": "" } : { "data-p-older": "" })}
      className="absolute inset-x-0 flex items-center px-6"
      style={{
        top,
        height: P_ROW,
        boxShadow: `inset 0 1px 0 ${INK.hair}`,
        opacity: data === "new" ? 0 : 1,
      }}
    >
      <span className="text-[25px] font-semibold">{when}</span>
      {absent ? (
        <span
          className="ml-auto rounded-[10px] px-3 py-[3px] text-[23px] font-bold"
          style={{ background: "rgba(220,56,72,0.12)", color: "#c42f3e" }}
        >
          Absent
        </span>
      ) : (
        <span
          className="ml-auto px-3 text-[23px] font-semibold"
          style={{ color: INK.muted }}
        >
          Present
        </span>
      )}
    </div>
  );
}
