"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Grad, Icon, Phone, SlideFrame, useSteps } from "./_kit";
import type { IconName } from "./_kit";

const INK = "#0d1117";
const SLATE = "#5b6573";
const BERRY = "#c8305f";

interface Row {
  time: string;
  title: string;
  room: string;
  tone: string;
  tag?: string;
  state?: "done" | "next";
}

const STUDENT: Row[] = [
  {
    time: "09:00",
    title: "Design Thinking",
    room: "Room 403",
    tone: "#3b6fd4",
    state: "done",
  },
  {
    time: "11:00",
    title: "Web UI and CMS",
    room: "Room 402",
    tone: "#1f9d78",
    state: "next",
  },
  { time: "14:30", title: "Databases", room: "Lab 2", tone: "#d98324" },
];

const TEACHER: Row[] = [
  {
    time: "09:00",
    title: "Web UI and CMS",
    room: "Room 402",
    tone: "#1f9d78",
    tag: "Group A",
    state: "done",
  },
  {
    time: "11:00",
    title: "Web UI and CMS",
    room: "Lab 2",
    tone: "#1f9d78",
    tag: "Group B",
    state: "next",
  },
  {
    time: "14:30",
    title: "Databases",
    room: "Room 403",
    tone: "#d98324",
    tag: "Group A",
  },
];

function DayScreen({
  heading,
  sub,
  rows,
}: {
  heading: string;
  sub: string;
  rows: Row[];
}) {
  return (
    <div
      className="absolute inset-0"
      style={{ background: "#f4f5f8", color: INK, padding: "70px 22px 0" }}
    >
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 54,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {heading}
      </p>
      <p style={{ fontSize: 30, color: SLATE, marginTop: 8 }}>{sub}</p>
      <div
        style={{
          marginTop: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px",
          borderRadius: 999,
          background: "rgba(200,48,95,0.1)",
          color: BERRY,
          fontSize: 24,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        Opened on the next class
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => (
          <div key={r.time}>
            {i === 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "-4px 0 10px",
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: BERRY,
                  }}
                />
                <span style={{ flex: 1, height: 4, background: BERRY }} />
                <span style={{ fontSize: 26, fontWeight: 700, color: BERRY }}>
                  10:40
                </span>
              </div>
            )}
            <div
              style={{
                marginBottom: 9,
                borderRadius: 22,
                padding: "10px 18px 12px 24px",
                background: r.state === "next" ? "#ffffff" : "#fbfbfc",
                position: "relative",
                opacity: r.state === "done" ? 0.55 : 1,
                boxShadow:
                  r.state === "next"
                    ? `inset 0 0 0 4px ${BERRY}, 0 10px 24px -10px rgba(200,48,95,0.5)`
                    : "inset 0 0 0 2px #e3e6ec",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 18,
                  bottom: 18,
                  width: 8,
                  borderRadius: 4,
                  background: r.tone,
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 30,
                  fontWeight: 600,
                  color: SLATE,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span>{r.time}</span>
                <span style={{ fontFamily: "var(--font-body)" }}>{r.room}</span>
              </div>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 38,
                  fontWeight: 600,
                  marginTop: 4,
                  lineHeight: 1.1,
                }}
              >
                {r.title}
              </p>
              {r.tag && (
                <span
                  style={{
                    display: "inline-block",
                    marginTop: 4,
                    padding: "1px 14px",
                    borderRadius: 999,
                    background: "#eceef3",
                    fontSize: 26,
                    fontWeight: 600,
                    color: SLATE,
                  }}
                >
                  {r.tag}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const POINTS: { icon: IconName; text: string }[] = [
  { icon: "user", text: "Only your classes, found from your groups" },
  { icon: "target", text: "The next class is lit up for you" },
  { icon: "clock", text: "A now-line shows where the day is" },
];

const VIEWS = ["Student", "Faculty", "Coordinator"];

function Schedule({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".ps-teacher", { opacity: 0, x: -60 });
    gsap.set(".ps-views", { opacity: 0 });
    gsap.set(".ps-arrow", { opacity: 0 });
    tl.to(".ps-points", { opacity: 0, x: 40, duration: 0.5 }, 0.01);
    tl.to(
      ".ps-views",
      { opacity: 1, duration: 0.6, ease: "deck.enter" },
      ">-0.1",
    );
    tl.to(
      ".ps-teacher",
      { opacity: 1, x: 0, duration: 0.8, ease: "deck.enter" },
      "<",
    );
    tl.to(".ps-arrow", { opacity: 1, duration: 0.5 }, "<0.3");
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          Your day, <Grad>not the college&apos;s</Grad>
        </>
      }
      subhead="Open Plannr and see only your own classes, already scrolled to what is next."
      tech={[
        { name: "mySchedule" },
        { name: "ownedOccurrenceClauses" },
        { name: "nextClassMoment" },
        { name: "perspectivesFor" },
        { name: "asUserId" },
        { name: "groupId in memberships" },
      ]}
    >
      <div
        ref={visual}
        className="absolute inset-0 flex items-center justify-between"
      >
        <div className="flex flex-col items-center gap-3">
          <Phone height={496}>
            <DayScreen heading="My day" sub="Thu 22 Oct" rows={STUDENT} />
          </Phone>
        </div>

        <div className="relative h-full flex-1">
          <ul className="ps-points absolute inset-0 flex flex-col justify-center gap-9 pl-20">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-6">
                <span className="bg-accent-soft text-accent flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full">
                  <Icon name={p.icon} size={36} />
                </span>
                <span className="text-fg text-[34px] leading-tight font-medium">
                  {p.text}
                </span>
              </li>
            ))}
          </ul>
          <div className="ps-views absolute inset-0 flex flex-col justify-center px-16">
            <p className="t-label text-muted text-[24px]">View as</p>
            <div className="mt-5 flex items-center gap-4">
              {VIEWS.map((v) => {
                const on = v === "Faculty";
                return (
                  <span
                    key={v}
                    className={`rounded-full px-8 py-4 text-[32px] font-semibold ${on ? "bg-accent text-white" : "bg-raised text-body shadow-[inset_0_0_0_1.5px_var(--line-strong)]"}`}
                  >
                    {v}
                  </span>
                );
              })}
            </div>
            <p className="text-fg font-display mt-9 text-[40px] leading-[1.15] font-semibold">
              One page that adapts to who you are
            </p>
            <p className="text-muted mt-3 text-[26px] leading-snug">
              Your own views come first. A coordinator can view as someone else.
            </p>
          </div>
        </div>

        <div className="ps-teacher flex flex-col items-center gap-3">
          <Phone height={496}>
            <DayScreen heading="Teaching" sub="Thu 22 Oct" rows={TEACHER} />
          </Phone>
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "personal-schedule",
  title: "Personalised schedule",
  steps: 2,
  notes: [
    "This is My day for a student. Only the classes of their own groups are there, with the time and the room. The next class is highlighted, a now-line shows where the day is, and the page opens on that class, so nobody scrolls from midnight.",
    "The same page for a teacher says Teaching, and lists their classes by group. The View as chips show Student, Faculty and Coordinator. It is one page, and it follows who you are.",
  ],
  render: ({ step }) => <Schedule step={step} />,
};
