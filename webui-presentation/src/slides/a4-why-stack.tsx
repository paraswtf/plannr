"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Grad, SlideFrame, useSteps } from "./_kit";

const ROWS = [
  {
    k: "Kind of product",
    a: "An application with scheduling logic",
    b: "A CMS would need it all as custom plugins",
  },
  {
    k: "Language",
    a: "TypeScript from database to browser",
    b: "PHP and jQuery splits it in two",
  },
  {
    k: "Database",
    a: "PostgreSQL: advisory locks, strict constraints",
    b: "MySQL: not the locks and constraints Plannr relies on",
  },
  {
    k: "Hosting",
    a: "Vercel: HTTPS, a preview per change, next to the database",
    b: "A server to patch and keep running",
  },
];

function Why({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".proof", { opacity: 0, y: 16 });
    tl.to(
      ".proof",
      { opacity: 1, y: 0, duration: 0.6, ease: "deck.enter" },
      ">",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          The right stack for an app, <Grad>not a CMS</Grad>
        </>
      }
    >
      <div ref={visual} className="absolute inset-0 flex flex-col">
        <div className="grid grid-cols-[230px_1fr_1fr] gap-x-8 pt-8 pb-4">
          <span />
          <span className="font-display text-accent text-[30px] font-semibold">
            Plannr&rsquo;s choice
          </span>
          <span className="font-display text-muted text-[30px] font-semibold">
            LAMP, MySQL, WordPress
          </span>
        </div>
        {ROWS.map((r) => (
          <div
            key={r.k}
            className="grid grid-cols-[230px_1fr_1fr] items-center gap-x-8 border-t py-5"
            style={{ borderColor: "var(--line-strong)" }}
          >
            <span className="text-muted text-[26px]">{r.k}</span>
            <span className="text-fg text-[28px] leading-[1.2]">{r.a}</span>
            <span className="text-muted text-[28px] leading-[1.2]">{r.b}</span>
          </div>
        ))}
        <div
          className="proof mt-auto flex items-center gap-8 border-t-2 pt-4"
          style={{ borderColor: "var(--accent-line)" }}
        >
          <span className="font-display text-accent w-[230px] shrink-0 text-[30px] leading-[1.1] font-semibold">
            Today&rsquo;s proof
          </span>
          <span className="text-fg text-[26px] leading-[1.25]">
            The college&rsquo;s LAMP timetable: one 141 KB page, desktop only,
            plain HTTP. We re-created the viewer on LAMP too: the legacy
            version, on the web-ui-compliance branch.
          </span>
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "why-stack",
  title: "Why this stack",
  steps: 2,
  notes: [
    "Why Next.js, serverless and PostgreSQL, and not LAMP with WordPress? Plannr is an application with scheduling logic, and a CMS would need all of it as custom plugins. TypeScript runs from the database to the browser, where PHP and jQuery split it in two. PostgreSQL gives us advisory locks and strict constraints that MySQL does not offer in the same way. And Vercel gives HTTPS and a preview for every change, with no server to patch.",
    "Today&rsquo;s proof: the college's own LAMP timetable is one 141 kilobyte page, desktop only, over plain HTTP. For this course we also re-created the timetable viewer on LAMP with jQuery, jQuery UI and Ajax: that is the legacy version, on the web-ui-compliance branch.",
  ],
  render: ({ step }) => <Why step={step} />,
};
