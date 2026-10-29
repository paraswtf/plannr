"use client";

import { useRef, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";
import { courseTone } from "~/ui/mock";

import { AppBar, Cursor, Stage, STRIP, toBox, useIntro } from "./_kit";

export interface DayReportProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between slides. */
  flipId?: string;
}

/* ── Layout, in page coordinates (the page is 930 × 568) ───────────────── */

const X = 15;
const W = 900;
/** Today's classes: a header, then one row per class. */
const TODAY = { y: 78, header: 46, row: 50 } as const;
const TODAY_H = TODAY.header + 6 * TODAY.row;
/** The day in four numbers, under today's classes. */
const SUMMARY = { y: TODAY.y + TODAY_H + 12, h: 118 } as const;
/** Build 1: the summary rises to the top, and the term's card takes its place. */
const SUMMARY_RISE = TODAY.y - SUMMARY.y;
const TERM = { y: TODAY.y + SUMMARY.h + 12, header: 46, row: 60 } as const;
const TERM_H = TERM.header + 5 * TERM.row;

const slotY = (slot: number) => TODAY.header + slot * TODAY.row;

/* ── Today: Monday 5 October, for BCA-A and BCA-B ─────────────────────── */

type Status = "held" | "moved" | "cancelled";

interface Lecture {
  id: string;
  time: string;
  title: string;
  group: string;
  who: string;
  room: string;
  status: Status;
  detail: string;
  /** Its place in the list on arrival (by its timetabled hour)… */
  from: number;
  /** …and once the day has settled (a moved class goes to its new hour). */
  to: number;
}

const LECTURES: Lecture[] = [
  {
    id: "dt",
    time: "09:00",
    title: "Design Thinking",
    group: "BCA-A",
    who: "Prof. Kulkarni",
    room: "301",
    status: "held",
    detail: "61 of 63 present",
    from: 0,
    to: 0,
  },
  {
    id: "dm",
    time: "10:00",
    title: "Data Mining",
    group: "BCA-A",
    who: "Dr. Mehta",
    room: "304",
    status: "held",
    detail: "58 of 63 present",
    from: 1,
    to: 1,
  },
  {
    id: "wt",
    time: "11:00",
    title: "Web Technologies",
    group: "BCA-B",
    who: "Dr. Fernandes",
    room: "Lab 2",
    status: "moved",
    detail: "No clash",
    from: 2,
    to: 5,
  },
  {
    id: "st",
    time: "12:00",
    title: "Statistics",
    group: "BCA-B",
    who: "Prof. Iyer",
    room: "304",
    status: "held",
    detail: "57 of 63 present",
    from: 3,
    to: 2,
  },
  {
    id: "cs",
    time: "13:00",
    title: "Communication Skills",
    group: "BCA-A",
    who: "Prof. Kulkarni",
    room: "301",
    status: "cancelled",
    detail: "Notice sent, 9:40",
    from: 4,
    to: 3,
  },
  {
    id: "sw",
    time: "14:00",
    title: "Software Testing",
    group: "BCA-B",
    who: "Dr. Fernandes",
    room: "Lab 2",
    status: "held",
    detail: "59 of 63 present",
    from: 5,
    to: 4,
  },
];
const MOVED_TO = "15:00";
/** 61 + 58 + 57 + 59 present, of 4 × 63. */
const PRESENT = Math.round(((61 + 58 + 57 + 59) / (4 * 63)) * 100);

const STATUS: Record<
  Status | "pending",
  { label: string; icon: IconName; fg: string; bg: string }
> = {
  pending: {
    label: "Scheduled",
    icon: "clock",
    fg: "rgba(44,49,53,0.62)",
    bg: "rgba(44,49,53,0.06)",
  },
  held: {
    label: "Held",
    icon: "check",
    fg: "#3f6a2e",
    bg: "rgba(78,125,58,0.13)",
  },
  moved: {
    label: `Moved to ${MOVED_TO}`,
    icon: "arrowRight",
    fg: "#324464",
    bg: "rgba(68,88,121,0.12)",
  },
  cancelled: {
    label: "Cancelled",
    icon: "x",
    fg: "#b02636",
    bg: "rgba(220,56,72,0.1)",
  },
};

/* ── The term, course by course ───────────────────────────────────────── */

const COURSES = [
  { id: "dm", title: "Data Mining", group: "BCA-A", held: 18, of: 40 },
  { id: "dt", title: "Design Thinking", group: "BCA-A", held: 21, of: 40 },
  { id: "cs", title: "Communication Skills", group: "BCA-A", held: 12, of: 30 },
  { id: "st", title: "Statistics", group: "BCA-B", held: 19, of: 40 },
  { id: "wt", title: "Web Technologies", group: "BCA-B", held: 16, of: 36 },
] as const;
const BAR = { x: 340, w: 300, h: 12 } as const;

/* ── The top bar's controls (page coordinates) ────────────────────────── */

const SEND = { x: 930 - 20 - 106, y: 13, w: 106, h: 38 } as const;
const DOWNLOAD = { x: SEND.x - 12 - 140, y: 13, w: 140, h: 38 } as const;
const READY_W = 210;

const CURSOR_START = { x: 640, y: 470 };
const CURSOR_SEND = { x: SEND.x + 62, y: SEND.y + 24 };

/* ── The toast under the window, and the report that flies into it ────── */

const TOAST = { x: 232, y: STRIP.y + 12 } as const;
/** The toast's icon tile, in box coordinates (StatusPill: 12px in, 44px tile). */
const TILE = { x: TOAST.x + 12 + 22, y: TOAST.y + 12 + 22 } as const;
const DOC = { w: 56, h: 70 } as const;
const SEND_IN_BOX = toBox({ x: SEND.x + SEND.w / 2, y: SEND.y + SEND.h / 2 });
const DOC_FROM = { x: SEND_IN_BOX.x - TILE.x, y: SEND_IN_BOX.y - TILE.y + 40 };

const RING = "inset 0 0 0 1px var(--card-ring), 0 2px 10px rgba(13,17,23,0.05)";

/**
 * The day's report, written for the coordinator from what Plannr already
 * knows: the registers teachers mark, and the timetable's own moves and
 * cancellations.
 *
 * Builds (steps = 3):
 *   0 — on arrival, today's classes for BCA-A and BCA-B settle: the held ones
 *       ticked from their registers, one cancelled, and one moved to a free
 *       hour with no clash (it travels down to its new place in the day).
 *   1 — the day's numbers rise to the top, and the term comes in under them:
 *       lectures held and left for every course, with bars.
 *   2 — at five the report is ready: Download and Send light up, Send is
 *       pressed, and the report flies out into a toast.
 *
 * The browser window carries `flipId`, at the same size and place as the
 * other coordinator demos, so it holds still between them.
 */
export function DayReport({ step, active, flipId }: DayReportProps) {
  const ref = useRef<HTMLDivElement>(null);

  // On arrival: the registers tick the held classes, then the timetable
  // brings in the cancellation and the move.
  useIntro(ref, step, active, (tl) => {
    const settle = (id: string, at: number) => {
      tl.fromTo(
        `.pend-${id}`,
        { opacity: 1 },
        { opacity: 0, duration: 0.2 },
        at,
      );
      tl.fromTo(
        `.final-${id}`,
        { opacity: 0, x: 18 },
        { opacity: 1, x: 0, duration: 0.45, ease: "deck.enter" },
        at + 0.05,
      );
    };
    // Every counter starts at zero.
    tl.fromTo(
      ".n-held, .n-moved, .n-cancelled, .n-present",
      { textContent: 0 },
      { textContent: 0, duration: 0 },
      0,
    );

    // From the registers: the four that were held, in the day's order.
    const held = LECTURES.filter((l) => l.status === "held");
    held.forEach((l, i) => {
      const at = 0.1 + i * 0.32;
      settle(l.id, at);
      tl.to(".n-held", { textContent: i + 1, duration: 0 }, at + 0.1);
    });
    tl.to(
      ".n-present",
      {
        textContent: PRESENT,
        snap: { textContent: 1 },
        duration: 1.2,
        ease: "power2.out",
      },
      0.2,
    );

    // From the timetable: the cancellation…
    const cx = 1.55;
    settle("cs", cx);
    tl.fromTo(
      ".strike-cs",
      { scaleX: 0 },
      { scaleX: 1, duration: 0.45, ease: "power2.inOut" },
      cx + 0.05,
    );
    tl.fromTo(
      ".dim-cs",
      { opacity: 1 },
      { opacity: 0.5, duration: 0.4 },
      cx + 0.2,
    );
    tl.to(".n-cancelled", { textContent: 1, duration: 0 }, cx + 0.15);

    // …and the move: Web Technologies goes to 15:00 and travels down the
    // day to its new place, the classes after it closing up.
    const mv = 2.15;
    settle("wt", mv);
    tl.to(".n-moved", { textContent: 1, duration: 0 }, mv + 0.15);
    const go = mv + 0.45;
    tl.fromTo(
      ".row-wt",
      { boxShadow: "0 0 0 rgba(16,24,40,0)" },
      {
        boxShadow: "0 16px 32px rgba(16,24,40,0.16)",
        duration: 0.25,
        immediateRender: false,
      },
      go,
    );
    LECTURES.forEach((l) => {
      if (l.from === l.to) return;
      tl.fromTo(
        `.row-${l.id}`,
        { y: slotY(l.from) },
        {
          y: slotY(l.to),
          duration: l.id === "wt" ? 1.05 : 0.6,
          ease: "deck.morph",
        },
        l.id === "wt" ? go : go + 0.25 + (l.to - 2) * 0.06,
      );
    });
    tl.fromTo(
      ".time-was-wt",
      { opacity: 1 },
      { opacity: 0, duration: 0.2 },
      go + 0.35,
    );
    tl.fromTo(
      ".time-now-wt",
      { opacity: 0 },
      { opacity: 1, duration: 0.3 },
      go + 0.45,
    );
    tl.to(
      ".row-wt",
      { boxShadow: "0 0 0 rgba(16,24,40,0)", duration: 0.35 },
      go + 1.0,
    );
  });

  useSteps(ref, step, (tl, mark) => {
    // ── Build 1: today's numbers rise; the term, course by course, comes in.
    tl.fromTo(
      ".today",
      { opacity: 1, y: 0 },
      {
        opacity: 0,
        y: -24,
        duration: 0.45,
        ease: "power2.in",
        immediateRender: false,
      },
      0,
    );
    tl.fromTo(
      ".summary",
      { y: 0 },
      {
        y: SUMMARY_RISE,
        duration: 0.95,
        ease: "deck.morph",
        immediateRender: false,
      },
      0.1,
    );
    tl.fromTo(
      ".term",
      { opacity: 0, y: 70 },
      { opacity: 1, y: 0, duration: 0.8, ease: "deck.enter" },
      0.55,
    );
    tl.from(
      ".bar-fill",
      {
        scaleX: 0,
        duration: 0.9,
        stagger: 0.08,
        ease: "power3.out",
      },
      0.85,
    );
    tl.from(
      ".n-term-held",
      {
        textContent: 0,
        snap: { textContent: 1 },
        duration: 0.9,
        stagger: 0.08,
        ease: "power3.out",
      },
      0.85,
    );
    COURSES.forEach((c, i) => {
      tl.fromTo(
        `.n-term-left-${c.id}`,
        { textContent: c.of },
        {
          textContent: c.of - c.held,
          snap: { textContent: 1 },
          duration: 0.9,
          ease: "power3.out",
        },
        0.85 + i * 0.08,
      );
    });
    mark();

    // ── Build 2: five o'clock. Ready; Send; it goes out.
    tl.addLabel("five");
    tl.to(".ready-draft", { opacity: 0, y: -8, duration: 0.25 }, "five");
    tl.fromTo(
      ".ready-done",
      { opacity: 0, y: 8, scale: 0.94 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.45,
        ease: "back.out(2)",
      },
      "five+=0.1",
    );
    tl.to(".act", { opacity: 1, duration: 0.35 }, "five+=0.3");
    tl.fromTo(
      ".cur-a",
      { x: CURSOR_START.x, y: CURSOR_START.y, opacity: 0 },
      { opacity: 1, duration: 0.25 },
      "five+=0.45",
    );
    tl.to(
      ".cur-a",
      {
        x: CURSOR_SEND.x,
        y: CURSOR_SEND.y,
        duration: 0.85,
        ease: "deck.morph",
      },
      "five+=0.55",
    );
    tl.addLabel("press", "five+=1.5");
    tl.to(
      ".cur-svg",
      { scale: 0.84, duration: 0.1, ease: "power2.out" },
      "press",
    );
    tl.to(".cur-svg", { scale: 1, duration: 0.18 }, "press+=0.1");
    tl.to(".send-done", { opacity: 1, duration: 0.25 }, "press+=0.05");
    // The report leaves the page and lands in the toast's tile.
    tl.fromTo(
      ".doc",
      { x: DOC_FROM.x, y: DOC_FROM.y, scale: 0.4, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.3,
        ease: "power2.out",
      },
      "press+=0.2",
    );
    tl.to(
      ".doc",
      {
        motionPath: {
          path: [
            { x: DOC_FROM.x * 0.55, y: DOC_FROM.y * 0.42 },
            { x: 0, y: 0 },
          ],
          curviness: 1.2,
        },
        scale: 0.62,
        duration: 1.05,
        ease: "deck.morph",
      },
      "press+=0.45",
    );
    tl.fromTo(
      ".toast",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "press+=1.25",
    );
    tl.to(".doc", { opacity: 0, duration: 0.25 }, "press+=1.45");
    tl.to(".cur-a", { opacity: 0, duration: 0.3 }, "press+=1.3");
    mark();
  });

  return (
    <Stage
      stageRef={ref}
      flipId={flipId}
      strip={
        <div className="toast absolute" style={{ left: TOAST.x, top: 12 }}>
          <Toast />
        </div>
      }
      overlay={<Doc />}
    >
      <AppBar title="Day report" chip="Mon 5 Oct" />
      <ReadyState />
      <Button box={DOWNLOAD} icon="download" kind="quiet">
        Download
      </Button>
      <Button box={SEND} icon="send" kind="solid">
        Send
      </Button>

      <Today />
      <Summary />
      <Term />

      <Cursor
        className="cur-a"
        style={{
          transform: `translate(${CURSOR_SEND.x}px, ${CURSOR_SEND.y}px)`,
        }}
      />
    </Stage>
  );
}

/* ── The top bar ───────────────────────────────────────────────────────── */

/** Left of the buttons: a draft through the day, ready at five. */
function ReadyState() {
  const face =
    "absolute top-0 right-0 flex items-center gap-2 rounded-full px-3.5 text-[15px] font-semibold whitespace-nowrap";
  return (
    <div
      className="absolute"
      style={{
        left: DOWNLOAD.x - 14 - READY_W,
        top: SEND.y,
        width: READY_W,
        height: SEND.h,
      }}
    >
      <span
        className={`ready-draft ${face}`}
        style={{
          height: SEND.h,
          color: "rgba(44,49,53,0.62)",
          background: "rgba(44,49,53,0.06)",
        }}
      >
        <Icon name="clock" size={16} stroke={2} />
        Draft, 4:52 pm
      </span>
      <span
        className={`ready-done ${face}`}
        style={{
          height: SEND.h,
          opacity: 0,
          color: "#3f6a2e",
          background: "rgba(78,125,58,0.13)",
          boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.3)",
        }}
      >
        <Icon name="checkCircle" size={17} stroke={2.2} />
        Ready at 5:00 pm
      </span>
    </div>
  );
}

function Button({
  box,
  icon,
  kind,
  children,
}: {
  box: { x: number; y: number; w: number; h: number };
  icon: IconName;
  kind: "quiet" | "solid";
  children: ReactNode;
}) {
  const solid = kind === "solid";
  return (
    <div
      className="act absolute overflow-hidden rounded-[10px] text-[16px] font-semibold"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        opacity: 0.4,
        background: solid ? "var(--slate)" : "#ffffff",
        color: solid ? "#ffffff" : "var(--app-title)",
        boxShadow: solid ? undefined : "inset 0 0 0 1px var(--card-ring)",
      }}
    >
      <span className="absolute inset-0 flex items-center justify-center gap-2">
        <Icon name={icon} size={17} stroke={2.2} />
        {children}
      </span>
      {solid && (
        <span
          className="send-done absolute inset-0 flex items-center justify-center gap-2 text-white"
          style={{ opacity: 0, background: "var(--green)" }}
        >
          <Icon name="check" size={18} stroke={2.6} />
          Sent
        </span>
      )}
    </div>
  );
}

/* ── Today's classes ───────────────────────────────────────────────────── */

function Today() {
  return (
    <div
      className="today absolute overflow-hidden rounded-[14px] bg-white"
      style={{
        left: X,
        top: TODAY.y,
        width: W,
        height: TODAY_H,
        boxShadow: RING,
      }}
    >
      <div
        className="flex items-center gap-3 px-5"
        style={{
          height: TODAY.header,
          boxShadow: "inset 0 -1px 0 var(--hair)",
        }}
      >
        <span className="text-[16px] font-semibold">Today</span>
        <span className="text-[14px] text-[rgba(44,49,53,0.55)]">
          BCA-A and BCA-B
        </span>
        <span className="ml-auto flex items-center gap-5 text-[13.5px] text-[rgba(44,49,53,0.6)]">
          <span className="flex items-center gap-1.5">
            <Icon name="clipboard" size={15} stroke={2} />
            From the registers
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="calendar" size={15} stroke={2} />
            From the timetable
          </span>
        </span>
      </div>
      {/* Drawn last first, so a row travelling down passes over the rest. */}
      {[...LECTURES].reverse().map((l) => (
        <Row key={l.id} l={l} />
      ))}
    </div>
  );
}

function Row({ l }: { l: Lecture }) {
  const tone = courseTone(l.title);
  const moved = l.status === "moved";
  const cancelled = l.status === "cancelled";
  return (
    <div
      className={`row-${l.id} absolute inset-x-0 top-0 bg-white`}
      style={{
        height: TODAY.row,
        transform: `translateY(${slotY(l.to)}px)`,
        boxShadow: "0 0 0 rgba(16,24,40,0)",
        zIndex: moved ? 2 : 1,
      }}
    >
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: 1, background: "rgba(68,88,121,0.1)" }}
      />
      <div className={cancelled ? "dim-cs" : undefined}>
        {/* The hour: a moved class shows its new one, and where it was. */}
        <div
          className="absolute font-mono text-[15px] font-semibold"
          style={{ left: 20, top: 0, width: 70, height: TODAY.row }}
        >
          {moved ? (
            <>
              <span className="time-was-wt absolute inset-0 flex items-center opacity-0">
                {l.time}
              </span>
              <span className="time-now-wt absolute inset-0 flex flex-col justify-center leading-tight">
                {MOVED_TO}
                <span className="text-[11.5px] font-medium text-[rgba(44,49,53,0.55)]">
                  was {l.time}
                </span>
              </span>
            </>
          ) : (
            <span className="absolute inset-0 flex items-center">{l.time}</span>
          )}
        </div>
        <div
          className="absolute flex items-center gap-2.5"
          style={{ left: 100, top: 0, width: 216, height: TODAY.row }}
        >
          <span
            className="h-3 w-3 shrink-0 rounded-[4px]"
            style={{
              background: tone.fill,
              boxShadow: `inset 0 0 0 1px ${tone.ring}`,
            }}
          />
          <span className="relative truncate text-[16px] font-semibold">
            {l.title}
            {cancelled && (
              <span
                className="strike-cs absolute inset-x-0 top-1/2"
                style={{
                  height: 2,
                  marginTop: -1,
                  background: "rgba(13,17,23,0.7)",
                  transformOrigin: "left center",
                }}
              />
            )}
          </span>
        </div>
        <span
          className="absolute flex items-center"
          style={{ left: 326, top: 0, height: TODAY.row }}
        >
          <span
            className="rounded-[6px] px-2 py-0.5 font-mono text-[12.5px] font-semibold"
            style={{ background: "rgba(68,88,121,0.1)", color: "#324464" }}
          >
            {l.group}
          </span>
        </span>
        <span
          className="absolute flex items-center truncate text-[14.5px] text-[rgba(44,49,53,0.8)]"
          style={{ left: 412, top: 0, width: 190, height: TODAY.row }}
        >
          {l.who}
          <span className="ml-2 font-mono text-[13px] text-[rgba(44,49,53,0.55)]">
            {l.room}
          </span>
        </span>
      </div>
      {/* What happened: scheduled, until the register or the timetable says. */}
      <div
        className="absolute"
        style={{ left: 612, top: 0, right: 14, height: TODAY.row }}
      >
        <span
          className={`pend-${l.id} absolute inset-0 flex items-center opacity-0`}
        >
          <StatusBadge status="pending" />
        </span>
        <span
          className={`final-${l.id} absolute inset-0 flex items-center gap-3`}
        >
          <StatusBadge status={l.status} />
          <span className="truncate font-mono text-[13px] text-[rgba(44,49,53,0.62)]">
            {l.detail}
          </span>
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status | "pending" }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[14px] font-semibold whitespace-nowrap"
      style={{ color: s.fg, background: s.bg }}
    >
      <Icon name={s.icon} size={14} stroke={2.4} />
      {s.label}
    </span>
  );
}

/* ── The day in numbers ───────────────────────────────────────────────── */

function Summary() {
  const tiles: {
    key: string;
    n: number;
    suffix?: string;
    label: string;
    icon: IconName;
    fg: string;
    bg: string;
  }[] = [
    { key: "held", n: 4, label: "classes held today", ...pick("held") },
    { key: "moved", n: 1, label: "moved, with no clash", ...pick("moved") },
    { key: "cancelled", n: 1, label: "cancelled", ...pick("cancelled") },
    {
      key: "present",
      n: PRESENT,
      suffix: "%",
      label: "present, from the registers",
      icon: "users",
      fg: "#324464",
      bg: "rgba(68,88,121,0.1)",
    },
  ];
  return (
    <div
      className="summary absolute flex rounded-[14px] bg-white"
      style={{
        left: X,
        top: SUMMARY.y,
        width: W,
        height: SUMMARY.h,
        boxShadow: RING,
      }}
    >
      {tiles.map((t, i) => (
        <div
          key={t.key}
          className="relative flex flex-1 flex-col justify-center px-6"
          style={i > 0 ? { boxShadow: "inset 1px 0 0 var(--hair)" } : undefined}
        >
          <span className="font-display text-[44px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
            <span className={`n-${t.key}`}>{t.n}</span>
            {t.suffix}
          </span>
          <span className="mt-2.5 text-[14.5px] text-[rgba(44,49,53,0.62)]">
            {t.label}
          </span>
          <span
            className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{ color: t.fg, background: t.bg }}
          >
            <Icon name={t.icon} size={19} stroke={2.2} />
          </span>
        </div>
      ))}
    </div>
  );
}

function pick(s: Status) {
  const { icon, fg, bg } = STATUS[s];
  return { icon, fg, bg };
}

/* ── The term, course by course ───────────────────────────────────────── */

function Term() {
  return (
    <div
      className="term absolute overflow-hidden rounded-[14px] bg-white"
      style={{
        left: X,
        top: TERM.y,
        width: W,
        height: TERM_H,
        boxShadow: RING,
        opacity: 0,
      }}
    >
      <div
        className="flex items-center gap-3 px-5"
        style={{ height: TERM.header, boxShadow: "inset 0 -1px 0 var(--hair)" }}
      >
        <Icon name="chart" size={17} stroke={2} color="var(--slate)" />
        <span className="text-[16px] font-semibold">This term, by course</span>
        <span className="ml-auto text-[13.5px] text-[rgba(44,49,53,0.6)]">
          Held from the registers, left from the timetable
        </span>
      </div>
      {COURSES.map((c, i) => {
        const tone = courseTone(c.title);
        return (
          <div
            key={c.id}
            className="absolute inset-x-0"
            style={{
              top: TERM.header + i * TERM.row,
              height: TERM.row,
              boxShadow:
                i > 0 ? "inset 0 1px 0 rgba(68,88,121,0.1)" : undefined,
            }}
          >
            <div
              className="absolute flex items-center gap-2.5"
              style={{ left: 20, top: 0, width: 310, height: TERM.row }}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-[4px]"
                style={{
                  background: tone.fill,
                  boxShadow: `inset 0 0 0 1px ${tone.ring}`,
                }}
              />
              <span className="truncate text-[16px] font-semibold">
                {c.title}
              </span>
              <span
                className="shrink-0 rounded-[6px] px-2 py-0.5 font-mono text-[12px] font-semibold"
                style={{ background: "rgba(68,88,121,0.1)", color: "#324464" }}
              >
                {c.group}
              </span>
            </div>
            <div
              className="absolute overflow-hidden rounded-full"
              style={{
                left: BAR.x,
                top: (TERM.row - BAR.h) / 2,
                width: BAR.w,
                height: BAR.h,
                background: "rgba(68,88,121,0.1)",
              }}
            >
              <div
                className="bar-fill absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: (BAR.w * c.held) / c.of,
                  background: tone.fill,
                  boxShadow: `inset 0 0 0 1px ${tone.ring}`,
                  transformOrigin: "left center",
                }}
              />
            </div>
            <div
              className="absolute flex items-center justify-end text-[16px] whitespace-nowrap text-[rgba(44,49,53,0.62)] tabular-nums"
              style={{ right: 20, top: 0, height: TERM.row }}
            >
              <span className="font-semibold text-[#0d1117]">
                <span className="n-term-held">{c.held}</span> of {c.of} held
              </span>
              ,&nbsp;
              <span
                className={`n-term-left-${c.id} font-semibold text-[#0d1117]`}
              >
                {c.of - c.held}
              </span>
              &nbsp;left
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Under and over the window ────────────────────────────────────────── */

function Toast() {
  return (
    <span
      className="bg-raised text-fg inline-flex items-center gap-4 rounded-[22px] py-3 pr-8 pl-3 text-[26px] leading-none font-medium tracking-[-0.01em] whitespace-nowrap"
      style={{ boxShadow: "inset 0 0 0 1px var(--line), var(--shadow-2)" }}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-[12px]"
        style={{ background: "rgba(47,122,75,0.1)", color: "var(--good)" }}
      >
        <Icon name="send" size={24} stroke={2} />
      </span>
      Sent to the BCA office at 5:00 pm
    </span>
  );
}

/** The report as a page, for its flight from Send into the toast. */
function Doc() {
  return (
    <div
      className="doc absolute rounded-[8px] bg-white"
      style={{
        left: TILE.x - DOC.w / 2,
        top: TILE.y - DOC.h / 2,
        width: DOC.w,
        height: DOC.h,
        opacity: 0,
        boxShadow:
          "inset 0 0 0 1px var(--card-ring), 0 14px 28px rgba(16,24,40,0.22)",
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          left: 9,
          top: 11,
          width: 26,
          height: 5,
          background: "var(--slate)",
        }}
      />
      {[22, 31, 40, 49].map((t, i) => (
        <span
          key={t}
          className="absolute rounded-full"
          style={{
            left: 9,
            top: t,
            width: i % 2 ? 28 : 38,
            height: 4,
            background: "rgba(68,88,121,0.22)",
          }}
        />
      ))}
      <span
        className="absolute rounded-[3px]"
        style={{
          right: 8,
          bottom: 8,
          width: 14,
          height: 10,
          background: "#4e7d3a",
        }}
      />
    </div>
  );
}
