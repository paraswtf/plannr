"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Grad, Icon, Phone, SlideFrame, useSteps, type IconName } from "./_kit";

const ENDPOINTS = [
  { path: "/siri/next-class", say: "Next lecture" },
  {
    path: "/siri/day-start?day=tomorrow",
    say: "When does my day start tomorrow",
  },
  { path: "/siri/timings?day=today", say: "College timings today" },
  { path: "/siri/any-classes?day=tomorrow", say: "Do I have class tomorrow" },
];

const ACTIONS: { icon: IconName; name: string; detail: string }[] = [
  {
    icon: "globe",
    name: "Get Contents of URL",
    detail: "Authorization: Bearer plk_live_…",
  },
  { icon: "list", name: "Get Dictionary Value", detail: "speech" },
  { icon: "mic", name: "Speak Text", detail: "Dictionary Value" },
];

const SAFE = [
  { big: "ViewOwnEvents", small: "is the only scope a personal key holds" },
  { big: "Revocable", small: "switch a key off in Settings" },
  { big: "5 keys", small: "at most per person" },
  { big: "60 per minute", small: "rate limit on every key" },
  { big: "Cannot mint keys", small: "a key cannot create another key" },
];

export const slide: SlideDef = {
  id: "siri",
  title: "Siri",
  steps: 3,
  notes: [
    "Say hey Siri, next lecture, and your phone reads your next class aloud. Notice the room number is written 4 0 3 with spaces on purpose, so Siri says the digits one by one.",
    "It is a three step Apple Shortcut. Get Contents of URL calls our API with the key in an Authorization Bearer header. Get Dictionary Value picks the speech field from the answer. Speak Text says it. There are four endpoints, each with its own phrase: next lecture, when does my day start tomorrow, college timings today, and do I have class tomorrow.",
    "Why the key is safe. A personal key only ever holds ViewOwnEvents. You can revoke it, you can have five at most, it is limited to 60 requests a minute, and it cannot mint other keys. It only reads your own timetable.",
  ],
  render: ({ step }) => <Siri step={step} />,
};

function Screen() {
  return (
    <div
      className="absolute inset-0 flex flex-col justify-end gap-5 p-5 pb-16"
      style={{ background: "linear-gradient(180deg,#14161d,#241629)" }}
    >
      <div
        className="siri-q self-end rounded-[26px] px-6 py-4 text-[42px] leading-tight font-medium"
        style={{ background: "#3a3d4a", color: "#fff" }}
      >
        Hey Siri, next lecture
      </div>
      <div
        className="siri-a rounded-[26px] px-6 py-5 text-[38px] leading-snug font-medium"
        style={{ background: "#ffffff", color: "#0d1117" }}
      >
        Your next class is tomorrow, Design Thinking at 9am, in room{" "}
        <span
          style={{ color: "#c8305f", fontWeight: 700, whiteSpace: "nowrap" }}
        >
          4 0 3
        </span>
        .
      </div>
    </div>
  );
}

function Siri({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".siri-ep", { opacity: 0, x: 30 });
    gsap.set(".siri-act", { opacity: 0, y: 24 });
    gsap.set(".siri-safe", { opacity: 0, y: 24 });

    tl.to(".siri-hint", { opacity: 0, duration: 0.3 }, ">");
    tl.to(
      ".siri-act",
      { opacity: 1, y: 0, duration: 0.5, ease: "deck.enter", stagger: 0.15 },
      "<",
    );
    tl.to(
      ".siri-ep",
      { opacity: 1, x: 0, duration: 0.5, ease: "deck.enter", stagger: 0.1 },
      ">-0.1",
    );
    mark();
    tl.to(".siri-main", { opacity: 0, duration: 0.4, ease: "deck.enter" }, ">");
    tl.to(
      ".siri-safe",
      { opacity: 1, y: 0, duration: 0.5, ease: "deck.enter", stagger: 0.1 },
      "<0.2",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          Ask your phone about <Grad>your lectures</Grad>
        </>
      }
      subhead="Siri reads your own timetable back to you."
      tech={[
        { name: "GET /api/v1/siri/next-class" },
        { name: "Authorization: Bearer plk_live_" },
        { name: "PERSONAL_SCOPES" },
        { name: "speech" },
      ]}
    >
      <div ref={visual} className="absolute inset-0">
        <div className="absolute top-3 left-0">
          <Phone height={500} screen="dark" screenBg="#14161d" time="9:41">
            <Screen />
          </Phone>
        </div>

        <div className="siri-hint absolute top-[120px] left-[330px] w-[900px]">
          <p className="font-display text-accent text-[48px] leading-tight font-semibold">
            4 0 3, spaced on purpose
          </p>
          <p className="text-muted mt-3 text-[32px] leading-snug">
            so Siri reads the digits one by one.
          </p>
        </div>

        <div className="siri-main absolute top-0 right-0 left-[330px] flex h-full justify-between">
          <div className="flex w-[520px] flex-col justify-center gap-4">
            {ACTIONS.map((a) => (
              <div
                key={a.name}
                className="siri-act bg-raised flex items-center gap-5 rounded-[22px] px-6 py-5 shadow-[inset_0_0_0_1px_var(--line),var(--shadow-1)]"
              >
                <Icon
                  name={a.icon}
                  size={44}
                  className="text-accent shrink-0"
                />
                <span className="flex flex-col">
                  <span className="font-display text-fg text-[28px] font-semibold">
                    {a.name}
                  </span>
                  <span className="t-mono text-muted text-[22px]">
                    {a.detail}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <ul className="flex w-[760px] flex-col justify-center">
            {ENDPOINTS.map((e) => (
              <li
                key={e.path}
                className="siri-ep border-t py-4"
                style={{ borderColor: "var(--line)" }}
              >
                <span className="font-display text-fg block text-[30px] font-semibold">
                  “{e.say}”
                </span>
                <span className="t-mono text-muted block text-[23px]">
                  {e.path}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="absolute top-0 right-0 left-[330px] flex h-full flex-col justify-center">
          <p className="siri-safe font-display text-fg mb-4 text-[34px] font-semibold">
            Why the key is <span className="text-accent">safe</span>
          </p>
          <ul>
            {SAFE.map((s) => (
              <li
                key={s.big}
                className="siri-safe flex items-baseline gap-8 border-t py-[11px]"
                style={{ borderColor: "var(--line)" }}
              >
                <span className="t-mono text-fg w-[400px] shrink-0 text-[28px] font-medium">
                  {s.big}
                </span>
                <span className="text-body text-[26px]">{s.small}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SlideFrame>
  );
}
