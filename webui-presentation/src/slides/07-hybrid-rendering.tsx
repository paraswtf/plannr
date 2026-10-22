"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";
import { courseTone } from "~/ui/mock";

import { Card, Grad, Icon, SlideFrame, useSteps } from "./_kit";

const SLOW = [
  { label: "Blank page", w: 150, fill: false },
  { label: "Download JS", w: 240, fill: false },
  { label: "Fetch data", w: 240, fill: false },
  { label: "Draw", w: 150, fill: true },
];

function Bar({
  parts,
  cls,
}: {
  parts: { label: string; w: number; fill: boolean; soft?: boolean }[];
  cls: string;
}) {
  return (
    <div className="flex gap-1">
      {parts.map((p) => (
        <div
          key={p.label}
          className={`${cls} flex h-[76px] items-center rounded-[12px] px-4 text-[22px] leading-tight font-medium ${p.fill ? "bg-accent text-white" : p.soft ? "bg-accent-soft text-fg" : "bg-sunken text-body"}`}
          style={{
            width: p.w,
            boxShadow: p.fill ? undefined : "inset 0 0 0 1px var(--line)",
          }}
        >
          {p.label}
        </div>
      ))}
    </div>
  );
}

function Flag({
  children,
  x,
  cls,
}: {
  children: string;
  x: number;
  cls: string;
}) {
  return (
    <div
      className={`${cls} absolute top-[124px] flex flex-col items-start`}
      style={{ left: x }}
    >
      <span className="bg-fg block h-[14px] w-[2px]" />
      <span className="text-fg -ml-px text-[22px] font-semibold whitespace-nowrap">
        {children}
      </span>
    </div>
  );
}

function Facts() {
  return (
    <div className="facts grid grid-cols-3 gap-8">
      <div>
        <div className="flex h-[44px] items-center gap-2" aria-hidden>
          {[120, 70, 90].map((w) => (
            <span
              key={w}
              className="bg-sunken block h-[18px] rounded-[6px]"
              style={{ width: w }}
            />
          ))}
        </div>
        <p className="t-mono text-fg text-[22px] font-medium">loading.tsx</p>
        <p className="text-muted text-[22px] leading-tight">
          A skeleton between click and data
        </p>
      </div>
      <div>
        <div className="flex h-[44px] items-center">
          <Icon name="refresh" size={36} className="text-accent" />
        </div>
        <p className="t-mono text-fg text-[22px] font-medium">
          staleTime: 30_000
        </p>
        <p className="text-muted text-[22px] leading-tight">
          HydrateClient hands react-query warm data
        </p>
      </div>
      <div>
        <div className="flex h-[44px] items-center">
          <Icon name="mapPin" size={36} className="text-accent" />
        </div>
        <p className="t-mono text-fg text-[22px] font-medium">bom1</p>
        <p className="text-muted text-[22px] leading-tight">
          Same city as Supabase, Mumbai
        </p>
      </div>
    </div>
  );
}

function PageSketch() {
  const t = courseTone("Design Thinking");
  const t2 = courseTone("Web Technologies");
  return (
    <Card className="sk-page w-[560px] overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ background: "var(--sunken)" }}
      >
        <span className="font-display text-fg text-[24px] font-semibold">
          Plannr
        </span>
        <span className="text-muted text-[22px]">Static shell</span>
      </div>
      <div className="relative p-5">
        <div
          className="sk-island rounded-[16px] p-4"
          style={{
            boxShadow: "inset 0 0 0 2px var(--accent)",
            borderStyle: "dashed",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="t-mono text-accent text-[22px] font-semibold">
              ScheduleView
            </span>
            <span className="text-accent text-[22px]">Client island</span>
          </div>
          <div className="flex gap-3">
            {[
              [t, "Design Thinking"],
              [t2, "Web Technologies"],
            ].map(([tone, name]) => (
              <div
                key={name as string}
                className="flex-1 rounded-xl px-3 py-4 text-[22px] leading-tight font-semibold"
                style={{
                  background: (tone as typeof t).fill,
                  boxShadow: `inset 0 0 0 1px ${(tone as typeof t).ring}`,
                  color: "#0d1117",
                }}
              >
                {name as string}
              </div>
            ))}
          </div>
        </div>
        <p className="text-fg mt-4 text-[22px] font-semibold">
          Server Component
        </p>
        <p className="text-muted text-[22px] leading-tight">
          Fetches your data, sends finished HTML
        </p>
      </div>
    </Card>
  );
}

export const slide: SlideDef = {
  id: "hybrid-rendering",
  title: "Hybrid rendering",
  steps: 2,
  notes: [
    "The usual single page app starts with a blank page. It downloads its JavaScript, then asks the server for your data, and only then draws. You stare at nothing until the last step.",
    "Plannr does it the other way round. The page is a server component. It awaits your schedule on the server, renders real HTML with your classes on it, and only then does a small client view, ScheduleView, hydrate for interaction. A loading skeleton covers the wait between click and data, react-query starts warm with a thirty second stale time, and the server runs in Mumbai, next to the database.",
  ],
  render: ({ step }) => <Hybrid step={step} />,
};

function Hybrid({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".pl-row", { opacity: 0, y: 24 });
    gsap.set(".facts > div", { opacity: 0, y: 16 });
    gsap.set(".sk-page", { opacity: 0, x: 40 });

    tl.to(".slow-row", { opacity: 0.55, duration: 0.5, ease: "deck.enter" });
    tl.to(
      ".pl-row",
      { opacity: 1, y: 0, duration: 0.7, ease: "deck.enter" },
      "<",
    );
    tl.to(
      ".sk-page",
      { opacity: 1, x: 0, duration: 0.8, ease: "deck.enter" },
      "<0.2",
    );
    tl.to(
      ".facts > div",
      { opacity: 1, y: 0, duration: 0.5, ease: "deck.enter", stagger: 0.12 },
      "<0.3",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          The page arrives with <Grad>your data already on it</Grad>
        </>
      }
      subhead="The server renders your schedule, then a small client view takes over."
      tech={[
        { name: "Server Components" },
        { name: "await api.timetable.mySchedule" },
        { name: "HydrateClient" },
        { name: "loading.tsx" },
        { name: "staleTime: 30_000" },
        { name: "bom1" },
      ]}
    >
      <div ref={visual} className="absolute inset-x-0 top-6 bottom-0">
        <div className="absolute top-0 left-0 w-[1040px]">
          <div className="slow-row relative h-[172px]">
            <p className="text-fg text-[26px] font-semibold">
              Client-only app{" "}
              <span className="text-muted font-normal">
                nothing to see until the end
              </span>
            </p>
            <div className="mt-2">
              <Bar parts={SLOW} cls="slow-seg" />
            </div>
            <Flag x={642} cls="slow-flag">
              Your schedule
            </Flag>
          </div>
          <div className="pl-row relative mt-[14px] h-[172px]">
            <p className="text-fg text-[26px] font-semibold">
              <span className="text-accent">Plannr</span>{" "}
              <span className="text-muted font-normal">
                real HTML first, then it comes alive
              </span>
            </p>
            <div className="mt-2">
              <Bar
                parts={[
                  {
                    label: "Server renders HTML with your schedule",
                    w: 400,
                    fill: true,
                  },
                  {
                    label: "Client view hydrates",
                    w: 260,
                    fill: false,
                    soft: true,
                  },
                ]}
                cls="pl-seg"
              />
            </div>
            <Flag x={404} cls="pl-flag">
              Your schedule, already here
            </Flag>
          </div>
          <div className="mt-[18px]">
            <Facts />
          </div>
        </div>
        <div className="absolute top-0 right-0">
          <PageSketch />
        </div>
      </div>
    </SlideFrame>
  );
}
