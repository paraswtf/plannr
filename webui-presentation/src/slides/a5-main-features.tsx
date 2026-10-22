"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Card, Grad, Icon, SlideFrame, useSteps, type IconName } from "./_kit";

interface Feature {
  icon: IconName;
  name: string;
  body: string;
}

/** Three rows of four: what people get, what staff do, what keeps it running. */
const GROUPS: Feature[][] = [
  [
    {
      icon: "calendar",
      name: "Personal timetable",
      body: "Day, week, month. Swipe. Opens on your next class.",
    },
    {
      icon: "refresh",
      name: "Google Calendar sync",
      body: "Opt in once. Moves and cancellations follow.",
    },
    {
      icon: "bell",
      name: "Push notifications",
      body: "A changed class reaches your phone, app closed.",
    },
    {
      icon: "wifiOff",
      name: "Works offline",
      body: "Installs as an app and opens on what it last showed.",
    },
  ],
  [
    {
      icon: "checkCircle",
      name: "Attendance",
      body: "A register for every class: present, absent, late, excused.",
    },
    {
      icon: "inbox",
      name: "Requests and approvals",
      body: "One queue that shows clashes. Locks stop double booking.",
    },
    {
      icon: "alert",
      name: "Clash detection",
      body: "Room, teacher, group, capacity. Suggests the next free slot.",
    },
    {
      icon: "door",
      name: "Room booking",
      body: "One-off or recurring bookings.",
    },
  ],
  [
    {
      icon: "sparkles",
      name: "Timetable planner",
      body: "Generates a clash-free week. Review, approve, apply.",
    },
    {
      icon: "upload",
      name: "Bulk CSV import",
      body: "Preview every addition, change and removal first.",
    },
    {
      icon: "shield",
      name: "College sign-in",
      body: "Google, for @sicsr.ac.in accounts only.",
    },
    {
      icon: "code",
      name: "REST API and Siri",
      body: "OpenAPI documented. Ask Siri for your next class.",
    },
  ],
];

function Tile({ f, row }: { f: Feature; row: number }) {
  return (
    <Card className={`tr tr-${row} flex flex-col justify-center px-7 py-5`}>
      <div className="flex items-center gap-4">
        <span className="bg-accent-soft text-accent flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[12px]">
          <Icon name={f.icon} size={36} />
        </span>
        <p className="font-display text-fg text-[30px] leading-[1.1] font-semibold">
          {f.name}
        </p>
      </div>
      <p className="text-body mt-3 text-[24px] leading-[1.25]">{f.body}</p>
    </Card>
  );
}

function Features({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".tr-1, .tr-2", { opacity: 0.18 });
    [1, 2].forEach((r) => {
      tl.to(
        `.tr-${r}`,
        { opacity: 1, duration: 0.6, ease: "deck.enter", stagger: 0.07 },
        ">",
      );
      mark();
    });
  });

  return (
    <SlideFrame
      title={
        <>
          Everything a college week needs, <Grad>in one place</Grad>
        </>
      }
    >
      <div
        ref={visual}
        className="absolute inset-0 grid grid-cols-4 content-center gap-x-6 gap-y-6"
      >
        {GROUPS.flatMap((g, r) =>
          g.map((f) => <Tile key={f.name} f={f} row={r} />),
        )}
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "main-features",
  title: "Main features",
  steps: 3,
  notes: [
    "First what a student gets: a personal timetable that opens on the next class, Google Calendar sync, a push notification when a class changes, and an app that installs and still opens offline.",
    "Then how classes are run: attendance for every class, one approvals queue that shows clashes, clash detection on room, teacher, group and capacity, and room booking including recurring ones.",
    "And what keeps it going: a timetable planner, bulk CSV import with a preview, college only Google sign-in, and a REST API with OpenAPI and Siri.",
  ],
  render: ({ step }) => <Features step={step} />,
};
