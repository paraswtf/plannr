"use client";

import { useRef } from "react";

import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { courseTone } from "~/ui/mock";

import {
  AppBar,
  Block,
  BlockFace,
  cell,
  type ClassDef,
  Cursor,
  makeGrid,
  Stage,
  StatusPill,
  useIntro,
  WeekGrid,
} from "./_kit";

export interface ApprovalsInboxProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

/* ── Layout: the queue on the left, BCA-A's week on the right ──────────── */

const QUEUE = { x: 15, y: 78, w: 336, h: 474, header: 48 } as const;
const CARD = { x: QUEUE.x + 12, w: QUEUE.w - 24, h: 124, gap: 10 } as const;
/** The three places in the queue, top first. */
const SLOT_Y = [0, 1, 2].map(
  (i) => QUEUE.y + QUEUE.header + i * (CARD.h + CARD.gap),
);
const y0 = SLOT_Y[0]!;
const y1 = SLOT_Y[1]!;
const y2 = SLOT_Y[2]!;

const G = makeGrid({
  x: QUEUE.x + QUEUE.w + 12,
  y: 78,
  w: 915 - (QUEUE.x + QUEUE.w + 12),
  gutter: 44,
  rowH: 72,
});

const WEEK: ClassDef[] = [
  { id: "a", title: "Software Testing", col: 0, hour: 9, room: "Lab 2" },
  { id: "b", title: "Statistics", col: 0, hour: 11, room: "304" },
  { id: "c", title: "Business Analytics", col: 1, hour: 10, room: "304" },
  { id: "d", title: "Web Technologies", col: 2, hour: 9, room: "Lab 2" },
  { id: "e", title: "Communication Skills", col: 2, hour: 12, room: "301" },
  { id: "f", title: "Statistics", col: 3, hour: 9, room: "304" },
  { id: "g", title: "Design Thinking", col: 3, hour: 13, room: "301" },
  { id: "h", title: "Business Analytics", col: 4, hour: 11, room: "304" },
  { id: "i", title: "Cyber Security", col: 0, hour: 14, room: "304" },
  { id: "j", title: "Cloud Computing", col: 3, hour: 14, room: "Lab 2" },
];
/** Classes a request changes: drawn under the card that lands on them. */
const ROOM_CHANGE: ClassDef = {
  id: "rc",
  title: "Design Thinking",
  col: 4,
  hour: 9,
  room: "301",
};
const CANCEL: ClassDef = {
  id: "cx",
  title: "Data Mining",
  col: 1,
  hour: 14,
  room: "304",
};

type Kind = "extra" | "room" | "cancel";

interface Request {
  key: string;
  who: string;
  initials: string;
  kind: Kind;
  course: string;
  detail: string;
  ago: string;
  /** Where approving it puts it. */
  lands: { col: number; hour: number };
  /** What the class looks like once it has. */
  result: Pick<ClassDef, "title" | "room" | "who">;
}

const REQUESTS: Request[] = [
  {
    key: "r1",
    who: "Dr. Fernandes",
    initials: "F",
    kind: "extra",
    course: "Web Technologies",
    detail: "Thu 11:00 · Lab 2",
    ago: "2m",
    lands: { col: 3, hour: 11 },
    result: { title: "Web Technologies", room: "Lab 2" },
  },
  {
    key: "r2",
    who: "Prof. Kulkarni",
    initials: "K",
    kind: "room",
    course: "Design Thinking",
    detail: "Fri 9:00 · 301 → 304",
    ago: "18m",
    lands: { col: 4, hour: 9 },
    result: { title: "Design Thinking", room: "304" },
  },
  {
    key: "r3",
    who: "Dr. Mehta",
    initials: "M",
    kind: "cancel",
    course: "Data Mining",
    detail: "Tue 14:00 · 304",
    ago: "1h",
    lands: { col: 1, hour: 14 },
    result: { title: "Data Mining", room: "Cancelled" },
  },
];

const KIND: Record<Kind, { label: string; fg: string; bg: string }> = {
  extra: { label: "Extra lecture", fg: "#2f5f1f", bg: "rgba(78,125,58,0.14)" },
  room: { label: "Room change", fg: "#2c3f63", bg: "rgba(68,88,121,0.14)" },
  cancel: { label: "Cancellation", fg: "#a8274f", bg: "rgba(200,48,95,0.1)" },
};

const APPROVE = { w: 88, h: 30 };
/** The Approve button's centre on a card at queue slot `y`. */
const approveAt = (y: number) => ({
  x: CARD.x + CARD.w - 14 - APPROVE.w / 2,
  y: y + CARD.h - 14 - APPROVE.h / 2,
});
const CURSOR_START = { x: 560, y: 520 };
const TIP = { x: 16, y: 5 };
const tip = (p: { x: number; y: number }) => ({
  x: p.x + TIP.x,
  y: p.y + TIP.y,
});

/** The flight from a queue slot to a class's place on the grid. */
function flight(r: Request, fromY: number) {
  const to = cell(G, r.lands.col, r.lands.hour);
  const end = { x: to.x - CARD.x, y: to.y };
  const mid = { x: end.x * 0.55, y: Math.min(fromY, end.y) - 70 };
  return {
    motionPath: { path: [mid, end], curviness: 1.2 },
    width: to.w,
    height: to.h,
    borderRadius: 10,
  };
}

/**
 * Requests from faculty arrive in one queue instead of calls, chats and
 * mails.
 *
 * Builds (steps = 3):
 *   0 — the queue: an extra lecture, a room change, a cancellation.
 *   1 — approve one: it lands on the timetable, and the next slides up.
 *   2 — approve the other two, one at a time: the queue is clear and every
 *       affected timetable is updated.
 *
 * The browser window carries `flipId`, at the same size and place as the
 * other two coordinator demos, so it holds still between them.
 */
export function ApprovalsInbox({ step, active, flipId }: ApprovalsInboxProps) {
  const ref = useRef<HTMLDivElement>(null);

  // On arrival: the requests come in, newest on top, pushing the rest down.
  useIntro(ref, step, active, (tl) => {
    const enter = { duration: 0.5, ease: "power3.out" };
    const push = { duration: 0.45, ease: "deck.morph" };
    // The badge stays hidden until the first request has landed.
    tl.fromTo(
      ".count",
      { textContent: 0, opacity: 0 },
      { textContent: 0, opacity: 0, duration: 0 },
    );
    tl.fromTo(
      ".card-r3",
      { y: y0 - 36, opacity: 0 },
      { y: y0, opacity: 1, ...enter },
    );
    tl.set(".count", { textContent: 1 }, ">-0.15");
    tl.to(".count", { opacity: 1, duration: 0.2 }, "<");
    tl.to(".card-r3", { y: y1, ...push }, ">0.1");
    tl.fromTo(
      ".card-r2",
      { y: y0 - 36, opacity: 0 },
      { y: y0, opacity: 1, ...enter },
      "<0.15",
    );
    tl.to(".count", { textContent: 2, duration: 0 }, "<");
    tl.to(".card-r3", { y: y2, ...push }, ">0.25");
    tl.to(".card-r2", { y: y1, ...push }, "<");
    tl.fromTo(
      ".card-r1",
      { y: y0 - 36, opacity: 0 },
      { y: y0, opacity: 1, ...enter },
      "<0.15",
    );
    tl.to(".count", { textContent: 3, duration: 0 }, "<");
    tl.fromTo(
      ".cur-a",
      tip(CURSOR_START),
      { ...tip(approveAt(y0)), duration: 0.8, ease: "deck.morph" },
      ">0.2",
    );
  });

  useSteps(ref, step, (tl, mark) => {
    // ── Build 1: approve the extra lecture; it flies onto Thursday 11:00.
    tl.to(".cur-svg", { scale: 0.84, duration: 0.1, ease: "power2.out" });
    tl.to(".cur-svg", { scale: 1, duration: 0.18 });
    tl.to(".card-r1 .ok", { opacity: 1, duration: 0.2 }, "<");
    tl.fromTo(
      ".count",
      { textContent: 3 },
      { textContent: 2, duration: 0, immediateRender: false },
      "<",
    );
    tl.addLabel("fly1", ">0.1");
    tl.to(
      ".card-r1",
      { boxShadow: "0 24px 44px rgba(16,24,40,0.24)", duration: 0.2 },
      "fly1",
    );
    tl.to(
      ".card-r1",
      { ...flight(REQUESTS[0]!, y0), duration: 1, ease: "deck.morph" },
      "fly1",
    );
    tl.to(".card-r1 .face-card", { opacity: 0, duration: 0.35 }, "fly1+=0.1");
    tl.to(".card-r1 .face-block", { opacity: 1, duration: 0.4 }, "fly1+=0.45");
    tl.to(
      ".card-r1",
      { boxShadow: "0 0 0 rgba(16,24,40,0)", duration: 0.3 },
      "fly1+=0.8",
    );
    // The queue closes up behind it.
    tl.fromTo(
      ".card-r2",
      { y: y1 },
      { y: y0, duration: 0.55, ease: "deck.morph", immediateRender: false },
      "fly1+=0.3",
    );
    tl.fromTo(
      ".card-r3",
      { y: y2 },
      { y: y1, duration: 0.55, ease: "deck.morph", immediateRender: false },
      "fly1+=0.38",
    );
    // The next request slides up under the pointer, its own Approve ready.
    mark();

    // ── Build 2: approve the other two, one at a time, from the top.
    /** Click the top card's Approve, then send that card onto its class. */
    const approveTop = (r: Request, sel: string, count: number) => {
      tl.to(".cur-svg", { scale: 0.84, duration: 0.1, ease: "power2.out" });
      tl.to(".cur-svg", { scale: 1, duration: 0.18 });
      tl.to(`${sel} .ok`, { opacity: 1, duration: 0.2 }, "<");
      tl.to(".count", { textContent: count, duration: 0 }, "<");
      const at = `fly-${r.key}`;
      tl.addLabel(at, ">0.1");
      tl.to(
        sel,
        { boxShadow: "0 24px 44px rgba(16,24,40,0.24)", duration: 0.2 },
        at,
      );
      tl.to(sel, { ...flight(r, y0), duration: 1, ease: "deck.morph" }, at);
      tl.to(`${sel} .face-card`, { opacity: 0, duration: 0.35 }, `${at}+=0.1`);
      tl.to(`${sel} .face-block`, { opacity: 1, duration: 0.4 }, `${at}+=0.45`);
      tl.to(
        sel,
        { boxShadow: "0 0 0 rgba(16,24,40,0)", duration: 0.3 },
        `${at}+=0.8`,
      );
      return at;
    };
    const fly2 = approveTop(REQUESTS[1]!, ".card-r2", 1);
    // The last one closes up under the pointer, and is approved in turn.
    tl.fromTo(
      ".card-r3",
      { y: y1 },
      { y: y0, duration: 0.55, ease: "deck.morph", immediateRender: false },
      `${fly2}+=0.3`,
    );
    const fly3 = approveTop(REQUESTS[2]!, ".card-r3", 0);
    tl.to(".count", { opacity: 0, scale: 0.5, duration: 0.3 }, `${fly3}-=0.1`);
    tl.to(".cur-a", { opacity: 0, duration: 0.3 }, `${fly3}+=0.4`);
    tl.from(
      ".done",
      { opacity: 0, y: 16, scale: 0.96, duration: 0.6, ease: "deck.enter" },
      `${fly3}+=0.75`,
    );
    // Updated: a ring goes out from each class that changed.
    tl.fromTo(
      ".told",
      { scale: 1, opacity: 0.95 },
      {
        scale: 1.35,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: "power2.out",
        immediateRender: false,
      },
      `${fly3}+=1.1`,
    );
    tl.from(
      ".toast",
      { opacity: 0, y: 24, duration: 0.55, ease: "deck.enter" },
      `${fly3}+=1.2`,
    );
    mark();
  });

  return (
    <Stage
      stageRef={ref}
      flipId={flipId}
      strip={
        <div className="flex justify-center">
          <StatusPill icon="calendarCheck" tone="accent" className="toast">
            Every affected timetable updated
          </StatusPill>
        </div>
      }
    >
      <AppBar
        title="Requests"
        chip="Coordinator"
        sub="From faculty, in one place"
      />

      {/* The queue's card. The requests are drawn over it, so they can leave it. */}
      <div
        className="absolute rounded-[14px] bg-white"
        style={{
          left: QUEUE.x,
          top: QUEUE.y,
          width: QUEUE.w,
          height: QUEUE.h,
          boxShadow:
            "inset 0 0 0 1px var(--card-ring), 0 2px 10px rgba(13,17,23,0.05)",
        }}
      >
        <div
          className="flex items-center gap-2.5 px-4"
          style={{
            height: QUEUE.header,
            boxShadow: "inset 0 -1px 0 var(--hair)",
          }}
        >
          <Icon name="inbox" size={19} stroke={2} color="var(--slate)" />
          <span className="text-[16px] font-semibold">Inbox</span>
          <span
            className="count flex h-5.5 min-w-5.5 items-center justify-center rounded-full px-1.5 font-mono text-[12.5px] font-bold text-white"
            style={{ background: "var(--accent)" }}
          >
            3
          </span>
        </div>
        <div
          className="done absolute inset-x-0 flex flex-col items-center text-center"
          style={{ top: 150 }}
        >
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: "rgba(78,125,58,0.12)",
              color: "var(--green)",
            }}
          >
            <Icon name="checkCircle" size={36} stroke={2} />
          </span>
          <span className="font-display mt-4 text-[26px] font-bold tracking-[-0.02em]">
            All caught up
          </span>
          <span className="mt-1.5 text-[15px] text-[rgba(44,49,53,0.6)]">
            3 requests handled · no calls, no mails
          </span>
        </div>
      </div>

      <WeekGrid g={G} today={0} />
      {WEEK.map((c) => (
        <Block key={c.id} g={G} c={c} size="sm" />
      ))}
      <Block g={G} c={ROOM_CHANGE} size="sm" />
      <Block g={G} c={CANCEL} size="sm" />

      {REQUESTS.map((r) => (
        <RequestCard key={r.key} r={r} />
      ))}

      {/* A ring per class that changed: every affected timetable updated. */}
      {REQUESTS.map((r) => {
        const c = cell(G, r.lands.col, r.lands.hour);
        return (
          <span
            key={r.key}
            className="told pointer-events-none absolute z-30 rounded-[10px]"
            style={{
              left: c.x,
              top: c.y,
              width: c.w,
              height: c.h,
              opacity: 0,
              boxShadow: "0 0 0 3px var(--accent)",
            }}
          />
        );
      })}

      <Cursor
        className="cur-a"
        innerClassName="cur-b"
        style={{
          transform: `translate(${tip(approveAt(y0)).x}px, ${tip(approveAt(y0)).y}px)`,
        }}
      />
    </Stage>
  );
}

function RequestCard({ r }: { r: Request }) {
  const k = KIND[r.kind];
  const cancelled = r.kind === "cancel";
  const tone = courseTone(r.result.title);
  return (
    <div
      className={`card-${r.key} absolute top-0 z-20 overflow-hidden rounded-[14px] bg-white`}
      style={{
        left: CARD.x,
        width: CARD.w,
        height: CARD.h,
        transform: `translateY(${y0}px)`,
        boxShadow: "0 0 0 rgba(16,24,40,0)",
      }}
    >
      {/* As a request, in the queue. */}
      <div
        className="face-card absolute top-0 left-0"
        style={{
          width: CARD.w,
          height: CARD.h,
          padding: 14,
          boxShadow: "inset 0 0 0 1px var(--card-ring)",
          borderRadius: 14,
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="font-display flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-bold"
            style={{
              background: "#fde7c2",
              color: "#8a5a10",
              boxShadow: "inset 0 0 0 1px rgba(217,148,37,0.5)",
            }}
          >
            {r.initials}
          </span>
          <span className="text-[15.5px] font-semibold">{r.who}</span>
          <span className="ml-auto font-mono text-[12.5px] text-[rgba(44,49,53,0.5)]">
            {r.ago} ago
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[12px] font-semibold"
            style={{ color: k.fg, background: k.bg }}
          >
            {k.label}
          </span>
          <span className="truncate text-[14.5px] font-semibold">
            {r.course}
          </span>
        </div>
        <div className="absolute inset-x-3.5 bottom-3.5 flex items-center">
          <span className="font-mono text-[12.5px] text-[rgba(44,49,53,0.65)]">
            {r.detail}
          </span>
          <span
            className="relative ml-auto flex items-center justify-center overflow-hidden rounded-lg text-[13.5px] font-semibold text-white"
            style={{
              width: APPROVE.w,
              height: APPROVE.h,
              background: "var(--slate)",
            }}
          >
            Approve
            <span
              className="ok absolute inset-0 flex items-center justify-center gap-1"
              style={{ opacity: 0, background: "var(--green)" }}
            >
              <Icon name="check" size={15} stroke={2.6} />
              Done
            </span>
          </span>
        </div>
      </div>
      {/* As a class, on the timetable. */}
      <div className="face-block absolute inset-0" style={{ opacity: 0 }}>
        {cancelled ? (
          <div
            className="absolute inset-0 overflow-hidden rounded-[10px] px-2 py-1.5"
            style={{
              background: `repeating-linear-gradient(135deg, rgba(200,48,95,0.08) 0 6px, rgba(255,255,255,0.9) 6px 12px)`,
              boxShadow: "inset 0 0 0 1.5px rgba(200,48,95,0.5)",
              color: "rgba(13,17,23,0.55)",
            }}
          >
            <span className="line-clamp-2 text-[13px] leading-tight font-semibold line-through">
              {r.result.title}
            </span>
            <span className="mt-1 block truncate font-mono text-[11px] font-semibold text-[#a8274f]">
              Cancelled
            </span>
          </div>
        ) : (
          <BlockFace c={r.result} tone={tone} size="sm" />
        )}
      </div>
    </div>
  );
}
