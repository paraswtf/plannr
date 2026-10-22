"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";
import { PlannrMark } from "~/ui/brand";

import { Card, Grad, Icon, Phone, SlideFrame, useSteps } from "./_kit";

const COL = 420;
const GAP = 60;
const ROW_H = 200;
const ELBOW = 44;
const X = [0, COL + GAP, 2 * (COL + GAP)];
const Y2 = ROW_H + ELBOW;

const STAGES = [
  {
    title: "Opt in once",
    name: "pushManager.subscribe",
    body: "With the VAPID public key. push.subscribe stores it.",
  },
  {
    title: "A class moves",
    name: "events.update",
    body: "A coordinator drags it, or approves or cancels.",
  },
  {
    title: "Same transaction",
    name: "regenerateOccurrences",
    body: "Queues a ClassChangeNotice with the edit.",
  },
  {
    title: "After the response",
    name: "after() runs dispatchPending",
    body: "Claims with FOR UPDATE SKIP LOCKED.",
  },
  {
    title: "Encrypted and signed",
    name: "web-push",
    body: "VAPID-signed, via FCM, Mozilla or Apple.",
  },
  {
    title: "The phone wakes",
    name: "showNotification",
    body: "A tap runs notificationclick and opens /schedule.",
  },
] as const;

const POS = [
  { x: X[0]!, y: 0 },
  { x: X[1]!, y: 0 },
  { x: X[2]!, y: 0 },
  { x: X[0]!, y: Y2 },
  { x: X[1]!, y: Y2 },
  { x: X[2]!, y: Y2 },
];

function Path() {
  return (
    <div className="absolute top-0 left-0" style={{ width: 1380 }}>
      {STAGES.map((s, i) => (
        <div
          key={s.name}
          className={`st st-${i} absolute`}
          style={{ left: POS[i]!.x, top: POS[i]!.y, width: COL, height: ROW_H }}
        >
          <Card accent={i === 5} className="h-full px-6 py-4">
            <div className="flex items-center gap-4">
              <span
                className="font-display bg-accent tabular flex h-[40px] w-[40px] shrink-0 items-center justify-center text-[24px] font-semibold text-white"
                style={{ borderRadius: "30%" }}
              >
                {i + 1}
              </span>
              <p className="font-display text-fg text-[28px] leading-[1.1] font-semibold">
                {s.title}
              </p>
            </div>
            <p className="t-mono text-fg mt-3 text-[22px] font-medium">
              {s.name}
            </p>
            <p className="text-body mt-1 text-[22px] leading-[1.25]">
              {s.body}
            </p>
          </Card>
        </div>
      ))}
      {[0, 1, 3, 4].map((i) => (
        <div
          key={i}
          className={`st st-${i + 1} absolute flex items-center justify-center`}
          style={{
            left: POS[i]!.x + COL,
            top: POS[i]!.y,
            width: GAP,
            height: ROW_H,
          }}
        >
          <Icon name="arrowRight" size={44} className="text-accent" />
        </div>
      ))}
      <svg
        className="st st-3 absolute"
        style={{ left: 0, top: ROW_H, width: 1380, height: ELBOW }}
        viewBox={`0 0 1380 ${ELBOW}`}
        fill="none"
      >
        <path
          d={`M${X[2]! + COL / 2} 2 V22 H${COL / 2} V34`}
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={`M${COL / 2 - 10} 28 L${COL / 2} 42 L${COL / 2 + 10} 28`}
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Failures() {
  const items = [
    { code: "410", say: "prunes the device" },
    { code: "5xx", say: "retries later" },
    { code: "cron", say: "sweeps what is left" },
  ];
  return (
    <div
      className="fail absolute flex items-center gap-10"
      style={{ left: 0, top: Y2 + ROW_H + 24, width: 1380 }}
    >
      <p className="font-display text-fg text-[28px] font-semibold">
        If a send fails
      </p>
      {items.map((it) => (
        <p
          key={it.code}
          className="text-body flex items-baseline gap-3 text-[24px]"
        >
          <span className="t-mono bg-sunken text-fg rounded-[12px] px-3 py-1 font-medium">
            {it.code}
          </span>
          {it.say}
        </p>
      ))}
    </div>
  );
}

function LockScreen() {
  return (
    <Phone
      height={520}
      screen="dark"
      screenBg="linear-gradient(170deg, #3a4558 0%, #1a2130 55%, #0d1117 100%)"
      time=""
    >
      <div className="absolute inset-0 text-center" style={{ color: "#fff" }}>
        <p style={{ fontSize: 28, marginTop: 130, opacity: 0.85 }}>
          Wednesday 4 November
        </p>
        <p
          className="font-display tabular"
          style={{
            fontSize: 150,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          9:41
        </p>
        <div
          className="note absolute text-left"
          style={{
            left: 16,
            right: 16,
            top: 380,
            padding: 22,
            borderRadius: 30,
            background: "rgba(245,247,250,0.94)",
            color: "#0d1117",
          }}
        >
          <div className="flex items-center gap-3">
            <PlannrMark height={34} />
            <span style={{ fontSize: 26, fontWeight: 600 }}>Plannr</span>
            <span
              style={{ fontSize: 24, color: "#5b6572", marginLeft: "auto" }}
            >
              now
            </span>
          </div>
          <p
            style={{
              fontSize: 34,
              fontWeight: 700,
              marginTop: 12,
              lineHeight: 1.15,
            }}
          >
            Design Thinking has moved
          </p>
          <p
            style={{
              fontSize: 29,
              marginTop: 6,
              lineHeight: 1.3,
              color: "#2c3440",
            }}
          >
            Now Wed 4 Nov, 11:00-12:00, room 403 (was Wed 4 Nov, 09:00-10:00,
            room 402)
          </p>
        </div>
      </div>
    </Phone>
  );
}

function Push({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".st", { opacity: 0.2 });
    gsap.set(".st-0", { opacity: 1 });
    gsap.set(".fail", { opacity: 0, y: 16 });
    gsap.set(".mk", { opacity: 0.4 });
    gsap.set(".note", { opacity: 0, y: -60 });
    const lit = (n: number) => {
      tl.to(
        `.st-${n}`,
        { opacity: 1, duration: 0.6, ease: "deck.enter", stagger: 0.08 },
        ">",
      );
    };
    lit(1);
    mark();
    lit(2);
    mark();
    lit(3);
    mark();
    lit(4);
    tl.to(
      ".fail",
      { opacity: 1, y: 0, duration: 0.6, ease: "deck.enter" },
      "<0.2",
    );
    mark();
    lit(5);
    tl.to(".mk", { opacity: 1, duration: 0.5, ease: "deck.enter" }, "<");
    tl.to(
      ".note",
      { opacity: 1, y: 0, duration: 0.8, ease: "deck.morph" },
      ">-0.1",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          Be told about a changed class <Grad>before you walk</Grad>
        </>
      }
      subhead="Moves and cancellations reach your phone, even app closed."
      tech={[
        { name: "pushManager.subscribe" },
        { name: "VAPID" },
        { name: "ClassChangeNotice" },
        { name: "SKIP LOCKED" },
        { name: "showNotification" },
        { name: "notificationclick" },
      ]}
    >
      <div ref={visual} className="absolute inset-0">
        <Path />
        <Failures />
        <div className="mk absolute -top-20 -right-20 p-20">
          <LockScreen />
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "push-notifications",
  title: "Push notifications",
  steps: 6,
  notes: [
    "Push notifications work like this. First, you opt in once. The browser asks permission, then pushManager dot subscribe makes a subscription using our VAPID public key. The endpoint and keys are stored by push dot subscribe.",
    "Second, a coordinator moves a class, through events dot update. Approving a request, cancelling or restoring a class do the same thing.",
    "Third, in the same transaction, regenerateOccurrences compares the sittings before and after, and writes a ClassChangeNotice: moved, cancelled, restored or added. If the edit commits, the notice exists. If not, neither does.",
    "Fourth, after the response has gone back, Next's after function runs dispatchPending. It claims notices with FOR UPDATE SKIP LOCKED, so two workers never send the same one.",
    "Fifth, web-push sends a message that is encrypted for that device and signed with our VAPID key, through the browser vendor's push service: Google, Mozilla or Apple. If the service says 410, we remove the device. A 5xx is retried, and the cron sweeps up the rest.",
    "Sixth, the service worker wakes on the push event, even with the app closed, and calls showNotification. Tapping it runs notificationclick and opens the schedule. That is how you hear about the move before you walk to the wrong room.",
  ],
  render: ({ step }) => <Push step={step} />,
};
