"use client";

import { useRef } from "react";

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
  type GroupId,
} from "./_shell";

export interface TeachingWeekProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

/**
 * One teacher's whole week across divisions and electives, in one place.
 *
 * Builds (steps = 3), following the speaker's notes:
 *   0 — the week, coloured by group, with a legend. The elective that BCA-A
 *       and BCA-B take together is one block with a stacked group badge.
 *   1 — when a lecture moves, it moves in your week too: the coordinator
 *       moves that combined lecture and the block travels to its new day,
 *       hour and room, and a banner says so.
 *   2 — cancel once: the pointer opens a class and cancels it; it greys out
 *       and a toast says "62 timetables updated": every student's timetable
 *       follows.
 *
 * The browser frame carries `flipId`, shared with RequestLecture and
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
const HOURS = 7; // 9:00 to 16:00

/** The grid card, in page pixels. */
const GRID = {
  x: 16,
  y: TOPBAR + 74,
  w: 768,
  head: 38,
  gutter: 50,
  col: (768 - 50) / 6,
  row: 57,
};
const GRID_H = GRID.head + HOURS * GRID.row + 8;

type Group = GroupId | "AB";

interface Sitting {
  id: string;
  day: number;
  at: number;
  len?: number;
  title: string;
  group: Group;
  room: string;
}

const WEEK: Sitting[] = [
  {
    id: "m9",
    day: 0,
    at: 9,
    title: "Web Technologies",
    group: "BCA-A",
    room: "301",
  },
  {
    id: "m11",
    day: 0,
    at: 11,
    title: "Software Testing",
    group: "BBA(IT)-A",
    room: "304",
  },
  {
    id: "m14",
    day: 0,
    at: 14,
    len: 2,
    title: "Web Tech Lab",
    group: "BCA-B",
    room: "Lab 2",
  },
  {
    id: "t10",
    day: 1,
    at: 10,
    title: "Web Technologies",
    group: "BCA-B",
    room: "302",
  },
  {
    id: "t12",
    day: 1,
    at: 12,
    title: "Cloud Computing",
    group: "AB",
    room: "304",
  },
  {
    id: "t15",
    day: 1,
    at: 15,
    title: "Software Testing",
    group: "BBA(IT)-A",
    room: "304",
  },
  {
    id: "w9",
    day: 2,
    at: 9,
    title: "Web Technologies",
    group: "BCA-A",
    room: "301",
  },
  {
    id: "w11",
    day: 2,
    at: 11,
    title: "Web Technologies",
    group: "BCA-B",
    room: "302",
  },
  {
    id: "w14",
    day: 2,
    at: 14,
    len: 2,
    title: "Testing Lab",
    group: "BBA(IT)-A",
    room: "Lab 2",
  },
  {
    id: "h13",
    day: 3,
    at: 13,
    title: "Web Technologies",
    group: "BCA-A",
    room: "301",
  },
  {
    id: "f9",
    day: 4,
    at: 9,
    title: "Software Testing",
    group: "BBA(IT)-A",
    room: "304",
  },
  {
    id: "f11",
    day: 4,
    at: 11,
    title: "Web Technologies",
    group: "BCA-B",
    room: "302",
  },
  {
    id: "s10",
    day: 5,
    at: 10,
    len: 2,
    title: "Web Tech Lab",
    group: "BCA-A",
    room: "Lab 2",
  },
];

/** The combined elective the coordinator moves in build 1. */
const MOVED = { from: { day: 3, at: 10 }, to: { day: 4, at: 14 } };
/** The class cancelled in build 2. */
const CANCELLED = WEEK.find((s) => s.id === "w11")!;

const ELECTIVE_FILL = `linear-gradient(115deg, ${GROUP_TONES["BCA-A"].fill} 0%, ${GROUP_TONES["BCA-A"].fill} 38%, ${GROUP_TONES["BCA-B"].fill} 62%, ${GROUP_TONES["BCA-B"].fill} 100%)`;

const box = (day: number, at: number, len = 1) => ({
  left: GRID.gutter + day * GRID.col + 3,
  top: GRID.head + (at - FIRST) * GRID.row + 2,
  width: GRID.col - 6,
  height: len * GRID.row - 4,
});

/** Page coordinates of a point inside the grid card. */
const page = (x: number, y: number) => ({ x: GRID.x + x, y: GRID.y + y });

export function TeachingWeek({ step, flipId }: TeachingWeekProps) {
  const scope = useRef<HTMLDivElement>(null);

  const cancelBox = box(CANCELLED.day, CANCELLED.at);
  const blockCentre = page(
    cancelBox.left + cancelBox.width * 0.55,
    cancelBox.top + cancelBox.height * 0.55,
  );
  const pop = {
    x: GRID.x + cancelBox.left + cancelBox.width + 10,
    y: GRID.y + cancelBox.top - 30,
  };
  const cancelRow = { x: pop.x + 100, y: pop.y + 123 };
  const start = { x: 720, y: 540 };

  useSteps(scope, step, (tl, mark) => {
    // 1 — the coordinator moves the combined lecture; it moves in your week.
    tl.fromTo(
      "[data-banner]",
      { y: -90 },
      { y: 0, duration: 0.7, ease: "power3.out" },
    );
    tl.to(
      "[data-moved]",
      {
        scale: 1.06,
        boxShadow: "0px 16px 30px rgba(16,24,40,0.2)",
        duration: 0.3,
        ease: "power2.out",
      },
      "-=0.25",
    );
    tl.to("[data-moved]", {
      x: (MOVED.to.day - MOVED.from.day) * GRID.col,
      y: (MOVED.to.at - MOVED.from.at) * GRID.row,
      duration: 0.9,
      ease: "deck.morph",
    });
    tl.fromTo(
      "[data-ghost]",
      { opacity: 0 },
      { opacity: 1, duration: 0.4, ease: "power1.out" },
      "<0.1",
    );
    tl.to(
      "[data-moved-room-old]",
      { yPercent: -100, opacity: 0, duration: 0.3, ease: "power2.in" },
      "<0.45",
    );
    tl.fromTo(
      "[data-moved-room-new]",
      { yPercent: 100, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      "<0.15",
    );
    tl.to(
      "[data-moved]",
      {
        scale: 1,
        boxShadow: "0px 0px 0px rgba(16,24,40,0)",
        duration: 0.35,
        ease: "power2.out",
      },
      ">-0.1",
    );
    tl.fromTo(
      "[data-moved-tag]",
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" },
      "<",
    );
    mark();

    // 2 — cancel once; every student's timetable updates.
    tl.to("[data-banner]", { y: -90, duration: 0.5, ease: "power3.in" });
    tl.to("[data-cursor]", { opacity: 1, duration: 0.2 }, "<0.1");
    tl.to(
      "[data-cursor]",
      {
        x: blockCentre.x - start.x,
        y: blockCentre.y - start.y,
        duration: 0.75,
        ease: "power3.inOut",
      },
      "<",
    );
    click(tl, "[data-cursor]");
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
      "[data-cursor]",
      {
        x: cancelRow.x - start.x,
        y: cancelRow.y - start.y,
        duration: 0.5,
        ease: "power3.inOut",
      },
      ">0.05",
    );
    tl.to(
      "[data-pop-cancel]",
      { backgroundColor: "rgba(220,56,72,0.1)", duration: 0.15 },
      ">-0.12",
    );
    click(tl, "[data-cursor]");
    tl.to(
      "[data-pop]",
      { opacity: 0, scale: 0.95, duration: 0.22, ease: "power2.in" },
      ">-0.05",
    );
    tl.fromTo(
      "[data-cancelled]",
      { opacity: 0 },
      { opacity: 1, duration: 0.35, ease: "power1.out" },
      "<",
    );
    tl.fromTo(
      "[data-strike]",
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 0.4,
        ease: "power2.inOut",
        transformOrigin: "0% 50%",
      },
      "<0.15",
    );
    tl.to(
      "[data-cursor]",
      {
        x: cancelRow.x - start.x + 60,
        y: cancelRow.y - start.y + 70,
        opacity: 0,
        duration: 0.5,
        ease: "power2.inOut",
      },
      "<",
    );
    tl.fromTo(
      "[data-toast]",
      { y: 110 },
      { y: 0, duration: 0.6, ease: "power3.out" },
      "<0.1",
    );
    mark();
  });

  return (
    <DemoBox scope={scope}>
      <FacultyBrowser
        flipId={flipId}
        path="week"
        tab={0}
        user="Prof. Kulkarni"
        role="Faculty · BCA"
      >
        {/* Heading and legend */}
        <div
          className="absolute flex items-end justify-between"
          style={{ left: 16, right: 16, top: TOPBAR + 12, height: 52 }}
        >
          <div>
            <div
              className="text-[14px] leading-[18px] font-semibold"
              style={{ color: INK.muted }}
            >
              Week of 5 Oct
            </div>
            <div className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em]">
              My teaching week
            </div>
          </div>
          <div
            className="flex items-center gap-4 pb-1 text-[14.5px] font-semibold"
            style={{ color: INK.ink }}
          >
            {(Object.keys(GROUP_TONES) as GroupId[]).map((g) => (
              <span key={g} className="flex items-center gap-1.5">
                <span
                  className="h-[13px] w-[13px] rounded-[4px]"
                  style={{
                    background: GROUP_TONES[g].fill,
                    boxShadow: `inset 0 0 0 1px ${GROUP_TONES[g].ring}`,
                  }}
                />
                {g}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <GroupStack size={18} />
              Elective
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
                className="absolute font-mono text-[12.5px] leading-none"
                style={{
                  top: GRID.head + i * GRID.row + 6,
                  right: GRID.w - GRID.gutter + 7,
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

          {WEEK.map((s) => (
            <Block key={s.id} sitting={s} cancellable={s.id === CANCELLED.id} />
          ))}

          {/* Where the moved lecture was. */}
          <svg
            data-ghost
            className="absolute"
            style={{ ...box(MOVED.from.day, MOVED.from.at), opacity: 0 }}
            aria-hidden
          >
            <rect
              x="1"
              y="1"
              width={GRID.col - 8}
              height={GRID.row - 6}
              rx="9"
              fill="rgba(68,88,121,0.05)"
              stroke="rgba(68,88,121,0.45)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          </svg>

          {/* The combined elective that moves. */}
          <div
            data-moved
            className="absolute z-[2] rounded-[10px]"
            style={{
              ...box(MOVED.from.day, MOVED.from.at),
              background: ELECTIVE_FILL,
              boxShadow: "0px 0px 0px rgba(16,24,40,0)",
            }}
          >
            <span
              className="absolute inset-0 rounded-[10px]"
              style={{ boxShadow: "inset 0 0 0 1px rgba(13,17,23,0.32)" }}
            />
            <BlockTitle>Cloud Computing</BlockTitle>
            <span className="absolute inset-x-2 bottom-[3px] flex items-center justify-between">
              <span className="relative block h-[15px] flex-1 overflow-hidden">
                <span data-moved-room-old className="absolute inset-0">
                  <Room>304</Room>
                </span>
                <span
                  data-moved-room-new
                  className="absolute inset-0 opacity-0"
                >
                  <Room>Lab 2</Room>
                </span>
              </span>
              <GroupStack size={16} />
            </span>
            <span
              data-moved-tag
              className="absolute -top-[14px] -right-[8px] rounded-[7px] px-2 py-[3px] text-[13px] leading-[15px] font-bold text-white opacity-0"
              style={{ background: "#c46d10", boxShadow: "0 0 0 2px #ffffff" }}
            >
              Moved
            </span>
          </div>
        </div>

        {/* 1 — the change, from the coordinator: one line under the app bar,
            so the days the class moves between stay in view. */}
        <div
          data-banner
          className="absolute z-10 flex items-center gap-3 rounded-[14px] bg-white pr-4 pl-2"
          style={{
            left: 16,
            right: 16,
            top: TOPBAR + 10,
            height: 54,
            transform: "translateY(-90px)",
            boxShadow: `inset 0 0 0 1.5px rgba(217,119,31,0.5), 0 2px 4px rgba(16,24,40,0.04), 0 16px 36px -14px rgba(16,24,40,0.24)`,
          }}
        >
          <span
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "rgba(246,167,59,0.18)", color: "#c46d10" }}
          >
            <Icon name="bell" size={21} stroke={2} />
          </span>
          <span className="text-[17px] font-bold whitespace-nowrap">
            Cloud Computing moved
          </span>
          <span
            className="font-mono text-[15px] font-semibold whitespace-nowrap"
            style={{ color: INK.ink }}
          >
            Thu 10:00 → Fri 14:00 · Lab 2
          </span>
          <span
            className="ml-auto text-[13.5px] whitespace-nowrap"
            style={{ color: INK.muted }}
          >
            now
          </span>
        </div>

        {/* 2 — the class menu, and the confirmation. */}
        <div
          data-pop
          className="absolute z-10 w-[214px] rounded-[14px] bg-white p-1.5 opacity-0"
          style={{
            left: pop.x,
            top: pop.y,
            boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 2px 4px rgba(16,24,40,0.04), 0 18px 40px -14px rgba(16,24,40,0.26)`,
          }}
        >
          <div className="px-3 pt-2 pb-2.5">
            <div className="text-[15.5px] font-semibold">Web Technologies</div>
            <div
              className="font-mono text-[12.5px]"
              style={{ color: INK.muted }}
            >
              BCA-B, Wed 11:00 · 302
            </div>
          </div>
          <div className="mx-2 h-px" style={{ background: INK.hair }} />
          <div
            className="mt-1 flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[15.5px] font-medium"
            style={{ color: INK.ink }}
          >
            <Icon name="swap" size={18} stroke={2} />
            Move
          </div>
          <div
            data-pop-cancel
            className="flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[15.5px] font-semibold"
            style={{ color: INK.red }}
          >
            <Icon name="calendarX" size={18} stroke={2} />
            Cancel class
          </div>
        </div>

        {/* Bottom right, over the empty end of the week, not over a class. */}
        <Toast style={{ left: "auto", right: 16, translate: "none" }}>
          Cancelled · 62 timetables updated
        </Toast>

        <Cursor x={start.x} y={start.y} />
      </FacultyBrowser>
    </DemoBox>
  );
}

/** Two group dots, stacked: a class two divisions take together. */
function GroupStack({ size }: { size: number }) {
  return (
    <span className="inline-flex shrink-0 items-center">
      {(["BCA-A", "BCA-B"] as const).map((g, i) => (
        <span
          key={g}
          className="flex items-center justify-center rounded-full font-mono font-bold"
          style={{
            width: size,
            height: size,
            marginLeft: i === 0 ? 0 : -size * 0.2,
            fontSize: size * 0.52,
            background: GROUP_TONES[g].fill,
            color: GROUP_TONES[g].ring,
            boxShadow: `0 0 0 1.5px #ffffff, inset 0 0 0 1px ${GROUP_TONES[g].ring}`,
          }}
        >
          {g.slice(-1)}
        </span>
      ))}
    </span>
  );
}

function BlockTitle({ children }: { children: string }) {
  return (
    <span className="relative block px-2 pt-[1px] text-[14.5px] leading-[15px] font-semibold">
      {children}
    </span>
  );
}

function Room({ children }: { children: string }) {
  return (
    <span
      className="flex items-center gap-[3px] font-mono text-[12px] leading-[15px] font-medium"
      style={{ color: "rgba(44,49,53,0.8)" }}
    >
      <Icon name="mapPin" size={12} stroke={2.2} />
      {children}
    </span>
  );
}

function Block({
  sitting: s,
  cancellable,
}: {
  sitting: Sitting;
  cancellable: boolean;
}) {
  const tone = s.group === "AB" ? null : GROUP_TONES[s.group];
  return (
    <div
      className="absolute rounded-[10px]"
      style={{
        ...box(s.day, s.at, s.len),
        background: tone ? tone.fill : ELECTIVE_FILL,
        boxShadow: `inset 0 0 0 1px ${tone ? tone.ring : "rgba(13,17,23,0.32)"}`,
      }}
    >
      <BlockTitle>{s.title}</BlockTitle>
      <span className="absolute inset-x-2 bottom-[3px] flex items-center justify-between">
        <Room>{s.room}</Room>
        {s.group === "AB" && <GroupStack size={16} />}
      </span>
      {cancellable && (
        <div
          data-cancelled
          className="absolute -inset-px flex flex-col items-start justify-between rounded-[10px] px-2 pt-[4px] pb-[5px] opacity-0"
          style={{
            background: "#fbecee",
            outline: `1.5px dashed ${INK.red}`,
            outlineOffset: -1.5,
          }}
        >
          <span
            className="relative block max-w-full truncate text-[14.5px] leading-[15.5px] font-semibold"
            style={{ color: "rgba(160,40,52,0.75)" }}
          >
            {s.title}
            <span
              data-strike
              className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2"
              style={{ background: INK.red, transform: "scaleX(0)" }}
            />
          </span>
          <span
            className="rounded-[6px] px-1.5 py-[2px] text-[12.5px] leading-[14px] font-bold text-white"
            style={{ background: INK.red }}
          >
            Cancelled
          </span>
        </div>
      )}
    </div>
  );
}
