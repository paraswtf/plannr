"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";
import { courseTone } from "~/ui/mock";

import { CodeBlock, Grad, Icon, SlideFrame, useSteps } from "./_kit";

const PANE_W = 236;
const GAP = 14;
const STRIDE = PANE_W + GAP;
const REST_X = 0;

const PANES = [
  { day: "Yesterday", classes: ["Databases"] },
  { day: "Today", classes: ["Design Thinking", "Databases"] },
  { day: "Tomorrow", classes: ["Design Thinking"] },
  { day: "Thursday", classes: ["Databases"] },
];

const RULES = [
  { code: "under 14px (SLOP)", say: "Undecided, keep watching" },
  { code: "|dx| >= 2 * |dy|", say: "Sideways, so the swipe takes over" },
  {
    code: "22% of pane or 0.35 px/ms",
    say: "Commit, travel clamped 48-88px",
  },
];

const GROUPS = [
  {
    label: "Gestures",
    items: [
      ["onPointerDown/Move/Up/Cancel", "Pointer Events, touch and mouse"],
      ["setPointerCapture", "Drag survives leaving the block"],
      ["touch-action: pan-y", "Vertical scroll stays native"],
    ],
  },
  {
    label: "This device",
    items: [
      ['matchMedia("(pointer: coarse)")', "Swipe rail for fingers only"],
      ["navigator.vibrate", "A tick on long press"],
      ["navigator.clipboard.writeText", "Copy an API key"],
    ],
  },
  {
    label: "Layout",
    items: [
      ["getBoundingClientRect", "Freeze room columns for drag"],
      ["ResizeObserver", "React when a box resizes"],
      ["visualViewport", "Keep popovers on screen"],
      ["scrollIntoView", "Jump to the now line"],
    ],
  },
  {
    label: "Address and time",
    items: [
      ["history.replaceState", "The date lives in the URL"],
      ["Intl.DateTimeFormat", "Dates and times in India"],
    ],
  },
] as const;

const CODE = `const SLOP = 14;
const AXIS_RATIO = 2;

function intentOf(dx, dy) {
  const across = Math.abs(dx);
  const down = Math.abs(dy);
  if (across < SLOP && down < SLOP) return "undecided";
  return across >= down * AXIS_RATIO
    ? "sideways" : "elsewhere";
}`;

function Pane({ day, classes }: (typeof PANES)[number]) {
  return (
    <div
      className="sw-pane bg-raised absolute top-0 h-full rounded-[22px] p-4 shadow-[inset_0_0_0_1px_var(--line),var(--shadow-1)]"
      style={{ width: PANE_W }}
    >
      <p className="font-display text-fg text-[28px] font-semibold">{day}</p>
      <div className="mt-4 flex flex-col gap-3">
        {classes.map((c, i) => {
          const t = courseTone(c);
          return (
            <div
              key={c + i}
              className="rounded-xl px-3 py-3 text-[22px] font-semibold"
              style={{
                background: t.fill,
                boxShadow: `inset 0 0 0 1px ${t.ring}`,
                color: "#0d1117",
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SwipeDiagram() {
  return (
    <div className="absolute top-0 left-0 w-[736px]">
      <div className="relative h-[200px] overflow-hidden">
        <div
          className="sw-rail absolute top-0 left-0 h-full"
          style={{ width: STRIDE * 4, transform: `translateX(${REST_X}px)` }}
        >
          {PANES.map((p, i) => (
            <div
              key={p.day}
              className={`sw-p${i} absolute top-0 h-full`}
              style={{ left: i * STRIDE, width: PANE_W }}
            >
              <Pane {...p} />
            </div>
          ))}
        </div>
        <div
          className="sw-trail bg-accent absolute h-[4px] rounded-full"
          style={{ left: 354, top: 150, width: 0, transformOrigin: "right" }}
        />
        <div
          className="sw-finger text-accent absolute"
          style={{ left: 330, top: 118 }}
        >
          <Icon name="hand" size={64} />
        </div>
      </div>
      <ul className="mt-5">
        {RULES.map((r) => (
          <li
            key={r.code}
            className="sw-row flex items-baseline justify-between gap-6 border-t py-3"
            style={{ borderColor: "var(--line-strong)" }}
          >
            <span className="t-mono text-fg text-[22px] font-medium">
              {r.code}
            </span>
            <span className="text-muted text-[22px]">{r.say}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApiGrid() {
  return (
    <div className="api-grid absolute top-0 left-0 grid w-[888px] grid-cols-2 gap-x-8">
      {[GROUPS.slice(0, 2), GROUPS.slice(2)].map((col, ci) => (
        <div key={ci} className="flex flex-col gap-4">
          {col.map((g) => (
            <section key={g.label}>
              <p className="text-accent text-[22px] font-semibold">{g.label}</p>
              <ul>
                {g.items.map(([name, why]) => (
                  <li
                    key={name}
                    className="api-item border-t py-[7px]"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <span className="t-mono text-fg block text-[22px] leading-tight font-medium">
                      {name}
                    </span>
                    <span className="text-muted block text-[22px] leading-tight">
                      {why}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}

export const slide: SlideDef = {
  id: "dom-apis",
  title: "DOM APIs",
  steps: 3,
  notes: [
    "Plannr feels native because it uses what the browser already gives it. Take the swipe between days: three panes sit on a rail, yesterday, today and tomorrow.",
    "Watch one swipe. Under fourteen pixels of travel, the gesture is undecided. Once it is sideways, meaning across is at least twice down, the swipe takes over. Anything else stays a normal vertical scroll. Then it commits by distance, twenty two percent of the pane clamped between forty eight and eighty eight pixels, or by a quick fling.",
    "And that is one slice of the platform. Pointer Events, pointer capture, touch action, matchMedia, the bounding rect, ResizeObserver, visualViewport, vibrate, the clipboard, replaceState and Intl. No gesture library, no extra weight.",
  ],
  render: ({ step }) => <DomApis step={step} />,
};

function DomApis({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".sw-row", { opacity: 0.3 });
    gsap.set(".sw-finger", { opacity: 0, x: 0 });
    gsap.set(".sw-p0, .sw-p2, .sw-p3", { opacity: 0.5 });
    gsap.set(".sw-p1", { opacity: 1 });
    gsap.set(".api-grid", { opacity: 0, y: 24 });
    gsap.set(".api-item", { opacity: 0, y: 10 });

    // Build 1: one swipe, decided in three steps.
    tl.to(".sw-finger", { opacity: 1, duration: 0.3, ease: "deck.enter" });
    tl.to(".sw-row:nth-child(1)", { opacity: 1, duration: 0.3 }, ">");
    tl.to(".sw-finger", { x: -14, duration: 0.4, ease: "deck.enter" }, "<");
    tl.to(
      ".sw-finger",
      { x: -120, duration: 0.7, ease: "deck.enter" },
      ">+0.2",
    );
    tl.to(".sw-trail", { width: 120, duration: 0.7, ease: "deck.enter" }, "<");
    tl.to(".sw-rail", { x: -120, duration: 0.7, ease: "deck.enter" }, "<");
    tl.to(".sw-row:nth-child(2)", { opacity: 1, duration: 0.3 }, "<0.3");
    tl.to(".sw-row:nth-child(3)", { opacity: 1, duration: 0.3 }, ">+0.2");
    tl.to(".sw-finger", { opacity: 0, duration: 0.3 }, "<");
    tl.to(".sw-trail", { opacity: 0, duration: 0.3 }, "<");
    tl.to(
      ".sw-rail",
      { x: -STRIDE, duration: 0.8, ease: "deck.morph" },
      "<0.1",
    );
    tl.to(".sw-p1", { opacity: 0.5, duration: 0.6 }, "<");
    tl.to(".sw-p2", { opacity: 1, duration: 0.6 }, "<");
    mark();

    // Build 2: the platform behind it.
    tl.to(".sw-code", {
      opacity: 0,
      y: -16,
      duration: 0.5,
      ease: "deck.enter",
    });
    tl.to(
      ".api-grid",
      { opacity: 1, y: 0, duration: 0.6, ease: "deck.enter" },
      "<0.2",
    );
    tl.to(
      ".api-item",
      { opacity: 1, y: 0, duration: 0.5, ease: "deck.enter", stagger: 0.05 },
      "<0.1",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          It feels native because it uses <Grad>the platform</Grad>
        </>
      }
      subhead="Swipes and drags run on the browser's own APIs."
      tech={[
        { name: "Pointer Events" },
        { name: "setPointerCapture" },
        { name: "touch-action: pan-y" },
        { name: "matchMedia" },
        { name: "ResizeObserver" },
      ]}
    >
      <div ref={visual} className="absolute inset-x-0 top-6 bottom-0">
        <SwipeDiagram />
        <div className="absolute top-0 left-[776px] w-[888px]">
          <div className="sw-code absolute top-0 left-0 w-[888px]">
            <CodeBlock
              title="intentOf, from swipe-gesture.ts (trimmed)"
              code={CODE}
              size={22}
              mark={[7, 8, 9]}
            />
          </div>
          <ApiGrid />
        </div>
      </div>
    </SlideFrame>
  );
}
