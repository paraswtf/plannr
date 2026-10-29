"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Grad, SlideFrame, useSteps } from "./_kit";

const TECH = [
  "Next.js 15",
  "React 19",
  "TypeScript",
  "tRPC",
  "Prisma",
  "PostgreSQL",
  "Auth.js + Google",
  "Tailwind CSS v4",
  "Vercel serverless",
  "REST API + OpenAPI",
  "Google Calendar API",
  "Vitest",
];

const CONCEPTS = [
  {
    name: "Ajax",
    say: "Every screen loads and saves with asynchronous JSON calls (tRPC, REST)",
  },
  {
    name: "DOM",
    say: "React updates the DOM; direct DOM APIs for swipe and measuring",
  },
  {
    name: "Server-side database",
    say: "Prisma and PostgreSQL in Node.js, the role PHP and MySQL play in LAMP",
  },
  {
    name: "LAMP integration",
    say: "Imports and reconciles the college's MRBS timetable, with a preview",
  },
];

function TechUsed({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".cn", { opacity: 0.18 });
    tl.to(
      ".cn",
      { opacity: 1, duration: 0.6, ease: "deck.enter", stagger: 0.12 },
      ">",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          Modern tools on <Grad>the syllabus</Grad>
        </>
      }
    >
      <div ref={visual} className="absolute inset-0 flex gap-14 pt-8">
        <ul className="flex w-[560px] shrink-0 flex-wrap content-start gap-3">
          {TECH.map((t) => (
            <li
              key={t}
              className="bg-raised t-mono text-fg rounded-[12px] px-5 py-3 text-[24px] font-medium shadow-[inset_0_0_0_1px_var(--line-strong)]"
            >
              {t}
            </li>
          ))}
        </ul>
        <div className="flex flex-1 flex-col">
          <p className="text-muted text-[24px]">
            Syllabus concepts, as applied
          </p>
          <ul className="mt-2">
            {CONCEPTS.map((c) => (
              <li
                key={c.name}
                className="cn flex items-baseline gap-6 border-t py-3"
                style={{ borderColor: "var(--line-strong)" }}
              >
                <span className="font-display text-accent w-[250px] shrink-0 text-[30px] font-semibold">
                  {c.name}
                </span>
                <span className="text-body text-[25px] leading-[1.2]">
                  {c.say}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "tech-used",
  title: "Technology used",
  steps: 2,
  notes: [
    "This is the stack: Next.js 15 and React 19 in TypeScript, tRPC and a REST API with OpenAPI, Prisma on PostgreSQL, Auth.js with Google, Tailwind, Vercel, the Google Calendar API, and Vitest for tests.",
    "And here is how it maps to the syllabus. Ajax: every screen loads and saves with asynchronous JSON calls. DOM: React updates it, and we use direct DOM APIs for swipe and measuring. Server-side database: Prisma and PostgreSQL in Node, the role PHP and MySQL play in LAMP. LAMP integration: we import and reconcile the college's MRBS timetable, with a preview.",
  ],
  render: ({ step }) => <TechUsed step={step} />,
};
