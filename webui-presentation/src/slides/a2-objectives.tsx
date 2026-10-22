"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Grad, Icon, SlideFrame, useSteps, type IconName } from "./_kit";

const OBJECTIVES: { icon: IconName; text: string }[] = [
  {
    icon: "user",
    text: "A personal timetable: only your own classes, on any device",
  },
  {
    icon: "shield",
    text: "Clash-free scheduling, with approvals in one queue",
  },
  {
    icon: "clipboard",
    text: "Attendance for every class, no setup per lecture",
  },
  {
    icon: "calendarCheck",
    text: "Changes follow into students' Google Calendar",
  },
  { icon: "zap", text: "Replace hand-booking with a timetable planner" },
  { icon: "database", text: "Work with the college's existing MRBS data" },
];

function Objectives({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".ob", { opacity: 0.18 });
    for (let i = 0; i < 3; i++) {
      tl.to(
        `.ob-${i}, .ob-${i + 3}`,
        { opacity: 1, duration: 0.6, ease: "deck.enter", stagger: 0.1 },
        ">",
      );
      mark();
    }
  });

  return (
    <SlideFrame
      title={
        <>
          Six things Plannr sets out <Grad>to do</Grad>
        </>
      }
    >
      <div
        ref={visual}
        className="absolute inset-0 grid grid-flow-col grid-cols-2 grid-rows-3 gap-x-16"
      >
        {OBJECTIVES.map((o, i) => (
          <div
            key={o.text}
            className={`ob ob-${i} flex items-center gap-6 border-t`}
            style={{ borderColor: "var(--line-strong)" }}
          >
            <span
              className="font-display tabular bg-accent flex h-[56px] w-[56px] shrink-0 items-center justify-center text-[30px] font-semibold text-white"
              style={{ borderRadius: "30%" }}
            >
              {i + 1}
            </span>
            <Icon name={o.icon} size={48} className="text-accent shrink-0" />
            <p className="text-fg text-[30px] leading-[1.2]">{o.text}</p>
          </div>
        ))}
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "objectives",
  title: "Objectives",
  steps: 4,
  notes: [
    "We set out six objectives for Plannr.",
    "One, a personal timetable that shows only your own classes, on any device. Two, clash-free scheduling, with every request in one approvals queue.",
    "Three, attendance for every class, with no setup per lecture. Four, changes that follow into students' Google Calendar.",
    "Five, replace hand-booking with a timetable planner. Six, work with the college's existing MRBS data, so nobody starts from scratch.",
  ],
  render: ({ step }) => <Objectives step={step} />,
};
