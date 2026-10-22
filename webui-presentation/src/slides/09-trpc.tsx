"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { CodeBlock, Grad, Icon, SlideFrame, useSteps } from "./_kit";

const SERVER = `mySchedule: protectedProcedure
  .input(z.object({
    date: z.date().optional(),
    span: z.enum(SPANS).default("day"),
  }))
  .query(({ ctx, input }) =>
    scheduleFor(ctx.actor, input)),`;

const BROWSER = `const { data } = api.timetable
  .mySchedule.useQuery({ span: "week" });

data.days;  // typed from the server
data.dayz;  // compile error`;

const CALLERS = [
  { icon: "monitor", name: "Browser hooks", note: "useQuery, useMutation" },
  { icon: "database", name: "Server components", note: "createCaller" },
  { icon: "link", name: "Public REST API", note: "/api/v1" },
] as const;

export const slide: SlideDef = {
  id: "trpc",
  title: "tRPC",
  steps: 3,
  notes: [
    "Plannr talks to its backend with tRPC. The server declares a procedure once, with a zod input and a typed result. The browser calls it by name, api dot timetable dot mySchedule dot useQuery. The types flow across with no codegen and no hand-written client. Rename a field on the server and every screen that used it stops compiling. The code on the left is simplified.",
    "On the wire it is plain Ajax over HTTP. Two queries made on one screen are batched into a single GET to slash api slash trpc by httpBatchStreamLink and streamed back. SuperJSON carries Dates and BigInts intact. Mutations are POST.",
    "And the same procedures serve three callers: browser hooks, server components through createCaller, and the public REST API, where each route calls its procedure. One rule, in one place.",
  ],
  render: ({ step }) => <Trpc step={step} />,
};

function Trpc({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".tr-wire", { opacity: 0, y: 24 });
    gsap.set(".tr-trio", { opacity: 0, y: 24 });
    gsap.set(".tr-dot", { x: 0 });
    // Step 2: the wire.
    tl.to(
      ".tr-wire",
      { opacity: 1, y: 0, duration: 0.6, ease: "deck.enter" },
      ">",
    );
    tl.fromTo(
      ".tr-dot",
      { x: 0 },
      { x: 560, duration: 1.1, ease: "deck.enter", stagger: 0.25 },
      "<0.3",
    );
    mark();
    // Step 3: three callers.
    tl.to(
      ".tr-trio",
      { opacity: 1, y: 0, duration: 0.6, ease: "deck.enter" },
      ">",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          Change the server, and <Grad>every broken screen tells you</Grad>
        </>
      }
      subhead="A mismatch fails at compile time, not in front of a student."
      tech={[
        { name: "httpBatchStreamLink" },
        { name: "SuperJSON" },
        { name: "zod" },
        { name: "permissionProcedure" },
        { name: "createCaller" },
      ]}
    >
      <div ref={visual} className="absolute inset-0">
        {/* Top: code, arrow, code */}
        <div className="absolute top-5 left-0 flex w-full items-start justify-between">
          <div className="w-[700px]">
            <CodeBlock
              title="server · simplified"
              code={SERVER}
              mark={[2, 3, 4, 5]}
              size={22}
            />
          </div>
          <div className="tr-arrow flex w-[250px] flex-col items-center pt-20">
            <p className="font-display text-accent text-center text-[26px] leading-tight font-semibold">
              same types,
              <br />
              no codegen
            </p>
            <Icon name="arrowRight" size={72} className="text-accent mt-2" />
          </div>
          <div className="w-[700px]">
            <CodeBlock
              title="browser · simplified"
              code={BROWSER}
              mark={[4, 5]}
              size={22}
            />
          </div>
        </div>

        {/* Bottom: the wire and the trio */}
        <div className="absolute bottom-0 left-0 flex w-full items-end justify-between">
          <div className="tr-wire bg-raised w-[1030px] rounded-[22px] px-7 py-5 shadow-[inset_0_0_0_1px_var(--line),var(--shadow-1)]">
            <p className="t-mono text-fg text-[22px] font-medium">
              <span className="text-accent">GET</span>{" "}
              /api/trpc/timetable.mySchedule,attendance.mine?batch=1&amp;input=…
            </p>
            <div className="mt-4 flex items-center gap-4">
              <span className="text-muted w-[230px] text-[22px]">
                Two calls, one request
              </span>
              <div className="relative h-[26px] w-[620px]">
                <span
                  className="absolute top-1/2 h-[2px] w-full -translate-y-1/2"
                  style={{ background: "var(--line-strong)" }}
                />
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className="tr-dot bg-accent absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-[6px]"
                    style={{ left: i * 28 }}
                  />
                ))}
              </div>
            </div>
            <p className="text-muted mt-3 text-[22px]">
              Ajax over HTTP, SuperJSON carries Date and BigInt. Mutations are
              POST.
            </p>
          </div>

          <div className="tr-trio w-[590px]">
            <p className="font-display text-fg mb-2 text-[28px] font-semibold">
              One rule, <span className="text-accent">three callers</span>
            </p>
            <ul>
              {CALLERS.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center gap-4 border-t py-2"
                  style={{ borderColor: "var(--line)" }}
                >
                  <Icon
                    name={c.icon}
                    size={34}
                    className="text-accent shrink-0"
                  />
                  <span className="text-fg text-[26px] font-medium">
                    {c.name}
                  </span>
                  <span className="t-mono text-muted text-[22px]">
                    {c.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}
