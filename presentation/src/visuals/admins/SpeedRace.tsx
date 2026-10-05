"use client";

import { useRef, type ReactNode } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { PhoneFrame } from "~/ui/frames";
import { Icon } from "~/ui/icon";
import { courseTone, LIVE, MockTabBar } from "~/ui/mock";
import { Ph } from "~/ui/placeholder";

export interface SpeedRaceProps {
  step: number;
  active: boolean;
}

/* ── Layout, in the 960 × 844 box ───────────────────────────────────────── */

const BOX = { w: 960, h: 844 } as const;
const PHONE_H = 640;
/** The phone's width at that height (the frame is 419 × 878). */
const PHONE_W = (419 / 878) * PHONE_H;
const PHONE_TOP = 12;
const LABEL_TOP = PHONE_TOP + PHONE_H + 22;
const MID = { x: PHONE_W, w: BOX.w - PHONE_W * 2 } as const;

/** Placeholder timings: what the race shows until they are measured. */
const PLANNR_S = 0.4;
const OLD_S = 8.2;
/** The old site's clock runs in real time this long, then is sped up. */
const REAL_S = 1;
const FAST_DURATION = 2;

const fmt = (s: number) => `${s.toFixed(2)} s`;

const DAY = [
  { title: "Design Thinking", time: "09:00-10:00", room: "301", past: true },
  { title: "Cloud Computing", time: "10:00-11:00", room: "304", live: true },
  { title: "Data Mining", time: "11:30-12:30", room: "Lab 2" },
  { title: "Web Technologies", time: "14:00-15:00", room: "301" },
  { title: "Cyber Security", time: "15:00-16:00", room: "304" },
];

/**
 * Today's site against Plannr, loading the same day on the same phone
 * network.
 *
 * Builds (steps = 3):
 *   0 — two empty loading bars, labelled.
 *   1 — the race: Plannr is done almost at once while the old site is still
 *       loading (placeholder timings); the gap lands as "20× faster".
 *   2 — offline: the Plannr phone loses its signal (a plane drops into the
 *       status bar) and the day stays on screen.
 *
 * The clocks run on the build's own timeline: real time for the first
 * second, then the old site's is visibly sped up (and says so) so the room
 * is not kept waiting eight seconds.
 */
export function SpeedRace({ step, active }: SpeedRaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();

  // The old site never finishes: once the race is run, its progress bar
  // keeps crawling while the slide is on screen.
  const crawling = active && step >= 1 && !instant;
  useGSAP(
    () => {
      if (!crawling) {
        gsap.set(".bar-crawl", { scaleX: 1 });
        return;
      }
      const t = gsap.fromTo(
        ".bar-crawl",
        { scaleX: 1 },
        { scaleX: 1.22, duration: 24, ease: "power4.out", delay: 3 },
      );
      return () => {
        t.kill();
      };
    },
    { scope: ref, dependencies: [crawling] },
  );

  useSteps(ref, step, (tl, mark) => {
    const root = ref.current;
    const oldClock = root?.querySelector<HTMLElement>(".clock-old");
    const newClock = root?.querySelector<HTMLElement>(".clock-new");
    const times = { old: 0, new: 0 };
    const draw = () => {
      if (oldClock) oldClock.textContent = fmt(times.old);
      if (newClock) newClock.textContent = fmt(times.new);
    };

    // ── Build 1: the race. Both requests leave at once.
    tl.addLabel("go");
    tl.fromTo(
      times,
      { new: 0 },
      {
        new: PLANNR_S,
        duration: PLANNR_S,
        ease: "none",
        onUpdate: draw,
        immediateRender: false,
      },
      "go",
    );
    tl.fromTo(
      times,
      { old: 0 },
      {
        old: REAL_S,
        duration: REAL_S,
        ease: "none",
        onUpdate: draw,
        immediateRender: false,
      },
      "go",
    );
    tl.to(
      times,
      { old: OLD_S, duration: FAST_DURATION, ease: "none", onUpdate: draw },
      `go+=${REAL_S}`,
    );
    tl.fromTo(
      ".bar-new",
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: PLANNR_S,
        ease: "power1.out",
        transformOrigin: "0% 50%",
      },
      "go",
    );
    tl.fromTo(
      ".bar-old",
      { scaleX: 0 },
      {
        scaleX: 0.24,
        duration: REAL_S,
        ease: "power1.out",
        transformOrigin: "0% 50%",
      },
      "go",
    );
    tl.to(
      ".bar-old",
      { scaleX: 0.58, duration: FAST_DURATION, ease: "power1.out" },
      `go+=${REAL_S}`,
    );
    // Plannr paints, and its clock stops.
    const painted = `go+=${PLANNR_S}`;
    tl.to(".bar-new", { opacity: 0, duration: 0.25 }, painted);
    tl.fromTo(
      ".paint-new",
      { opacity: 0 },
      { opacity: 1, duration: 0.18, ease: "power1.out" },
      painted,
    );
    tl.fromTo(
      ".paint-new .cls",
      { y: 18 },
      { y: 0, duration: 0.45, ease: "power3.out", stagger: 0.04 },
      painted,
    );
    tl.to(".clock-new-wrap", { color: "#2f7a4b", duration: 0.2 }, painted);
    tl.fromTo(
      ".done-new",
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.4)" },
      painted,
    );
    tl.fromTo(
      ".cap-new",
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      `${painted}+=0.1`,
    );
    // The old site's clock is sped up, and says so.
    tl.fromTo(
      ".ff",
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.3 },
      `go+=${REAL_S}`,
    );
    tl.to(
      ".ff",
      { opacity: 0, duration: 0.3 },
      `go+=${REAL_S + FAST_DURATION - 0.1}`,
    );
    tl.to(
      ".clock-old-wrap",
      { color: "#a66b12", duration: 0.3 },
      `go+=${REAL_S + FAST_DURATION - 0.1}`,
    );
    tl.fromTo(
      ".cap-old",
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
      "<",
    );
    tl.fromTo(
      ".plus-old",
      { x: -8, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.3, ease: "power2.out" },
      "<",
    );

    // The gap, as a number.
    tl.to(
      ".vs",
      { scale: 0.6, opacity: 0, duration: 0.3, ease: "power2.in" },
      ">-0.05",
    );
    tl.fromTo(
      ".result",
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, ease: "deck.enter" },
      "<0.15",
    );
    const big = root?.querySelector<HTMLElement>(".times");
    if (big) {
      const k = { v: 1 };
      tl.fromTo(
        k,
        { v: 1 },
        {
          v: Math.round(OLD_S / PLANNR_S),
          duration: 0.9,
          ease: "power3.out",
          onUpdate: () => (big.textContent = `${Math.round(k.v)}×`),
          immediateRender: false,
        },
        "<",
      );
    }
    tl.fromTo(".note", { opacity: 0 }, { opacity: 1, duration: 0.4 }, "<0.4");
    mark();

    // ── Build 2: offline. The signal goes, a plane drops in, the day stays.
    tl.to(".net-on", { y: -26, opacity: 0, duration: 0.35, ease: "power2.in" });
    tl.fromTo(
      ".net-off",
      { y: -30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.55, ease: "back.out(2)" },
      "<0.2",
    );
    tl.fromTo(
      ".offline-pill",
      { y: 90 },
      { y: 0, duration: 0.7, ease: "deck.enter" },
      "<0.15",
    );
    tl.to(
      ".cap-new",
      { y: -14, opacity: 0, duration: 0.3, ease: "power2.in" },
      "<",
    );
    tl.fromTo(
      ".cap-off",
      { y: 14, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" },
      "<0.2",
    );
    mark();
  });

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      style={{ width: BOX.w, height: BOX.h }}
    >
      <Racer
        x={0}
        url="time-table.sicsr.ac.in"
        insecure
        clockClass="clock-old"
        plus
        caption={
          <span
            className="cap-old text-warn flex items-center gap-2"
            style={{ opacity: 0 }}
          >
            <Icon name="hourglass" size={22} stroke={2} />
            still a white page
          </span>
        }
        extra={
          <span
            className="ff t-small text-muted flex items-center gap-1"
            style={{ opacity: 0 }}
          >
            <Icon name="chevronRight" size={20} stroke={2.4} />
            <Icon
              name="chevronRight"
              size={20}
              stroke={2.4}
              className="-ml-3.5"
            />
            clock sped up
          </span>
        }
      >
        <div
          className="absolute inset-x-0 bottom-0 bg-white"
          style={{ top: 112 }}
        />
      </Racer>

      <Racer
        x={BOX.w - PHONE_W}
        url="plannr.paraswtf.com"
        clockClass="clock-new"
        done
        caption={
          <span
            className="cap-new text-good flex items-center gap-2"
            style={{ opacity: 0 }}
          >
            your whole day, ready
          </span>
        }
        extra={
          <span
            className="cap-off text-good flex items-center gap-2"
            style={{ opacity: 0 }}
          >
            <Icon name="wifiOff" size={22} stroke={2} />
            offline, still here
          </span>
        }
      >
        <PlannrDay />
      </Racer>

      {/* Between the phones: the conditions, then the result */}
      <div
        className="absolute flex flex-col items-center text-center"
        style={{
          left: MID.x,
          width: MID.w,
          top: 0,
          height: PHONE_TOP + PHONE_H,
        }}
      >
        <div className="mt-16 flex flex-col items-center gap-3">
          <Icon name="phone" size={40} className="text-muted" />
          <span className="text-muted text-[24px] leading-[1.3]">
            Same phone,
            <br />
            same 4G network
          </span>
        </div>

        <div className="relative w-full flex-1">
          <span className="vs font-display text-faint absolute inset-x-0 top-1/2 -translate-y-1/2 text-[34px] font-medium">
            vs
          </span>
          <div
            className="result absolute inset-x-0 top-1/2 flex -translate-y-[58%] flex-col items-center px-2"
            style={{ opacity: 0 }}
          >
            <div className="t-display text-accent tabular">
              <Ph>
                <span className="times">{Math.round(OLD_S / PLANNR_S)}×</span>
              </Ph>
            </div>
            <div className="text-fg mt-3 max-w-[240px] text-[30px] leading-[1.2] font-semibold tracking-[-0.01em] text-balance">
              faster on mobile data
            </div>
            <div className="note t-small text-muted mt-5 max-w-[260px] text-balance">
              Timings to be measured on campus
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One phone: its browser loading a page, and its stopwatch underneath. */
function Racer({
  x,
  url,
  insecure,
  done,
  plus,
  clockClass,
  caption,
  extra,
  children,
}: {
  x: number;
  url: string;
  insecure?: boolean;
  done?: boolean;
  /** Show a "+" after the clock once it stops: this one never finished. */
  plus?: boolean;
  clockClass: string;
  caption: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const bar = done ? "bar-new" : "bar-old";
  return (
    <>
      <div className="absolute" style={{ left: x, top: PHONE_TOP }}>
        <PhoneFrame height={PHONE_H} statusBar={false} screenBg="#ffffff">
          <div className="absolute inset-0">{children}</div>
          <MobileStatus offlineCapable={done} />
          {/* The browser's address bar, at the top, with its progress line. */}
          <div
            className="absolute inset-x-0 z-20 bg-[#f7f7f8]"
            style={{
              top: 54,
              height: 58,
              boxShadow: "inset 0 -1px 0 rgba(13,17,23,0.1)",
            }}
          >
            <div
              className="absolute flex items-center justify-center gap-1.5 rounded-[12px] bg-[#e7e8ea] text-[15px] text-[#2c3135]"
              style={{ left: 14, right: 14, top: 7, height: 40 }}
            >
              {insecure ? (
                <span className="flex items-center gap-1 font-semibold text-[#c5221f]">
                  <Icon name="alert" size={14} stroke={2.4} />
                  Not secure ·
                </span>
              ) : (
                <svg
                  width="10"
                  height="12"
                  viewBox="0 0 12 14"
                  aria-hidden
                  fill="currentColor"
                  opacity={0.6}
                >
                  <path d="M2 6V4.5a4 4 0 1 1 8 0V6h.5A1.5 1.5 0 0 1 12 7.5v5A1.5 1.5 0 0 1 10.5 14h-9A1.5 1.5 0 0 1 0 12.5v-5A1.5 1.5 0 0 1 1.5 6zm1.6 0h4.8V4.5a2.4 2.4 0 1 0-4.8 0z" />
                </svg>
              )}
              <span className="truncate">{url}</span>
            </div>
            <div
              className={`${bar} absolute bottom-0 left-0 h-1 w-full`}
              style={{ transform: "scaleX(0)", transformOrigin: "0% 50%" }}
            >
              <div
                className="bar-crawl h-full w-full bg-[#0a84ff]"
                style={{ transformOrigin: "0% 50%" }}
              />
            </div>
          </div>
        </PhoneFrame>
      </div>

      {/* Label and stopwatch */}
      <div
        className="absolute flex flex-col items-center"
        style={{ left: x, width: PHONE_W, top: LABEL_TOP }}
      >
        <span className="t-mono text-muted text-[22px]">{url}</span>
        <span
          className={`${clockClass}-wrap text-fg relative mt-1 flex items-center gap-3`}
        >
          <span className="t-mono text-[52px] leading-[1.1] font-bold tracking-[-0.03em] tabular-nums">
            <Ph>
              <span className={clockClass}>{fmt(0)}</span>
            </Ph>
            {plus && (
              <span
                className="plus-old text-warn ml-1 inline-block"
                style={{ opacity: 0 }}
              >
                +
              </span>
            )}
          </span>
          {done && (
            <span
              className="done-new bg-good flex h-10 w-10 items-center justify-center rounded-full text-white"
              style={{ opacity: 0 }}
            >
              <Icon name="check" size={24} stroke={3} />
            </span>
          )}
        </span>
        <span className="t-small relative mt-1 h-8 w-full">
          <span className="absolute inset-0 flex justify-center">
            {caption}
          </span>
          {extra && (
            <span className="absolute inset-0 flex justify-center">
              {extra}
            </span>
          )}
        </span>
      </div>
    </>
  );
}

/** Plannr's Today, as it paints. */
function PlannrDay() {
  return (
    <div
      className="paint-new absolute inset-0 bg-[#eef0f3]"
      style={{ opacity: 0 }}
    >
      <div className="px-5" style={{ paddingTop: 128 }}>
        <div className="text-[13px] font-medium text-[rgba(44,49,53,0.58)]">
          Mon 5 Oct · BCA-A
        </div>
        <div className="font-display text-[30px] leading-tight font-bold tracking-[-0.02em] text-[#0d1117]">
          Today
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 px-4">
        {DAY.map((c) => {
          const t = c.live ? LIVE : courseTone(c.title);
          return (
            <div
              key={c.title + c.time}
              className="cls rounded-[16px] px-4 py-3.5"
              style={{
                background: t.fill,
                boxShadow: `inset 0 0 0 1px ${t.ring}`,
                opacity: c.past ? 0.62 : 1,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[18px] leading-tight font-semibold text-[#0d1117]">
                  {c.title}
                </span>
                {c.live && (
                  <span className="rounded-full bg-[#0d1117] px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.06em] text-white">
                    NOW
                  </span>
                )}
              </div>
              <div className="mt-1 font-mono text-[13.5px] text-[rgba(44,49,53,0.75)]">
                {c.time} · {c.room}
              </div>
            </div>
          );
        })}
      </div>
      {/* Shown when the phone goes offline: slides up from under the tab bar. */}
      <div
        className="absolute inset-x-0 overflow-hidden"
        style={{ bottom: 96, height: 64 }}
      >
        <div
          className="offline-pill absolute inset-x-0 bottom-2 flex justify-center"
          style={{ transform: "translateY(90px)" }}
        >
          <span className="flex items-center gap-2 rounded-full bg-[#0d1117] px-4 py-2.5 text-[15px] font-semibold text-white shadow-lg">
            <Icon name="wifiOff" size={16} stroke={2.2} />
            Offline · saved 9:40
          </span>
        </div>
      </div>
      <MockTabBar active={0} />
    </div>
  );
}

/** The phone's top 54px on mobile data: signal, "4G", battery. */
function MobileStatus({ offlineCapable }: { offlineCapable?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-[#f7f7f8]"
      style={{ height: 54, padding: "0 30px 0 46px", color: "#0d1117" }}
    >
      <span
        className="text-[17px] font-semibold tracking-[-0.01em]"
        style={{ fontFamily: "-apple-system, var(--font-body)" }}
      >
        9:41
      </span>
      <span className="flex items-center gap-[6px]">
        <span className="relative flex items-center">
          {offlineCapable && (
            <span
              className="net-off absolute inset-y-0 right-0 flex items-center"
              style={{ opacity: 0 }}
            >
              <Plane />
            </span>
          )}
          <span
            className={[
              "flex items-center gap-[6px]",
              offlineCapable && "net-on",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
              <rect x="0" y="8" width="3" height="4" rx="1" fill="#0d1117" />
              <rect
                x="5"
                y="5.5"
                width="3"
                height="6.5"
                rx="1"
                fill="#0d1117"
              />
              <rect x="10" y="3" width="3" height="9" rx="1" fill="#0d1117" />
              <rect
                x="15"
                y="0"
                width="3"
                height="12"
                rx="1"
                fill="#0d1117"
                fillOpacity="0.25"
              />
            </svg>
            <span
              className="text-[14px] font-bold"
              style={{ fontFamily: "-apple-system, var(--font-body)" }}
            >
              4G
            </span>
          </span>
        </span>
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
          <rect
            x="0.5"
            y="0.5"
            width="23"
            height="12"
            rx="3.5"
            fill="none"
            stroke="#0d1117"
            strokeOpacity="0.4"
          />
          <rect x="2" y="2" width="14" height="9" rx="2" fill="#0d1117" />
          <path
            d="M25 4.5v4a2 2 0 0 0 0-4z"
            fill="#0d1117"
            fillOpacity="0.45"
          />
        </svg>
      </span>
    </div>
  );
}

/** Airplane mode, as the status bar draws it. */
function Plane() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#0d1117" aria-hidden>
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </svg>
  );
}
