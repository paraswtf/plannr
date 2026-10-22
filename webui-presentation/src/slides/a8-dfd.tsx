"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";
import { PlannrMark } from "~/ui/brand";

import { Card, Grad, Icon, SlideFrame, useSteps, type IconName } from "./_kit";

const EW = 290;
const CW = 330;
const W = 1664;
const CX = (W - CW) / 2;
const GAP = CX - EW;
const PITCH = 170;
const H = PITCH * 3;

interface Actor {
  name: string;
  icon: IconName;
  side: "l" | "r";
  row: number;
  grp: 0 | 1;
  into: string;
  out: string;
}

const ACTORS: Actor[] = [
  {
    name: "Students",
    icon: "cap",
    side: "l",
    row: 0,
    grp: 0,
    into: "sign-in, view request",
    out: "personal schedule, attendance summary, class change alerts",
  },
  {
    name: "Faculty",
    icon: "briefcase",
    side: "l",
    row: 1,
    grp: 0,
    into: "attendance marks, change requests",
    out: "teaching schedule, request status",
  },
  {
    name: "Coordinators",
    icon: "users",
    side: "l",
    row: 2,
    grp: 0,
    into: "approvals, class and room edits",
    out: "pending requests with clashes",
  },
  {
    name: "System admins",
    icon: "settings",
    side: "r",
    row: 0,
    grp: 0,
    into: "CSV imports, planner input",
    out: "import diff preview, plan",
  },
  {
    name: "Google",
    icon: "globe",
    side: "r",
    row: 1,
    grp: 1,
    into: "verified college identity",
    out: "calendar events: create, move, cancel",
  },
  {
    name: "College MRBS",
    icon: "database",
    side: "r",
    row: 2,
    grp: 1,
    into: "timetable export",
    out: "verification queries",
  },
];

function Flow({ a }: { a: Actor }) {
  const y0 = a.row * PITCH;
  const left = a.side === "l";
  const aE = left ? EW : W - EW;
  const pE = left ? CX : CX + CW;
  const aIn = y0 + 70;
  const aOut = y0 + 100;
  const head = (x: number, y: number, dir: 1 | -1) =>
    `M${x - 12 * dir} ${y - 8} L${x} ${y} L${x - 12 * dir} ${y + 8}`;
  const dirIn: 1 | -1 = left ? 1 : -1;
  const xa = aE;
  const xb = pE;
  return (
    <div className={`g${a.grp} absolute inset-0`}>
      <svg
        className="absolute inset-0"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={`M${xa} ${aIn} H${xb}`} />
        <path d={head(xb, aIn, dirIn)} />
        <path d={`M${xb} ${aOut} H${xa}`} />
        <path d={head(xa, aOut, -dirIn as 1 | -1)} />
      </svg>
      <p
        className="text-fg absolute text-center text-[23px] leading-[1.2]"
        style={{
          left: Math.min(aE, pE) + 12,
          width: GAP - 24,
          top: y0 + 12,
          height: 50,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {a.into}
      </p>
      <p
        className="text-muted absolute text-center text-[23px] leading-[1.2]"
        style={{ left: Math.min(aE, pE) + 12, width: GAP - 24, top: y0 + 112 }}
      >
        {a.out}
      </p>
    </div>
  );
}

function Entity({ a }: { a: Actor }) {
  return (
    <div
      className={`g${a.grp} absolute`}
      style={{
        left: a.side === "l" ? 0 : W - EW,
        top: a.row * PITCH + 20,
        width: EW,
        height: 130,
      }}
    >
      <Card className="flex h-full items-center gap-4 px-6">
        <Icon name={a.icon} size={44} className="text-accent shrink-0" />
        <p className="font-display text-fg text-[30px] leading-[1.1] font-semibold">
          {a.name}
        </p>
      </Card>
    </div>
  );
}

function Dfd({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".g1", { opacity: 0 });
    tl.to(".g1", { opacity: 1, duration: 0.7, ease: "deck.enter" }, ">");
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          One system, six parties, <Grad>every flow named</Grad>
        </>
      }
    >
      <div ref={visual} className="absolute inset-x-0 top-6 bottom-0">
        <div className="absolute top-0 left-0" style={{ width: W, height: H }}>
          {ACTORS.map((a) => (
            <Flow key={a.name} a={a} />
          ))}
          {ACTORS.map((a) => (
            <Entity key={a.name + "e"} a={a} />
          ))}
          <Card
            accent
            className="absolute flex flex-col items-center justify-center px-6 text-center"
            style={{ left: CX, top: 0, width: CW, height: H - 20 }}
          >
            <span
              className="font-display bg-accent tabular mb-5 flex h-[48px] w-[48px] items-center justify-center text-[28px] font-semibold text-white"
              style={{ borderRadius: "30%" }}
            >
              0
            </span>
            <PlannrMark height={64} />
            <p className="font-display text-fg mt-4 text-[40px] font-semibold">
              Plannr
            </p>
            <p className="text-body mt-2 text-[24px] leading-[1.25]">
              Timetable, attendance and scheduling system
            </p>
          </Card>
        </div>
        <p
          className="text-muted absolute left-0 text-[24px]"
          style={{ top: H + 14 }}
        >
          Level 1 has 8 processes and 7 stores. Arrows show the way the data
          travels.
        </p>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "dfd",
  title: "Data flow diagram",
  steps: 2,
  notes: [
    "This is the level 0 data flow diagram: Plannr as one process in the middle, and the people who use it. Students sign in and ask for their schedule, and get it back with attendance and change alerts. Faculty send attendance marks and change requests. Coordinators send approvals and edits and get the pending requests with their clashes. Admins send CSV imports and planner input and get a diff preview and a plan.",
    "Two outside systems. Google confirms who someone is and receives calendar events that Plannr creates, moves and cancels. The college MRBS gives us its timetable export and gets verification queries back. The level 1 diagram splits Plannr into 8 processes and 7 stores.",
  ],
  render: ({ step }) => <Dfd step={step} />,
};
