"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Card, Grad, Icon, SlideFrame, useSteps } from "./_kit";

const STEPS = [
  { role: "Everyone", say: "Sign in with college Google", icon: "shield" },
  { role: "Student", say: "My day, week and attendance", icon: "calendar" },
  { role: "Faculty", say: "Request an extra lecture", icon: "users" },
  { role: "Coordinator", say: "Approve from the queue", icon: "checkCircle" },
  { role: "Admin", say: "Import CSV, run the planner", icon: "upload" },
] as const;

function Demo({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".ds", { opacity: 0.25 });
    gsap.set(".ds-0", { opacity: 1 });
    for (let i = 1; i < STEPS.length; i++) {
      tl.to(`.ds-${i}`, { opacity: 1, duration: 0.6, ease: "deck.enter" }, ">");
      mark();
    }
  });

  return (
    <SlideFrame
      title={
        <>
          Four roles, one demo, <Grad>start to finish</Grad>
        </>
      }
      subhead="Live at plannr.paraswtf.com, running on real college data."
      tech={[
        { name: "regenerateOccurrences" },
        { name: "advisory locks" },
        { name: "most constrained first" },
        { name: "65 test files" },
      ]}
    >
      <div ref={visual} className="absolute inset-0">
        <div className="flex gap-6 pt-10">
          {STEPS.map((s, i) => (
            <div key={s.role} className={`ds ds-${i} flex-1`}>
              <Card accent={i === 0} className="h-[250px] px-6 py-6">
                <div className="flex items-center justify-between">
                  <span
                    className="font-display bg-accent tabular flex h-[48px] w-[48px] items-center justify-center text-[28px] font-semibold text-white"
                    style={{ borderRadius: "30%" }}
                  >
                    {i + 1}
                  </span>
                  <Icon name={s.icon} size={44} className="text-accent" />
                </div>
                <p className="font-display text-fg mt-5 text-[30px] font-semibold">
                  {s.role}
                </p>
                <p className="text-body mt-2 text-[26px] leading-[1.2]">
                  {s.say}
                </p>
              </Card>
            </div>
          ))}
        </div>
        <div
          className="absolute right-0 bottom-0 left-0 grid grid-cols-2 gap-10 border-t pt-6"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <p className="font-display text-fg text-[28px] font-semibold">
              Under the hood
            </p>
            <p className="text-body mt-2 text-[24px] leading-[1.3]">
              Recurrence is materialised in one transaction. Advisory locks stop
              double booking. The planner solves the hardest classes first, then
              repairs.
            </p>
          </div>
          <div>
            <p className="font-display text-fg text-[28px] font-semibold">
              Project files
            </p>
            <p className="t-mono text-fg mt-2 text-[24px] font-medium">
              github.com/paraswtf/plannr
            </p>
            <p className="text-muted mt-2 text-[22px]">
              65 test files cover it.
            </p>
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "demo",
  title: "Demo and implementation",
  steps: 5,
  notes: [
    "The demo starts at plannr.paraswtf.com. Everyone signs in with their college Google account.",
    "As a student: my day, my week, and my attendance.",
    "As faculty: request an extra lecture.",
    "As a coordinator: approve it from the queue.",
    "As an admin: import a CSV and run the planner. Underneath, regenerateOccurrences materialises recurrence in one transaction, advisory locks stop double booking, and the solver places the most constrained classes first, then repairs. 65 test files cover it. Project files are on github.com/paraswtf/plannr.",
  ],
  render: ({ step }) => <Demo step={step} />,
};
