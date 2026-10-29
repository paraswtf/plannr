"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";

import {
  CARD,
  click,
  Cursor,
  DemoBox,
  FacultyBrowser,
  GROUP_TONES,
  INK,
  TOPBAR,
  useIntro,
} from "./_shell";

export interface AvailabilityOnceProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between slides. */
  flipId?: string;
}

/**
 * A visiting teacher says when they can teach, once a term, and the planner
 * works around it.
 *
 * Builds (steps = 3):
 *   0 — on arrival, Dr. Deshmukh (visiting) paints the hours she can teach
 *       on a Mon to Sat week, four runs of three hours, and saves them for
 *       the term: "12 h a week".
 *   1 — the planner schedules her lectures into them: the six pieces of
 *       Data Mining waiting in the tray (a lab and two lectures each for
 *       BCA-A and BCA-B) fly into those hours, clash-free; "6 of 6 placed".
 *   2 — a change goes to a queue, not to anyone's phone: the pointer opens
 *       Wed 10:00 and marks it "Can't teach this hour"; the change becomes a
 *       card that travels into Dr. Mehta's queue, with a free hour already
 *       found (Sat 10:00, which lights up on the week).
 *
 * The browser frame carries `flipId`, shared with the other faculty demos,
 * so the window holds still between the feature slides.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FIRST = 9;
const HOURS = 7; // 9:00 to 16:00

/** The week card, in page pixels. */
const GRID = {
  x: 16,
  y: TOPBAR + 74,
  w: 548,
  head: 34,
  gutter: 44,
  col: (548 - 44) / 6,
  row: 56,
};
const GRID_H = GRID.head + HOURS * GRID.row + 8;

/** The right-hand column: the planner's tray, then the coordinator's queue. */
const SIDE = { x: GRID.x + GRID.w + 12, w: 800 - 16 - (GRID.x + GRID.w + 12) };
const TRAY = { x: SIDE.x, y: GRID.y, w: SIDE.w, h: 222 };
const QUEUE = {
  x: SIDE.x,
  y: TRAY.y + TRAY.h + 12,
  w: SIDE.w,
  h: GRID.y + GRID_H - (TRAY.y + TRAY.h + 12),
};

/** A block on the week, in page pixels. */
const cell = (day: number, at: number, len = 1) => ({
  left: GRID.x + GRID.gutter + day * GRID.col + 3,
  top: GRID.y + GRID.head + (at - FIRST) * GRID.row + 2,
  width: GRID.col - 6,
  height: len * GRID.row - 4,
});

/** The hours she can teach: 12 a week. */
const AVAIL = [
  { day: 0, at: 13, len: 3 },
  { day: 2, at: 9, len: 3 },
  { day: 4, at: 13, len: 3 },
  { day: 5, at: 9, len: 3 },
];

type Group = "BCA-A" | "BCA-B";

interface Lecture {
  id: string;
  group: Group;
  lab?: boolean;
  day: number;
  at: number;
  room: string;
}

/** What the planner places, in tray order: a lab and two lectures a group. */
const LECTURES: Lecture[] = [
  { id: "a-lab", group: "BCA-A", lab: true, day: 0, at: 13, room: "Lab 2" },
  { id: "a-wed", group: "BCA-A", day: 2, at: 9, room: "301" },
  { id: "a-fri", group: "BCA-A", day: 4, at: 15, room: "304" },
  { id: "b-lab", group: "BCA-B", lab: true, day: 4, at: 13, room: "Lab 2" },
  { id: "b-mon", group: "BCA-B", day: 0, at: 15, room: "304" },
  { id: "b-wed", group: "BCA-B", day: 2, at: 10, room: "302" },
];

/** The lecture she can no longer teach, and the hour the planner offers. */
const CHANGED = LECTURES.find((l) => l.id === "b-wed")!;
const OFFER = { day: 5, at: 10 };

/** Where each piece waits in the tray, in page pixels. */
const TOKEN = { h: 26, lec: 44, lab: 70, gap: 7 };
const TOKEN_ROWS: Record<Group, number> = {
  "BCA-A": TRAY.y + 92,
  "BCA-B": TRAY.y + 152,
};
const tokens = (() => {
  const next: Record<Group, number> = {
    "BCA-A": TRAY.x + 14,
    "BCA-B": TRAY.x + 14,
  };
  return LECTURES.map((l) => {
    const w = l.lab ? TOKEN.lab : TOKEN.lec;
    const x = next[l.group];
    next[l.group] = x + w + TOKEN.gap;
    return { x, y: TOKEN_ROWS[l.group], w, h: TOKEN.h };
  });
})();

/** The change, once it has landed in the queue. */
const REQ = { x: QUEUE.x + 10, y: QUEUE.y + 62, w: QUEUE.w - 20, h: 122 };

/** The menu that opens on the changed lecture. */
const changedBox = cell(CHANGED.day, CHANGED.at);
const POP = {
  x: changedBox.left + changedBox.width + 10,
  y: changedBox.top - 30,
};

const SAVE = { right: 16, w: 168, h: 36 };

const ELEVATED = `inset 0 0 0 1px ${INK.ring}, 0 2px 4px rgba(16,24,40,0.04), 0 18px 40px -14px rgba(16,24,40,0.26)`;
const CAN_TEACH = { fill: "#dcf1d2", ring: "rgba(78,125,58,0.55)" };
const AMBER = "#c46d10";

export function AvailabilityOnce({
  step,
  active,
  flipId,
}: AvailabilityOnceProps) {
  const scope = useRef<HTMLDivElement>(null);

  const paintFrom = { x: 690, y: 520 };
  const saveAt = { x: 800 - SAVE.right - SAVE.w / 2, y: TOPBAR + 46 };
  const actFrom = { x: 380, y: 520 };
  const lectureAt = {
    x: changedBox.left + changedBox.width * 0.55,
    y: changedBox.top + changedBox.height * 0.6,
  };
  const cantAt = { x: POP.x + 110, y: POP.y + 132 };

  // On arrival: she paints the hours she can teach, then saves them.
  useIntro(scope, { active, step }, (tl) => {
    tl.to(".cur-paint", { opacity: 1, duration: 0.2 });
    let painted = 0;
    AVAIL.forEach((a, i) => {
      const b = cell(a.day, a.at, a.len);
      const x = b.left + b.width / 2 - paintFrom.x;
      const top = b.top + 14 - paintFrom.y;
      const bottom = b.top + b.height - 14 - paintFrom.y;
      tl.to(".cur-paint", {
        x,
        y: top,
        duration: i === 0 ? 0.6 : 0.45,
        ease: "power3.inOut",
      });
      tl.to(".cur-paint", {
        scale: 0.86,
        duration: 0.09,
        ease: "power2.in",
        transformOrigin: "5px 3px",
      });
      tl.addLabel(`paint${i}`);
      tl.to(
        `[data-avail="${i}"]`,
        { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "power1.out" },
        `paint${i}`,
      );
      tl.to(
        ".cur-paint",
        { y: bottom, duration: 0.55, ease: "power1.out" },
        `paint${i}`,
      );
      const from = painted;
      painted += a.len;
      tl.fromTo(
        "[data-hours]",
        { textContent: from },
        {
          textContent: painted,
          snap: { textContent: 1 },
          duration: 0.6,
          ease: "power1.out",
          immediateRender: false,
        },
        `paint${i}`,
      );
      tl.to(".cur-paint", { scale: 1, duration: 0.14, ease: "power2.out" });
    });
    // Saved for the term.
    tl.to(".cur-paint", {
      x: saveAt.x - paintFrom.x,
      y: saveAt.y - paintFrom.y,
      duration: 0.75,
      ease: "power3.inOut",
    });
    click(tl, ".cur-paint");
    tl.to("[data-save-idle]", { opacity: 0, duration: 0.18 }, "<0.05");
    tl.fromTo(
      "[data-save-done]",
      { opacity: 0, scale: 0.9 },
      { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" },
      "<",
    );
    tl.to(".cur-paint", {
      x: saveAt.x - paintFrom.x - 30,
      y: saveAt.y - paintFrom.y + 80,
      opacity: 0,
      duration: 0.5,
      ease: "power2.inOut",
    });
  });

  useSteps(scope, step, (tl, mark) => {
    // 1 — the planner schedules her lectures into those hours.
    tl.to("[data-status-wait]", { opacity: 0, duration: 0.25 });
    tl.addLabel("fly", "<0.05");
    LECTURES.forEach((l, i) => {
      const t = tokens[i]!;
      const b = cell(l.day, l.at, l.lab ? 2 : 1);
      const end = { x: b.left - t.x, y: b.top - t.y };
      const mid = { x: end.x * 0.5, y: Math.min(0, end.y) - 70 - i * 6 };
      const at = `fly+=${i * 0.17}`;
      const sel = `[data-piece="${l.id}"]`;
      tl.to(
        sel,
        {
          boxShadow: "0px 16px 28px rgba(16,24,40,0.22)",
          duration: 0.2,
          ease: "power2.out",
        },
        at,
      );
      tl.fromTo(
        sel,
        { x: 0, y: 0 },
        {
          motionPath: { path: [{ x: 0, y: 0 }, mid, end], curviness: 1.1 },
          duration: 0.9,
          ease: "power2.inOut",
          immediateRender: false,
        },
        at,
      );
      tl.to(
        sel,
        {
          width: b.width,
          height: b.height,
          borderRadius: 10,
          duration: 0.9,
          ease: "power2.inOut",
        },
        at,
      );
      tl.to(
        `${sel} [data-token-face]`,
        { opacity: 0, duration: 0.25 },
        `fly+=${i * 0.17 + 0.15}`,
      );
      tl.to(
        `${sel} [data-block-face]`,
        { opacity: 1, duration: 0.3 },
        `fly+=${i * 0.17 + 0.6}`,
      );
      tl.to(
        sel,
        {
          boxShadow: "0px 0px 0px rgba(16,24,40,0)",
          duration: 0.3,
          ease: "power2.out",
        },
        `fly+=${i * 0.17 + 0.85}`,
      );
      tl.set(
        "[data-placed]",
        { textContent: i + 1 },
        `fly+=${i * 0.17 + 0.88}`,
      );
    });
    tl.fromTo(
      "[data-status-done]",
      { opacity: 0, x: -8 },
      { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" },
      ">-0.1",
    );
    tl.to("[data-placed-line]", { color: INK.green, duration: 0.3 }, "<");
    mark();

    // 2 — a change goes to the coordinator's queue, not to a phone call.
    tl.to(".cur-act", { opacity: 1, duration: 0.2 });
    tl.to(
      ".cur-act",
      {
        x: lectureAt.x - actFrom.x,
        y: lectureAt.y - actFrom.y,
        duration: 0.75,
        ease: "power3.inOut",
      },
      "<",
    );
    click(tl, ".cur-act");
    tl.fromTo(
      "[data-pop]",
      { opacity: 0, scale: 0.92, x: -10 },
      {
        opacity: 1,
        scale: 1,
        x: 0,
        duration: 0.3,
        ease: "power3.out",
        transformOrigin: "0% 30%",
      },
      "<0.05",
    );
    tl.to(
      ".cur-act",
      {
        x: cantAt.x - actFrom.x,
        y: cantAt.y - actFrom.y,
        duration: 0.55,
        ease: "power3.inOut",
      },
      ">0.05",
    );
    tl.to(
      "[data-pop-cant]",
      { backgroundColor: "rgba(220,56,72,0.1)", duration: 0.15 },
      ">-0.12",
    );
    click(tl, ".cur-act");
    tl.to(
      "[data-pop]",
      { opacity: 0, scale: 0.95, duration: 0.22, ease: "power2.in" },
      ">-0.05",
    );
    tl.fromTo(
      "[data-asked]",
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: "power1.out" },
      "<",
    );
    tl.fromTo(
      "[data-asked-tag]",
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" },
      "<0.1",
    );
    tl.to(
      ".cur-act",
      {
        x: cantAt.x - actFrom.x + 50,
        y: cantAt.y - actFrom.y + 90,
        opacity: 0,
        duration: 0.5,
        ease: "power2.inOut",
      },
      "<",
    );
    // The change, as a card, travels to Dr. Mehta's queue.
    const from = {
      x: lectureAt.x - (REQ.x + REQ.w / 2),
      y: lectureAt.y - (REQ.y + REQ.h / 2),
    };
    tl.addLabel("send", "<0.1");
    tl.fromTo(
      "[data-req]",
      { opacity: 0, scale: 0.35 },
      { opacity: 1, duration: 0.2, ease: "power2.out" },
      "send",
    );
    tl.fromTo(
      "[data-req]",
      { x: from.x, y: from.y },
      {
        motionPath: {
          path: [
            { x: from.x, y: from.y },
            { x: from.x * 0.45, y: from.y - 40 },
            { x: 0, y: 0 },
          ],
          curviness: 1.1,
        },
        duration: 1,
        ease: "power2.inOut",
        immediateRender: false,
      },
      "send",
    );
    tl.to(
      "[data-req]",
      { scale: 1, duration: 1, ease: "power2.inOut" },
      "send",
    );
    tl.to("[data-empty]", { opacity: 0, duration: 0.3 }, "send+=0.55");
    tl.to(
      "[data-req]",
      {
        boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 1px 2px rgba(16,24,40,0.04), 0 6px 16px -8px rgba(16,24,40,0.16)`,
        duration: 0.3,
      },
      "send+=0.9",
    );
    tl.set("[data-waiting]", { textContent: 1 }, "send+=0.95");
    tl.fromTo(
      "[data-waiting-chip]",
      { scale: 1 },
      {
        scale: 1.15,
        duration: 0.15,
        ease: "power2.out",
        yoyo: true,
        repeat: 1,
      },
      "send+=0.95",
    );
    tl.fromTo(
      "[data-offer]",
      { opacity: 0, x: -8 },
      { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" },
      "send+=1.1",
    );
    tl.fromTo(
      "[data-offer-slot]",
      { opacity: 0, scale: 0.85 },
      { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.8)" },
      "<0.1",
    );
    mark();
  });

  return (
    <DemoBox scope={scope}>
      <FacultyBrowser
        flipId={flipId}
        path="schedule/availability"
        tab={1}
        user="Dr. Deshmukh"
        role="Visiting faculty"
      >
        {/* Heading, the hours counter and the save button */}
        <div
          className="absolute flex items-end justify-between"
          style={{ left: 16, right: 16, top: TOPBAR + 12, height: 52 }}
        >
          <div>
            <div
              className="text-[14px] leading-[18px] font-semibold"
              style={{ color: INK.muted }}
            >
              This term, every week
            </div>
            <div className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em]">
              When I can teach
            </div>
          </div>
          <div className="flex items-center gap-3 pb-0.5">
            <span
              className="flex h-[36px] items-center gap-2 rounded-[10px] px-3 text-[15px] font-semibold"
              style={{
                background: "#ffffff",
                boxShadow: `inset 0 0 0 1px ${INK.hair}`,
              }}
            >
              <span
                className="h-[13px] w-[13px] rounded-[4px]"
                style={{
                  background: CAN_TEACH.fill,
                  boxShadow: `inset 0 0 0 1px ${CAN_TEACH.ring}`,
                }}
              />
              <span>
                <span data-hours className="font-mono tabular-nums">
                  0
                </span>{" "}
                h <span style={{ color: INK.muted }}>a week</span>
              </span>
            </span>
            <span
              className="relative block"
              style={{ width: SAVE.w, height: SAVE.h }}
            >
              <span
                data-save-idle
                className="absolute inset-0 flex items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold text-white"
                style={{ background: INK.slate }}
              >
                <Icon name="calendarCheck" size={17} stroke={2} />
                Save for the term
              </span>
              <span
                data-save-done
                className="absolute inset-0 flex items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold opacity-0"
                style={{
                  background: "rgba(78,125,58,0.13)",
                  color: INK.green,
                  boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.35)",
                }}
              >
                <Icon name="check" size={17} stroke={2.6} />
                Saved for the term
              </span>
            </span>
          </div>
        </div>

        {/* The week */}
        <div
          className="absolute"
          style={{
            ...CARD,
            left: GRID.x,
            top: GRID.y,
            width: GRID.w,
            height: GRID_H,
          }}
        >
          <div
            className="absolute inset-x-0 top-0 flex"
            style={{
              height: GRID.head,
              paddingLeft: GRID.gutter,
              boxShadow: `inset 0 -1px 0 ${INK.hair}`,
            }}
          >
            {DAYS.map((d) => (
              <div
                key={d}
                className="flex flex-1 items-center justify-center text-[14px] font-semibold"
                style={{ color: INK.muted }}
              >
                {d}
              </div>
            ))}
          </div>
          {Array.from({ length: HOURS }, (_, i) => (
            <div key={i}>
              <span
                className="absolute font-mono text-[12px] leading-none"
                style={{
                  top: GRID.head + i * GRID.row + 7,
                  right: GRID.w - GRID.gutter + 6,
                  color: INK.faint,
                }}
              >
                {FIRST + i}:00
              </span>
              {i > 0 && (
                <span
                  className="absolute h-px"
                  style={{
                    left: GRID.gutter,
                    right: 0,
                    top: GRID.head + i * GRID.row,
                    background: "rgba(68,88,121,0.1)",
                  }}
                />
              )}
            </div>
          ))}
          {DAYS.map((d, i) =>
            i === 0 ? null : (
              <span
                key={d}
                className="absolute w-px"
                style={{
                  top: GRID.head,
                  bottom: 8,
                  left: GRID.gutter + i * GRID.col,
                  background: "rgba(68,88,121,0.1)",
                }}
              />
            ),
          )}
        </div>

        {/* The hours she can teach, painted on arrival. */}
        {AVAIL.map((a, i) => {
          const b = cell(a.day, a.at, a.len);
          return (
            <div
              key={i}
              data-avail={i}
              className="absolute rounded-[10px] px-2 pt-[5px]"
              style={{
                ...b,
                background: CAN_TEACH.fill,
                boxShadow: `inset 0 0 0 1.5px ${CAN_TEACH.ring}`,
                clipPath: "inset(0% 0% 100% 0%)",
              }}
            >
              <span
                className="text-[12.5px] leading-[14px] font-bold"
                style={{ color: INK.green }}
              >
                Can teach
              </span>
            </div>
          );
        })}

        {/* The hour the planner offers instead, once she has asked. */}
        <div
          data-offer-slot
          className="absolute z-[2] flex flex-col justify-end rounded-[10px] px-2 pb-[5px] opacity-0"
          style={{
            ...cell(OFFER.day, OFFER.at),
            background: "rgba(251,175,219,0.35)",
            outline: `1.5px dashed ${GROUP_TONES["BCA-B"].ring}`,
            outlineOffset: -1.5,
          }}
        >
          <span
            className="text-[12px] leading-[14px] font-bold"
            style={{ color: GROUP_TONES["BCA-B"].ring }}
          >
            Suggested
          </span>
        </div>

        {/* The planner's tray */}
        <div
          className="absolute"
          style={{
            ...CARD,
            left: TRAY.x,
            top: TRAY.y,
            width: TRAY.w,
            height: TRAY.h,
          }}
        >
          <div
            className="absolute flex items-center justify-between"
            style={{ left: 14, right: 14, top: 13 }}
          >
            <span
              className="flex items-center gap-1.5 text-[13.5px] font-semibold"
              style={{ color: INK.muted }}
            >
              <Icon name="sparkles" size={15} stroke={2} />
              Planner
            </span>
            <span
              data-placed-line
              className="font-mono text-[13px] font-semibold tabular-nums"
              style={{ color: INK.ink }}
            >
              <span data-placed>0</span> of {LECTURES.length} placed
            </span>
          </div>
          <div
            className="font-display absolute text-[20px] leading-[24px] font-bold tracking-[-0.02em]"
            style={{ left: 14, top: 34 }}
          >
            Data Mining
          </div>
          {(Object.keys(TOKEN_ROWS) as Group[]).map((g) => (
            <div
              key={g}
              className="absolute flex items-center gap-1.5 text-[14px] font-semibold"
              style={{ left: 14, right: 14, top: TOKEN_ROWS[g] - TRAY.y - 24 }}
            >
              <span
                className="h-[12px] w-[12px] rounded-[4px]"
                style={{
                  background: GROUP_TONES[g].fill,
                  boxShadow: `inset 0 0 0 1px ${GROUP_TONES[g].ring}`,
                }}
              />
              {g}
              <span
                className="ml-auto text-[12.5px] font-medium"
                style={{ color: INK.muted }}
              >
                1 lab, 2 lectures
              </span>
            </div>
          ))}
          {/* Where each piece waited. */}
          {tokens.map((t, i) => (
            <span
              key={i}
              className="absolute rounded-[7px]"
              style={{
                left: t.x - TRAY.x,
                top: t.y - TRAY.y,
                width: t.w,
                height: t.h,
                outline: "1.5px dashed rgba(68,88,121,0.28)",
                outlineOffset: -1.5,
              }}
            />
          ))}
          <div
            className="absolute text-[13.5px] font-semibold"
            style={{ left: 14, right: 14, top: TRAY.h - 32, height: 20 }}
          >
            <span
              data-status-wait
              className="absolute inset-0 flex items-center gap-1.5"
              style={{ color: INK.muted }}
            >
              <Icon name="hourglass" size={15} stroke={2} />
              Waiting for your hours
            </span>
            <span
              data-status-done
              className="absolute inset-0 flex items-center gap-1.5 opacity-0"
              style={{ color: INK.green }}
            >
              <Icon name="checkCircle" size={16} stroke={2.2} />
              Placed, no clashes
            </span>
          </div>
        </div>

        {/* The coordinator's queue */}
        <div
          className="absolute"
          style={{
            ...CARD,
            left: QUEUE.x,
            top: QUEUE.y,
            width: QUEUE.w,
            height: QUEUE.h,
          }}
        >
          <div
            className="absolute flex items-center gap-2.5"
            style={{ left: 14, right: 12, top: 12 }}
          >
            <span
              className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white"
              style={{ background: "#7a2e8f" }}
            >
              M
            </span>
            <span className="flex min-w-0 flex-col leading-tight whitespace-nowrap">
              <span className="text-[14.5px] font-semibold">Dr. Mehta</span>
              <span className="text-[12.5px]" style={{ color: INK.muted }}>
                Coordinator&apos;s queue
              </span>
            </span>
            <span
              data-waiting-chip
              className="ml-auto flex h-[24px] min-w-[24px] items-center justify-center rounded-[8px] px-1.5 font-mono text-[13px] font-bold"
              style={{ background: "rgba(68,88,121,0.1)", color: INK.slate }}
            >
              <span data-waiting>0</span>
            </span>
          </div>
          <div
            className="absolute inset-x-0 h-px"
            style={{ top: 54, background: INK.hair }}
          />
          <div
            data-empty
            className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center gap-1.5 text-[14px] font-semibold"
            style={{ top: 55, color: INK.faint }}
          >
            <Icon name="inbox" size={24} stroke={1.8} />
            Nothing waiting
          </div>
        </div>

        {/* The lectures: in the tray, then on the week. */}
        {LECTURES.map((l, i) => (
          <Piece key={l.id} lecture={l} token={tokens[i]!} />
        ))}

        {/* 2: the menu on the changed lecture */}
        <div
          data-pop
          className="absolute z-10 w-[220px] rounded-[14px] bg-white p-1.5 opacity-0"
          style={{ left: POP.x, top: POP.y, boxShadow: ELEVATED }}
        >
          <div className="px-3 pt-2 pb-2.5">
            <div className="text-[15.5px] font-semibold">
              Data Mining, BCA-B
            </div>
            <div
              className="font-mono text-[12.5px]"
              style={{ color: INK.muted }}
            >
              Every Wed, 10:00 · 302
            </div>
          </div>
          <div className="mx-2 h-px" style={{ background: INK.hair }} />
          <div
            className="mt-1 flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[15.5px] font-medium"
            style={{ color: INK.ink }}
          >
            <Icon name="swap" size={18} stroke={2} />
            Ask to move
          </div>
          <div
            data-pop-cant
            className="flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[15.5px] font-semibold"
            style={{ color: INK.red }}
          >
            <Icon name="calendarX" size={18} stroke={2} />
            Can&apos;t teach this hour
          </div>
        </div>

        {/* 2: the change, in Dr. Mehta's queue */}
        <div
          data-req
          className="absolute z-[6] rounded-[14px] bg-white opacity-0"
          style={{
            left: REQ.x,
            top: REQ.y,
            width: REQ.w,
            height: REQ.h,
            boxShadow: ELEVATED,
          }}
        >
          <div className="absolute inset-x-3 top-3 flex items-center justify-between">
            <span
              className="rounded-[7px] px-2 py-[2px] text-[12px] font-semibold"
              style={{ background: "rgba(196,109,16,0.14)", color: "#8a4b0a" }}
            >
              Change
            </span>
            <span
              className="font-mono text-[12px]"
              style={{ color: INK.faint }}
            >
              now
            </span>
          </div>
          <div
            className="absolute inset-x-3 text-[14.5px] leading-[18px] font-bold"
            style={{ top: 38 }}
          >
            Can&apos;t teach Wed 10:00
          </div>
          <div
            className="absolute inset-x-3 text-[13px] leading-[16px]"
            style={{ top: 58, color: INK.muted }}
          >
            Data Mining, BCA-B
          </div>
          <div
            className="absolute inset-x-3 h-px"
            style={{ top: 84, background: INK.hair }}
          />
          <div
            data-offer
            className="absolute inset-x-3 flex items-center gap-1.5 text-[13px] font-semibold opacity-0"
            style={{ top: 93, color: INK.green }}
          >
            <Icon name="checkCircle" size={15} stroke={2.2} />
            <span>
              <span className="font-mono">Sat 10:00</span> is free
            </span>
          </div>
        </div>

        <Cursor x={paintFrom.x} y={paintFrom.y} className="cur-paint" />
        <Cursor x={actFrom.x} y={actFrom.y} className="cur-act" />
      </FacultyBrowser>
    </DemoBox>
  );
}

/**
 * One lecture: a token in the planner's tray at first, then, once it has
 * flown there, a block on the week. Its block face is laid out at the
 * block's own size, so nothing reflows as the piece grows in flight.
 */
function Piece({
  lecture: l,
  token: t,
}: {
  lecture: Lecture;
  token: { x: number; y: number; w: number; h: number };
}) {
  const tone = GROUP_TONES[l.group];
  const b = cell(l.day, l.at, l.lab ? 2 : 1);
  const changed = l.id === CHANGED.id;
  return (
    <div
      data-piece={l.id}
      className="absolute z-[4] rounded-[7px]"
      style={{
        left: t.x,
        top: t.y,
        width: t.w,
        height: t.h,
        background: tone.fill,
        boxShadow: "0px 0px 0px rgba(16,24,40,0)",
      }}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
      />
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <span
          data-token-face
          className="absolute inset-0 flex items-center justify-center font-mono text-[12.5px] font-bold"
          style={{ color: "rgba(13,17,23,0.75)" }}
        >
          {l.lab ? "Lab 2 h" : "1 h"}
        </span>
        <div
          data-block-face
          className="absolute top-0 left-0 opacity-0"
          style={{ width: b.width, height: b.height }}
        >
          <span className="block px-2 pt-[3px] text-[13.5px] leading-[15px] font-semibold">
            {l.lab ? "Data Mining Lab" : "Data Mining"}
          </span>
          <Room>{l.room}</Room>
        </div>
      </div>
      {changed && <Asked />}
    </div>
  );
}

function Room({ children }: { children: ReactNode }) {
  return (
    <span
      className="absolute inset-x-2 bottom-[3px] flex items-center gap-[3px] font-mono text-[12px] leading-[15px] font-medium"
      style={{ color: "rgba(44,49,53,0.8)" }}
    >
      <Icon name="mapPin" size={12} stroke={2.2} />
      {children}
    </span>
  );
}

/** The lecture she has asked to move: outlined, and tagged, until it's decided. */
function Asked() {
  const ring: CSSProperties = {
    outline: `2px dashed ${AMBER}`,
    outlineOffset: -1,
  };
  return (
    <>
      <span
        data-asked
        className="pointer-events-none absolute inset-0 rounded-[10px] opacity-0"
        style={{ ...ring, background: "rgba(255,255,255,0.35)" }}
      />
      <span
        data-asked-tag
        className="absolute -right-[6px] -bottom-[17px] rounded-[7px] px-1.5 py-[3px] text-[12px] leading-[14px] font-bold text-white opacity-0"
        style={{ background: AMBER, boxShadow: "0 0 0 2px #ffffff" }}
      >
        Asked
      </span>
    </>
  );
}
