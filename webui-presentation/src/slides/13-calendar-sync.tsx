"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import {
  Card,
  Grad,
  Icon,
  Phone,
  SlideFrame,
  useSteps,
  type IconName,
} from "./_kit";

const COL = 420;
const GAP = 60;
const ROW_H = 140;

function Stage({
  cls,
  icon,
  name,
  mono,
  body,
  x,
  y,
}: {
  cls: string;
  icon: IconName;
  name: string;
  mono?: boolean;
  body: ReactNode;
  x: number;
  y: number;
}) {
  return (
    <div
      className={`${cls} absolute`}
      style={{ left: x, top: y, width: COL, height: ROW_H }}
    >
      <Card className="h-full px-6 py-4">
        <div className="flex items-center gap-4">
          <Icon name={icon} size={36} className="text-accent shrink-0" />
          <p
            className={`text-fg ${mono ? "t-mono text-[26px]" : "font-display text-[30px]"} font-semibold`}
          >
            {name}
          </p>
        </div>
        <p className="text-body mt-2 text-[22px] leading-[1.25]">{body}</p>
      </Card>
    </div>
  );
}

function Arrow({ cls, x, y }: { cls: string; x: number; y: number }) {
  return (
    <div
      className={`${cls} absolute flex items-center justify-center`}
      style={{ left: x, top: y, width: GAP, height: ROW_H }}
    >
      <Icon name="arrowRight" size={44} className="text-accent" />
    </div>
  );
}

const X = [0, COL + GAP, 2 * (COL + GAP)];
const Y2 = ROW_H + 52;

function Pipeline() {
  return (
    <div className="absolute top-0 left-0" style={{ width: 1380 }}>
      <Stage
        cls="pl pl-1"
        icon="cursor"
        name="Plannr edit"
        body="A coordinator drags a class to a new time."
        x={X[0]!}
        y={0}
      />
      <Arrow cls="pl pl-1" x={X[0]! + COL} y={0} />
      <Stage
        cls="pl pl-1"
        icon="refresh"
        name="regenerateOccurrences"
        mono
        body="Every write passes through here."
        x={X[1]!}
        y={0}
      />
      <Arrow cls="pl pl-1" x={X[1]! + COL} y={0} />
      <Stage
        cls="pl pl-1"
        icon="list"
        name="CalendarSyncTask"
        mono
        body="One row per person and class, so five edits make one task."
        x={X[2]!}
        y={0}
      />

      {/* The elbow from the queue down to the drain. */}
      <svg
        className="pl absolute pl-2"
        style={{ left: 0, top: ROW_H, width: 1380, height: 52 }}
        viewBox="0 0 1380 52"
        fill="none"
      >
        <path
          d={`M${X[2]! + COL / 2} 4 V26 H${COL / 2} V40`}
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={`M${COL / 2 - 10} 32 L${COL / 2} 46 L${COL / 2 + 10} 32`}
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <Stage
        cls="pl pl-2"
        icon="alarm"
        name="Hourly cron drain"
        body="50 tasks per batch, retries with backoff."
        x={X[0]!}
        y={Y2}
      />
      <Arrow cls="pl pl-2" x={X[0]! + COL} y={Y2} />
      <Stage
        cls="pl pl-2"
        icon="swap"
        name="reconcile"
        mono
        body="Insert, patch or delete, decided by a digest."
        x={X[1]!}
        y={Y2}
      />
      <Arrow cls="pl pl-2" x={X[1]! + COL} y={Y2} />
      <Stage
        cls="pl pl-2"
        icon="calendarCheck"
        name="Google Calendar"
        body="The class lands in the calendar they already use."
        x={X[2]!}
        y={Y2}
      />
    </div>
  );
}

function OptIn() {
  return (
    <Card
      accent
      className="absolute left-0 flex items-center gap-10 px-8 py-5"
      style={{ top: Y2 + ROW_H + 28, width: 1380 }}
    >
      <div className="flex items-center gap-4">
        <Icon name="calendar" size={44} className="text-accent shrink-0" />
        <div>
          <p className="font-display text-fg text-[30px] font-semibold">
            Opt in, one person at a time
          </p>
          <p className="t-mono text-body text-[22px]">calendar.app.created</p>
        </div>
      </div>
      <span className="bg-line-strong h-[64px] w-px" />
      <p className="text-fg flex-1 text-[26px] leading-[1.25]">
        &ldquo;Plannr can only see the calendar it creates.&rdquo;
      </p>
      <span className="bg-line-strong h-[64px] w-px" />
      <div className="flex items-center gap-4">
        <Icon name="key" size={40} className="text-accent shrink-0" />
        <p className="text-body text-[22px] leading-[1.25]">
          Refresh token sealed
          <br />
          with <span className="t-mono text-fg">AES-256-GCM</span>
        </p>
      </div>
    </Card>
  );
}

function Event({
  cls,
  top,
  title,
  time,
  color,
}: {
  cls: string;
  top: number;
  title: string;
  time: string;
  color: string;
}) {
  return (
    <div
      className={`${cls} absolute rounded-[10px] px-4 py-2`}
      style={{
        left: 86,
        right: 18,
        top,
        height: 118,
        background: color,
        color: "#fff",
      }}
    >
      <p
        style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.15 }}
        className="ev-title"
      >
        {title}
      </p>
      <p style={{ fontSize: 28, opacity: 0.9, position: "relative" }}>
        <span className="tm-old">{time}</span>
        {cls === "ev-dt" && (
          <span className="tm-new absolute top-0 left-0 opacity-0">
            11:00-12:00
          </span>
        )}
      </p>
    </div>
  );
}

function CalendarPhone() {
  const hours = ["9", "10", "11", "12", "1", "2"];
  return (
    <Phone height={520}>
      <div className="absolute inset-0 bg-white" style={{ paddingTop: 70 }}>
        <div className="flex items-center justify-between px-6">
          <p style={{ fontSize: 40, fontWeight: 600, color: "#202124" }}>
            Wed 4 Nov
          </p>
          <span style={{ fontSize: 30, color: "#5f6368" }}>Plannr</span>
        </div>
        <div className="relative mt-5" style={{ height: 660 }}>
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute right-0 left-0 border-t"
              style={{ top: i * 120, borderColor: "#e3e5e8" }}
            >
              <span style={{ fontSize: 26, color: "#70757a", marginLeft: 20 }}>
                {h}
              </span>
            </div>
          ))}
          <div
            className="ev-ghost absolute rounded-[10px]"
            style={{
              left: 86,
              right: 18,
              top: 2,
              height: 118,
              border: "3px dashed #c8305f",
              opacity: 0,
            }}
          />
          <Event
            cls="ev-dt"
            top={2}
            title="Design Thinking"
            time="9:00-10:00"
            color="#c8305f"
          />
          <Event
            cls="ev-cancel"
            top={482}
            title="Web UI"
            time="1:00-2:00"
            color="#3b6fd4"
          />
        </div>
      </div>
    </Phone>
  );
}

function CalendarSync({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".pl", { opacity: 0.2 });
    gsap.set(".mk", { opacity: 0.35 });
    gsap.set(".ev-ghost", { opacity: 0 });
    gsap.set(".ev-dt", { y: 0 });
    gsap.set(".ev-cancel", { opacity: 1, backgroundColor: "#3b6fd4" });
    gsap.set(".ev-cancel .ev-title", { textDecoration: "none" });
    tl.to(
      ".pl-1",
      { opacity: 1, duration: 0.6, ease: "deck.enter", stagger: 0.08 },
      ">",
    );
    mark(); // 1: an edit becomes a task
    tl.to(
      ".pl-2",
      { opacity: 1, duration: 0.6, ease: "deck.enter", stagger: 0.08 },
      ">",
    );
    tl.to(".mk", { opacity: 0.7, duration: 0.5, ease: "deck.enter" }, "<");
    mark(); // 2: the drain reconciles
    tl.to(".mk", { opacity: 1, duration: 0.4, ease: "deck.enter" }, ">");
    tl.to(
      ".ev-ghost",
      { opacity: 0.8, duration: 0.3, ease: "deck.enter" },
      "<",
    );
    // 120 phone px per hour: 9:00 to 11:00 is 240.
    tl.to(".ev-dt .tm-old", { opacity: 0, duration: 0.01 }, ">0.3");
    tl.to(".tm-new", { opacity: 1, duration: 0.01 }, "<");
    tl.to(".ev-dt", { y: 240, duration: 0.9, ease: "deck.morph" }, ">-0.1");
    tl.to(
      ".ev-cancel",
      {
        backgroundColor: "#e3e5e9",
        color: "#5f6368",
        opacity: 0.8,
        duration: 0.6,
        ease: "deck.enter",
      },
      "<0.2",
    );
    tl.set(".ev-cancel .ev-title", { textDecoration: "line-through" }, "<");
    mark(); // 3: phone shows the move
  });

  return (
    <SlideFrame
      title={
        <>
          Your classes follow you into <Grad>Google Calendar</Grad>
        </>
      }
      subhead="When a class moves, the change follows. Nobody edits their calendar by hand."
      tech={[
        { name: "calendar.app.created" },
        { name: "CalendarSyncTask" },
        { name: "reconcile" },
        { name: "events.patch" },
        { name: "extendedProperties.private.plannrEventId" },
      ]}
    >
      <div ref={visual} className="absolute inset-0">
        <Pipeline />
        <OptIn />
        <div className="mk absolute -top-20 -right-20 p-20">
          <CalendarPhone />
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "calendar-sync",
  title: "Google Calendar sync",
  steps: 4,
  notes: [
    "Calendar sync is opt in, one person at a time. Plannr asks for a single narrow scope, calendar dot app dot created, so it can only see the calendar it creates itself. The refresh token is sealed with AES 256 GCM.",
    "A coordinator drags a class. The write goes through regenerateOccurrences, which queues a CalendarSyncTask for each person who should see it, in the same transaction as the edit. The row is unique per person and class, so five quick edits make one task.",
    "An hourly cron drains the queue, fifty tasks at a time, with retries and backoff. Reconcile compares what Google should hold with what it holds, and inserts, patches or deletes by digest. If nothing changed, there is no API call.",
    "On the phone, the class has moved in Google Calendar. A cancelled class stays in the calendar greyed out, marked transparent, so it does not block the time.",
  ],
  render: ({ step }) => <CalendarSync step={step} />,
};
