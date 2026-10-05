"use client";

import { useRef, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { courseTone } from "~/ui/mock";
import { Ph } from "~/ui/placeholder";

import { CARD, DemoBox, FacultyBrowser, INK, TOPBAR, useIntro } from "./_shell";

export interface LectureLogProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

/**
 * For external faculty, who are paid per lecture: every lecture they take is
 * counted for them.
 *
 * Builds (steps = 3):
 *   0 — the month so far (today is Thu 22): on arrival each lecture already
 *       taken is ticked, in date order, and the counter rolls up with it; then
 *       the three still to come are counted too (dashed, no tick).
 *   1 — an upcoming one (Sat 24) is cancelled: it is struck out, and the
 *       counter rolls back down by itself.
 *   2 — a statement for accounts slides in, with a Download PDF button
 *       (placeholder figures).
 *
 * The browser frame carries `flipId`, shared with TeachingWeek and
 * RequestLecture, so the window holds still across the three feature slides.
 */

const COURSES = {
  dm: { title: "Data Mining", group: "BCA-B", time: "17:30" },
  ba: { title: "Business Analytics", group: "BBA(IT)-A", time: "10:00" },
} as const;
type CourseKey = keyof typeof COURSES;

/** October 2026: the 1st is a Thursday. Date → course taught that day. */
const LECTURES: [number, CourseKey][] = [
  [1, "dm"],
  [3, "ba"],
  [6, "dm"],
  [8, "dm"],
  [10, "ba"],
  [13, "dm"],
  [15, "dm"],
  [17, "ba"],
  [20, "dm"],
  [22, "dm"],
  [24, "ba"],
  [27, "dm"],
  [29, "dm"],
];
const TODAY = 22;
const CANCELLED = 24;
const TOTAL = LECTURES.length; // 13, then 12 once one is cancelled
const TAKEN = LECTURES.filter(([d]) => d <= TODAY).length; // 10

const CAL = { x: 16, y: TOPBAR + 72, w: 480, h: 444, head: 34, pad: 6 };
const CELL = {
  w: (CAL.w - CAL.pad * 2) / 7,
  h: (CAL.h - CAL.head - CAL.pad) / 5,
};
const SIDE = { x: 508, w: 276 };
const COUNT_H = 196;
const DIGIT = 84;

/** Monday 28 Sep to Sunday 1 Nov. */
const CELLS = Array.from({ length: 35 }, (_, n) => {
  if (n < 3) return { date: 28 + n, inMonth: false };
  if (n - 2 > 31) return { date: n - 2 - 31, inMonth: false };
  return { date: n - 2, inMonth: true };
});

export function LectureLog({ step, active, flipId }: LectureLogProps) {
  const scope = useRef<HTMLDivElement>(null);

  useIntro(scope, { active, step }, (tl) => {
    const start = tl.duration();
    LECTURES.forEach(([date], i) => {
      const upcoming = date > TODAY;
      // The ones still to come are counted after a beat, a little slower.
      const at = start + i * 0.15 + (upcoming ? 0.3 + (i - TAKEN) * 0.1 : 0);
      if (upcoming) {
        tl.fromTo(
          `[data-pulse="${date}"]`,
          { scale: 1 },
          {
            keyframes: [
              { scale: 1.12, duration: 0.14, ease: "power2.out" },
              { scale: 1, duration: 0.22, ease: "power2.inOut" },
            ],
          },
          at,
        );
      } else {
        tl.fromTo(
          `[data-tick="${date}"]`,
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.32, ease: "back.out(2.4)" },
          at,
        );
      }
      tl.to(
        "[data-count-strip]",
        { y: -(i + 1) * DIGIT, duration: 0.2, ease: "power2.out" },
        at + 0.06,
      );
      if (i === TAKEN - 1) {
        tl.fromTo(
          "[data-split-taken]",
          { opacity: 0, x: -8 },
          { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" },
          at,
        );
      }
      if (i === TAKEN) {
        tl.fromTo(
          "[data-split-upcoming]",
          { opacity: 0, x: -8 },
          { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" },
          at,
        );
      }
    });
  });

  useSteps(scope, step, (tl, mark) => {
    // 1 — a cancelled lecture drops out of the count on its own.
    tl.fromTo(
      "[data-cancel-veil]",
      { opacity: 0 },
      { opacity: 1, duration: 0.35, ease: "power1.out" },
    );
    tl.fromTo(
      "[data-cancel-strike]",
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 0.4,
        ease: "power2.inOut",
        transformOrigin: "0% 50%",
      },
      "<0.1",
    );
    tl.fromTo(
      "[data-count-drop]",
      { y: 0 },
      { y: DIGIT, duration: 0.7, ease: "power3.inOut" },
      "<0.15",
    );
    tl.fromTo(
      "[data-minus]",
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" },
      "<0.35",
    );
    tl.to(
      "[data-upcoming-old]",
      { yPercent: -110, opacity: 0, duration: 0.3, ease: "power2.in" },
      "<-0.1",
    );
    tl.fromTo(
      "[data-upcoming-new]",
      { yPercent: 110, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      "<0.15",
    );
    tl.to(
      "[data-row-status-old]",
      { yPercent: -110, opacity: 0, duration: 0.3, ease: "power2.in" },
      "<-0.2",
    );
    tl.fromTo(
      "[data-row-status-new]",
      { yPercent: 110, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      "<0.15",
    );
    tl.fromTo(
      "[data-row-strike]",
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 0.35,
        ease: "power2.inOut",
        transformOrigin: "0% 50%",
      },
      "<",
    );
    mark();

    // 2 — the month's statement, ready for accounts.
    tl.fromTo(
      "[data-statement]",
      { x: SIDE.w + 40 },
      { x: 0, duration: 0.85, ease: "deck.enter" },
    );
    tl.fromTo(
      "[data-statement-row]",
      { x: 30, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.45, ease: "power2.out", stagger: 0.06 },
      "<0.3",
    );
    mark();
  });

  return (
    <DemoBox scope={scope}>
      <FacultyBrowser
        flipId={flipId}
        path="lectures"
        tab={2}
        user="Dr. Fernandes"
        role="Visiting · per lecture"
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
              October 2026
            </div>
            <div className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em]">
              My lectures
            </div>
          </div>
          <div
            className="flex items-center gap-4 pb-1 text-[14.5px] font-semibold"
            style={{ color: INK.ink }}
          >
            {(Object.keys(COURSES) as CourseKey[]).map((k) => {
              const t = courseTone(COURSES[k].title);
              return (
                <span key={k} className="flex items-center gap-1.5">
                  <span
                    className="h-[13px] w-[13px] rounded-[4px]"
                    style={{
                      background: t.fill,
                      boxShadow: `inset 0 0 0 1px ${t.ring}`,
                    }}
                  />
                  {COURSES[k].title}
                  <span
                    className="font-mono text-[12.5px] font-medium"
                    style={{ color: INK.muted }}
                  >
                    {COURSES[k].group}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {/* The month */}
        <div
          className="absolute"
          style={{
            ...CARD,
            left: CAL.x,
            top: CAL.y,
            width: CAL.w,
            height: CAL.h,
          }}
        >
          <div
            className="absolute inset-x-0 top-0 flex"
            style={{
              height: CAL.head,
              padding: `0 ${CAL.pad}px`,
              boxShadow: `inset 0 -1px 0 ${INK.hair}`,
            }}
          >
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span
                key={d}
                className="flex flex-1 items-center justify-center text-[14px] font-semibold"
                style={{ color: INK.muted }}
              >
                {d}
              </span>
            ))}
          </div>
          {CELLS.map((c, n) => {
            const row = Math.floor(n / 7);
            const col = n % 7;
            const lecture = c.inMonth
              ? LECTURES.find(([d]) => d === c.date)
              : undefined;
            const course = lecture ? COURSES[lecture[1]] : undefined;
            const tone = course ? courseTone(course.title) : undefined;
            const isToday = c.inMonth && c.date === TODAY;
            const upcoming = c.inMonth && c.date > TODAY;
            const isCancelled = c.inMonth && c.date === CANCELLED;
            return (
              <div
                key={n}
                className="absolute"
                style={{
                  left: CAL.pad + col * CELL.w,
                  top: CAL.head + row * CELL.h,
                  width: CELL.w,
                  height: CELL.h,
                  boxShadow: `${col > 0 ? "inset 1px 0 0 rgba(68,88,121,0.08)," : ""} inset 0 -1px 0 rgba(68,88,121,0.08)`,
                }}
              >
                <span
                  className="font-display absolute top-[5px] left-[5px] flex h-[26px] min-w-[26px] items-center justify-center rounded-full text-[14.5px] font-semibold"
                  style={{
                    color: isToday
                      ? "#ffffff"
                      : c.inMonth
                        ? col >= 5
                          ? INK.muted
                          : INK.title
                        : "rgba(44,49,53,0.25)",
                    background: isToday ? INK.slate : undefined,
                  }}
                >
                  {c.date}
                </span>
                {course && tone && (
                  <span
                    data-tick={upcoming ? undefined : c.date}
                    className="absolute top-[7px] right-[6px] flex h-[22px] w-[22px] items-center justify-center rounded-full text-white opacity-0"
                    style={{
                      background: INK.green,
                      boxShadow: "0 0 0 1.5px #ffffff",
                    }}
                  >
                    <Icon name="check" size={13} stroke={3.2} />
                  </span>
                )}
                {course && tone && (
                  <div
                    data-pulse={upcoming ? c.date : undefined}
                    className="absolute flex items-center justify-center rounded-[8px]"
                    style={{
                      left: 5,
                      right: 5,
                      bottom: 7,
                      height: 30,
                      background: upcoming ? "#ffffff" : tone.fill,
                      boxShadow: upcoming
                        ? undefined
                        : `inset 0 0 0 1px ${tone.ring}`,
                      outline: upcoming
                        ? `1.5px dashed ${tone.ring}`
                        : undefined,
                      outlineOffset: -1.5,
                    }}
                  >
                    <span
                      className="font-mono text-[13px] font-semibold"
                      style={{
                        color: upcoming
                          ? "rgba(13,17,23,0.6)"
                          : "rgba(13,17,23,0.82)",
                      }}
                    >
                      {course.time}
                    </span>
                    {isCancelled && (
                      <>
                        <span
                          data-cancel-veil
                          className="absolute -inset-[2px] flex items-center justify-center rounded-[9px] opacity-0"
                          style={{
                            background: "#fbecee",
                            outline: `1.5px dashed ${INK.red}`,
                            outlineOffset: -1.5,
                          }}
                        >
                          <span
                            className="font-mono text-[13px] font-semibold"
                            style={{ color: "rgba(160,40,52,0.7)" }}
                          >
                            {course.time}
                          </span>
                        </span>
                        <span
                          data-cancel-strike
                          className="absolute top-1/2 h-[2px] rounded-full"
                          style={{
                            left: 6,
                            right: 6,
                            background: INK.red,
                            transform: "scaleX(0)",
                          }}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* The count */}
        <div
          className="absolute"
          style={{
            ...CARD,
            left: SIDE.x,
            top: CAL.y,
            width: SIDE.w,
            height: COUNT_H,
          }}
        >
          <div
            className="absolute top-[16px] left-[18px] text-[15px] font-semibold"
            style={{ color: INK.muted }}
          >
            Lectures this month
          </div>
          <div
            className="absolute overflow-hidden"
            style={{ left: 16, top: 40, height: DIGIT, width: 110 }}
          >
            <div data-count-drop>
              <div data-count-strip>
                {Array.from({ length: TOTAL + 1 }, (_, n) => (
                  <div
                    key={n}
                    className="font-display font-bold tracking-[-0.04em]"
                    style={{
                      height: DIGIT,
                      fontSize: 84,
                      lineHeight: `${DIGIT}px`,
                    }}
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <span
            data-minus
            className="absolute rounded-[8px] px-2.5 py-1 font-mono text-[13.5px] font-bold opacity-0"
            style={{
              left: 128,
              top: 70,
              background: "rgba(220,56,72,0.12)",
              color: INK.red,
            }}
          >
            −1 cancelled
          </span>
          <div
            className="absolute flex items-center gap-4 text-[14.5px] font-semibold"
            style={{ left: 18, top: 134, color: INK.ink }}
          >
            <span
              data-split-taken
              className="flex items-center gap-1.5 opacity-0"
            >
              <span
                className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-white"
                style={{ background: INK.green }}
              >
                <Icon name="check" size={10} stroke={3.4} />
              </span>
              {TAKEN} taken
            </span>
            <span
              data-split-upcoming
              className="flex items-center gap-1.5 opacity-0"
            >
              <span
                className="h-[14px] w-[14px] rounded-full"
                style={{ outline: `1.5px dashed ${INK.slate}` }}
              />
              <span className="relative inline-block h-[20px] w-[96px] overflow-hidden">
                <Swap
                  old="data-upcoming-old"
                  next="data-upcoming-new"
                  a={`${TOTAL - TAKEN} upcoming`}
                  b={`${TOTAL - TAKEN - 1} upcoming`}
                />
              </span>
            </span>
          </div>
          <div
            className="absolute text-[13px]"
            style={{ left: 18, top: 162, color: INK.muted }}
          >
            Ticked when attendance is taken
          </div>
        </div>

        {/* Around today */}
        <div
          className="absolute"
          style={{
            ...CARD,
            left: SIDE.x,
            top: CAL.y + COUNT_H + 12,
            width: SIDE.w,
            height: CAL.h - COUNT_H - 12,
          }}
        >
          <div
            className="absolute top-[15px] left-[18px] text-[13.5px] leading-[17px] font-semibold"
            style={{ color: INK.muted }}
          >
            This week and next
          </div>
          {[
            { date: "Thu 22 Oct", key: "dm" as const, status: "taken" },
            { date: "Sat 24 Oct", key: "ba" as const, status: "cancel" },
            { date: "Tue 27 Oct", key: "dm" as const, status: "upcoming" },
          ].map((r, i) => (
            <div
              key={r.date}
              className="absolute flex items-center gap-3"
              style={{
                left: 18,
                right: 16,
                top: 44 + i * 62,
                height: 56,
                boxShadow: i > 0 ? `inset 0 1px 0 ${INK.hair}` : undefined,
              }}
            >
              <span
                className="h-[32px] w-[5px] shrink-0 rounded-full"
                style={{ background: courseTone(COURSES[r.key].title).fill }}
              />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="relative self-start text-[15px] font-semibold">
                  {r.date}
                  {r.status === "cancel" && (
                    <span
                      data-row-strike
                      className="absolute inset-x-0 top-1/2 h-[2px]"
                      style={{ background: INK.red, transform: "scaleX(0)" }}
                    />
                  )}
                </span>
                <span
                  className="truncate text-[13px]"
                  style={{ color: INK.muted }}
                >
                  {COURSES[r.key].title}
                </span>
              </span>
              <span className="relative h-[22px] w-[100px] shrink-0 overflow-hidden text-[14px] font-semibold">
                {r.status === "taken" ? (
                  <Status color={INK.green} icon="checkCircle">
                    Taken
                  </Status>
                ) : (
                  <span
                    data-row-status-old={r.status === "cancel" ? "" : undefined}
                    className="absolute inset-0"
                  >
                    <Status color={INK.slate} icon="clock">
                      Upcoming
                    </Status>
                  </span>
                )}
                {r.status === "cancel" && (
                  <span
                    data-row-status-new
                    className="absolute inset-0 opacity-0"
                  >
                    <Status color={INK.red} icon="calendarX">
                      Cancelled
                    </Status>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* 2 — the statement */}
        <div
          data-statement
          className="absolute z-10 flex flex-col px-5 pt-4 pb-5"
          style={{
            left: SIDE.x,
            top: CAL.y,
            width: SIDE.w,
            height: CAL.h,
            transform: `translateX(${SIDE.w + 40}px)`,
            background: "#ffffff",
            borderRadius: 16,
            boxShadow: `inset 0 0 0 1px ${INK.ring}, 0 2px 4px rgba(16,24,40,0.04), 0 22px 48px -16px rgba(16,24,40,0.28)`,
          }}
        >
          <div
            data-statement-row
            className="text-[13.5px] leading-[17px] font-semibold"
            style={{ color: INK.muted }}
          >
            Statement · October 2026
          </div>
          <div data-statement-row className="mt-2 flex items-center gap-3">
            <span
              className="flex h-[40px] w-[40px] items-center justify-center rounded-full text-[15px] font-bold text-white"
              style={{ background: INK.slate }}
            >
              DF
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-[19px] font-bold tracking-[-0.01em]">
                Dr. Fernandes
              </span>
              <span className="text-[13px]" style={{ color: INK.muted }}>
                Visiting faculty · per lecture
              </span>
            </span>
          </div>
          <div
            data-statement-row
            className="mt-3.5 flex flex-col gap-2 py-3"
            style={{
              boxShadow: `inset 0 1px 0 ${INK.hair}, inset 0 -1px 0 ${INK.hair}`,
            }}
          >
            {(
              [
                ["dm", 9],
                ["ba", 3],
              ] as const
            ).map(([k, n]) => (
              <div
                key={k}
                className="flex items-center justify-between text-[15px]"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-[11px] w-[11px] rounded-[3px]"
                    style={{ background: courseTone(COURSES[k].title).fill }}
                  />
                  {COURSES[k].title}
                </span>
                <span className="font-mono font-semibold">{n}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {(
              [
                ["Lectures", <Ph key="n">12</Ph>],
                ["Per lecture", <Ph key="r">₹ …</Ph>],
                ["Amount", <Ph key="a">₹ …</Ph>],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                data-statement-row
                className="flex items-center justify-between"
              >
                <span
                  className="text-[15px] font-semibold"
                  style={{ color: INK.muted }}
                >
                  {label}
                </span>
                <span className="font-display text-[26px] leading-[32px] font-bold">
                  {value}
                </span>
              </div>
            ))}
          </div>
          <div data-statement-row className="mt-auto flex flex-col gap-2.5">
            <span
              className="flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[15px] font-bold"
              style={{ background: "rgba(78,125,58,0.12)", color: INK.green }}
            >
              <Icon name="checkCircle" size={18} stroke={2.2} />
              Ready for accounts
            </span>
            <span
              className="flex h-[46px] items-center justify-center gap-2 rounded-[12px] text-[16px] font-semibold text-white"
              style={{ background: INK.slate }}
            >
              <Icon name="download" size={18} stroke={2.2} />
              Download PDF
            </span>
          </div>
        </div>
      </FacultyBrowser>
    </DemoBox>
  );
}

function Status({
  color,
  icon,
  children,
}: {
  color: string;
  icon: "checkCircle" | "clock" | "calendarX";
  children: ReactNode;
}) {
  return (
    <span
      className="absolute inset-0 flex items-center justify-end gap-1"
      style={{ color }}
    >
      <Icon name={icon} size={16} stroke={2.2} />
      {children}
    </span>
  );
}

/** Two labels in one slot: the first rolls up and away as the second rolls in. */
function Swap({
  old,
  next,
  a,
  b,
}: {
  old: string;
  next: string;
  a: string;
  b: string;
}) {
  return (
    <>
      <span {...{ [old]: "" }} className="absolute inset-0 whitespace-nowrap">
        {a}
      </span>
      <span
        {...{ [next]: "" }}
        className="absolute inset-0 whitespace-nowrap opacity-0"
      >
        {b}
      </span>
    </>
  );
}
