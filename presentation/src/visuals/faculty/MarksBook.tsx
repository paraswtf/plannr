"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { PhoneFrame, PHONE_BODY } from "~/ui/frames";
import { Icon } from "~/ui/icon";
import { courseTone } from "~/ui/mock";

import {
  CARD,
  click,
  Cursor,
  DemoBox,
  FacultyBrowser,
  FRAME,
  GROUP_TONES,
  INK,
  PAGE,
  Toast,
  TOPBAR,
  useIntro,
  ZOOM,
  type GroupId,
} from "./_shell";

export interface MarksBookProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between slides. */
  flipId?: string;
}

/**
 * A teacher's marks book: the college's assessment plan filled in, an
 * assignment set once for every group, marks typed once.
 *
 * Builds (steps = 3), following the feature's three points:
 *   0 — on arrival: Data Mining's marks book for BCA-A. The college's
 *       assessment plan sits beside it, and each of its four parts travels
 *       into the book as a column (Unit test 1 /20, Unit test 2 /20,
 *       Assignment /10, End term /50), then the total. Nothing to set up.
 *   1 — the pointer sets the assignment from the plan: the title is typed,
 *       the deadline is Fri 9 Oct, 11:59pm, both groups are ticked. One
 *       click, and the deadline flies to a BCA-A phone and a BCA-B phone and
 *       lands on their Friday: "62 + 63 students see it".
 *   2 — the marks go in cell by cell and each row's total adds itself up as
 *       they do; then Export, and the results file is ready.
 *
 * The browser frame carries `flipId`, like the other faculty demos.
 */

/* ---------- Data ---------------------------------------------------------- */

const TEACHER = "Prof. Rao";
const COURSE = "Data Mining";
const SIZE: Record<"BCA-A" | "BCA-B", number> = { "BCA-A": 62, "BCA-B": 63 };
const PROJECT = "Data Mining project";
const DUE = "Fri 9 Oct, 11:59pm";

/** The college's assessment plan for the course: four parts, out of 100. */
const PLAN = [
  { label: "Unit test 1", out: 20, tone: "#8fa2c0" },
  { label: "Unit test 2", out: 20, tone: "#6b80a3" },
  { label: "Assignment", out: 10, tone: "#d99425" },
  { label: "End term", out: 50, tone: INK.slate },
] as const;
const ASSIGNMENT = 2;
const PLAN_TOTAL = PLAN.reduce((s, p) => s + p.out, 0);

/** The first eight of BCA-A's 62, as the register lists them, with marks. */
const ROSTER: { name: string; prn: string; marks: number[] }[] = [
  { name: "Aadya Pillai", prn: "24030121001", marks: [17, 18, 9, 41] },
  { name: "Aarav Menon", prn: "24030121002", marks: [14, 15, 8, 36] },
  { name: "Abhishek Rane", prn: "24030121004", marks: [12, 11, 7, 29] },
  { name: "Aditi Deshmukh", prn: "24030121005", marks: [19, 18, 10, 45] },
  { name: "Advait Chavan", prn: "24030121007", marks: [9, 13, 6, 27] },
  { name: "Ananya Iyer", prn: "24030121008", marks: [16, 17, 9, 38] },
  { name: "Arjun Malhotra", prn: "24030121010", marks: [15, 12, 8, 33] },
  { name: "Aryan Shah", prn: "24030121011", marks: [11, 14, 7, 31] },
];

/** Friday on a student's phone in each group, before the deadline lands. */
const PHONES: {
  group: "BCA-A" | "BCA-B";
  student: string;
  classes: { title: string; time: string; room: string }[];
}[] = [
  {
    group: "BCA-A",
    student: "Aarav Menon",
    classes: [
      { title: "Data Mining", time: "9:00-10:00", room: "301" },
      { title: "Web Technologies", time: "11:00-12:00", room: "301" },
      { title: "Software Testing", time: "14:00-15:00", room: "304" },
    ],
  },
  {
    group: "BCA-B",
    student: "Kavya Patil",
    classes: [
      { title: "Web Technologies", time: "9:00-10:00", room: "302" },
      { title: "Data Mining", time: "11:00-12:00", room: "302" },
      { title: "Cloud Computing", time: "12:00-13:00", room: "304" },
    ],
  },
];

/* ---------- Layout, in page pixels ---------------------------------------- */

const HEAD_Y = TOPBAR + 12;
const BODY_Y = TOPBAR + 76;

/** The marks book: a card with a head, the column heads, then the rows. */
const BOOK = { x: 16, y: BODY_Y, w: 540, head: 50, cols: 46, row: 38 };
const NAME_W = 164;
const COLS = PLAN.length + 1; // the four parts, then the total
const COL_W = (BOOK.w - NAME_W) / COLS;
const COLS_Y = BOOK.y + BOOK.head;
const ROWS_Y = COLS_Y + BOOK.cols;

const colX = (c: number) => BOOK.x + NAME_W + c * COL_W;
const rowY = (r: number) => ROWS_Y + r * BOOK.row;
const cellAt = (r: number, c: number) => ({
  x: colX(c) + COL_W / 2,
  y: rowY(r) + BOOK.row / 2,
});

/** The column beside the book: the plan, then the assignment form. */
const SIDE = { x: 568, y: BODY_Y, w: 216 };
const SIDE_OUT = SIDE.w + 40;
const PLAN_ROWS_Y = 88;
const PLAN_ROW = 32;
const SET_BTN = { w: 40, h: 24 };
const SET_AT = {
  x: SIDE.x + SIDE.w - 16 - 30 - SET_BTN.w / 2,
  y: SIDE.y + PLAN_ROWS_Y + ASSIGNMENT * PLAN_ROW + PLAN_ROW / 2,
};
/** Where a plan part's label sits, for its column to set off from. */
const planLabelAt = (i: number) => ({
  x: SIDE.x + 16 + 18 + 38,
  y: SIDE.y + PLAN_ROWS_Y + i * PLAN_ROW + PLAN_ROW / 2,
});

const FORM_BTN_Y = 254;
const FORM_BTN_H = 38;
const FORM_BTN = {
  x: SIDE.x + SIDE.w / 2,
  y: SIDE.y + FORM_BTN_Y + FORM_BTN_H / 2,
};

/** The save bar along the bottom of the book, and its Export button. */
const BAR = { x: BOOK.x, h: 54, y: PAGE.height - 12 - 54, w: BOOK.w };
const EXPORT_W = 150;
const EXPORT = {
  x: BAR.x + BAR.w - 9 - EXPORT_W / 2,
  y: BAR.y + BAR.h / 2,
};

const START_B = { x: 470, y: 420 };
const START_C = { x: 300, y: 430 };

/* ---------- The phones (build 1), in the 960 x 844 box -------------------- */

const BOX = { w: FRAME.width, h: 844 };
const FRAME_TOP = (BOX.h - FRAME.height) / 2;
/** A point on the page, in the box's pixels (the page sits under a 52px toolbar). */
const onBox = (p: { x: number; y: number }) => ({
  x: (BOX.w - FRAME.width) / 2 + p.x * ZOOM,
  y: FRAME_TOP + 52 + p.y * ZOOM,
});

const PHONE_H = 470;
const PK = PHONE_H / PHONE_BODY.height;
const PHONE_W = PHONE_BODY.width * PK;
const PHONE_X = [22, 22 + PHONE_W + 22];
/** The phones' tops line up with the book's first row, under its column heads. */
const PHONE_TOP = onBox({ x: 0, y: ROWS_Y }).y;
/** The phone's list of the day, in phone pixels. */
const P_LIST_Y = 190;
const P_ROW_H = 118;
const P_GAP = 14;
const P_STEP = P_ROW_H + P_GAP;
/** Where the deadline lands on each phone, in the box's pixels. */
const LANDINGS = PHONE_X.map((x) => ({
  x: x + PK * (PHONE_BODY.bezel + 393 / 2),
  y: PHONE_TOP + PK * (PHONE_BODY.bezel + P_LIST_Y + P_ROW_H / 2),
}));
const LAUNCH = onBox(FORM_BTN);

const DEADLINE = { bg: "#fff3dc", ink: "#7a4a00", ring: "#d99425" } as const;

/* ---------- The demo ------------------------------------------------------- */

export function MarksBook({ step, active, flipId }: MarksBookProps) {
  const scope = useRef<HTMLDivElement>(null);

  // 0 — the college's plan travels into the book, a column at a time.
  useIntro(scope, { active, step }, (tl) => {
    PLAN.forEach((_, i) => {
      const from = planLabelAt(i);
      const to = { x: colX(i) + COL_W / 2, y: COLS_Y + BOOK.cols / 2 };
      const at = i * 0.32;
      tl.fromTo(
        `[data-col="${i}"]`,
        { opacity: 0, scale: 1.08 },
        {
          opacity: 1,
          scale: 1,
          motionPath: {
            path: [
              { x: from.x - to.x, y: from.y - to.y },
              { x: (from.x - to.x) * 0.5, y: (from.y - to.y) * 0.5 - 70 },
              { x: 0, y: 0 },
            ],
            curviness: 1.1,
          },
          duration: 0.95,
          ease: "deck.morph",
        },
        at,
      );
      tl.fromTo(
        `[data-col-chip="${i}"]`,
        { opacity: 0 },
        {
          keyframes: [
            { opacity: 1, duration: 0.15 },
            { opacity: 1, duration: 0.6 },
            { opacity: 0, duration: 0.2 },
          ],
        },
        at,
      );
      tl.fromTo(
        `[data-applied="${i}"]`,
        { scale: 0.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.4)" },
        at + 0.85,
      );
      tl.fromTo(
        `[data-blank-in="${i}"]`,
        { opacity: 0, y: -6 },
        {
          opacity: 1,
          y: 0,
          duration: 0.3,
          ease: "power2.out",
          stagger: 0.035,
        },
        at + 0.8,
      );
    });
    const end = (PLAN.length - 1) * 0.32 + 0.95;
    tl.fromTo(
      `[data-col="${PLAN.length}"]`,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
      end,
    );
    tl.fromTo(
      `[data-blank-in="${PLAN.length}"]`,
      { opacity: 0, y: -6 },
      { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", stagger: 0.035 },
      end + 0.1,
    );
    tl.fromTo(
      "[data-from-plan]",
      { opacity: 0, x: 10 },
      { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" },
      end + 0.1,
    );
  });

  useSteps(scope, step, (tl, mark) => {
    // 1 — set the assignment once, from the plan.
    tl.to(".cur-b", { opacity: 1, duration: 0.2 });
    tl.to(
      ".cur-b",
      {
        x: SET_AT.x - START_B.x,
        y: SET_AT.y - START_B.y,
        duration: 0.75,
        ease: "deck.morph",
      },
      "<",
    );
    click(tl, ".cur-b");
    tl.to(
      "[data-plan]",
      { x: SIDE_OUT, duration: 0.55, ease: "power2.in" },
      ">0.02",
    );
    tl.fromTo(
      "[data-form]",
      { x: SIDE_OUT },
      { x: 0, duration: 0.7, ease: "deck.morph" },
      "<0.25",
    );
    tl.to(
      ".cur-b",
      { x: "-=180", y: "+=40", duration: 0.5, ease: "power2.inOut" },
      "<",
    );
    tl.fromTo(
      "[data-caret]",
      { opacity: 0 },
      { opacity: 1, duration: 0.1 },
      ">-0.1",
    );
    tl.fromTo(
      "[data-title]",
      { text: "" },
      { text: PROJECT, duration: 0.8, ease: "none" },
      "<",
    );
    tl.to("[data-caret]", { opacity: 0, duration: 0.1 }, ">0.05");
    tl.to(
      ".cur-b",
      {
        x: FORM_BTN.x - START_B.x,
        y: FORM_BTN.y - START_B.y,
        duration: 0.6,
        ease: "deck.morph",
      },
      "<",
    );
    click(tl, ".cur-b");
    // The phones come up as the deadline sets off for them.
    tl.addLabel("fly", "<0.05");
    tl.to(
      "[data-book-layer]",
      { opacity: 0.4, duration: 0.5, ease: "power2.out" },
      "fly",
    );
    tl.fromTo(
      "[data-phone]",
      { y: 280, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.85,
        ease: "deck.enter",
        stagger: 0.1,
      },
      "fly",
    );
    tl.to(
      ".cur-b",
      { x: "+=70", y: "+=110", opacity: 0, duration: 0.6, ease: "power2.out" },
      "fly",
    );
    LANDINGS.forEach((to, i) => {
      const chip = `[data-chip="${i}"]`;
      const dx = to.x - LAUNCH.x;
      const dy = to.y - LAUNCH.y;
      const t0 = 0.15 + i * 0.12;
      tl.fromTo(
        chip,
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1, duration: 0.2, ease: "power2.out" },
        `fly+=${t0}`,
      );
      tl.fromTo(
        chip,
        { x: 0, y: 0 },
        {
          motionPath: {
            path: [
              { x: 0, y: 0 },
              { x: dx * 0.5, y: Math.min(0, dy) - 120 - i * 30 },
              { x: dx, y: dy },
            ],
            curviness: 1.2,
          },
          duration: 1.05,
          ease: "power2.inOut",
          immediateRender: false,
        },
        `fly+=${t0 + 0.02}`,
      );
      tl.to(
        chip,
        { scale: 0.5, opacity: 0, duration: 0.16, ease: "power2.in" },
        `fly+=${t0 + 1}`,
      );
      tl.to(
        `[data-p-classes="${i}"]`,
        { y: P_STEP, duration: 0.5, ease: "deck.morph" },
        `fly+=${t0 + 0.7}`,
      );
      tl.fromTo(
        `[data-p-due="${i}"]`,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.8)" },
        `fly+=${t0 + 1}`,
      );
    });
    tl.to(
      "[data-set-done]",
      { opacity: 1, duration: 0.3 },
      `fly+=${0.15 + 0.12 + 1.05}`,
    );
    tl.fromTo(
      "[data-reach]",
      { opacity: 0, y: -6 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
      "<0.05",
    );
    tl.to("[data-col-out]", { opacity: 0, y: -6, duration: 0.25 }, "<");
    tl.fromTo(
      "[data-col-due]",
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.3 },
      "<0.1",
    );
    mark();

    // 2 — the marks go in once; the totals add themselves up; export.
    tl.to("[data-phone]", {
      y: 300,
      opacity: 0,
      duration: 0.55,
      ease: "power2.in",
      stagger: 0.06,
    });
    tl.to(
      "[data-book-layer]",
      { opacity: 1, duration: 0.45, ease: "power2.out" },
      "<0.1",
    );
    tl.fromTo(
      "[data-focus]",
      { opacity: 0 },
      { opacity: 1, duration: 0.2 },
      ">-0.1",
    );
    const home = cellAt(0, 0);
    // Placed by the clock, so the totals' flashes never hold up the typing.
    let t = tl.duration();
    ROSTER.forEach((s, r) => {
      // A teacher finds the rhythm: slower on the first row, quick after.
      const move = r === 0 ? 0.16 : r < 3 ? 0.08 : 0.045;
      const fade = r === 0 ? 0.14 : r < 3 ? 0.09 : 0.07;
      const rest = r === 0 ? 0.08 : 0;
      let sum = 0;
      s.marks.forEach((m, c) => {
        sum += m;
        const at = cellAt(r, c);
        tl.to(
          "[data-focus]",
          {
            x: at.x - home.x,
            y: at.y - home.y,
            duration: move,
            ease: "power2.inOut",
          },
          t,
        );
        const typed = t + move;
        tl.set(`[data-blank="${c}"][data-row="${r}"]`, { opacity: 0 }, typed);
        tl.fromTo(
          `[data-mark="${r}-${c}"]`,
          { opacity: 0, y: 5 },
          { opacity: 1, y: 0, duration: fade },
          typed,
        );
        if (c === 0) {
          tl.set(
            `[data-blank="${PLAN.length}"][data-row="${r}"]`,
            { opacity: 0 },
            typed,
          );
          tl.set(`[data-total="${r}"]`, { opacity: 1 }, typed);
        }
        tl.set(`[data-total="${r}"]`, { text: String(sum) }, typed);
        if (c === s.marks.length - 1)
          tl.fromTo(
            `[data-total-flash="${r}"]`,
            { opacity: 0 },
            {
              keyframes: [
                { opacity: 1, duration: 0.08 },
                { opacity: 0, duration: 0.45 },
              ],
            },
            typed,
          );
        t = typed + fade * 0.6 + rest;
      });
    });
    tl.to("[data-focus]", { opacity: 0, duration: 0.2 }, t + 0.1);
    tl.to("[data-bar-idle]", { opacity: 0, y: -8, duration: 0.25 }, "<");
    tl.fromTo(
      "[data-bar-saved]",
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.3 },
      "<0.1",
    );
    tl.to(".cur-c", { opacity: 1, duration: 0.2 }, "<");
    tl.to(
      ".cur-c",
      {
        x: EXPORT.x - START_C.x,
        y: EXPORT.y - START_C.y,
        duration: 0.75,
        ease: "deck.morph",
      },
      "<",
    );
    click(tl, ".cur-c");
    tl.to("[data-export-idle]", { opacity: 0, duration: 0.15 }, "<0.05");
    tl.to("[data-export-done]", { opacity: 1, duration: 0.2 }, "<0.05");
    tl.to(
      ".cur-c",
      { x: "-=150", y: "-=40", opacity: 0, duration: 0.6, ease: "power2.out" },
      ">0.05",
    );
    tl.fromTo(
      "[data-toast]",
      { y: 110 },
      { y: 0, duration: 0.6, ease: "power3.out" },
      "<",
    );
    mark();
  });

  return (
    <DemoBox scope={scope}>
      <FacultyBrowser
        flipId={flipId}
        path="courses/data-mining/marks"
        tab={2}
        user={TEACHER}
        role="Faculty · BCA"
      >
        <Heading />
        {/* The book steps back while the phones are up. */}
        <div data-book-layer className="absolute inset-0">
          <Book />
          <Bar />
        </div>
        <PlanCard />
        <FormCard />

        {/* The cell being typed into. */}
        <span
          data-focus
          className="pointer-events-none absolute z-[4] rounded-[8px] opacity-0"
          style={{
            left: cellAt(0, 0).x - (COL_W - 12) / 2,
            top: cellAt(0, 0).y - (BOOK.row - 10) / 2,
            width: COL_W - 12,
            height: BOOK.row - 10,
            boxShadow: `0 0 0 2px ${INK.slate}, 0 0 0 5px rgba(68,88,121,0.16)`,
          }}
        />

        {/* Under the form, so it covers none of the marks. */}
        <Toast icon="sheet" style={{ left: SIDE.x + SIDE.w / 2 }}>
          <span className="flex flex-col leading-tight">
            <span>Results exported</span>
            <span
              className="font-mono text-[12.5px] font-semibold"
              style={{ color: INK.slate }}
            >
              DataMining_BCA-A.xlsx
            </span>
          </span>
        </Toast>
        <Cursor x={START_B.x} y={START_B.y} className="cur-b" />
        <Cursor x={START_C.x} y={START_C.y} className="cur-c" />
      </FacultyBrowser>

      {/* Build 1: a student's Friday in each group. */}
      {PHONES.map((p, i) => (
        <div
          key={p.group}
          data-phone
          className="absolute z-[6]"
          style={{ left: PHONE_X[i], top: PHONE_TOP, opacity: 0 }}
        >
          <StudentPhone index={i} {...p} />
        </div>
      ))}

      {/* The deadline, on its way to both groups. */}
      {LANDINGS.map((_, i) => (
        <span
          key={i}
          data-chip={i}
          className="absolute z-[7] flex items-center justify-center rounded-full opacity-0"
          style={{
            left: LAUNCH.x - 19,
            top: LAUNCH.y - 19,
            width: 38,
            height: 38,
            background: DEADLINE.bg,
            color: DEADLINE.ink,
            boxShadow: `inset 0 0 0 1.5px ${DEADLINE.ring}, 0 8px 18px -6px rgba(16,24,40,0.32)`,
          }}
        >
          <Icon name="file" size={19} stroke={2.1} />
        </span>
      ))}
    </DemoBox>
  );
}

/* ---------- The page ------------------------------------------------------- */

function Heading() {
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
          {COURSE} · BCA semester 5
        </div>
        <div className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em]">
          Marks book
        </div>
      </div>
      <span
        className="mb-0.5 flex gap-[3px] rounded-[11px] p-[3px]"
        style={{
          background: "rgba(68,88,121,0.08)",
          boxShadow: `inset 0 0 0 1px ${INK.hair}`,
        }}
      >
        {(["BCA-A", "BCA-B"] as const).map((g, i) => (
          <span
            key={g}
            className="flex h-[30px] items-center gap-2 rounded-[8px] px-3 text-[14px] font-semibold"
            style={
              i === 0
                ? {
                    background: "#ffffff",
                    color: INK.title,
                    boxShadow: `inset 0 0 0 1px ${INK.hair}, 0 1px 2px rgba(16,24,40,0.08)`,
                  }
                : { color: INK.muted }
            }
          >
            <GroupDot group={g} />
            {g}
            <span
              className="font-mono text-[12.5px]"
              style={{ color: INK.faint }}
            >
              {SIZE[g]}
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}

function GroupDot({ group, size = 10 }: { group: GroupId; size?: number }) {
  return (
    <span
      className="shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: GROUP_TONES[group].fill,
        boxShadow: `inset 0 0 0 1px ${GROUP_TONES[group].ring}`,
      }}
    />
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

function Book() {
  const total = PLAN.length;
  return (
    <>
      <div
        className="absolute overflow-hidden"
        style={{
          ...CARD,
          left: BOOK.x,
          top: BOOK.y,
          width: BOOK.w,
          height: PAGE.height - BOOK.y + 20,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        }}
      >
        {/* Head: the group, and where the columns came from. */}
        <div
          className="flex items-center px-4"
          style={{
            height: BOOK.head,
            boxShadow: `inset 0 -1px 0 ${INK.hair}`,
          }}
        >
          <span className="flex flex-col leading-tight">
            <span className="font-display text-[17px] font-bold tracking-[-0.01em]">
              BCA-A
            </span>
            <span className="text-[12.5px]" style={{ color: INK.muted }}>
              {SIZE["BCA-A"]} students · out of {PLAN_TOTAL}
            </span>
          </span>
          <span
            data-from-plan
            className="ml-auto flex items-center gap-1.5 rounded-[9px] px-2.5 py-[5px] text-[12.5px] font-semibold opacity-0"
            style={{ background: "rgba(78,125,58,0.1)", color: INK.green }}
          >
            <Icon name="clipboard" size={14} stroke={2.1} />
            From the college&apos;s plan
          </span>
        </div>

        {/* The column heads' row: the heads themselves travel in above. */}
        <div
          className="absolute inset-x-0"
          style={{
            top: BOOK.head,
            height: BOOK.cols,
            background: "#f7f8fa",
            boxShadow: `inset 0 -1px 0 ${INK.hair}`,
          }}
        >
          <span
            className="absolute text-[12.5px] font-semibold"
            style={{ left: 16, top: 15, color: INK.muted }}
          >
            Student
          </span>
        </div>

        {/* The total's column, tinted. */}
        <span
          className="absolute bottom-0"
          style={{
            left: NAME_W + total * COL_W,
            top: BOOK.head,
            width: COL_W,
            background: "rgba(68,88,121,0.05)",
            boxShadow: `inset 1px 0 0 ${INK.hair}`,
          }}
        />

        {ROSTER.map((s, r) => (
          <div
            key={s.prn}
            className="absolute inset-x-0"
            style={{
              top: ROWS_Y - BOOK.y + r * BOOK.row,
              height: BOOK.row,
              boxShadow: r > 0 ? `inset 0 1px 0 ${INK.hair}` : undefined,
            }}
          >
            <span
              className="absolute flex items-center gap-2"
              style={{ left: 14, top: 0, bottom: 0, width: NAME_W - 18 }}
            >
              <span
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[30%] text-[10.5px] font-semibold"
                style={{
                  background: "rgba(68,88,121,0.1)",
                  color: INK.slate,
                  boxShadow: `inset 0 0 0 1px ${INK.hair}`,
                }}
              >
                {initials(s.name)}
              </span>
              <span className="flex min-w-0 flex-col leading-[1.15]">
                <span className="truncate text-[14px] font-semibold">
                  {s.name}
                </span>
                <span
                  className="font-mono text-[10.5px]"
                  style={{ color: INK.faint }}
                >
                  {s.prn}
                </span>
              </span>
            </span>

            {Array.from({ length: COLS }, (_, c) => (
              <span
                key={c}
                className="absolute flex items-center justify-center"
                style={{
                  left: NAME_W + c * COL_W,
                  width: COL_W,
                  top: 0,
                  bottom: 0,
                }}
              >
                {/* Not entered yet. */}
                <span data-blank-in={c} className="absolute opacity-0">
                  <span
                    data-blank={c}
                    data-row={r}
                    className="block h-[2px] w-[12px] rounded-full"
                    style={{ background: "rgba(68,88,121,0.3)" }}
                  />
                </span>
                {c < total ? (
                  <span
                    data-mark={`${r}-${c}`}
                    className="font-mono text-[15px] font-medium tabular-nums opacity-0"
                    style={{ color: INK.ink }}
                  >
                    {s.marks[c]}
                  </span>
                ) : (
                  <>
                    <span
                      data-total-flash={r}
                      className="absolute inset-x-[8px] inset-y-[6px] rounded-[7px] opacity-0"
                      style={{ background: "rgba(78,125,58,0.16)" }}
                    />
                    <span
                      data-total={r}
                      className="relative font-mono text-[15px] font-bold tabular-nums opacity-0"
                      style={{ color: INK.title }}
                    />
                  </>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* The column heads, drawn over the card so they can travel in. */}
      {Array.from({ length: COLS }, (_, c) => {
        const part = PLAN[c];
        return (
          <div
            key={c}
            data-col={c}
            className="absolute z-[3] opacity-0"
            style={{
              left: colX(c),
              top: COLS_Y,
              width: COL_W,
              height: BOOK.cols,
            }}
          >
            {part && (
              <span
                data-col-chip={c}
                className="absolute inset-x-[2px] inset-y-[4px] rounded-[9px] bg-white opacity-0"
                style={{
                  boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 8px 18px -8px rgba(16,24,40,0.3)`,
                }}
              />
            )}
            <span className="relative flex h-full flex-col items-center justify-center leading-[1.2]">
              <span
                className="text-[12.5px] font-semibold whitespace-nowrap"
                style={{ color: part ? INK.ink : INK.title }}
              >
                {part ? part.label : "Total"}
              </span>
              <span className="relative h-[15px] w-full">
                <span
                  {...(c === ASSIGNMENT ? { "data-col-out": "" } : {})}
                  className="absolute inset-0 text-center font-mono text-[11.5px]"
                  style={{ color: INK.muted }}
                >
                  /{part ? part.out : PLAN_TOTAL}
                </span>
                {c === ASSIGNMENT && (
                  <span
                    data-col-due
                    className="absolute inset-0 flex items-center justify-center gap-1 text-[11.5px] font-semibold whitespace-nowrap opacity-0"
                    style={{ color: DEADLINE.ink }}
                  >
                    <Icon name="file" size={11} stroke={2.2} />
                    Due Fri
                  </span>
                )}
              </span>
            </span>
          </div>
        );
      })}
    </>
  );
}

/** The college's assessment plan for the course, as the exam cell set it. */
function PlanCard() {
  const barW = SIDE.w - 32;
  return (
    <div
      data-plan
      className="absolute"
      style={{ ...CARD, left: SIDE.x, top: SIDE.y, width: SIDE.w, height: 308 }}
    >
      <div
        className="absolute text-[13px] leading-[17px] font-semibold"
        style={{ left: 16, top: 14, color: INK.muted }}
      >
        College assessment plan
      </div>
      <div
        className="font-display absolute text-[18px] leading-[24px] font-bold tracking-[-0.01em]"
        style={{ left: 16, top: 31 }}
      >
        BCA semester 5
      </div>
      {/* How the hundred marks split. */}
      <span
        className="absolute flex gap-[2px] overflow-hidden rounded-full"
        style={{ left: 16, top: 66, width: barW, height: 8 }}
      >
        {PLAN.map((p) => (
          <span
            key={p.label}
            className="h-full"
            style={{
              width: (barW - 6) * (p.out / PLAN_TOTAL),
              background: p.tone,
            }}
          />
        ))}
      </span>
      {PLAN.map((p, i) => (
        <div
          key={p.label}
          className="absolute flex items-center"
          style={{
            left: 16,
            right: 16,
            top: PLAN_ROWS_Y + i * PLAN_ROW,
            height: PLAN_ROW,
          }}
        >
          <span className="relative mr-2 h-[18px] w-[18px] shrink-0">
            <span
              className="absolute top-[4px] left-[4px] h-[10px] w-[10px] rounded-[3px]"
              style={{ background: p.tone }}
            />
            <span
              data-applied={i}
              className="absolute inset-0 flex items-center justify-center rounded-full opacity-0"
              style={{ background: INK.green, color: "#ffffff" }}
            >
              <Icon name="check" size={12} stroke={3} />
            </span>
          </span>
          <span className="text-[14px] font-semibold">{p.label}</span>
          {i === ASSIGNMENT && (
            <span
              className="ml-auto flex items-center justify-center rounded-[8px] text-[12.5px] font-semibold"
              style={{
                width: SET_BTN.w,
                height: SET_BTN.h,
                color: INK.slate,
                boxShadow: `inset 0 0 0 1px ${INK.ring}`,
              }}
            >
              Set
            </span>
          )}
          <span
            className={`${i === ASSIGNMENT ? "ml-3" : "ml-auto"} w-[18px] text-right font-mono text-[14px] font-semibold tabular-nums`}
            style={{ color: INK.ink }}
          >
            {p.out}
          </span>
        </div>
      ))}
      <div
        className="absolute flex items-center"
        style={{
          left: 16,
          right: 16,
          top: PLAN_ROWS_Y + PLAN.length * PLAN_ROW + 4,
          height: PLAN_ROW,
          boxShadow: `inset 0 1px 0 ${INK.hair}`,
        }}
      >
        <span className="text-[14px] font-bold">Total</span>
        <span className="ml-auto font-mono text-[14px] font-bold tabular-nums">
          {PLAN_TOTAL}
        </span>
      </div>
      <div
        className="absolute text-[12.5px] leading-[16px]"
        style={{ left: 16, right: 16, top: 262, color: INK.muted }}
      >
        Set by the exam cell, for every BCA group
      </div>
    </div>
  );
}

/** Build 1: the assignment, set once for both groups. */
function FormCard() {
  return (
    <div
      data-form
      className="absolute"
      style={{
        ...CARD,
        left: SIDE.x,
        top: SIDE.y,
        width: SIDE.w,
        height: 334,
        transform: `translateX(${SIDE_OUT}px)`,
      }}
    >
      <div
        className="absolute text-[13px] leading-[17px] font-semibold"
        style={{ left: 16, top: 14, color: INK.muted }}
      >
        Assignment · out of 10
      </div>
      <div
        className="font-display absolute text-[18px] leading-[24px] font-bold tracking-[-0.01em]"
        style={{ left: 16, top: 31 }}
      >
        Set the assignment
      </div>

      <FormField top={66} label="Title">
        <span data-title className="truncate font-semibold" />
        <span
          data-caret
          className="ml-[1px] h-[17px] w-[1.5px] shrink-0 opacity-0"
          style={{ background: INK.slate }}
        />
      </FormField>
      <FormField top={128} label="Due">
        <Icon name="calendar" size={15} stroke={2} color={INK.muted} />
        <span className="ml-1.5 font-semibold whitespace-nowrap">{DUE}</span>
      </FormField>

      <div
        className="absolute text-[12px] font-semibold"
        style={{ left: 16, top: 190, color: INK.muted }}
      >
        For
      </div>
      <div className="absolute flex gap-1.5" style={{ left: 16, top: 210 }}>
        {(["BCA-A", "BCA-B"] as const).map((g) => (
          <span
            key={g}
            className="flex h-[30px] items-center gap-[5px] rounded-[9px] px-2 text-[12.5px] font-semibold"
            style={{
              background: "rgba(68,88,121,0.08)",
              boxShadow: `inset 0 0 0 1.5px ${INK.slate}`,
              color: INK.title,
            }}
          >
            <GroupDot group={g} size={9} />
            {g}
            <span
              className="font-mono text-[12px]"
              style={{ color: INK.muted }}
            >
              {SIZE[g]}
            </span>
          </span>
        ))}
      </div>

      <span
        className="absolute flex items-center justify-center overflow-hidden rounded-[10px] text-[14.5px] font-semibold text-white"
        style={{
          left: 16,
          right: 16,
          top: FORM_BTN_Y,
          height: FORM_BTN_H,
          background: INK.slate,
        }}
      >
        Set for both groups
        <span
          data-set-done
          className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0"
          style={{ background: INK.green }}
        >
          <Icon name="check" size={16} stroke={2.6} />
          Set for both groups
        </span>
      </span>
      <div
        data-reach
        className="absolute flex items-center gap-1.5 text-[13.5px] font-semibold whitespace-nowrap opacity-0"
        style={{ left: 16, top: 302, color: INK.green }}
      >
        <Icon name="users" size={15} stroke={2.2} />
        {SIZE["BCA-A"]} + {SIZE["BCA-B"]} students see it
      </div>
    </div>
  );
}

function FormField({
  top,
  label,
  children,
}: {
  top: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className="absolute text-[12px] font-semibold"
        style={{ left: 16, top, color: INK.muted }}
      >
        {label}
      </div>
      <div
        className="absolute flex items-center rounded-[10px] px-3 text-[14px]"
        style={{
          left: 16,
          right: 16,
          top: top + 20,
          height: 34,
          background: "#f6f7f9",
          boxShadow: `inset 0 0 0 1px ${INK.hair}`,
          color: INK.title,
        }}
      >
        {children}
      </div>
    </>
  );
}

/** Saved as you type, and the export. */
function Bar() {
  return (
    <div
      className="absolute z-[5] flex items-center gap-3 rounded-[16px] bg-white pr-[9px] pl-4"
      style={{
        left: BAR.x,
        top: BAR.y,
        width: BAR.w,
        height: BAR.h,
        boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 2px 4px rgba(16,24,40,0.04), 0 14px 30px -14px rgba(16,24,40,0.24)`,
      }}
    >
      <div className="relative h-[20px] min-w-0 flex-1">
        <p
          data-bar-idle
          className="absolute inset-0 text-[14px] font-medium"
          style={{ color: INK.muted }}
        >
          Type a mark, and the total follows
        </p>
        <p
          data-bar-saved
          className="absolute inset-0 flex items-center gap-1.5 text-[14px] font-semibold opacity-0"
          style={{ color: INK.green }}
        >
          <Icon name="checkCircle" size={15} stroke={2} />
          Saved as you type, totals worked out
        </p>
      </div>
      <span
        className="relative flex h-[36px] items-center justify-center overflow-hidden rounded-[10px] text-[14.5px] font-semibold text-white"
        style={{ width: EXPORT_W, background: INK.slate }}
      >
        <span data-export-idle className="flex items-center gap-1.5">
          <Icon name="download" size={16} stroke={2.2} />
          Export results
        </span>
        <span
          data-export-done
          className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0"
          style={{ background: INK.green }}
        >
          <Icon name="check" size={16} stroke={2.6} />
          Exported
        </span>
      </span>
    </div>
  );
}

/* ---------- Build 1: a student's phone ------------------------------------ */

const PHONE_CARD: CSSProperties = {
  borderRadius: 24,
  boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 2px 8px -4px rgba(16,24,40,0.12)`,
};

function StudentPhone({
  index,
  group,
  student,
  classes,
}: {
  index: number;
  group: "BCA-A" | "BCA-B";
  student: string;
  classes: { title: string; time: string; room: string }[];
}) {
  return (
    <PhoneFrame height={PHONE_H} time="4:12">
      <div className="absolute inset-0" style={{ background: INK.paper }}>
        <div className="absolute" style={{ left: 26, top: 70 }}>
          <div
            className="flex items-center gap-2.5 text-[27px] font-semibold"
            style={{ color: INK.muted }}
          >
            <GroupDot group={group} size={18} />
            {student} · {group}
          </div>
          <div className="font-display text-[52px] leading-tight font-bold tracking-[-0.02em]">
            Fri 9 Oct
          </div>
        </div>

        {/* The deadline lands on top of the day. */}
        <div
          data-p-due={index}
          className="absolute flex items-center gap-3 px-4 opacity-0"
          style={{
            ...PHONE_CARD,
            left: 16,
            right: 16,
            top: P_LIST_Y,
            height: P_ROW_H,
            background: DEADLINE.bg,
            boxShadow: `inset 0 0 0 2px ${DEADLINE.ring}, 0 10px 24px -10px rgba(217,148,37,0.5)`,
          }}
        >
          <span
            className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[15px] bg-white"
            style={{
              color: DEADLINE.ink,
              boxShadow: `inset 0 0 0 1.5px ${DEADLINE.ring}`,
            }}
          >
            <Icon name="file" size={26} stroke={2.1} />
          </span>
          <span className="flex min-w-0 flex-col leading-[1.15]">
            <span className="truncate text-[27px] font-bold whitespace-nowrap">
              {PROJECT}
            </span>
            <span
              className="text-[24px] font-semibold whitespace-nowrap"
              style={{ color: DEADLINE.ink }}
            >
              Due 11:59pm · {TEACHER}
            </span>
          </span>
        </div>

        <div data-p-classes={index} className="absolute inset-x-0 top-0">
          {classes.map((c, i) => {
            const tone = courseTone(c.title);
            return (
              <div
                key={c.title}
                className="absolute flex flex-col justify-center px-5"
                style={{
                  ...PHONE_CARD,
                  left: 16,
                  right: 16,
                  top: P_LIST_Y + i * P_STEP,
                  height: P_ROW_H,
                  background: tone.fill,
                  boxShadow: `inset 0 0 0 1.5px ${tone.ring}`,
                }}
              >
                <span className="truncate text-[31px] leading-[1.15] font-bold">
                  {c.title}
                </span>
                <span
                  className="font-mono text-[25px] leading-[1.3] font-semibold"
                  style={{ color: "rgba(13,17,23,0.72)" }}
                >
                  {c.time} · {c.room}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </PhoneFrame>
  );
}
