"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Browser, Grad, Icon, SlideFrame, useSteps } from "./_kit";

const INK = "#0d1117";
const SLATE = "#5b6573";
const BERRY = "#c8305f";

/** Grid geometry, in canvas px inside the browser's page area. */
const HEAD = 56;
const GUTTER = 96;
const HOUR = 96;
const COL_W = 320;
const ROOMS = ["Room 402", "Room 403", "Lab 2"];
const HOURS = ["09:00", "10:00", "11:00", "12:00"];
const top = (h: number, m = 0) => HEAD + (h - 9) * HOUR + (m / 60) * HOUR;
const left = (c: number) => GUTTER + c * COL_W + 8;

interface Block {
  col: number;
  h: number;
  m?: number;
  title: string;
  time: string;
  tone: string;
}

const BLOCKS: Block[] = [
  {
    col: 0,
    h: 9,
    title: "Design Thinking",
    time: "09:00 to 10:00",
    tone: "#3b6fd4",
  },
  {
    col: 1,
    h: 10,
    title: "Databases",
    time: "10:00 to 11:00",
    tone: "#d98324",
  },
  {
    col: 2,
    h: 10,
    title: "Networks",
    time: "10:00 to 11:00",
    tone: "#7a5bd0",
  },
];

const MOVE = { dx: 2 * COL_W, dy: top(10, 15) - top(11) };

const LIST = [
  "Grab the block",
  "Drag, it snaps to 15 minutes",
  "Pick how much of the series",
  "The server checks, then saves",
];

function Card({
  tone,
  title,
  time,
  w = COL_W - 16,
}: {
  tone: string;
  title: string;
  time: ReactNodeLike;
  w?: number;
}) {
  return (
    <div
      className="absolute overflow-hidden"
      style={{
        width: w,
        height: HOUR - 6,
        borderRadius: 14,
        background: "#fff",
        boxShadow: "inset 0 0 0 2px #e3e6ec",
        padding: "10px 16px 0 24px",
        color: INK,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          background: tone,
        }}
      />
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 600,
          lineHeight: 1.1,
        }}
      >
        {title}
      </p>
      <div style={{ fontSize: 24, color: SLATE, marginTop: 4 }}>{time}</div>
    </div>
  );
}
type ReactNodeLike = React.ReactNode;

function Grid() {
  return (
    <div className="absolute inset-0" style={{ background: "#f7f8fa" }}>
      {ROOMS.map((r, c) => (
        <div
          key={r}
          className="absolute"
          style={{
            left: GUTTER + c * COL_W,
            width: COL_W,
            top: 0,
            height: HEAD,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            fontWeight: 600,
            color: INK,
            boxShadow: "inset 1px 0 0 #e3e6ec, inset 0 -1px 0 #e3e6ec",
          }}
        >
          {r}
        </div>
      ))}
      {HOURS.map((h, i) => (
        <div
          key={h}
          className="absolute"
          style={{
            left: 0,
            right: 0,
            top: HEAD + i * HOUR,
            height: HOUR,
            boxShadow: "inset 0 1px 0 #e3e6ec",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 16,
              top: 8,
              fontSize: 24,
              color: SLATE,
              fontFamily: "var(--font-mono)",
            }}
          >
            {h}
          </span>
        </div>
      ))}
      {ROOMS.map((r, c) => (
        <div
          key={r}
          className="absolute"
          style={{
            left: GUTTER + c * COL_W,
            top: HEAD,
            bottom: 0,
            width: 1,
            background: "#e3e6ec",
          }}
        />
      ))}
      {BLOCKS.map((b) => (
        <div
          key={b.title}
          className={b.col === 2 ? "dd-taken absolute" : "absolute"}
          style={{ left: left(b.col), top: top(b.h, b.m) + 3 }}
        >
          <Card tone={b.tone} title={b.title} time={b.time} />
        </div>
      ))}

      {/* where the dragged block came from */}
      <div
        className="dd-home absolute"
        style={{
          left: left(0),
          top: top(11) + 3,
          width: COL_W - 16,
          height: HOUR - 6,
          borderRadius: 14,
          border: "3px dashed #b9bfca",
        }}
      />

      {/* the block being moved */}
      <div
        className="dd-block absolute"
        style={{ left: left(0), top: top(11) + 3 }}
      >
        <div
          className="dd-lift relative"
          style={{ width: COL_W - 16, height: HOUR - 6, borderRadius: 14 }}
        >
          <Card
            tone="#1f9d78"
            title="Web UI and CMS"
            time={
              <span className="relative inline-block">
                <span className="dd-t1">11:00 to 12:00</span>
                <span
                  className="dd-t2 absolute top-0 left-0 whitespace-nowrap"
                  style={{ color: BERRY, fontWeight: 700 }}
                >
                  10:15 to 11:15
                </span>
              </span>
            }
          />
          <span
            className="dd-cursor absolute"
            style={{ right: 28, bottom: -22, color: INK }}
          >
            <Icon name="cursor" size={54} />
          </span>
        </div>
        <span
          className="dd-snap absolute whitespace-nowrap"
          style={{
            left: 0,
            top: -50,
            padding: "5px 16px",
            borderRadius: 999,
            background: INK,
            color: "#fff",
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          Snaps every 15 min
        </span>
      </div>

      {/* recurring scope dialog */}
      <div
        className="dd-scrim absolute inset-0"
        style={{ background: "rgba(13,17,23,0.4)" }}
      />
      <div
        className="dd-dialog absolute"
        style={{
          left: "50%",
          top: "50%",
          width: 600,
          marginLeft: -300,
          marginTop: -190,
          borderRadius: 22,
          background: "#fff",
          padding: "26px 30px",
          boxShadow: "0 40px 80px -20px rgba(13,17,23,0.5)",
          color: INK,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          Move a repeating class
        </p>
        <div style={{ marginTop: 14 }}>
          {["This occurrence", "This and following", "Whole series"].map(
            (o, i) => (
              <div
                key={o}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "10px 0",
                  fontSize: 28,
                  fontWeight: i === 0 ? 600 : 500,
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    boxShadow: `inset 0 0 0 ${i === 0 ? 9 : 3}px ${i === 0 ? BERRY : "#b9bfca"}`,
                  }}
                />
                {o}
              </div>
            ),
          )}
        </div>
        <div
          style={{
            marginTop: 14,
            display: "inline-block",
            padding: "10px 30px",
            borderRadius: 12,
            background: BERRY,
            color: "#fff",
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          Move
        </div>
      </div>

      {/* the server's answer */}
      <div
        className="dd-toast absolute flex items-center gap-4"
        style={{
          left: 24,
          right: 24,
          bottom: 14,
          borderRadius: 16,
          background: "#fdecef",
          boxShadow: `inset 0 0 0 3px ${BERRY}`,
          padding: "14px 24px",
          color: "#8f1d41",
          fontSize: 28,
          fontWeight: 600,
        }}
      >
        <Icon name="alert" size={36} />
        Lab 2 is already booked from 10:00 to 11:00. Nothing moved.
      </div>
    </div>
  );
}

function Dragdrop({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set([".dd-cursor", ".dd-snap", ".dd-t2", ".dd-home", ".dd-scrim"], {
      opacity: 0,
    });
    gsap.set(".dd-dialog", { opacity: 0, y: 24 });
    gsap.set(".dd-toast", { opacity: 0, y: 30 });
    gsap.set(".dd-note", { opacity: 0, y: 20 });
    gsap.set(".dd-li", { opacity: 0.45 });

    const light = (k: number) => {
      tl.to(".dd-li", { opacity: 0.45, duration: 0.3 }, `s${k - 1}`);
      tl.to(`.dd-li:nth-child(${k})`, { opacity: 1, duration: 0.4 }, "<");
      tl.to(
        ".dd-num",
        { backgroundColor: "#e8eaef", color: "#5b6573", duration: 0.3 },
        "<",
      );
      tl.to(
        `.dd-li:nth-child(${k}) .dd-num`,
        { backgroundColor: BERRY, color: "#ffffff", duration: 0.3 },
        "<",
      );
    };

    // 1 grab
    light(1);
    tl.to(".dd-cursor", { opacity: 1, duration: 0.4 }, "<");
    tl.to(
      ".dd-lift",
      {
        scale: 1.04,
        boxShadow: "0 24px 40px -14px rgba(13,17,23,0.45)",
        duration: 0.4,
      },
      "<",
    );
    mark();

    // 2 drag
    light(2);
    tl.to(
      ".dd-block",
      { x: MOVE.dx, y: MOVE.dy, duration: 1.3, ease: "power2.inOut" },
      "<",
    );
    tl.to(".dd-home", { opacity: 1, duration: 0.4 }, "<");
    tl.to(".dd-snap", { opacity: 1, duration: 0.4 }, "<0.8");
    tl.to(".dd-t1", { opacity: 0, duration: 0.3 }, "<");
    tl.to(".dd-t2", { opacity: 1, duration: 0.3 }, "<");
    mark();

    // 3 drop: scope dialog
    light(3);
    tl.to(".dd-snap", { opacity: 0, duration: 0.3 }, "<");
    tl.to(".dd-scrim", { opacity: 1, duration: 0.4 }, "<");
    tl.to(
      ".dd-dialog",
      { opacity: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "<0.1",
    );
    mark();

    // 4 server answers: a clash, so the block returns
    light(4);
    tl.to(".dd-scrim", { opacity: 0, duration: 0.3 }, "<");
    tl.to(".dd-dialog", { opacity: 0, y: 24, duration: 0.3 }, "<");
    tl.to(
      ".dd-taken > div",
      { boxShadow: `inset 0 0 0 4px ${BERRY}`, duration: 0.3 },
      "<0.2",
    );
    tl.to(
      ".dd-toast",
      { opacity: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "<0.1",
    );
    tl.to(
      ".dd-block",
      { x: 0, y: 0, duration: 0.9, ease: "back.out(1.4)" },
      ">0.5",
    );
    tl.to(".dd-t2", { opacity: 0, duration: 0.3 }, "<");
    tl.to(".dd-t1", { opacity: 1, duration: 0.3 }, "<");
    tl.to(".dd-home", { opacity: 0, duration: 0.3 }, "<");
    tl.to(".dd-cursor", { opacity: 0, duration: 0.3 }, "<");
    tl.to(
      ".dd-lift",
      { scale: 1, boxShadow: "0 0 0 0 rgba(0,0,0,0)", duration: 0.4 },
      "<",
    );
    tl.to(
      ".dd-note",
      { opacity: 1, y: 0, duration: 0.6, ease: "deck.enter" },
      "<0.2",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          Reschedule by <Grad>moving the block</Grad>
        </>
      }
      subhead="Drag a class to a new room or hour. The server checks first."
      tech={[
        { name: "pointerdown" },
        { name: "setPointerCapture" },
        { name: "getBoundingClientRect" },
        { name: "SNAP_MINUTES = 15" },
        { name: "events.update" },
        { name: "checkConflicts" },
      ]}
    >
      <div ref={visual} className="absolute inset-0 flex justify-between">
        <Browser url="plannr.app/timetable" width={1080} height={492}>
          <Grid />
        </Browser>
        <div className="flex w-[540px] flex-col justify-between">
          <ol className="flex flex-col gap-3">
            {LIST.map((t, i) => (
              <li key={t} className="dd-li flex items-center gap-5">
                <span className="dd-num font-display flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#e8eaef] text-[28px] font-bold text-[#5b6573]">
                  {i + 1}
                </span>
                <span className="text-fg text-[30px] leading-tight font-medium">
                  {t}
                </span>
              </li>
            ))}
          </ol>
          <div className="dd-note bg-raised rounded-[18px] p-6 shadow-[inset_0_0_0_1px_var(--line-strong)]">
            <p className="text-fg text-[26px] leading-snug">
              <span className="font-semibold">A clash:</span> the block stays
              put. <span className="font-semibold">No clash:</span> it is saved.
            </p>
            <p className="text-muted mt-3 text-[24px] leading-snug">
              Cannot manage all events? Your move goes as a change request.
            </p>
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "drag-and-drop",
  title: "Drag and drop for coordinators",
  steps: 5,
  notes: [
    "Here is the coordinator's timetable. Three rooms across, hours down, each class a block.",
    "To move a class you just grab it. This is plain pointer events, and the pointer is captured, so the drag survives leaving the block.",
    "Drag it into another room and hour. It snaps every fifteen minutes, and the time on the block updates as you go.",
    "Drop it, and if the class repeats, Plannr asks how much to move: this occurrence, this and following, or the whole series.",
    "Then the server checks. If the room is free, it saves. If it clashes, you get a clear message, and the block goes back where it was. Nothing moves until the server agrees. And someone who cannot manage all events sends a change request instead.",
  ],
  render: ({ step }) => <Dragdrop step={step} />,
};
