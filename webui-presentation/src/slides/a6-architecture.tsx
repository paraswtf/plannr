"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Card, Grad, Icon, SlideFrame, useSteps, type IconName } from "./_kit";

const W = 1664;
const MAIN_H = 200;
const EXT_Y = 292;
const EXT_H = 120;
const FLOW_Y = 470;

// Main row: browser, Next.js, Prisma, PostgreSQL (x, width).
const BR = { x: 0, w: 300 };
const NX = { x: 372, w: 560 };
const PR = { x: 1004, w: 280 };
const PG = { x: 1356, w: 308 };
// External row, four equal cards.
const EXT_W = 380;
const EXT_GAP = (W - 4 * EXT_W) / 3;
const extX = (i: number) => i * (EXT_W + EXT_GAP);

const EXTERNALS: {
  icon: IconName;
  name: string;
  body: string;
}[] = [
  {
    icon: "bell",
    name: "Web push service",
    body: "Wakes the phone, app closed",
  },
  {
    icon: "shield",
    name: "Google sign-in",
    body: "@sicsr.ac.in accounts only",
  },
  {
    icon: "calendar",
    name: "Google Calendar",
    body: "Cron drains the sync queue",
  },
  {
    icon: "database",
    name: "MRBS sync",
    body: "College timetable",
  },
];

const FLOW = [
  "Request",
  "Clash check",
  "Approval",
  "Timetable",
  "Calendar",
  "Notification",
];

function Layer({
  box,
  icon,
  title,
  children,
  accent,
  cls,
}: {
  box: { x: number; w: number };
  icon: IconName;
  title: string;
  children: ReactNode;
  accent?: boolean;
  cls: string;
}) {
  return (
    <div
      className={`${cls} absolute`}
      style={{ left: box.x, top: 0, width: box.w, height: MAIN_H }}
    >
      <Card accent={accent} className="h-full px-6 py-5">
        <div className="flex items-center gap-3">
          <Icon name={icon} size={36} className="text-accent shrink-0" />
          <p className="font-display text-fg text-[30px] leading-[1.1] font-semibold">
            {title}
          </p>
        </div>
        <div className="text-body mt-3 text-[24px] leading-[1.3]">
          {children}
        </div>
      </Card>
    </div>
  );
}

function Lines() {
  const sw = {
    stroke: "var(--accent)",
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const mid = MAIN_H / 2;
  const busY = MAIN_H + (EXT_Y - MAIN_H) / 2;
  const nxC = NX.x + NX.w / 2;
  const arrowR = (x: number, y: number) =>
    `M${x - 12} ${y - 8} L${x} ${y} L${x - 12} ${y + 8}`;
  const arrowD = (x: number, y: number) =>
    `M${x - 8} ${y - 12} L${x} ${y} L${x + 8} ${y - 12}`;
  const arrowU = (x: number, y: number) =>
    `M${x - 8} ${y + 12} L${x} ${y} L${x + 8} ${y + 12}`;
  const drops = [1, 2, 3].map((i) => extX(i) + EXT_W / 2);
  const wpDrop = extX(0) + EXT_W - 70;
  return (
    <>
      <svg
        className="lay absolute inset-0"
        width={W}
        height={FLOW_Y}
        viewBox={`0 0 ${W} ${FLOW_Y}`}
        fill="none"
        {...sw}
      >
        {/* browser, next, prisma, postgres */}
        <path d={`M${BR.x + BR.w} ${mid - 14} H${NX.x}`} />
        <path d={arrowR(NX.x, mid - 14)} />
        <path d={`M${NX.x} ${mid + 14} H${BR.x + BR.w}`} />
        <path
          d={arrowR(BR.x + BR.w, mid + 14).replace(/L/g, "L")}
          transform={`rotate(180 ${BR.x + BR.w} ${mid + 14})`}
        />
        <path d={`M${NX.x + NX.w} ${mid} H${PR.x}`} />
        <path d={arrowR(PR.x, mid)} />
        <path d={`M${PR.x + PR.w} ${mid} H${PG.x}`} />
        <path d={arrowR(PG.x, mid)} />
      </svg>
      <svg
        className="ext absolute inset-0"
        width={W}
        height={FLOW_Y}
        viewBox={`0 0 ${W} ${FLOW_Y}`}
        fill="none"
        {...sw}
      >
        {/* bus from Next.js down to the four services */}
        <path d={`M${nxC} ${MAIN_H} V${busY}`} />
        <path d={`M${wpDrop} ${busY} H${drops[2]}`} />
        <path d={`M${wpDrop} ${busY} V${EXT_Y - 2}`} />
        {drops.map((x) => (
          <path key={x} d={`M${x} ${busY} V${EXT_Y - 2}`} />
        ))}
        <path d={arrowD(wpDrop, EXT_Y - 2)} />
        {drops.map((x) => (
          <path key={"a" + x} d={arrowD(x, EXT_Y - 2)} />
        ))}
        {/* push reaches the browser */}
        <path
          d={`M${extX(0) + 90} ${EXT_Y - 2} V${MAIN_H + 2}`}
          strokeDasharray="2 9"
        />
        <path d={arrowU(extX(0) + 90, MAIN_H + 2)} />
      </svg>
    </>
  );
}

function Architecture({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".ext", { opacity: 0 });
    gsap.set(".flow", { opacity: 0, y: 16 });
    tl.to(
      ".ext",
      { opacity: 1, duration: 0.7, ease: "deck.enter", stagger: 0.08 },
      ">",
    );
    mark();
    tl.to(
      ".flow",
      { opacity: 1, y: 0, duration: 0.7, ease: "deck.enter" },
      ">",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          One app on one stack, <Grad>close to the college</Grad>
        </>
      }
      tech={[
        { name: "bom1" },
        { name: "server components" },
        { name: "TRPC (Ajax + REST)" },
        { name: "/api/v1" },
        { name: "Prisma" },
        { name: "cron" },
      ]}
    >
      <div ref={visual} className="absolute inset-x-0 top-6 bottom-0">
        <Lines />
        <Layer box={BR} icon="laptop" title="Browser" cls="lay">
          Phone or laptop, installed as an app
        </Layer>
        <Layer
          box={NX}
          icon="layers"
          title="Next.js on Vercel, Mumbai (bom1)"
          accent
          cls="lay"
        >
          Server components, TRPC (Ajax + REST) and the API at /api/v1
        </Layer>
        <Layer box={PR} icon="code" title="Prisma" cls="lay">
          Typed queries
        </Layer>
        <Layer box={PG} icon="database" title="PostgreSQL" cls="lay">
          Supabase, Mumbai
        </Layer>

        {EXTERNALS.map((e, i) => (
          <div
            key={e.name}
            className="ext absolute"
            style={{ left: extX(i), top: EXT_Y, width: EXT_W, height: EXT_H }}
          >
            <Card className="flex h-full items-center gap-4 px-6">
              <Icon name={e.icon} size={40} className="text-accent shrink-0" />
              <div>
                <p className="font-display text-fg text-[28px] leading-[1.1] font-semibold">
                  {e.name}
                </p>
                <p className="text-muted mt-1 text-[22px] leading-[1.2]">
                  {e.body}
                </p>
              </div>
            </Card>
          </div>
        ))}

        <div
          className="flow absolute flex items-center gap-3"
          style={{ left: 0, top: FLOW_Y, width: W }}
        >
          <p className="font-display text-fg mr-4 text-[26px] font-semibold">
            A change travels
          </p>
          {FLOW.map((f, i) => (
            <div key={f} className="flex items-center gap-3">
              <span
                className={`font-display rounded-[12px] px-5 py-3 text-[26px] font-semibold ${i === FLOW.length - 1 ? "bg-accent text-white" : "bg-sunken text-fg"}`}
              >
                {f}
              </span>
              {i < FLOW.length - 1 && (
                <Icon name="arrowRight" size={32} className="text-accent" />
              )}
            </div>
          ))}
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "architecture",
  title: "System architecture",
  steps: 3,
  notes: [
    "The browser, on a phone or laptop, talks to one Next.js app on Vercel in Mumbai. It renders server components, answers TRPC calls over Ajax and REST, and serves the public API under api slash v1. Prisma turns those into typed queries on PostgreSQL, hosted on Supabase in Mumbai.",
    "Four outside services. Google sign-in, only for college accounts. Google Calendar, filled by a cron that drains the sync queue. The MRBS import and sync, which reads the college's own timetable. And a web push service, which wakes the phone when a class changes.",
    "The path of a change: a request, a clash check, an approval, then the timetable, then the calendar, and last the notification.",
  ],
  render: ({ step }) => <Architecture step={step} />,
};
