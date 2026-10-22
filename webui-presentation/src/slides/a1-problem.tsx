"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Card, Grad, Icon, SlideFrame, useSteps, type IconName } from "./_kit";

const STATS = [
  { n: "73", say: "say it does not tell them when a class changes" },
  { n: "82", say: "say finding their own classes takes too many steps" },
  { n: "82", say: "cannot see their week at a glance" },
  { n: "87", say: "use WhatsApp to learn about changes" },
] as const;

const FACTS: { icon: IconName; text: string }[] = [
  {
    icon: "database",
    text: "An MRBS install: PHP and MySQL, a LAMP application",
  },
  {
    icon: "monitor",
    text: "One desktop page for the whole college, plain HTTP",
  },
  { icon: "file", text: "A 141 KB day view" },
  { icon: "edit", text: "Coordinators book every lecture by hand" },
  { icon: "mail", text: "Changes travel by Gmail, WhatsApp and Moodle" },
];

function Problem({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".stat", { opacity: 0.18 });
    STATS.forEach((_, i) => {
      tl.to(
        `.stat-${i}`,
        { opacity: 1, duration: 0.6, ease: "deck.enter" },
        ">",
      );
      mark();
    });
  });

  return (
    <SlideFrame
      title={
        <>
          A timetable that <Grad>cannot keep up</Grad>
        </>
      }
    >
      <div ref={visual} className="absolute inset-0 flex gap-14">
        <div className="flex flex-1 flex-col justify-between pt-6">
          <div className="grid grid-cols-2 gap-x-10 gap-y-12">
            {STATS.map((s, i) => (
              <div
                key={i}
                className={`stat stat-${i} border-t-2 pt-4`}
                style={{ borderColor: "var(--accent-line)" }}
              >
                <p className="font-display tabular text-accent text-[112px] leading-none font-semibold">
                  {s.n}
                  <span className="text-[64px]">%</span>
                </p>
                <p className="text-body mt-3 max-w-[22ch] text-[28px] leading-[1.2]">
                  {s.say}
                </p>
              </div>
            ))}
          </div>
          <p className="text-muted text-[22px]">
            15 students, 10 faculty and 4 coordinators interviewed, 11 students
            surveyed
          </p>
        </div>
        <Card className="mt-6 w-[640px] self-start p-9">
          <p className="font-display text-fg text-[34px] font-semibold">
            Today the college runs on
          </p>
          <ul className="mt-4">
            {FACTS.map((f) => (
              <li
                key={f.text}
                className="flex items-center gap-5 border-t py-5"
                style={{ borderColor: "var(--line)" }}
              >
                <Icon
                  name={f.icon}
                  size={40}
                  className="text-accent shrink-0"
                />
                <span className="text-body text-[26px] leading-[1.2]">
                  {f.text}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "problem",
  title: "The problem",
  steps: 5,
  notes: [
    "The college timetable is an MRBS install, PHP and MySQL, one desktop page for everyone. We asked 15 students, 10 faculty and 4 coordinators, and surveyed 11 more students. Here is what they told us.",
    "73 percent say it does not tell them when a class changes.",
    "82 percent say finding their own classes takes too many steps.",
    "82 percent cannot see their week at a glance.",
    "And 87 percent use WhatsApp to learn about changes, because the timetable itself will not tell them. Coordinators book every lecture by hand, and changes travel by Gmail, WhatsApp and Moodle.",
  ],
  render: ({ step }) => <Problem step={step} />,
};
