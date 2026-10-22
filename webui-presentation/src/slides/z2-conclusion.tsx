"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Card, Grad, Icon, SlideFrame, useSteps } from "./_kit";

const DELIVERED = [
  "Push on class changes",
  "Offline PWA",
  "Students cannot self book rooms",
  "Booking approval stays",
];

const FUTURE = [
  "Email and in-app change notifications",
  "Daily report of classes held",
  "Faculty availability and QR self check in",
  "Tests and marks",
  "Assignments and deadlines",
  "Course material uploads",
  "Admin dashboard and audit log",
];

function Conclusion({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".cc-d", { opacity: 0, y: 24 });
    gsap.set(".cc-f", { opacity: 0, y: 24 });
    tl.to(
      ".cc-d",
      { opacity: 1, y: 0, duration: 0.7, ease: "deck.enter" },
      ">",
    );
    mark();
    tl.to(
      ".cc-f",
      { opacity: 1, y: 0, duration: 0.7, ease: "deck.enter" },
      ">",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          One desktop page became <Grad>your own timetable</Grad>
        </>
      }
      subhead="Attendance, approvals and a planner, built on the data the college already holds."
    >
      <div
        ref={visual}
        className="absolute inset-0 grid grid-cols-2 items-start gap-12 pt-10"
      >
        <Card accent className="cc-d px-9 py-8">
          <div className="flex items-center gap-4">
            <Icon name="checkCircle" size={44} className="text-accent" />
            <p className="font-display text-fg text-[34px] font-semibold">
              Delivered since the first version
            </p>
          </div>
          <ul className="mt-6">
            {DELIVERED.map((d) => (
              <li
                key={d}
                className="text-fg border-t py-4 text-[28px]"
                style={{ borderColor: "var(--accent-line)" }}
              >
                {d}
              </li>
            ))}
          </ul>
        </Card>
        <div className="cc-f">
          <p className="font-display text-fg text-[34px] font-semibold">
            Future scope
          </p>
          <ul className="mt-4">
            {FUTURE.map((f) => (
              <li
                key={f}
                className="text-body border-t py-[10px] text-[26px]"
                style={{ borderColor: "var(--line)" }}
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "conclusion",
  title: "Conclusion and future scope",
  steps: 3,
  notes: [
    "Plannr turns the college's single desktop page into a personal timetable with attendance, approvals and a planner, built on the data the college already holds.",
    "Since the first version we have delivered push notifications on class changes and an offline PWA. Students can no longer self book rooms, and booking approval stays.",
    "Future scope: email and in-app change notifications, a daily report of classes held, faculty availability and QR self check in, tests and marks, assignments and deadlines, course material uploads, and an admin dashboard with an audit log.",
  ],
  render: ({ step }) => <Conclusion step={step} />,
};
