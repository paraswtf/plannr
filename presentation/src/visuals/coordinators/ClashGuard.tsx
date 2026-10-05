"use client";

import { useRef } from "react";

import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";

import {
  AppBar,
  Block,
  BlockFace,
  cell,
  type ClassDef,
  Cursor,
  makeGrid,
  Stage,
  StatusPill,
  useIntro,
  WeekGrid,
} from "./_kit";

export interface ClashGuardProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

/*
 * BCA-B's week. Software Testing (Prof. Iyer, room 301) is dragged from
 * Monday 14:00 towards Wednesday 11:00 — a slot that looks empty on this
 * grid, but room 301 and Prof. Iyer are both busy then, with other groups.
 */
const G = makeGrid({ x: 15, y: 78, w: 900, gutter: 60, rowH: 72 });

const WEEK: ClassDef[] = [
  {
    id: "a",
    title: "Web Technologies",
    col: 0,
    hour: 9,
    room: "Lab 2",
    who: "Fernandes",
  },
  { id: "b", title: "Statistics", col: 0, hour: 11, room: "304" },
  { id: "c", title: "Business Analytics", col: 1, hour: 9, room: "304" },
  {
    id: "d",
    title: "Design Thinking",
    col: 1,
    hour: 10,
    room: "301",
    who: "Kulkarni",
  },
  { id: "e", title: "Communication Skills", col: 1, hour: 13, room: "304" },
  { id: "f", title: "Statistics", col: 2, hour: 9, room: "304" },
  {
    id: "g",
    title: "Web Technologies",
    col: 2,
    hour: 10,
    room: "Lab 2",
    who: "Fernandes",
  },
  {
    id: "h",
    title: "Data Mining",
    col: 2,
    hour: 13,
    room: "304",
    who: "Mehta",
  },
  {
    id: "i",
    title: "Design Thinking",
    col: 3,
    hour: 11,
    room: "301",
    who: "Kulkarni",
  },
  { id: "j", title: "Business Analytics", col: 3, hour: 13, room: "304" },
  {
    id: "k",
    title: "Data Mining",
    col: 4,
    hour: 9,
    room: "Lab 2",
    who: "Mehta",
  },
  { id: "l", title: "Communication Skills", col: 4, hour: 10, room: "304" },
  {
    id: "m",
    title: "Web Technologies",
    col: 4,
    hour: 12,
    room: "Lab 2",
    who: "Fernandes",
  },
  { id: "n", title: "Cyber Security", col: 1, hour: 14, room: "304" },
  { id: "o", title: "Cloud Computing", col: 3, hour: 14, room: "Lab 2" },
];

const MOVED: ClassDef = {
  id: "st",
  title: "Software Testing",
  col: 0,
  hour: 14,
  room: "301",
  who: "Prof. Iyer",
};
const FROM = cell(G, MOVED.col, MOVED.hour);
const CLASH = cell(G, 2, 11);
const ALTS = [
  { col: 1, hour: 12, room: "Room 301" },
  { col: 3, hour: 10, room: "Room 301", pick: true },
  { col: 4, hour: 13, room: "Lab 2" },
].map((a) => ({ ...a, r: cell(G, a.col, a.hour) }));
const PICK = ALTS.find((a) => a.pick)!.r;

const AT_CLASH = { x: CLASH.x - FROM.x, y: CLASH.y - FROM.y };
const AT_PICK = { x: PICK.x - FROM.x, y: PICK.y - FROM.y };
const GRIP = { x: 128, y: 54 };
const CURSOR_START = { x: 640, y: 520 };
const grip = (o: { x: number; y: number }) => ({
  x: FROM.x + GRIP.x + o.x,
  y: FROM.y + GRIP.y + o.y,
});

const LIFT = {
  scale: 1.05,
  rotation: -2,
  boxShadow: "0 22px 40px rgba(13,17,23,0.3)",
};
const REST = { scale: 1, rotation: 0, boxShadow: "0 0 0 rgba(13,17,23,0)" };

/** The clash sheet: it slides in from the window's right edge. */
const PANEL = { w: 352, x: 930 - 352, y: 64, h: 568 - 64 };

/**
 * Clashes are caught before they are saved, with a way out offered.
 *
 * Builds (steps = 3):
 *   0 — placing a class into a slot.
 *   1 — a warning before saving: the room is taken, or the teacher is teaching elsewhere then.
 *   2 — three clash-free alternatives; one is picked.
 *
 * The browser window carries `flipId`, at the same size and place as the
 * other two coordinator demos, so it holds still between them.
 */
export function ClashGuard({ step, active, flipId }: ClashGuardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // On arrival: pick Software Testing up and carry it over Wednesday 11:00.
  useIntro(ref, step, active, (tl) => {
    tl.fromTo(
      ".cur-a",
      { x: CURSOR_START.x, y: CURSOR_START.y },
      {
        x: grip({ x: 0, y: 0 }).x,
        y: grip({ x: 0, y: 0 }).y,
        duration: 0.75,
        ease: "power2.inOut",
      },
    );
    tl.to(".cur-svg", { scale: 0.86, duration: 0.12, ease: "power2.out" }, ">");
    tl.fromTo(
      ".dm",
      REST,
      { ...LIFT, duration: 0.28, ease: "power2.out" },
      "<",
    );
    tl.fromTo(".ghost", { opacity: 0 }, { opacity: 1, duration: 0.25 }, "<0.1");
    tl.addLabel("carry", ">0.05");
    tl.fromTo(
      ".dm",
      { x: 0, y: 0 },
      { x: AT_CLASH.x, y: AT_CLASH.y, duration: 1.2, ease: "power2.inOut" },
      "carry",
    );
    tl.to(
      ".cur-a",
      {
        x: grip(AT_CLASH).x,
        y: grip(AT_CLASH).y,
        duration: 1.2,
        ease: "power2.inOut",
      },
      "carry",
    );
    tl.fromTo(
      ".target",
      { opacity: 0 },
      { opacity: 1, duration: 0.3 },
      "carry+=0.7",
    );
  });

  useSteps(ref, step, (tl, mark) => {
    // ── Build 1: still holding it — and Plannr says no, before anything is saved.
    tl.to(".target-red", { opacity: 1, duration: 0.3 });
    tl.to(".dm-red", { opacity: 1, duration: 0.3 }, "<");
    tl.to(
      ".dm-shake",
      {
        keyframes: { x: [0, -9, 8, -6, 4, 0] },
        duration: 0.45,
        ease: "power1.inOut",
      },
      "<",
    );
    tl.from(
      ".panel",
      { x: PANEL.w + 40, duration: 0.75, ease: "expo.out" },
      "<0.1",
    );
    tl.from(
      ".panel-row",
      { opacity: 0, y: 14, duration: 0.45, stagger: 0.1, ease: "power2.out" },
      "<0.25",
    );
    tl.from(
      ".pill-bad",
      { opacity: 0, y: 24, duration: 0.5, ease: "deck.enter" },
      "<0.1",
    );
    mark();

    // ── Build 2: the way out. Three slots that work; one is taken.
    tl.to(".panel", { x: PANEL.w + 40, duration: 0.5, ease: "power2.in" });
    tl.to(
      ".target-red, .dm-red, .target",
      { opacity: 0, duration: 0.3 },
      "<0.15",
    );
    tl.to(".pill-bad", { opacity: 0, y: -16, duration: 0.3 }, "<");
    tl.from(
      ".alt",
      {
        opacity: 0,
        scale: 0.86,
        duration: 0.45,
        stagger: 0.12,
        ease: "back.out(2)",
      },
      "<0.15",
    );
    // Hold: three ways out, before one is chosen.
    tl.addLabel("move", ">0.6");
    tl.fromTo(
      ".dm",
      { x: AT_CLASH.x, y: AT_CLASH.y },
      {
        x: AT_PICK.x,
        y: AT_PICK.y,
        duration: 0.9,
        ease: "power2.inOut",
        immediateRender: false,
      },
      "move",
    );
    tl.fromTo(
      ".cur-a",
      { x: grip(AT_CLASH).x, y: grip(AT_CLASH).y },
      {
        x: grip(AT_PICK).x,
        y: grip(AT_PICK).y,
        duration: 0.9,
        ease: "power2.inOut",
        immediateRender: false,
      },
      "move",
    );
    // Drop, and it snaps into the slot.
    tl.fromTo(
      ".dm",
      LIFT,
      {
        ...REST,
        duration: 0.35,
        ease: "back.out(2.2)",
        immediateRender: false,
      },
      ">",
    );
    tl.fromTo(
      ".cur-svg",
      { scale: 0.86 },
      { scale: 1, duration: 0.15, immediateRender: false },
      "<",
    );
    // The other two stay, dimmed: they were real options, and still are.
    tl.to(".alt-other", { opacity: 0.7, duration: 0.3 }, "<");
    tl.to(".alt-pick", { opacity: 0, duration: 0.4 }, "<0.1");
    tl.to(".dm-good", { opacity: 1, duration: 0.3 }, "<");
    tl.to(".ghost", { opacity: 0, duration: 0.3 }, "<");
    tl.from(
      ".pill-good",
      { opacity: 0, y: 24, duration: 0.5, ease: "deck.enter" },
      "<0.1",
    );
    mark();
  });

  return (
    <Stage
      stageRef={ref}
      flipId={flipId}
      strip={
        <div className="relative flex h-16 justify-center">
          <StatusPill
            icon="alert"
            tone="bad"
            className="pill-bad absolute top-0"
          >
            2 clashes — caught before saving
          </StatusPill>
          <StatusPill
            icon="check"
            tone="good"
            className="pill-good absolute top-0"
          >
            Saved — no clashes
          </StatusPill>
        </div>
      }
    >
      <AppBar
        title="Timetable"
        chip="BCA-B"
        sub="Week of 5 Oct"
        right={
          <span className="flex items-center gap-2 text-[15px] font-semibold text-[rgba(44,49,53,0.6)]">
            <Icon name="shield" size={18} stroke={2} color="var(--green)" />
            Checking rooms, teachers, groups
          </span>
        }
      />
      <WeekGrid g={G} today={0} />
      {WEEK.map((c) => (
        <Block key={c.id} g={G} c={c} />
      ))}

      <div
        className="ghost absolute rounded-[10px]"
        style={{
          left: FROM.x,
          top: FROM.y,
          width: FROM.w,
          height: FROM.h,
          opacity: 0,
          outline: "2px dashed rgba(68,88,121,0.4)",
          outlineOffset: -2,
        }}
      />
      <div
        className="target absolute rounded-[10px]"
        style={{
          left: CLASH.x,
          top: CLASH.y,
          width: CLASH.w,
          height: CLASH.h,
          opacity: 0,
          background: "rgba(68,88,121,0.08)",
          outline: "2px dashed var(--slate)",
          outlineOffset: -2,
        }}
      />
      <div
        className="target-red absolute rounded-[10px]"
        style={{
          left: CLASH.x - 4,
          top: CLASH.y - 3,
          width: CLASH.w + 8,
          height: CLASH.h + 6,
          opacity: 0,
          background: "rgba(220,56,72,0.12)",
          outline: "2px dashed var(--red)",
          outlineOffset: -2,
        }}
      />

      {ALTS.map((a) => (
        <div
          key={`${a.col}-${a.hour}`}
          className={`alt ${a.pick ? "alt-pick" : "alt-other"} absolute flex flex-col justify-center rounded-[10px] px-3`}
          style={{
            left: a.r.x,
            top: a.r.y,
            width: a.r.w,
            height: a.r.h,
            background: "rgba(78,125,58,0.12)",
            boxShadow:
              "inset 0 0 0 2px #5f9a46, 0 0 0 4px rgba(124,196,106,0.25), 0 0 22px rgba(124,196,106,0.55)",
          }}
        >
          <span className="flex items-center gap-1.5 text-[17px] leading-tight font-semibold text-[#2f5f1f]">
            <Icon name="checkCircle" size={18} stroke={2.2} />
            {a.room}
          </span>
          <span className="mt-1 text-[14px] font-semibold text-[#2f5f1f]/75">
            Free · no clashes
          </span>
        </div>
      ))}

      <Block
        g={G}
        c={MOVED}
        bare
        className="dm z-10 rounded-[10px]"
        style={{ transformOrigin: `${GRIP.x}px ${GRIP.y}px` }}
      >
        <div className="dm-shake absolute inset-0">
          <BlockFace c={MOVED} />
          <span
            className="dm-red absolute inset-0 rounded-[10px]"
            style={{
              opacity: 0,
              boxShadow:
                "inset 0 0 0 2.5px var(--red), 0 0 0 4px rgba(220,56,72,0.25)",
            }}
          >
            <span
              className="absolute -top-2.5 -left-2.5 flex h-6 w-6 items-center justify-center rounded-full font-mono text-[13px] font-bold text-white"
              style={{ background: "var(--red)", boxShadow: "0 0 0 2px #fff" }}
            >
              2
            </span>
          </span>
          <span
            className="dm-good absolute inset-0 rounded-[10px]"
            style={{
              opacity: 0,
              boxShadow:
                "inset 0 0 0 2.5px #5f9a46, 0 0 0 5px rgba(124,196,106,0.35)",
            }}
          />
        </div>
      </Block>

      <ClashPanel />

      <Cursor
        className="cur-a"
        innerClassName="cur-b"
        style={{
          transform: `translate(${grip(AT_CLASH).x}px, ${grip(AT_CLASH).y}px)`,
        }}
      />
    </Stage>
  );
}

function ClashPanel() {
  const rows: {
    icon: IconName;
    title: string;
    detail: string;
    ok?: boolean;
  }[] = [
    {
      icon: "door",
      title: "Room 301 is taken",
      detail: "BBA(IT)-B · Cloud Computing",
    },
    {
      icon: "user",
      title: "Prof. Iyer is teaching",
      detail: "BCA-A · Lab 2 · 11:00",
    },
    {
      icon: "users",
      title: "BCA-B is free then",
      detail: "No clash for the group",
      ok: true,
    },
  ];
  return (
    <div
      className="panel absolute z-30 flex flex-col bg-white"
      style={{
        left: PANEL.x,
        top: PANEL.y,
        width: PANEL.w,
        height: PANEL.h,
        boxShadow:
          "inset 1px 0 0 rgba(220,56,72,0.3), -24px 0 60px rgba(13,17,23,0.16)",
      }}
    >
      <div
        className="flex items-center gap-3.5 px-6 py-5"
        style={{
          background: "rgba(220,56,72,0.07)",
          boxShadow: "inset 0 -1px 0 rgba(220,56,72,0.16)",
        }}
      >
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full text-white"
          style={{ background: "var(--red)" }}
        >
          <Icon name="alert" size={23} stroke={2.3} />
        </span>
        <span className="flex flex-col">
          <span className="font-display text-[24px] leading-tight font-bold tracking-[-0.01em] text-[#a3202e]">
            2 clashes
          </span>
          <span className="mt-0.5 font-mono text-[13px] text-[rgba(44,49,53,0.6)]">
            Software Testing → Wed 11:00
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-2 px-4 pt-4">
        {rows.map((r) => (
          <div
            key={r.title}
            className="panel-row flex items-start gap-3.5 rounded-xl px-2 py-3"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
              style={{
                background: r.ok
                  ? "rgba(78,125,58,0.12)"
                  : "rgba(220,56,72,0.1)",
                color: r.ok ? "var(--green)" : "var(--red)",
              }}
            >
              <Icon name={r.icon} size={21} stroke={2} />
            </span>
            <span className="flex min-w-0 flex-col pt-0.5">
              <span
                className="text-[18px] leading-snug font-semibold"
                style={{ color: r.ok ? "var(--green)" : "#0d1117" }}
              >
                {r.title}
              </span>
              <span className="mt-1 font-mono text-[13.5px] text-[rgba(44,49,53,0.6)]">
                {r.detail}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div
        className="panel-row mt-auto flex items-center gap-2.5 px-6 py-4 text-[14.5px] font-medium text-[rgba(44,49,53,0.65)]"
        style={{ boxShadow: "inset 0 1px 0 var(--hair)" }}
      >
        <Icon name="shield" size={18} stroke={2} />
        Nothing is saved while it clashes
      </div>
    </div>
  );
}
