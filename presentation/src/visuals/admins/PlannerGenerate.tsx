"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";
import { courseTone } from "~/ui/mock";

import {
  AdminBar,
  APP_BAR,
  CARD_SHADOW,
  Cursor,
  PAD,
  PAGE,
  Stage,
  useIntro,
} from "./_stage";

export interface PlannerGenerateProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between slides. */
  flipId?: string;
}

/* ── Layout, in page coordinates (the window's page is 930 × 598) ───────── */

/** The plan's own header: name, status, reviewer, and the one action. */
const HEAD = { y: APP_BAR + 12, h: 44 } as const;
const COL_TOP = HEAD.y + HEAD.h + 10;
const BOTTOM = PAGE.h - PAD;
const GAP = 14;
/** Left: the demand, and under it what could not be placed. */
const LEFT = { x: PAD, w: 290 } as const;
/** Right: the generated week. */
const RIGHT = { x: PAD + LEFT.w + GAP, w: PAGE.w - PAD * 2 - LEFT.w - GAP };

const D_HEAD = 40;
const D_ROW = 42;
const DEMAND = { y: COL_TOP, h: D_HEAD + D_ROW * 7 } as const;
const UNPLACED = {
  y: DEMAND.y + DEMAND.h + 10,
  h: BOTTOM - (DEMAND.y + DEMAND.h + 10),
} as const;
/** Where the session that would not fit comes to rest, in its card. */
const STUCK = { x: LEFT.x + 14, y: UNPLACED.y + 44, w: 92, h: 54 } as const;

/** A session as a token on its demand line: one per session a week. */
const PIP = { w: 14, h: 18, gap: 5 } as const;

const TOOLBAR = { y: COL_TOP, h: 26 } as const;
const GRID = {
  x: RIGHT.x,
  y: TOOLBAR.y + TOOLBAR.h + 6,
  w: RIGHT.w,
  gutter: 46,
  header: 32,
  rowH: 64,
  startHour: 9,
  hours: 5,
} as const;
const GRID_H = GRID.header + GRID.rowH * GRID.hours;
const COL_W = (GRID.w - GRID.gutter) / 6;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Under the week: the legend, and later the "applied" toast. */
const STRIP_Y = GRID.y + GRID_H;

/** The action button's slot, at the right of the plan header. */
const SLOT = { w: 200, h: 36 } as const;
const SLOT_X = PAGE.w - PAD - SLOT.w;
const SLOT_Y = HEAD.y + (HEAD.h - SLOT.h) / 2;
const BTN = { gen: 196, share: 182, apply: 190, open: 164 } as const;
/** Where the pointer's tip goes to press a button in the slot. */
const press = (w: number) => ({
  x: PAGE.w - PAD - w / 2 - 8,
  y: SLOT_Y + SLOT.h / 2 - 4,
});
const CURSOR_FROM = { x: 690, y: 430 } as const;

/** The status chip's states, in order, and their sizes. */
const STATUS = [
  { label: "Draft", w: 62, bg: "rgba(68,88,121,0.1)", ink: "#445879" },
  { label: "In review", w: 92, bg: "rgba(246,167,59,0.2)", ink: "#9a5a00" },
  { label: "Approved", w: 96, bg: "rgba(78,125,58,0.15)", ink: "#2f5f1f" },
  { label: "Applied", w: 82, bg: "#445879", ink: "#ffffff" },
] as const;
const CHIP_H = 26;

/* ── Data ───────────────────────────────────────────────────────────────── */

interface Line {
  id: string;
  title: string;
  group: string;
  /** The group as a block has room for it. */
  short?: string;
  who: string;
  /** What the room must have, when it must have something. */
  need?: { icon: IconName; text: string };
  room: string;
  /** One per session a week: where the solver put it, or null if it could not. */
  slots: ([number, number] | null)[];
}

/** The plan's demand, in the order it was written down. Slots are [day, hour]. */
const LINES: Line[] = [
  {
    id: "dm",
    title: "Data Mining",
    group: "BCA-A",
    who: "Dr. Mehta",
    need: { icon: "monitor", text: "Projector" },
    room: "301",
    slots: [
      [0, 9],
      [2, 10],
      [4, 9],
    ],
  },
  {
    id: "cc",
    title: "Cloud Computing",
    group: "BCA-A",
    who: "Prof. Iyer",
    room: "304",
    slots: [
      [1, 11],
      [3, 9],
    ],
  },
  {
    id: "st",
    title: "Software Testing",
    group: "BCA-B",
    who: "Dr. Fernandes",
    need: { icon: "cpu", text: "Lab" },
    room: "Lab 2",
    slots: [
      [0, 11],
      [2, 13],
      [4, 11],
    ],
  },
  {
    id: "dt",
    title: "Design Thinking",
    group: "BCA-A + BCA-B",
    short: "A + B",
    who: "Prof. Kulkarni",
    need: { icon: "users", text: "120 seats" },
    room: "Aud",
    slots: [[5, 10], null],
  },
  {
    id: "cs",
    title: "Cyber Security",
    group: "BCA-B",
    who: "Prof. Iyer",
    room: "302",
    slots: [
      [0, 10],
      [2, 9],
      [3, 11],
    ],
  },
  {
    id: "wt",
    title: "Web Technologies",
    group: "BCA-A",
    who: "Dr. Fernandes",
    need: { icon: "cpu", text: "Lab" },
    room: "Lab 1",
    slots: [
      [1, 12],
      [3, 10],
      [4, 12],
    ],
  },
  {
    id: "ba",
    title: "Business Analytics",
    group: "BCA-B",
    who: "Dr. Mehta",
    room: "301",
    slots: [
      [1, 10],
      [4, 10],
    ],
  },
];

/** The order the solver takes them in: the hardest to fit first. */
const SOLVE_ORDER = ["dt", "st", "wt", "dm", "ba", "cs", "cc"];

/** What the live timetable already holds, which the plan works around. */
const BUSY = [
  { col: 1, hour: 9, label: "Open elective" },
  { col: 3, hour: 13, label: "Placement talk" },
];

interface Session {
  key: string;
  line: Line;
  /** Its row in the demand card. */
  row: number;
  /** Its token on that row. */
  k: number;
  slot: [number, number] | null;
}

const SESSIONS: Session[] = LINES.flatMap((line, row) =>
  line.slots.map((slot, k) => ({ key: `${line.id}${k}`, line, row, k, slot })),
);
const TOTAL = SESSIONS.length;
const PLACED = SESSIONS.filter((s) => s.slot).length;

/** A session's token on its demand line. */
function pipAt(s: Pick<Session, "row" | "k" | "line">) {
  const n = s.line.slots.length;
  const right = LEFT.x + LEFT.w - 14;
  return {
    x: right - (n - s.k) * PIP.w - (n - 1 - s.k) * PIP.gap,
    y: DEMAND.y + D_HEAD + s.row * D_ROW + (D_ROW - PIP.h) / 2,
  };
}

/** A class's box in the week. */
function cellAt(col: number, hour: number) {
  return {
    x: GRID.x + GRID.gutter + col * COL_W + 4,
    y: GRID.y + GRID.header + (hour - GRID.startHour) * GRID.rowH + 3,
    w: COL_W - 8,
    h: GRID.rowH - 6,
  };
}

/** Where a session comes to rest: its slot, or the "couldn't place" card. */
function restAt(s: Session) {
  return s.slot ? cellAt(s.slot[0], s.slot[1]) : STUCK;
}

/** `#rrggbb` at an alpha, for the draft tint of a course colour. */
function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * The timetable planner: a term's week, generated from what each group needs.
 *
 * Builds (steps = 3):
 *   0 — the plan's demand lines come in one by one; the plan is a draft.
 *   1 — Generate: every session flies from its line into a clash-free slot,
 *       hardest first; the one that will not fit lands in "Couldn't place".
 *   2 — Share for approval, Dr. Rao approves, Apply: the draft week becomes
 *       the live timetable, repeating until the end of term.
 *
 * The browser window carries `flipId`, at the same size and place as the
 * other admin demos', so it holds still between them.
 */
export function PlannerGenerate({
  step,
  active,
  flipId,
}: PlannerGenerateProps) {
  const ref = useRef<HTMLDivElement>(null);

  // On arrival: the demand is written down, line by line, and the total adds up.
  useIntro(ref, step, active, (tl) => {
    tl.set(".d-total", { text: "0", immediateRender: true }, 0);
    let sum = 0;
    LINES.forEach((line, i) => {
      const at = 0.1 + i * 0.17;
      tl.from(
        `.d-row-${line.id}`,
        { opacity: 0, x: -18, duration: 0.45, ease: "deck.enter" },
        at,
      );
      tl.from(
        `.d-row-${line.id} .pip`,
        {
          scale: 0,
          opacity: 0,
          duration: 0.32,
          ease: "back.out(2.4)",
          stagger: 0.05,
        },
        at + 0.14,
      );
      sum += line.slots.length;
      tl.set(".d-total", { text: String(sum) }, at + 0.2);
    });
  });

  useSteps(ref, step, (tl, mark) => {
    // ── Build 1: Generate. The pointer presses it; every session leaves its
    // line and flies to its slot, hardest first; one has nowhere to go.
    tl.fromTo(
      ".cur",
      { x: CURSOR_FROM.x, y: CURSOR_FROM.y, opacity: 0 },
      { opacity: 1, duration: 0.2, immediateRender: false },
    );
    const gen = press(BTN.gen);
    tl.to(
      ".cur",
      { x: gen.x, y: gen.y, duration: 0.75, ease: "deck.morph" },
      "<",
    );
    click(tl, ".btn-gen");
    tl.to(
      ".cur",
      {
        x: gen.x + 40,
        y: gen.y + 70,
        opacity: 0,
        duration: 0.45,
        ease: "power2.in",
      },
      "<0.15",
    );
    tl.to(".empty", { opacity: 0, y: 10, duration: 0.3 }, "<");
    tl.set(".placed-n", { text: "0" }, "<");
    tl.fromTo(
      ".summary",
      { opacity: 0, x: 12 },
      { opacity: 1, x: 0, duration: 0.35, ease: "deck.enter" },
      "<",
    );

    const t0 = tl.duration() - 0.1;
    const STAGGER = 0.085;
    const FLY = 0.9;
    const order = SOLVE_ORDER.flatMap((id) =>
      SESSIONS.filter((s) => s.line.id === id),
    );
    // The card for what would not fit rises as the solver gives up on it.
    const stuckAt = order.findIndex((s) => !s.slot);
    tl.fromTo(
      ".unplaced",
      { y: UNPLACED.h + 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, ease: "deck.morph" },
      t0 + stuckAt * STAGGER,
    );
    let placed = 0;
    order.forEach((s, i) => {
      const at = t0 + i * STAGGER + (s.slot ? 0 : 0.15);
      const el = `.s-${s.key}`;
      const from = pipAt(s);
      const to = restAt(s);
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      // It starts as the token on its line (hidden until it leaves).
      gsap.set(el, { x: dx, y: dy, width: PIP.w, height: PIP.h });
      tl.set(el, { opacity: 1 }, at);
      tl.to(`.pf-${s.key}`, { opacity: 0, duration: 0.25 }, at);
      tl.to(
        el,
        {
          motionPath: {
            path: [
              { x: dx * 0.5, y: dy * 0.5 - (s.slot ? 46 : 20) },
              { x: 0, y: 0 },
            ],
            curviness: 1.1,
          },
          duration: FLY,
          ease: "deck.morph",
        },
        at,
      );
      tl.to(
        el,
        { width: to.w, height: to.h, duration: FLY, ease: "deck.morph" },
        at,
      );
      tl.to(`${el} .face`, { opacity: 1, duration: 0.3 }, at + FLY - 0.35);
      if (s.slot) {
        placed += 1;
        tl.set(".placed-n", { text: String(placed) }, at + FLY - 0.2);
      } else {
        tl.to(`.pr-${s.key}`, { opacity: 1, duration: 0.3 }, at);
        tl.fromTo(
          ".reason",
          { opacity: 0, x: -10 },
          { opacity: 1, x: 0, duration: 0.4, ease: "deck.enter" },
          at + FLY - 0.15,
        );
      }
    });
    tl.fromTo(
      ".clash-free",
      { opacity: 0, scale: 0.7 },
      { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" },
      ">-0.1",
    );
    swap(tl, ".btn-gen", ".btn-share", "<");
    mark();

    // ── Build 2: share it; the reviewer signs off; apply it, and the draft
    // week becomes the timetable.
    const share = press(BTN.share);
    tl.fromTo(
      ".cur",
      { x: share.x - 120, y: share.y + 230, opacity: 0 },
      { opacity: 1, duration: 0.2, immediateRender: false },
    );
    tl.to(
      ".cur",
      { x: share.x, y: share.y, duration: 0.7, ease: "deck.morph" },
      "<",
    );
    click(tl, ".btn-share");
    swap(tl, ".btn-share", ".btn-apply", "<0.05");
    status(tl, 1, "<");
    tl.fromTo(
      ".rev",
      { opacity: 0, x: -12 },
      { opacity: 1, x: 0, duration: 0.4, ease: "deck.enter" },
      "<0.1",
    );
    tl.to(
      ".cur",
      { x: share.x + 30, y: share.y + 110, duration: 0.6, ease: "deck.morph" },
      "<",
    );
    // Dr. Rao signs off.
    tl.addLabel("approve", ">0.45");
    tl.fromTo(
      ".rev-tick",
      { scale: 0 },
      { scale: 1, duration: 0.35, ease: "back.out(2.6)" },
      "approve",
    );
    tl.to(
      ".rev-stack",
      { y: -CHIP_H, duration: 0.45, ease: "deck.morph" },
      "approve",
    );
    status(tl, 2, "approve+=0.05");
    tl.to(
      ".btn-apply",
      { backgroundColor: "#445879", color: "#ffffff", duration: 0.35 },
      "approve+=0.15",
    );
    // Apply.
    const apply = press(BTN.apply);
    tl.to(
      ".cur",
      { x: apply.x, y: apply.y, duration: 0.55, ease: "deck.morph" },
      "approve+=0.35",
    );
    click(tl, ".btn-apply");
    status(tl, 3, "<0.05");
    tl.to(
      ".cur",
      {
        x: apply.x + 50,
        y: apply.y + 80,
        opacity: 0,
        duration: 0.45,
        ease: "power2.in",
      },
      "<0.1",
    );
    tl.addLabel("settle", "<");
    swap(tl, ".btn-apply", ".btn-open", "settle+=0.2");
    tl.to(
      ".wk-stack",
      { y: -TOOLBAR.h, duration: 0.45, ease: "deck.morph" },
      "settle",
    );
    // The week settles into the live timetable's look, a day at a time.
    SESSIONS.forEach((s) => {
      if (!s.slot) return;
      const at = `settle+=${0.1 + s.slot[0] * 0.08 + (s.slot[1] - 9) * 0.03}`;
      tl.to(`.s-${s.key} .live`, { opacity: 1, duration: 0.4 }, at);
      tl.to(`.s-${s.key} .draft`, { opacity: 0, duration: 0.4 }, at);
    });
    tl.to(".legend", { opacity: 0, y: 12, duration: 0.3 }, "settle+=0.2");
    tl.fromTo(
      ".toast",
      { y: 80 },
      { y: 0, duration: 0.55, ease: "back.out(1.4)" },
      "settle+=0.35",
    );
    mark();
  });

  return (
    <Stage stageRef={ref} flipId={flipId}>
      <AdminBar
        title="Schedule builder"
        right={
          <span className="font-mono text-[13.5px] font-semibold text-[rgba(44,49,53,0.55)]">
            All plans
          </span>
        }
      />

      <PlanHeader />
      <DemandCard />
      <UnplacedCard />
      <WeekCard />

      {/* The sessions: tokens on their lines, then blocks in the week */}
      {SESSIONS.map((s) => (
        <SessionBlock key={s.key} s={s} />
      ))}

      <Toast />
      <Cursor className="cur" style={{ opacity: 0 }} />
    </Stage>
  );
}

/* ── Motion helpers ─────────────────────────────────────────────────────── */

/** The pointer presses, and the button gives under it. */
function click(tl: gsap.core.Timeline, button: string) {
  tl.to(".cur .cur-svg", { scale: 0.84, duration: 0.1, ease: "power2.out" });
  tl.to(button, { scale: 0.94, duration: 0.1, ease: "power2.out" }, "<");
  tl.to(".cur .cur-svg", { scale: 1, duration: 0.15, ease: "power2.out" });
  tl.to(button, { scale: 1, duration: 0.15, ease: "power2.out" }, "<");
}

/** The next action rises into the button's slot as the last one leaves it. */
function swap(
  tl: gsap.core.Timeline,
  out: string,
  next: string,
  at: gsap.Position,
) {
  tl.to(out, { y: -SLOT.h - 8, duration: 0.4, ease: "power3.in" }, at);
  tl.fromTo(
    next,
    { y: SLOT.h + 8 },
    { y: 0, duration: 0.45, ease: "power3.out" },
    ">-0.1",
  );
}

/** The status chip rolls to its next word, and takes that word's colour and width. */
function status(tl: gsap.core.Timeline, k: number, at: gsap.Position) {
  const s = STATUS[k]!;
  tl.to(
    ".chip",
    { width: s.w, backgroundColor: s.bg, duration: 0.45, ease: "deck.morph" },
    at,
  );
  tl.to(
    ".chip-stack",
    { y: -CHIP_H * k, duration: 0.45, ease: "deck.morph" },
    "<",
  );
}

/* ── The plan's header ──────────────────────────────────────────────────── */

function PlanHeader() {
  return (
    <div
      className="absolute flex items-center gap-3"
      style={{ left: PAD, top: HEAD.y, height: HEAD.h }}
    >
      <span className="font-display text-[21px] font-bold tracking-[-0.02em] whitespace-nowrap text-[#0d1117]">
        BCA Sem VII · Monsoon 2026
      </span>
      <span
        className="chip relative ml-1 shrink-0 overflow-hidden rounded-full"
        style={{
          width: STATUS[0].w,
          height: CHIP_H,
          background: STATUS[0].bg,
        }}
      >
        <span className="chip-stack absolute inset-x-0 top-0 flex flex-col">
          {STATUS.map((s) => (
            <span
              key={s.label}
              className="flex items-center justify-center text-[13.5px] font-semibold whitespace-nowrap"
              style={{ height: CHIP_H, color: s.ink }}
            >
              {s.label}
            </span>
          ))}
        </span>
      </span>
      {/* The reviewer: waiting on, then signed off by */}
      <span
        className="rev flex items-center gap-2"
        style={{ height: CHIP_H, opacity: 0 }}
      >
        <span className="relative flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-[#29abb7] text-[12.5px] font-bold text-white">
          R
          <span
            className="rev-tick absolute -right-1 -bottom-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#4e7d3a] text-white"
            style={{
              boxShadow: "0 0 0 2px var(--paper)",
              transform: "scale(0)",
            }}
          >
            <Icon name="check" size={9} stroke={3.4} />
          </span>
        </span>
        <span
          className="relative overflow-hidden"
          style={{ height: CHIP_H, width: 160 }}
        >
          <span className="rev-stack absolute inset-x-0 top-0 flex flex-col">
            <span
              className="flex items-center gap-1.5 text-[14px] text-[rgba(44,49,53,0.7)]"
              style={{ height: CHIP_H }}
            >
              <Icon name="hourglass" size={14} stroke={2} />
              Waiting on Dr. Rao
            </span>
            <span
              className="flex items-center text-[14px] text-[rgba(44,49,53,0.75)]"
              style={{ height: CHIP_H }}
            >
              Approved by&nbsp;
              <b className="font-semibold text-[#0d1117]">Dr. Rao</b>
            </span>
          </span>
        </span>
      </span>

      {/* The one action, which changes as the plan moves on */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: SLOT_X - PAD,
          top: SLOT_Y - HEAD.y,
          width: SLOT.w,
          height: SLOT.h,
        }}
      >
        <Button className="btn-gen" w={BTN.gen} icon="sparkles">
          Generate timetable
        </Button>
        <Button className="btn-share" w={BTN.share} icon="send" below>
          Share for approval
        </Button>
        <Button
          className="btn-apply"
          w={BTN.apply}
          icon="calendarCheck"
          below
          disabled
        >
          Apply to timetable
        </Button>
        <Button
          className="btn-open"
          w={BTN.open}
          icon="arrowRight"
          below
          secondary
        >
          Open timetable
        </Button>
      </div>
    </div>
  );
}

function Button({
  className,
  w,
  icon,
  below,
  disabled,
  secondary,
  children,
}: {
  className: string;
  w: number;
  icon: IconName;
  /** Waiting under the slot until its turn. */
  below?: boolean;
  disabled?: boolean;
  /** White, with a ring: the quiet next step once the work is done. */
  secondary?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`${className} absolute top-0 right-0 flex items-center justify-center gap-2 rounded-[10px] text-[14.5px] font-semibold whitespace-nowrap`}
      style={{
        width: w,
        height: SLOT.h,
        background: disabled ? "#d5dae3" : secondary ? "#ffffff" : "#445879",
        color: disabled ? "#7d889b" : secondary ? "#445879" : "#ffffff",
        boxShadow: secondary ? "inset 0 0 0 1px var(--card-ring)" : undefined,
        transform: below ? `translateY(${SLOT.h + 8}px)` : undefined,
      }}
    >
      <Icon name={icon} size={17} stroke={2.2} />
      {children}
    </span>
  );
}

/* ── Demand ─────────────────────────────────────────────────────────────── */

function DemandCard() {
  return (
    <div
      className="absolute overflow-hidden rounded-[14px] bg-white"
      style={{
        left: LEFT.x,
        top: DEMAND.y,
        width: LEFT.w,
        height: DEMAND.h,
        boxShadow: CARD_SHADOW,
      }}
    >
      <div
        className="flex items-center justify-between px-3.5"
        style={{ height: D_HEAD, boxShadow: "inset 0 -1px 0 var(--hair)" }}
      >
        <span className="text-[16px] font-semibold text-[#0d1117]">
          Each week
        </span>
        <span className="font-mono text-[13px] text-[rgba(44,49,53,0.55)]">
          <span className="d-total">{TOTAL}</span> sessions
        </span>
      </div>
      {LINES.map((line, row) => (
        <div
          key={line.id}
          className={`d-row-${line.id} relative flex items-center px-3.5`}
          style={{
            height: D_ROW,
            boxShadow:
              row < LINES.length - 1 ? "inset 0 -1px 0 var(--hair)" : undefined,
          }}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[14px] leading-tight font-semibold text-[#0d1117]">
                {line.title}
              </span>
              {line.need && (
                <span
                  className="flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-px text-[11px] font-semibold"
                  style={{
                    background: "rgba(68,88,121,0.09)",
                    color: "var(--slate)",
                  }}
                >
                  <Icon name={line.need.icon} size={11} stroke={2.2} />
                  {line.need.text}
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[12px] leading-tight text-[rgba(44,49,53,0.6)]">
              {line.group} · {line.who}
            </span>
          </span>
          {/* One token per session a week */}
          {line.slots.map((_, k) => {
            const t = courseTone(line.title);
            const at = pipAt({ row, k, line });
            return (
              <span
                key={k}
                className="pip absolute rounded-[4px]"
                style={{
                  left: at.x - LEFT.x,
                  top: at.y - DEMAND.y - D_HEAD - row * D_ROW,
                  width: PIP.w,
                  height: PIP.h,
                  boxShadow: `inset 0 0 0 1.5px ${alpha(t.ring, 0.35)}`,
                }}
              >
                <span
                  className={`pf-${line.id}${k} absolute inset-0 rounded-[4px]`}
                  style={{
                    background: alpha(t.fill, 0.4),
                    boxShadow: `inset 0 0 0 1px ${t.ring}`,
                  }}
                />
                <span
                  className={`pr-${line.id}${k} absolute -inset-0.5 rounded-[5px]`}
                  style={{
                    boxShadow: "inset 0 0 0 2px #d99425",
                    opacity: 0,
                  }}
                />
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function UnplacedCard() {
  return (
    <div
      className="unplaced absolute overflow-hidden rounded-[14px]"
      style={{
        left: LEFT.x,
        top: UNPLACED.y,
        width: LEFT.w,
        height: UNPLACED.h,
        background: "#fdf6ea",
        boxShadow:
          "inset 0 0 0 1px rgba(217,148,37,0.55), 0 2px 10px rgba(16,24,40,0.05)",
        opacity: 0,
      }}
    >
      <div className="absolute top-3 left-3.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f6a73b] text-[#0d1117]">
          <Icon name="alert" size={14} stroke={2.4} />
        </span>
        <span className="text-[15px] font-semibold text-[#0d1117]">
          Couldn&apos;t place (1)
        </span>
      </div>
      <div
        className="reason absolute text-[12.5px] leading-[1.3] text-[rgba(44,49,53,0.85)]"
        style={{
          left: STUCK.x - LEFT.x + STUCK.w + 12,
          top: STUCK.y - UNPLACED.y + 1,
          right: 12,
          opacity: 0,
        }}
      >
        No room with 120 seats free when both groups are.
      </div>
    </div>
  );
}

/* ── The week ───────────────────────────────────────────────────────────── */

function WeekCard() {
  return (
    <>
      {/* Above the week: what it is, and how the solver did */}
      <div
        className="absolute flex items-center justify-between"
        style={{
          left: RIGHT.x,
          top: TOOLBAR.y,
          width: RIGHT.w,
          height: TOOLBAR.h,
        }}
      >
        <span
          className="relative overflow-hidden"
          style={{ height: TOOLBAR.h, width: 240 }}
        >
          <span className="wk-stack absolute inset-x-0 top-0 flex flex-col">
            <span
              className="flex items-center pl-1 text-[16px] font-semibold text-[#0d1117]"
              style={{ height: TOOLBAR.h }}
            >
              Proposed week
            </span>
            <span
              className="flex items-center gap-1.5 pl-1 text-[16px] font-semibold text-[#0d1117]"
              style={{ height: TOOLBAR.h }}
            >
              On the timetable
            </span>
          </span>
        </span>
        <span
          className="summary flex items-center gap-2 pr-1 text-[14px] text-[rgba(44,49,53,0.7)]"
          style={{ opacity: 0 }}
        >
          <span className="clash-free flex h-5 w-5 items-center justify-center rounded-full bg-[#4e7d3a] text-white">
            <Icon name="check" size={12} stroke={3} />
          </span>
          <span>
            <b className="placed-n font-mono font-semibold text-[#0d1117]">
              {PLACED}
            </b>{" "}
            of <span className="font-mono">{TOTAL}</span> placed · no clashes
          </span>
        </span>
      </div>

      <div
        className="absolute rounded-[14px] bg-white"
        style={{
          left: GRID.x,
          top: GRID.y,
          width: GRID.w,
          height: GRID_H,
          boxShadow: CARD_SHADOW,
        }}
      >
        <div
          className="absolute inset-x-0 top-0 flex"
          style={{
            height: GRID.header,
            boxShadow: "inset 0 -1px 0 var(--hair)",
          }}
        >
          <div style={{ width: GRID.gutter }} />
          {DAYS.map((d) => (
            <div
              key={d}
              className="flex flex-1 items-center justify-center text-[14px] font-semibold text-[rgba(44,49,53,0.6)]"
            >
              {d}
            </div>
          ))}
        </div>
        {Array.from({ length: GRID.hours }, (_, i) => (
          <div key={i}>
            <span
              className="absolute text-right font-mono text-[12px] text-[rgba(44,49,53,0.45)]"
              style={{
                top: GRID.header + i * GRID.rowH + 5,
                left: 0,
                width: GRID.gutter - 9,
              }}
            >
              {GRID.startHour + i}:00
            </span>
            {i > 0 && (
              <div
                className="absolute right-0"
                style={{
                  left: GRID.gutter,
                  top: GRID.header + i * GRID.rowH,
                  height: 1,
                  background: "var(--hair)",
                }}
              />
            )}
          </div>
        ))}
        {DAYS.map((d, i) => (
          <div
            key={d}
            className="absolute bottom-0"
            style={{
              left: GRID.gutter + i * COL_W,
              top: GRID.header,
              width: 1,
              background: "rgba(68,88,121,0.1)",
            }}
          />
        ))}

        {/* Nothing yet */}
        <div
          className="empty absolute inset-x-0 flex flex-col items-center text-center"
          style={{ top: GRID.header + 112, paddingLeft: GRID.gutter }}
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[11px]"
            style={{ background: "rgba(68,88,121,0.1)", color: "var(--slate)" }}
          >
            <Icon name="calendar" size={22} stroke={2} />
          </span>
          <span className="mt-2.5 text-[17px] font-semibold text-[#0d1117]">
            Nothing laid out yet
          </span>
          <span className="mt-1 text-[14px] text-[rgba(44,49,53,0.6)]">
            Add the demand, then hit{" "}
            <b className="font-semibold">Generate timetable</b>.
          </span>
        </div>
      </div>

      {/* What the live timetable already has, which the plan works around */}
      {BUSY.map((b) => {
        const r = cellAt(b.col, b.hour);
        return (
          <div
            key={b.label}
            className="absolute overflow-hidden rounded-[8px] px-1.5 py-1.5"
            style={{
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              background:
                "repeating-linear-gradient(45deg, rgba(68,88,121,0.09) 0 6px, transparent 6px 12px)",
              boxShadow: "inset 0 0 0 1px var(--hair)",
            }}
          >
            <span className="block text-[11px] leading-tight font-semibold text-[rgba(44,49,53,0.5)]">
              {b.label}
            </span>
          </div>
        );
      })}

      {/* Under the week: the legend (the toast takes its place) */}
      <div
        className="legend absolute flex items-center gap-5 text-[13px] text-[rgba(44,49,53,0.6)]"
        style={{ left: RIGHT.x + 4, top: STRIP_Y + 18 }}
      >
        <span className="flex items-center gap-2">
          <span
            className="h-3.5 w-5.5 rounded-[4px]"
            style={{
              background: "rgba(68,88,121,0.08)",
              border: "1.5px dashed #9facc2",
            }}
          />
          Proposed
        </span>
        <span className="flex items-center gap-2">
          <span
            className="h-3.5 w-5.5 rounded-[4px]"
            style={{
              background:
                "repeating-linear-gradient(45deg, rgba(68,88,121,0.16) 0 3px, transparent 3px 6px)",
              boxShadow: "inset 0 0 0 1px var(--hair)",
            }}
          />
          Already on the timetable
        </span>
      </div>
    </>
  );
}

/**
 * One session: a token on its demand line, and then (once it has flown) a
 * draft block in the week, dashed, that turns solid when the plan is applied.
 */
function SessionBlock({ s }: { s: Session }) {
  const r = restAt(s);
  const t = courseTone(s.line.title);
  const title = s.line.title.replace("Technologies", "Tech­no­logies");
  return (
    <div
      className={`s-${s.key} absolute`}
      style={{ left: r.x, top: r.y, width: r.w, height: r.h, opacity: 0 }}
    >
      <div
        className="draft absolute inset-0 rounded-[8px]"
        style={{
          background: alpha(t.fill, 0.28),
          border: `1.5px dashed ${t.ring}`,
        }}
      />
      <div
        className="live absolute inset-0 rounded-[8px]"
        style={{
          background: t.fill,
          boxShadow: `inset 0 0 0 1px ${t.ring}`,
          opacity: 0,
        }}
      />
      <div
        className="face absolute inset-0 overflow-hidden text-left"
        style={{ padding: "5px 7px", opacity: 0, color: "#0d1117" }}
      >
        <span
          lang="en"
          className="line-clamp-2 text-[12px] leading-[1.18] font-semibold"
        >
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-[rgba(44,49,53,0.75)]">
          {s.line.short ?? s.line.group}
          {s.slot ? ` · ${s.line.room}` : ""}
        </span>
      </div>
    </div>
  );
}

/** Done: the toast that rises under the week. */
function Toast() {
  return (
    <div
      className="absolute flex justify-center"
      style={{ left: RIGHT.x, width: RIGHT.w, bottom: 12 }}
    >
      <div
        className="toast flex items-center gap-3 rounded-full py-2.5 pr-5 pl-3 text-[15px] font-semibold whitespace-nowrap text-white"
        style={{
          background: "#0d1117",
          boxShadow: "0 16px 36px -12px rgba(16,24,40,0.4)",
          transform: "translateY(80px)",
        }}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4e9a3a]">
          <Icon name="check" size={14} stroke={2.8} />
        </span>
        <span>Applied to the timetable</span>
        <span className="-mx-1 text-white/45">·</span>
        <span className="text-[#b8c5da]">repeats until 28 Nov</span>
      </div>
    </div>
  );
}
