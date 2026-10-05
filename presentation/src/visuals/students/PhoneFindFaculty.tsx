"use client";

import { useRef, type ReactNode } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { PhoneFrame, StatusBar } from "~/ui/frames";
import { Icon } from "~/ui/icon";
import { courseTone, LIVE } from "~/ui/mock";

import { Finger, Meta, PHONE_HEIGHT, SCREEN_W } from "./_phone-kit";

export interface PhoneFindFacultyProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

const QUERY = "Kulk";
const DT = courseTone("Design Thinking");
const RESULTS_TOP = 204;
const ROW_H = 74;
const KB_H = 290;
const TAP = { x: 196, y: RESULTS_TOP + 34 + ROW_H / 2 };

const RESULTS: {
  initials: string;
  prefix: string;
  rest: string;
  role: string;
  status: string;
  until: string;
  dot: string;
  tone: string;
}[] = [
  {
    initials: "SK",
    prefix: "Prof. ",
    rest: "arni",
    role: "Design Thinking · Faculty",
    status: "In 301",
    until: "till 12:30",
    dot: "var(--red)",
    tone: DT.fill,
  },
  {
    initials: "AK",
    prefix: "Dr. ",
    rest: "arni",
    role: "Data Mining · Visiting",
    status: "Free",
    until: "till 3:00",
    dot: "var(--green)",
    tone: courseTone("Data Mining").fill,
  },
  {
    initials: "MK",
    prefix: "Ms. ",
    rest: "arni",
    role: "BBA(IT) · Coordinator",
    status: "Office",
    until: "2nd floor",
    dot: "var(--slate-muted)",
    tone: "#ffc667",
  },
];

const COURSES = [
  {
    title: "Design Thinking",
    by: "Prof. Kulkarni",
    divs: "BCA-A, B",
  },
  { title: "Data Mining", by: "Dr. Kulkarni", divs: "BCA-B" },
];

const HER_DAY: {
  from: string;
  to: string;
  title: string;
  where: string;
  past?: boolean;
  live?: boolean;
}[] = [
  {
    from: "10:00",
    to: "11:00",
    title: "Design Thinking",
    where: "BCA-B, Room 304",
    past: true,
  },
  {
    from: "11:30",
    to: "12:30",
    title: "Design Thinking",
    where: "BCA-A, Room 301",
    live: true,
  },
  {
    from: "12:45",
    to: "2:00",
    title: "Design Thinking",
    where: "BBA(IT)-A, Lab 2",
  },
];

/** How far her day sits up the page until the free card makes room for it. */
const FREE_GAP = 84;

/**
 * Find any teacher by name, and see where they are now.
 *
 * Builds (steps = 3):
 *   0: a name being typed; the keyboard steps aside and the matches come up.
 *   1: tap her name: her page pushes in (where she is now, and her day).
 *   2: when she is next free: the card slides out, her free afternoon draws in.
 *
 * Build 0 plays by itself once the slide is on screen (at once in the
 * presenter's preview, or when arriving on a later build). Opening a result
 * pushes her profile in from the right, as a phone does. The live dot pulses
 * only while the slide is active.
 */
export function PhoneFindFaculty({
  step,
  active,
  flipId,
}: PhoneFindFacultyProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const typed = useRef(false);
  const auto = useRef<gsap.core.Timeline | null>(null);
  const loops = useRef<gsap.core.Tween[]>([]);

  // The name being typed: once, when the slide first shows.
  useGSAP(
    () => {
      // Moving on before it has finished: finish it first, so the tap lands
      // on her name and not on a half-typed search.
      if (step > 0 && auto.current) {
        auto.current.progress(1);
        auto.current = null;
      }
      if (typed.current) return;
      if (instant || step > 0) {
        typed.current = true;
        gsap.set(".ff-typed", { text: QUERY });
        gsap.set(".ff-ph", { opacity: 0 });
        gsap.set(".ff-kb", { y: KB_H + 10 });
        gsap.set(".ff-recent", { opacity: 0 });
        gsap.set(".ff-results > *", { y: 0, opacity: 1 });
        return;
      }
      gsap.set(".ff-results > *", { y: 28, opacity: 0 });
      if (!active) return;
      typed.current = true;
      const tl = gsap.timeline({
        delay: 0.9,
        onComplete: () => {
          auto.current = null;
        },
      });
      auto.current = tl;
      QUERY.split("").forEach((ch, i) => {
        const at = i * 0.26;
        const key = `.ff-key-${ch.toLowerCase()}`;
        tl.set(".ff-typed", { text: QUERY.slice(0, i + 1) }, at);
        if (i === 0) tl.set(".ff-ph", { opacity: 0 }, at);
        tl.to(
          key,
          {
            backgroundColor: "#aab1bd",
            scale: 1.14,
            duration: 0.06,
            ease: "power1.out",
          },
          at - 0.04,
        );
        tl.to(
          key,
          {
            backgroundColor: "#ffffff",
            scale: 1,
            duration: 0.18,
            ease: "power1.out",
          },
          at + 0.06,
        );
      });

      // Search: the keyboard steps aside and the matches come up.
      const go = QUERY.length * 0.26 + 0.3;
      tl.to(
        ".ff-key-search",
        { scale: 0.92, duration: 0.08, ease: "power1.out" },
        go - 0.1,
      );
      tl.to(
        ".ff-key-search",
        { scale: 1, duration: 0.18, ease: "power1.out" },
        go,
      );
      tl.to(
        ".ff-kb",
        { y: KB_H + 10, duration: 0.65, ease: "power3.inOut" },
        go,
      );
      tl.to(
        ".ff-recent",
        { y: -14, opacity: 0, duration: 0.3, ease: "power2.in" },
        go,
      );
      tl.to(
        ".ff-results > *",
        { y: 0, opacity: 1, duration: 0.6, ease: "deck.enter", stagger: 0.07 },
        go + 0.2,
      );
    },
    { scope: ref, dependencies: [active, instant, step] },
  );

  // Loops: the caret, and the live dot. Only while the slide is on screen.
  useGSAP(
    () => {
      for (const t of loops.current) t.kill();
      loops.current = [];
      gsap.set(".ff-caret", { opacity: 1 });
      gsap.set(".ff-pulse", { scale: 1, opacity: 0 });
      if (!active || instant) return;
      loops.current = [
        gsap.to(".ff-caret", {
          opacity: 0,
          duration: 0.5,
          repeat: -1,
          yoyo: true,
          ease: "steps(1)",
        }),
        gsap.fromTo(
          ".ff-pulse",
          { scale: 1, opacity: 0.6 },
          {
            scale: 3,
            opacity: 0,
            duration: 1.4,
            repeat: -1,
            ease: "power1.out",
          },
        ),
      ];
    },
    { scope: ref, dependencies: [active, instant] },
  );

  useSteps(ref, step, (tl, mark) => {
    gsap.set(".ff-finger", { x: TAP.x, y: TAP.y, scale: 1.3 });
    gsap.set(".ff-profile", { x: SCREEN_W });
    gsap.set(".ff-free", { y: -64, opacity: 0 });
    gsap.set(".ff-day", { y: -FREE_GAP });
    gsap.set(".ff-free-row", { opacity: 0, clipPath: "inset(0% 100% 0% 0%)" });

    // 1 — tap her name: her page pushes in from the right.
    tl.to(".ff-finger", {
      opacity: 1,
      scale: 1,
      duration: 0.22,
      ease: "power2.out",
    });
    tl.to(".ff-finger", { scale: 0.88, duration: 0.12, ease: "power1.out" });
    tl.to(".ff-row-0", { backgroundColor: "#e4e8ee", duration: 0.12 }, "<");
    tl.addLabel("push");
    tl.to(
      ".ff-finger",
      { opacity: 0, scale: 1.2, duration: 0.25, ease: "power1.out" },
      "push",
    );
    tl.to(".ff-profile", { x: 0, duration: 0.7, ease: "power3.inOut" }, "push");
    tl.to(
      ".ff-search",
      { x: -SCREEN_W * 0.3, duration: 0.7, ease: "power3.inOut" },
      "push",
    );
    tl.to(
      ".ff-shade",
      { opacity: 1, duration: 0.7, ease: "power1.inOut" },
      "push",
    );
    mark();

    // 2 — right now, until when, and next free: the now card answers, then
    // the free card slides out from under it and her day makes room.
    tl.to(".ff-now", { scale: 1.035, duration: 0.25, ease: "power2.out" });
    tl.to(".ff-now", { scale: 1, duration: 0.35, ease: "power2.inOut" });
    tl.addLabel("free", "-=0.2");
    tl.to(".ff-day", { y: 0, duration: 0.7, ease: "power3.inOut" }, "free");
    tl.to(
      ".ff-free",
      { y: 0, opacity: 1, duration: 0.7, ease: "power3.inOut" },
      "free",
    );
    tl.to(
      ".ff-free-row",
      {
        opacity: 1,
        clipPath: "inset(0% 0% 0% 0%)",
        duration: 0.6,
        ease: "power2.inOut",
      },
      "free+=0.45",
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
        <div className="absolute inset-0 isolate">
          {/* Search */}
          <div
            className="ff-search absolute inset-0"
            style={{ background: "var(--paper)" }}
          >
            <div className="absolute inset-x-0 px-5" style={{ top: 62 }}>
              <div className="text-[13.5px] font-medium text-[rgba(44,49,53,0.58)]">
                People, rooms, courses
              </div>
              <div className="font-display text-[30px] leading-tight font-bold tracking-[-0.02em] text-[#0d1117]">
                Find
              </div>
            </div>

            <div
              className="absolute flex items-center gap-2.5 rounded-[14px] bg-white px-3.5"
              style={{
                top: 134,
                left: 16,
                right: 16,
                height: 50,
                boxShadow:
                  "inset 0 0 0 1.5px var(--slate), 0 0 0 4px rgba(68,88,121,0.14)",
              }}
            >
              <Icon name="search" size={20} stroke={2.2} color="var(--slate)" />
              <span className="relative flex flex-1 items-center text-[19px] font-medium text-[#0d1117]">
                <span className="ff-ph absolute left-0 text-[rgba(44,49,53,0.4)]">
                  Name, room or course
                </span>
                <span className="ff-typed whitespace-pre" />
                <span
                  className="ff-caret ml-[1px] h-[24px] w-[2px] rounded-full"
                  style={{ background: "var(--slate)" }}
                />
              </span>
            </div>

            {/* Before typing: what you looked up last. */}
            <div
              className="ff-recent absolute inset-x-4"
              style={{ top: RESULTS_TOP }}
            >
              <Label>Recent</Label>
              <Card>
                {[
                  { icon: "door" as const, text: "Room 304", sub: "Floor 3" },
                  {
                    icon: "user" as const,
                    text: "Dr. Mehta",
                    sub: "Statistics",
                  },
                  {
                    icon: "book" as const,
                    text: "Web Technologies",
                    sub: "BCA-A",
                  },
                ].map((r, i) => (
                  <div
                    key={r.text}
                    className="flex items-center gap-3 px-4"
                    style={{
                      height: 54,
                      boxShadow:
                        i > 0
                          ? "inset 0 1px 0 rgba(68,88,121,0.12)"
                          : undefined,
                    }}
                  >
                    <Icon
                      name={r.icon}
                      size={19}
                      stroke={1.9}
                      color="rgba(44,49,53,0.5)"
                    />
                    <span className="text-[16px] font-medium text-[#0d1117]">
                      {r.text}
                    </span>
                    <span className="text-[14px] text-[rgba(44,49,53,0.5)]">
                      {r.sub}
                    </span>
                  </div>
                ))}
              </Card>
            </div>

            {/* After: the people it matches, and where each one is. */}
            <div
              className="ff-results absolute inset-x-4"
              style={{ top: RESULTS_TOP }}
            >
              <Label>
                <Meta text="People · 3" />
              </Label>
              {RESULTS.map((r, i) => (
                <div
                  key={r.initials}
                  className={`ff-row-${i} mb-2 flex items-center gap-3 rounded-[16px] bg-white px-3.5`}
                  style={{
                    height: ROW_H - 8,
                    boxShadow: "inset 0 0 0 1px rgba(68,88,121,0.2)",
                  }}
                >
                  <span
                    className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-[#0d1117]"
                    style={{ background: r.tone }}
                  >
                    {r.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16.5px] font-semibold text-[#0d1117]">
                      {r.prefix}
                      <span
                        className="rounded-[4px] px-[1px]"
                        style={{ background: "rgba(255,198,103,0.6)" }}
                      >
                        {QUERY}
                      </span>
                      {r.rest}
                    </span>
                    <span className="mt-0.5 block truncate text-[13.5px] text-[rgba(44,49,53,0.6)]">
                      <Meta text={r.role} />
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end font-mono">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#0d1117]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: r.dot }}
                      />
                      {r.status}
                    </span>
                    <span className="mt-0.5 text-[11px] text-[rgba(44,49,53,0.55)]">
                      {r.until}
                    </span>
                  </span>
                </div>
              ))}

              <div className="mt-3">
                <Label>
                  <Meta text="Courses · 2" />
                </Label>
              </div>
              <Card>
                {COURSES.map((c, i) => (
                  <div
                    key={c.title}
                    className="flex items-center gap-3 px-4"
                    style={{
                      height: 56,
                      boxShadow:
                        i > 0
                          ? "inset 0 1px 0 rgba(68,88,121,0.12)"
                          : undefined,
                    }}
                  >
                    <span
                      className="h-[28px] w-[6px] shrink-0 rounded-full"
                      style={{
                        background: courseTone(c.title).fill,
                        boxShadow: `inset 0 0 0 1px ${courseTone(c.title).ring}`,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15.5px] font-semibold text-[#0d1117]">
                        {c.title}
                      </span>
                      <span className="block truncate text-[13px] text-[rgba(44,49,53,0.6)]">
                        {c.by}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] text-[rgba(44,49,53,0.55)]">
                      {c.divs}
                    </span>
                  </div>
                ))}
              </Card>

              <div
                className="mt-4 flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 text-[13.5px] text-[rgba(44,49,53,0.7)]"
                style={{ background: "rgba(68,88,121,0.07)" }}
              >
                <Icon name="door" size={18} stroke={1.9} color="var(--slate)" />
                <span>
                  Tip: type a room, like{" "}
                  <b className="font-semibold text-[#0d1117]">304</b>, to see
                  who&apos;s in it.
                </span>
              </div>
            </div>

            <Keyboard />
            <span
              className="ff-shade pointer-events-none absolute inset-0 bg-[#0d1117]/10"
              style={{ opacity: 0 }}
            />
          </div>

          {/* Her page */}
          <div
            className="ff-profile absolute inset-0"
            style={{
              background: "var(--paper)",
              boxShadow: "-14px 0 34px -6px rgba(16,24,40,0.14)",
            }}
          >
            <div
              className="absolute flex items-center gap-1 text-[16px] font-medium"
              style={{ top: 60, left: 10, color: "var(--slate)" }}
            >
              <Icon name="chevronLeft" size={22} stroke={2.4} />
              Find
            </div>

            <div
              className="absolute inset-x-5 flex items-center gap-4"
              style={{ top: 104 }}
            >
              <span
                className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full text-[22px] font-bold text-[#0d1117]"
                style={{
                  background: DT.fill,
                  boxShadow: `inset 0 0 0 1px ${DT.ring}`,
                }}
              >
                SK
              </span>
              <span>
                <span className="font-display block text-[27px] leading-tight font-bold tracking-[-0.02em] text-[#0d1117]">
                  Prof. Kulkarni
                </span>
                <span className="mt-0.5 block text-[14.5px] text-[rgba(44,49,53,0.62)]">
                  <Meta text="Design Thinking · Faculty" />
                </span>
              </span>
            </div>

            {/* Where she is, right now. */}
            <div
              className="ff-now absolute z-[2] rounded-[20px] bg-white"
              style={{
                top: 198,
                left: 14,
                right: 14,
                padding: "16px 20px 18px",
                boxShadow: `inset 0 0 0 1.5px ${LIVE.ring}, 0 12px 28px -12px rgba(16,24,40,0.22)`,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="flex items-center gap-2 text-[14px] font-bold"
                  style={{ color: "var(--red)" }}
                >
                  <span className="relative flex h-[10px] w-[10px]">
                    <span
                      className="ff-pulse absolute inset-0 rounded-full"
                      style={{ background: "var(--red)", opacity: 0 }}
                    />
                    <span
                      className="relative h-[10px] w-[10px] rounded-full"
                      style={{ background: "var(--red)" }}
                    />
                  </span>
                  Now
                </span>
                <span className="font-mono text-[13px] font-semibold text-[rgba(44,49,53,0.7)]">
                  until 12:30
                </span>
              </div>
              <div className="font-display mt-2 text-[42px] leading-none font-bold tracking-[-0.02em] text-[#0d1117]">
                Room 301
              </div>
              <div className="mt-2.5 text-[16px] text-[rgba(44,49,53,0.72)]">
                <Meta text="BCA-A · Design Thinking" />
              </div>
            </div>

            {/* When she is next free. */}
            <div
              className="ff-free absolute z-[1] flex items-center gap-2.5 rounded-[16px] px-4"
              style={{
                top: 356,
                left: 14,
                right: 14,
                height: 58,
                background: "#e6f1df",
                boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.5)",
              }}
            >
              <Icon name="clock" size={20} stroke={2.1} color="var(--green)" />
              <span className="flex-1 text-[17px] font-bold text-[#2f5a20]">
                Free at 2:00pm
              </span>
              <span className="font-mono text-[12.5px] font-semibold text-[#2f5a20]/75">
                in 2h 08m
              </span>
            </div>

            <div
              className="ff-day absolute flex flex-col gap-2.5"
              style={{ top: 440, left: 14, right: 14 }}
            >
              <div className="px-1.5">
                <Label>
                  <Meta text="Her day · Tue 11 Aug" />
                </Label>
              </div>
              {HER_DAY.map((c) => {
                const tone = c.live ? LIVE : DT;
                return (
                  <div key={c.from} className="flex items-stretch gap-3">
                    <span className="w-[46px] shrink-0 pt-2 text-right font-mono text-[12px] text-[rgba(44,49,53,0.5)]">
                      {c.from}
                    </span>
                    <span
                      className="flex-1 rounded-[12px] px-3 py-2"
                      style={{
                        background: tone.fill,
                        boxShadow: `inset 0 0 0 1px ${tone.ring}`,
                        opacity: c.past ? 0.55 : 1,
                        height: 60,
                      }}
                    >
                      <span className="block text-[14.5px] leading-tight font-semibold text-[#0d1117]">
                        {c.title}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11.5px] text-[rgba(44,49,53,0.72)]">
                        {c.from}-{c.to} · {c.where}
                      </span>
                    </span>
                  </div>
                );
              })}
              <div className="ff-free-row flex items-stretch gap-3">
                <span className="w-[46px] shrink-0 pt-2 text-right font-mono text-[12px] font-semibold text-[var(--green)]">
                  2:00
                </span>
                <span
                  className="flex flex-1 items-center gap-2 rounded-[12px] px-3 text-[14.5px] font-semibold text-[#2f5a20]"
                  style={{
                    height: 44,
                    border: "1.5px dashed rgba(78,125,58,0.6)",
                  }}
                >
                  Free for the rest of the day
                </span>
              </div>
            </div>
          </div>

          <StatusBar time="11:52" />
          <Finger className="ff-finger" />
        </div>
      </PhoneFrame>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 px-1 text-[13.5px] font-semibold text-[rgba(44,49,53,0.55)]">
      {children}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[16px] bg-white"
      style={{ boxShadow: "inset 0 0 0 1px rgba(68,88,121,0.2)" }}
    >
      {children}
    </div>
  );
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const KEY = { w: 33.3, h: 44, gap: 6 };

/** An iPhone keyboard, light. Its letter keys are classed `ff-key-<letter>`. */
function Keyboard() {
  const key =
    "flex items-center justify-center rounded-[6px] text-[22px] text-[#0d1117]";
  const keyStyle = {
    height: KEY.h,
    background: "#ffffff",
    boxShadow: "0 1px 0 rgba(13,17,23,0.32)",
  };
  const fnStyle = {
    height: KEY.h,
    background: "#adb3bd",
    boxShadow: "0 1px 0 rgba(13,17,23,0.32)",
  };
  return (
    <div
      className="ff-kb absolute inset-x-0 bottom-0 flex flex-col"
      style={{
        height: KB_H,
        background: "#d2d5db",
        padding: "9px 4px 0",
        gap: 11,
        fontFamily: "-apple-system, var(--font-body)",
      }}
    >
      {ROWS.map((row, r) => (
        <div key={row} className="flex justify-center" style={{ gap: KEY.gap }}>
          {r === 2 && (
            <span
              className={`${key} mr-[8px]`}
              style={{ ...fnStyle, width: 42 }}
            >
              <svg
                width="20"
                height="18"
                viewBox="0 0 20 18"
                fill="none"
                stroke="#0d1117"
                strokeWidth="1.6"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M10 1.5 1.5 10H6v6.5h8V10h4.5z" />
              </svg>
            </span>
          )}
          {row.split("").map((ch) => (
            <span
              key={ch}
              className={`ff-key-${ch} ${key}`}
              style={{ ...keyStyle, width: KEY.w }}
            >
              {ch}
            </span>
          ))}
          {r === 2 && (
            <span
              className={`${key} ml-[8px]`}
              style={{ ...fnStyle, width: 42 }}
            >
              <svg
                width="22"
                height="16"
                viewBox="0 0 22 16"
                fill="none"
                stroke="#0d1117"
                strokeWidth="1.6"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M7 1h13a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7L1 8z" />
                <path d="m11 5 6 6M17 5l-6 6" />
              </svg>
            </span>
          )}
        </div>
      ))}
      <div className="flex" style={{ gap: KEY.gap }}>
        <span
          className={`${key} text-[16px]`}
          style={{ ...fnStyle, width: 88 }}
        >
          123
        </span>
        <span className={`${key} flex-1 text-[16px]`} style={keyStyle}>
          space
        </span>
        <span
          className={`ff-key-search ${key} text-[16px] text-white`}
          style={{
            ...fnStyle,
            width: 88,
            background: "#0a7cff",
            color: "#fff",
          }}
        >
          search
        </span>
      </div>
    </div>
  );
}
