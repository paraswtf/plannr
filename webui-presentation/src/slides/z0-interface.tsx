"use client";

import type { SlideDef } from "~/deck/types";

import { Browser, Grad, Phone, SlideFrame } from "./_kit";

/** Real frames from the running app, on the college's own timetable. */
const SHOTS = [
  {
    src: "/images/app/coordinator-timetable.png",
    url: "plannr.paraswtf.com/timetable",
    label: "The campus day, every room at once",
  },
  {
    src: "/images/app/coordinator-approvals.png",
    url: "plannr.paraswtf.com/approvals",
    label: "One queue, with clashes shown",
  },
  {
    src: "/images/app/coordinator-book.png",
    url: "plannr.paraswtf.com/book",
    label: "Book a room without a clash",
  },
  {
    src: "/images/app/coordinator-rooms.png",
    url: "plannr.paraswtf.com/rooms",
    label: "Every room and what is free now",
  },
] as const;

export const slide: SlideDef = {
  id: "interface",
  title: "Plannr's interface",
  steps: SHOTS.length,
  notes: [
    "This is the real app, with the college's real timetable in it. On the left, a student's day on a phone. On the right, the coordinator's timetable: every room, every class, today.",
    "The approvals queue. Each request shows what it would collide with before anyone decides.",
    "Booking a room, with live availability so a clash is seen before it is sent.",
    "And the rooms list, with what is free right now.",
  ],
  render: ({ step }) => <Interface step={step} />,
};

function Interface({ step }: { step: number }) {
  const shot = SHOTS[Math.min(step, SHOTS.length - 1)]!;
  return (
    <SlideFrame
      title={
        <>
          The real app, <Grad>on the real timetable</Grad>
        </>
      }
      subhead="Frames from Plannr running on the college's own data."
    >
      <div className="absolute inset-0 flex items-center justify-between">
        <div className="flex flex-col items-center gap-4">
          <Phone height={560}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/app/student-schedule.png"
              alt="A student's day on a phone"
              className="w-full object-cover object-top"
              style={{ marginTop: 48, height: "calc(100% - 48px)" }}
            />
          </Phone>
          <p className="text-muted text-[22px]">
            A student&rsquo;s day, opened on the next class
          </p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <Browser url={shot.url} width={1000} height={560}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={shot.src}
              src={shot.src}
              alt={shot.label}
              className="h-full w-full object-cover object-left-top"
            />
          </Browser>
          <p className="text-fg text-[24px] font-medium">{shot.label}</p>
        </div>
      </div>
    </SlideFrame>
  );
}
