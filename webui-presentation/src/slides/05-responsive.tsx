"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Grad, Icon, Phone, SlideFrame, useSteps } from "./_kit";
import type { IconName } from "./_kit";

const INK = "#0d1117";
const SLATE = "#5b6573";
const BERRY = "#c8305f";
const S = 0.5;

const NAV: { icon: IconName; label: string }[] = [
  { icon: "calendar", label: "Schedule" },
  { icon: "grid", label: "Timetable" },
  { icon: "door", label: "Rooms" },
  { icon: "settings", label: "Settings" },
];

function Mark({ size = 36 }: { size?: number }) {
  return (
    <span className="flex items-center gap-3">
      <span
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.3,
          background: `linear-gradient(135deg, #f0883e, ${BERRY} 55%, #6d3fc4)`,
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: size * 0.95,
          color: INK,
        }}
      >
        Plannr
      </span>
    </span>
  );
}

/** A few class blocks, standing in for the page behind the chrome. */
function Page({ cols, big = 40 }: { cols: number; big?: number }) {
  const tones = ["#3b6fd4", "#1f9d78", "#d98324", "#7a5bd0"];
  const names = [
    "Design Thinking",
    "Web UI and CMS",
    "Databases",
    "Networks",
    "Statistics",
    "Python Lab",
    "Ethics",
    "Algorithms",
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 14,
      }}
    >
      {names.slice(0, cols === 1 ? 3 : cols === 2 ? 4 : 8).map((n, i) => (
        <div
          key={n}
          style={{
            background: "#fff",
            borderRadius: 16,
            boxShadow: "inset 0 0 0 2px #e3e6ec",
            padding: "14px 16px 14px 24px",
            position: "relative",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: big,
            color: INK,
            lineHeight: 1.1,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 12,
              bottom: 12,
              width: 8,
              borderRadius: 4,
              background: tones[i % 4],
            }}
          />
          {n}
        </div>
      ))}
    </div>
  );
}

function TopBar({
  ring = false,
  big = false,
}: {
  ring?: boolean;
  big?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-4"
      style={{
        height: 52,
        padding: "0 14px",
        background: "#fff",
        boxShadow: "inset 0 -2px 0 #e3e6ec",
      }}
    >
      <span
        className={ring ? "rs-ham" : undefined}
        style={{
          display: "flex",
          width: 40,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 10,
          color: INK,
        }}
      >
        <Icon name="menu" size={big ? 44 : 30} />
      </span>
      <Mark size={big ? 38 : 30} />
    </div>
  );
}

function PhoneScreen() {
  return (
    <div className="absolute inset-0" style={{ background: "#f4f5f8" }}>
      <div style={{ paddingTop: 54 }}>
        <TopBar ring />
      </div>
      <div style={{ padding: "20px 18px" }}>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 52,
            fontWeight: 700,
            color: INK,
            marginBottom: 16,
          }}
        >
          Timetable
        </p>
        <Page cols={1} big={38} />
      </div>
      <div
        className="rs-scrim absolute inset-0"
        style={{ background: "rgba(13,17,23,0.45)" }}
      />
      <div
        className="rs-drawer absolute top-0 left-0 h-full"
        style={{
          width: 272,
          background: "#fff",
          padding: "70px 16px 0",
          boxShadow: "12px 0 40px rgba(13,17,23,0.25)",
        }}
      >
        <div style={{ padding: "0 8px 22px" }}>
          <Mark size={36} />
        </div>
        {NAV.map((n, i) => (
          <div
            key={n.label}
            className="flex items-center gap-4"
            style={{
              height: 66,
              padding: "0 14px",
              borderRadius: 14,
              fontSize: 38,
              fontWeight: 600,
              background: i === 1 ? "#eef0f6" : "transparent",
              color: i === 1 ? INK : SLATE,
            }}
          >
            <Icon name={n.icon} size={36} />
            {n.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Screen({
  w,
  h,
  children,
  className,
}: {
  w: number;
  h: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        width: w * S,
        height: h * S,
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        background: "#f4f5f8",
        boxShadow:
          "inset 0 0 0 1.5px rgba(16,24,40,0.18), 0 40px 80px -30px rgba(16,24,40,0.4)",
      }}
    >
      <div
        style={{
          width: w,
          height: h,
          transform: `scale(${S})`,
          transformOrigin: "top left",
          position: "absolute",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Tablet() {
  return (
    <Screen w={768} h={600}>
      <TopBar big />
      <div style={{ padding: "26px 28px" }}>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 56,
            fontWeight: 700,
            color: INK,
            marginBottom: 20,
          }}
        >
          Timetable
        </p>
        <Page cols={2} big={42} />
      </div>
    </Screen>
  );
}

const FULL = 244;
const RAIL = 68;

function Desktop() {
  return (
    <Screen w={1366} h={768}>
      <div
        className="rs-side absolute top-0 left-0 h-full overflow-hidden"
        style={{
          width: FULL,
          background: "#fff",
          boxShadow: "inset -2px 0 0 #e3e6ec",
          padding: "24px 12px",
        }}
      >
        <div className="rs-brand" style={{ padding: "0 8px 24px", height: 70 }}>
          <Mark size={36} />
        </div>
        {NAV.map((n, i) => (
          <div
            key={n.label}
            className="flex items-center gap-3"
            style={{
              height: 66,
              padding: "0 12px",
              borderRadius: 14,
              fontSize: 34,
              fontWeight: 600,
              whiteSpace: "nowrap",
              background: i === 1 ? "#eef0f6" : "transparent",
              color: i === 1 ? INK : SLATE,
            }}
          >
            <Icon name={n.icon} size={34} className="shrink-0" />
            <span className="rs-label">{n.label}</span>
          </div>
        ))}
      </div>
      <div
        className="rs-main absolute top-0 right-0 h-full"
        style={{ left: FULL, padding: "40px 44px" }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 64,
            fontWeight: 700,
            color: INK,
            marginBottom: 26,
          }}
        >
          Timetable
        </p>
        <Page cols={4} big={38} />
      </div>
    </Screen>
  );
}

function Caption({ title, note }: { title: string; note: string }) {
  return (
    <div className="mt-4 text-center">
      <p className="font-display text-fg text-[28px] leading-none font-semibold">
        {title}
      </p>
      <p className="text-muted mt-2 text-[22px] leading-tight">{note}</p>
    </div>
  );
}

function Responsive({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".rs-drawer", { x: -272 });
    gsap.set(".rs-scrim", { opacity: 0 });
    gsap.set(".rs-rail-tag", { opacity: 0, y: 10 });

    // 1: the phone, drawer open
    tl.to(
      [".rs-tablet", ".rs-desktop"],
      { opacity: 0.35, duration: 0.5 },
      0.01,
    );
    tl.to(".rs-scrim", { opacity: 1, duration: 0.5 }, "<");
    tl.to(".rs-drawer", { x: 0, duration: 0.7, ease: "deck.enter" }, "<");
    mark();

    // 2: the desktop, sidebar folds to the rail
    tl.to(".rs-phone", { opacity: 0.35, duration: 0.5 }, "s1");
    tl.to(".rs-desktop", { opacity: 1, duration: 0.5 }, "<");
    tl.to(
      ".rs-side",
      { width: RAIL, duration: 0.9, ease: "deck.morph" },
      "<0.2",
    );
    tl.to(".rs-main", { left: RAIL, duration: 0.9, ease: "deck.morph" }, "<");
    tl.to(".rs-label, .rs-brand", { opacity: 0, duration: 0.4 }, "<");
    tl.to(".rs-rail-tag", { opacity: 1, y: 0, duration: 0.5 }, ">-0.2");
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          One app for the phone in your hand <Grad>and the lab PC</Grad>
        </>
      }
      subhead="The same screens fit a small phone and a big monitor, and the menu moves to suit."
      tech={[
        { name: "sm / lg breakpoints" },
        { name: "100svh" },
        { name: "pointer: coarse" },
        { name: "prefers-reduced-motion" },
        { name: "env(safe-area-inset-bottom)" },
      ]}
    >
      <div
        ref={visual}
        className="absolute inset-0 flex items-end justify-between"
      >
        <div className="rs-phone flex flex-col items-center">
          <Phone height={S * 878}>
            <PhoneScreen />
          </Phone>
          <Caption title="Phone" note="Top bar and drawer" />
        </div>

        <div className="rs-tablet flex flex-col items-center">
          <Tablet />
          <Caption title="768px wide" note="Still the drawer" />
        </div>

        {/* the lg marker */}
        <div className="relative flex h-full w-[290px] flex-col items-center">
          <span
            className="mt-6 rounded-full px-5 py-2 text-[26px] font-bold text-white"
            style={{ background: BERRY, fontFamily: "var(--font-mono)" }}
          >
            lg 1024px
          </span>
          <div
            className="mt-4 flex w-full items-center justify-between text-[24px] font-semibold"
            style={{ color: BERRY }}
          >
            <span>&larr; drawer</span>
            <span>sidebar &rarr;</span>
          </div>
          <span
            className="mt-4 mb-[110px] flex-1"
            style={{ borderLeft: `4px dashed ${BERRY}` }}
          />
        </div>

        <div className="rs-desktop relative flex flex-col items-center">
          <Desktop />
          <Caption title="Desktop" note="Sidebar, folds to a 68px rail" />
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "responsive",
  title: "Responsive",
  steps: 3,
  notes: [
    "Three widths of the same app. The one marker that matters is lg, 1024 pixels. Below it you get a top bar and a drawer. From it up you get a sidebar.",
    "On a phone a hamburger opens a drawer. It traps focus, closes with Escape, and puts focus back where it was.",
    "On a desktop the sidebar folds down to a 68 pixel icon rail, and the page gets the room. The fold is saved in a cookie that the server reads, so there is no jump when the page loads.",
  ],
  render: ({ step }) => <Responsive step={step} />,
};
