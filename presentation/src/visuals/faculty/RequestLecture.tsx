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
  Toast,
  TOPBAR,
  useIntro,
} from "./_shell";

export interface RequestLectureProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

/**
 * A faculty member schedules an extra lecture themself, no call to the
 * coordinator.
 *
 * Builds (steps = 3):
 *   0 — group and week chosen: on arrival the free slots light up in green,
 *       only those with no clash for the teacher or the group, each with a
 *       room that has a projector. Every other hour says why it is not
 *       offered (your class, the group's class, lunch, no projector room).
 *   1 — the pointer travels to one and clicks: it becomes a confirmed class,
 *       "Booked · Room 304", and a note says no sign-off was needed (the
 *       request panel shows the sign-off switch the college can turn on).
 *   2 — the fan-out: notifications fly from the class to every student in
 *       BCA-A and to the coordinator; "0 mails written".
 *
 * The browser frame carries `flipId`, shared with TeachingWeek and
 * LectureLog, so the window holds still across the three feature slides.
 */

const DAYS = [
  { name: "Mon", date: 5 },
  { name: "Tue", date: 6 },
  { name: "Wed", date: 7 },
  { name: "Thu", date: 8 },
  { name: "Fri", date: 9 },
  { name: "Sat", date: 10 },
];
const FIRST = 9;
const HOURS = 8;
const LUNCH = 13;

const PANEL = { x: 16, y: TOPBAR + 14, w: 228 };
const FORM_H = 300;
const TOLD = { x: PANEL.x, y: PANEL.y + FORM_H + 12, w: PANEL.w, h: 192 };
const GRID = {
  x: 256,
  y: TOPBAR + 14,
  w: 528,
  h: 504,
  head: 38,
  gutter: 46,
  col: (528 - 46) / 6,
  row: 57,
};

type Why = "You" | "BCA-A" | "Room";

/** What is already taken, for the teacher ("You") or for the group. */
const BUSY: { day: number; at: number; len?: number; who: Why }[] = [
  { day: 0, at: 9, who: "You" },
  { day: 0, at: 10, who: "BCA-A" },
  { day: 0, at: 11, who: "You" },
  { day: 0, at: 12, who: "BCA-A" },
  { day: 0, at: 14, len: 2, who: "You" },
  { day: 1, at: 9, who: "BCA-A" },
  { day: 1, at: 10, who: "You" },
  { day: 1, at: 12, who: "You" },
  { day: 1, at: 15, who: "You" },
  { day: 2, at: 9, who: "You" },
  { day: 2, at: 10, who: "BCA-A" },
  { day: 2, at: 11, who: "You" },
  { day: 2, at: 12, who: "BCA-A" },
  { day: 2, at: 14, len: 2, who: "You" },
  { day: 3, at: 9, who: "BCA-A" },
  { day: 3, at: 10, who: "You" },
  { day: 3, at: 11, who: "BCA-A" },
  { day: 4, at: 9, who: "You" },
  { day: 4, at: 10, who: "BCA-A" },
  { day: 4, at: 11, who: "You" },
  { day: 4, at: 12, who: "BCA-A" },
  { day: 4, at: 14, who: "BCA-A" },
  { day: 5, at: 10, len: 2, who: "You" },
];

/** Clash-free, and a room with a projector. */
const FREE: { id: string; day: number; at: number; room: string }[] = [
  { id: "tue11", day: 1, at: 11, room: "304" },
  { id: "tue14", day: 1, at: 14, room: "Lab 2" },
  { id: "wed16", day: 2, at: 16, room: "301" },
  { id: "thu12", day: 3, at: 12, room: "304" },
  { id: "thu15", day: 3, at: 15, room: "304" },
  { id: "fri15", day: 4, at: 15, room: "Lab 2" },
  { id: "sat12", day: 5, at: 12, room: "304" },
];
const PICK = FREE[0]!;

/**
 * Every other hour has no room with a projector free: worked out from the
 * two lists above, and runs of them in a day drawn as one block.
 */
const NO_ROOM = (() => {
  const taken = (day: number, at: number) =>
    at === LUNCH ||
    BUSY.some((b) => b.day === day && at >= b.at && at < b.at + (b.len ?? 1)) ||
    FREE.some((f) => f.day === day && f.at === at);
  const out: { day: number; at: number; len: number }[] = [];
  DAYS.forEach((_, day) => {
    for (let at = FIRST; at < FIRST + HOURS; at++) {
      if (taken(day, at)) continue;
      const last = out[out.length - 1];
      if (last?.day === day && last.at + last.len === at) last.len++;
      else out.push({ day, at, len: 1 });
    }
  });
  return out;
})();

const box = (day: number, at: number, len = 1) => ({
  left: GRID.gutter + day * GRID.col + 3,
  top: GRID.head + (at - FIRST) * GRID.row + 3,
  width: GRID.col - 6,
  height: len * GRID.row - 6,
});

/** Where the booked class sits, in page pixels: the fan-out starts here. */
const pickBox = box(PICK.day, PICK.at);
const PICKED = {
  x: GRID.x + pickBox.left + pickBox.width / 2,
  y: GRID.y + pickBox.top + pickBox.height / 2,
};
const NOTE = {
  x: GRID.x + pickBox.left + pickBox.width + 10,
  y: GRID.y + pickBox.top - 6,
};

/** The people who will be told, in the "Will be told" card's pixels. */
const STUDENT_FACES = [
  "#7dc7fa",
  "#fbafdb",
  "#8e9cf8",
  "#40f8d4",
  "#ffc667",
  "#d77ce0",
];
const FACE = 38;
const FACE_STEP = 24;
const FACES_Y = 72;
const COORD_Y = 126;
const facesLocal = STUDENT_FACES.map((_, i) => ({
  x: 16 + FACE / 2 + i * FACE_STEP,
  y: FACES_Y + FACE / 2,
}));
const MORE_W = 46;
const MORE_LOCAL = { x: TOLD.w - 16 - MORE_W / 2, y: FACES_Y + FACE / 2 };
const COORD_LOCAL = { x: 16 + FACE / 2, y: COORD_Y + FACE / 2 };
/** The same people, in page pixels: where the notifications land. */
const TARGETS = [...facesLocal, MORE_LOCAL, COORD_LOCAL].map((p) => ({
  x: TOLD.x + p.x,
  y: TOLD.y + p.y,
}));

const HATCH: Record<Why, { bg: string; ring: string; ink: string }> = {
  You: {
    bg: "repeating-linear-gradient(135deg, #f0f2f5 0 6px, #e6e9ee 6px 12px)",
    ring: "inset 0 0 0 1px rgba(68,88,121,0.16)",
    ink: "rgba(44,49,53,0.5)",
  },
  "BCA-A": {
    bg: "repeating-linear-gradient(135deg, #f0f2f5 0 6px, #e6e9ee 6px 12px)",
    ring: "inset 0 0 0 1px rgba(68,88,121,0.16)",
    ink: "rgba(44,49,53,0.5)",
  },
  Room: {
    bg: "repeating-linear-gradient(135deg, #f7f8fa 0 3px, #eff1f4 3px 6px)",
    ring: "inset 0 0 0 1px rgba(68,88,121,0.1)",
    ink: "rgba(44,49,53,0.4)",
  },
};
const WHY_LABEL: Record<Why, string> = {
  You: "Your class",
  "BCA-A": "BCA-A class",
  Room: "No projector",
};

export function RequestLecture({ step, active, flipId }: RequestLectureProps) {
  const scope = useRef<HTMLDivElement>(null);
  const start = { x: 700, y: 540 };

  useIntro(scope, { active, step }, (tl) => {
    tl.fromTo(
      "[data-free]",
      { scale: 0.7, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.5,
        ease: "back.out(1.8)",
        stagger: 0.08,
      },
    );
  });

  useSteps(scope, step, (tl, mark) => {
    // 1 — the pointer goes to a slot and books it.
    tl.to("[data-cursor]", { opacity: 1, duration: 0.2 });
    tl.to(
      "[data-cursor]",
      {
        x: PICKED.x - start.x,
        y: PICKED.y - start.y,
        duration: 0.8,
        ease: "power3.inOut",
      },
      "<",
    );
    tl.to(
      "[data-pick] [data-free-face]",
      {
        boxShadow: `inset 0 0 0 2px ${INK.green}, 0 6px 14px -4px rgba(16,24,40,0.22)`,
        duration: 0.2,
      },
      ">-0.15",
    );
    click(tl, "[data-cursor]");
    tl.fromTo(
      "[data-booked]",
      { clipPath: "circle(0% at 50% 50%)" },
      {
        clipPath: "circle(75% at 50% 50%)",
        duration: 0.55,
        ease: "power2.out",
      },
      "<0.05",
    );
    tl.to(
      "[data-other]",
      {
        scale: 0.6,
        opacity: 0,
        duration: 0.4,
        ease: "power2.in",
        stagger: 0.04,
      },
      "<0.15",
    );
    tl.to(
      "[data-cursor]",
      {
        x: PICKED.x - start.x - 40,
        y: PICKED.y - start.y + 90,
        duration: 0.6,
        ease: "power2.inOut",
      },
      "<0.1",
    );
    tl.fromTo(
      "[data-note]",
      { opacity: 0, scale: 0.9, x: -12 },
      {
        opacity: 1,
        scale: 1,
        x: 0,
        duration: 0.4,
        ease: "power3.out",
        transformOrigin: "0% 50%",
      },
      "<0.1",
    );
    mark();

    // 2 — the fan-out: every student and the coordinator are told.
    tl.to("[data-cursor]", { opacity: 0, duration: 0.25 });
    tl.addLabel("fan", "<0.1");
    TARGETS.forEach((t, i) => {
      const chip = `[data-chip="${i}"]`;
      const dx = t.x - PICKED.x;
      const dy = t.y - PICKED.y;
      const t0 = i * 0.08;
      tl.fromTo(
        chip,
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1, duration: 0.2, ease: "power2.out" },
        `fan+=${t0}`,
      );
      tl.fromTo(
        chip,
        { x: 0, y: 0 },
        {
          motionPath: {
            path: [
              { x: 0, y: 0 },
              { x: dx * 0.45 + 30, y: dy * 0.3 - 50 - i * 6 },
              { x: dx, y: dy },
            ],
            curviness: 1.2,
          },
          duration: 0.9,
          ease: "power2.inOut",
          immediateRender: false,
        },
        `fan+=${t0 + 0.02}`,
      );
      tl.to(
        chip,
        { scale: 0.3, opacity: 0, duration: 0.14, ease: "power2.in" },
        `fan+=${t0 + 0.86}`,
      );
      tl.fromTo(
        `[data-tick="${i}"]`,
        { scale: 1.6, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.35, ease: "power3.out" },
        `fan+=${t0 + 0.86}`,
      );
    });
    const told = { n: 0 };
    tl.to(
      told,
      {
        n: 62,
        duration: 0.75,
        ease: "power1.inOut",
        onUpdate: () => {
          const el = scope.current?.querySelector("[data-told-count]");
          if (el) el.textContent = `${Math.round(told.n)} of 62 told`;
        },
      },
      "fan+=0.9",
    );
    tl.to(
      "[data-told-count]",
      { color: INK.green, duration: 0.3 },
      `fan+=${0.86 + (TARGETS.length - 1) * 0.08}`,
    );
    // The eye goes to the people before the toast says it.
    tl.to(
      "[data-told-card]",
      { scale: 1.06, duration: 0.2, ease: "power2.out" },
      `fan+=${0.86 + (TARGETS.length - 1) * 0.08 + 0.2}`,
    );
    tl.to("[data-told-card]", { scale: 1, duration: 0.25, ease: "power2.in" });
    tl.fromTo(
      "[data-toast]",
      { y: 110 },
      { y: 0, duration: 0.6, ease: "power3.out" },
      "<0.05",
    );
    mark();
  });

  return (
    <DemoBox scope={scope}>
      <FacultyBrowser
        flipId={flipId}
        path="schedule/new"
        tab={1}
        user="Prof. Kulkarni"
        role="Faculty · BCA"
      >
        {/* The request */}
        <div
          className="absolute"
          style={{
            ...CARD,
            left: PANEL.x,
            top: PANEL.y,
            width: PANEL.w,
            height: FORM_H,
          }}
        >
          <div className="absolute inset-x-[16px]" style={{ top: 16 }}>
            <div
              className="text-[13.5px] leading-[17px] font-semibold"
              style={{ color: INK.muted }}
            >
              New lecture
            </div>
            <div className="font-display mt-0.5 text-[21px] leading-[26px] font-bold tracking-[-0.02em]">
              Schedule a lecture
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <Field label="Group">
                <span
                  className="h-[11px] w-[11px] shrink-0 rounded-full"
                  style={{
                    background: GROUP_TONES["BCA-A"].fill,
                    boxShadow: `inset 0 0 0 1px ${GROUP_TONES["BCA-A"].ring}`,
                  }}
                />
                <span className="font-semibold">BCA-A</span>
                <span
                  className="ml-auto font-mono text-[12.5px]"
                  style={{ color: INK.muted }}
                >
                  62
                </span>
              </Field>
              <Field label="Course">
                <span className="truncate">Web Tech</span>
              </Field>
              <Field label="Week">
                <Icon
                  name="chevronLeft"
                  size={15}
                  stroke={2}
                  color={INK.faint}
                />
                <span className="flex-1 text-center">5-10 Oct</span>
                <Icon
                  name="chevronRight"
                  size={15}
                  stroke={2}
                  color={INK.faint}
                />
              </Field>
            </div>
            <div className="mt-2.5 flex gap-2">
              <span
                className="flex h-[30px] items-center gap-1.5 rounded-[10px] px-2.5 text-[14px] font-semibold text-white"
                style={{ background: INK.slate }}
              >
                <Icon name="monitor" size={16} stroke={2} />
                Projector
              </span>
              <span
                className="flex h-[30px] items-center rounded-[10px] px-2.5 text-[14px] font-semibold"
                style={{
                  background: "#f3f4f6",
                  boxShadow: `inset 0 0 0 1px ${INK.hair}`,
                }}
              >
                1 hour
              </span>
            </div>
            <div className="mt-3 h-px" style={{ background: INK.hair }} />
            <div className="mt-2.5 flex items-center justify-between">
              <span className="flex flex-col leading-tight">
                <span className="text-[14px] font-semibold">
                  Coordinator sign-off
                </span>
                <span className="text-[12.5px]" style={{ color: INK.muted }}>
                  Off · books straight away
                </span>
              </span>
              <span
                className="relative h-[22px] w-[38px] shrink-0 rounded-full"
                style={{
                  background: "#dfe3e9",
                  boxShadow: `inset 0 0 0 1px ${INK.hair}`,
                }}
              >
                <span
                  className="absolute top-[3px] left-[3px] h-[16px] w-[16px] rounded-full bg-white"
                  style={{ boxShadow: "0 1px 3px rgba(16,24,40,0.25)" }}
                />
              </span>
            </div>
          </div>
        </div>

        {/* Who will be told — the fan-out lands here. */}
        <div
          data-told-card
          className="absolute"
          style={{
            ...CARD,
            left: TOLD.x,
            top: TOLD.y,
            width: TOLD.w,
            height: TOLD.h,
          }}
        >
          <div
            className="absolute text-[13.5px] leading-[17px] font-semibold"
            style={{ left: 16, top: 15, color: INK.muted }}
          >
            Will be told
          </div>
          <div
            data-told-count
            className="absolute font-mono text-[16px] leading-[22px] font-semibold tabular-nums"
            style={{ left: 16, top: 36, color: INK.ink }}
          >
            0 of 62 told
          </div>
          {facesLocal.map((f, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                ...faceBox(f),
                background: `radial-gradient(circle at 50% 38%, rgba(255,255,255,0.8) 0 21%, transparent 22%), radial-gradient(circle at 50% 100%, rgba(255,255,255,0.8) 0 37%, transparent 38%), ${STUDENT_FACES[i]}`,
                boxShadow: "0 0 0 2px #ffffff",
              }}
            >
              <Tick index={i} />
            </span>
          ))}
          <span
            className="absolute flex items-center justify-center rounded-full font-mono text-[13px] font-bold"
            style={{
              left: MORE_LOCAL.x - MORE_W / 2,
              top: MORE_LOCAL.y - FACE / 2,
              width: MORE_W,
              height: FACE,
              background: "#eef0f3",
              color: INK.ink,
              boxShadow: "0 0 0 2px #ffffff",
            }}
          >
            +56
            <Tick index={6} />
          </span>
          <span
            className="absolute flex items-center justify-center rounded-full text-[15px] font-bold text-white"
            style={{ ...faceBox(COORD_LOCAL), background: "#7a2e8f" }}
          >
            M
            <Tick index={7} />
          </span>
          <span
            className="absolute flex flex-col leading-tight"
            style={{ left: COORD_LOCAL.x + FACE / 2 + 10, top: COORD_Y + 1 }}
          >
            <span className="text-[15px] font-semibold">Dr. Mehta</span>
            <span className="text-[12.5px]" style={{ color: INK.muted }}>
              Coordinator
            </span>
          </span>
        </div>

        {/* The week, with the clash-free slots */}
        <div
          className="absolute"
          style={{
            ...CARD,
            left: GRID.x,
            top: GRID.y,
            width: GRID.w,
            height: GRID.h,
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
                key={d.name}
                className="flex flex-1 items-center justify-center gap-1.5"
              >
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: INK.muted }}
                >
                  {d.name}
                </span>
                <span className="font-display text-[15px] font-bold">
                  {d.date}
                </span>
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
                key={d.name}
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

          {[
            ...BUSY.map((b) => ({ ...b, len: b.len ?? 1 })),
            ...NO_ROOM.map((n) => ({ ...n, who: "Room" as const })),
          ].map((b) => (
            <div
              key={`${b.day}-${b.at}`}
              className="absolute rounded-[9px] px-1.5 py-[5px] text-[12.5px] leading-[14px] font-semibold"
              style={{
                ...box(b.day, b.at, b.len),
                background: HATCH[b.who].bg,
                boxShadow: HATCH[b.who].ring,
                color: HATCH[b.who].ink,
              }}
            >
              {WHY_LABEL[b.who]}
            </div>
          ))}

          {/* Lunch, for everyone. */}
          <div
            className="absolute flex items-center justify-center gap-2 rounded-[9px] text-[13px] font-semibold"
            style={{
              ...box(0, LUNCH),
              width: GRID.col * DAYS.length - 6,
              background: "#f4f5f7",
              boxShadow: "inset 0 0 0 1px rgba(68,88,121,0.1)",
              color: "rgba(44,49,53,0.42)",
            }}
          >
            <Icon name="coffee" size={15} stroke={2} />
            Lunch break
          </div>

          {FREE.map((f) => (
            <div
              key={f.id}
              {...(f.id === PICK.id
                ? { "data-pick": "" }
                : { "data-other": "" })}
              className="absolute"
              style={box(f.day, f.at)}
            >
              <div data-free className="absolute inset-0">
                <div
                  data-free-face
                  className="absolute inset-0 flex flex-col justify-between rounded-[9px] px-1.5 pt-[4px] pb-[5px]"
                  style={{
                    background: "#dcf1d2",
                    boxShadow: `inset 0 0 0 1.5px ${INK.green}`,
                  }}
                >
                  <span
                    className="pl-0.5 text-[13.5px] leading-[16px] font-bold"
                    style={{ color: INK.green }}
                  >
                    Free
                  </span>
                  <span
                    className="flex items-center gap-[3px] self-start rounded-full bg-white px-1 py-[1px] font-mono text-[12px] leading-[16px] font-semibold whitespace-nowrap"
                    style={{
                      color: INK.ink,
                      boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.35)",
                    }}
                  >
                    <Icon name="monitor" size={12} stroke={2.2} />
                    {f.room}
                  </span>
                </div>
                {f.id === PICK.id && (
                  <div
                    data-booked
                    className="absolute inset-0 flex flex-col justify-between rounded-[9px] px-1.5 pt-[4px] pb-[6px]"
                    style={{
                      background: GROUP_TONES["BCA-A"].fill,
                      boxShadow: `inset 0 0 0 1.5px ${GROUP_TONES["BCA-A"].ring}`,
                      clipPath: "circle(0% at 50% 50%)",
                    }}
                  >
                    <span className="pl-0.5 text-[14px] leading-[17px] font-bold">
                      Booked
                    </span>
                    <span
                      className="pl-0.5 font-mono text-[12.5px] leading-[15px] font-semibold"
                      style={{ color: "rgba(13,17,23,0.75)" }}
                    >
                      Room 304
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 1 — what the tap did. */}
        <div
          data-note
          className="absolute z-[4] flex items-center gap-3 rounded-[14px] bg-white py-2.5 pr-4 pl-3 opacity-0"
          style={{
            left: NOTE.x,
            top: NOTE.y,
            boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 2px 4px rgba(16,24,40,0.04), 0 18px 40px -14px rgba(16,24,40,0.26)`,
          }}
        >
          <span
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(78,125,58,0.14)", color: INK.green }}
          >
            <Icon name="check" size={19} stroke={2.6} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[15.5px] font-bold whitespace-nowrap">
              Booked, Tue 11:00 · 304
            </span>
            <span
              className="text-[13px] whitespace-nowrap"
              style={{ color: INK.muted }}
            >
              Confirmed, no sign-off needed
            </span>
          </span>
        </div>

        {/* The notifications in flight. */}
        {TARGETS.map((_, i) => (
          <span
            key={i}
            data-chip={i}
            className="absolute z-[5] flex items-center justify-center rounded-full bg-white opacity-0"
            style={{
              left: PICKED.x - 15,
              top: PICKED.y - 15,
              width: 30,
              height: 30,
              color: INK.slate,
              boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 6px 14px -4px rgba(16,24,40,0.26)`,
            }}
          >
            <Icon name="bell" size={16} stroke={2.2} />
          </span>
        ))}

        <Toast style={{ left: GRID.x + GRID.w / 2 }}>
          Everyone in BCA-A told · 0 mails written
        </Toast>
        <Cursor x={start.x} y={start.y} />
      </FacultyBrowser>
    </DemoBox>
  );
}

function faceBox(c: { x: number; y: number }): CSSProperties {
  return {
    left: c.x - FACE / 2,
    top: c.y - FACE / 2,
    width: FACE,
    height: FACE,
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="flex h-[34px] items-center gap-2 rounded-[10px] px-3 text-[14.5px]"
      style={{
        background: "#f6f7f9",
        boxShadow: `inset 0 0 0 1px ${INK.hair}`,
      }}
    >
      <span
        className="w-[50px] shrink-0 text-[12.5px] font-semibold"
        style={{ color: INK.muted }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/** A green ring that closes round a face when its notification lands. */
function Tick({ index }: { index: number }) {
  return (
    <span
      data-tick={index}
      className="pointer-events-none absolute -inset-[4px] rounded-full opacity-0"
      style={{
        boxShadow: `inset 0 0 0 3px ${INK.green}`,
      }}
    />
  );
}
