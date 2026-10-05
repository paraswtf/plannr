"use client";

import { useRef } from "react";

import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { Ph } from "~/ui/placeholder";
import { Card } from "~/ui/surfaces";

import {
  AppBar,
  Block,
  cell,
  type ClassDef,
  Cursor,
  makeGrid,
  PAGE,
  Stage,
  STRIP,
  toBox,
  useIntro,
  WeekGrid,
} from "./_kit";

export interface EditOnceNotifyProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

/*
 * BCA-A's week. Data Mining moves from Wednesday 10:00 to Friday 13:00; its
 * students and its teacher hear about it, nobody else does.
 */
const G = makeGrid({ x: 15, y: 78, w: 900, gutter: 60, rowH: 72 });

const WEEK: ClassDef[] = [
  {
    id: "a",
    title: "Design Thinking",
    col: 0,
    hour: 9,
    room: "301",
    who: "Kulkarni",
  },
  {
    id: "b",
    title: "Web Technologies",
    col: 0,
    hour: 10,
    room: "Lab 2",
    who: "Fernandes",
  },
  { id: "c", title: "Business Analytics", col: 0, hour: 12, room: "304" },
  { id: "d", title: "Software Testing", col: 1, hour: 9, room: "Lab 2" },
  {
    id: "e",
    title: "Design Thinking",
    col: 1,
    hour: 11,
    room: "301",
    who: "Kulkarni",
  },
  { id: "f", title: "Statistics", col: 1, hour: 13, room: "304" },
  {
    id: "g",
    title: "Web Technologies",
    col: 2,
    hour: 11,
    room: "Lab 2",
    who: "Fernandes",
  },
  { id: "h", title: "Communication Skills", col: 2, hour: 13, room: "301" },
  { id: "i", title: "Business Analytics", col: 3, hour: 9, room: "304" },
  { id: "j", title: "Software Testing", col: 3, hour: 12, room: "Lab 2" },
  { id: "k", title: "Statistics", col: 4, hour: 10, room: "301" },
  {
    id: "l",
    title: "Design Thinking",
    col: 4,
    hour: 11,
    room: "304",
    who: "Kulkarni",
  },
  { id: "m", title: "Cyber Security", col: 1, hour: 14, room: "304" },
  { id: "n", title: "Cloud Computing", col: 3, hour: 14, room: "Lab 2" },
];

const MOVED: ClassDef = {
  id: "dm",
  title: "Data Mining",
  col: 2,
  hour: 10,
  room: "304",
  who: "Dr. Mehta",
};
const FROM = cell(G, MOVED.col, MOVED.hour);
const TO = cell(G, 4, 13);
const DRAG = { x: TO.x - FROM.x, y: TO.y - FROM.y };
/** Where the pointer holds the block, from its top-left. */
const GRIP = { x: 92, y: 36 };

const SAVE = { x: 742, y: 13, w: 168, h: 38 };
const CURSOR_START = { x: 600, y: 520 };
const CURSOR_GRAB = { x: FROM.x + GRIP.x, y: FROM.y + GRIP.y };
const CURSOR_SAVE = { x: SAVE.x + 70, y: SAVE.y + 30 };

/* ── The people under the window ─────────────────────────────────────── */

const AV = 52;
const STEP_X = 58;
const PILL_W = 64;
const ROW_Y = STRIP.y + 6;

interface Person {
  key: string;
  initials: string;
  x: number;
  pill?: boolean;
  teacher?: boolean;
  /** Notified on save. */
  hit: boolean;
  /** Has opened it by the tally (build 2). */
  seen?: boolean;
}

interface Group {
  label: string;
  x: number;
  w: number;
  hit: boolean;
}

function buildPeople() {
  const people: Person[] = [];
  const groups: Group[] = [];
  const gap = 44;
  let x = 25;
  const slug = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const crowd = (
    label: string,
    initials: string[],
    more: string,
    hit: boolean,
    seen: number,
  ) => {
    const start = x;
    initials.forEach((ini, i) => {
      people.push({
        key: `${slug(label)}${i}`,
        initials: ini,
        x,
        hit,
        seen: hit && i < seen,
      });
      x += i < initials.length - 1 ? STEP_X : AV + 8;
    });
    people.push({
      key: `${slug(label)}more`,
      initials: more,
      x,
      pill: true,
      hit,
      seen: hit,
    });
    x += PILL_W;
    groups.push({ label, x: start, w: x - start, hit });
    x += gap;
  };
  const teacher = (label: string, initials: string, hit: boolean) => {
    const w = 120;
    people.push({
      key: slug(label),
      initials,
      x: x + (w - AV) / 2,
      teacher: true,
      hit,
      seen: hit,
    });
    groups.push({ label, x, w, hit });
    x += w + gap;
  };
  crowd("BCA-A", ["AK", "RS", "NP", "VJ"], "+59", true, 3);
  teacher("Dr. Mehta", "M", true);
  crowd("BCA-B", ["TR", "HD", "KP"], "+60", false, 0);
  teacher("Prof. Iyer", "I", false);
  return { people, groups };
}

const { people: PEOPLE, groups: GROUPS } = buildPeople();
const widthOf = (p: Person) => (p.pill ? PILL_W : AV);
/** A notification's badge: the top-right corner of its person. */
const badgeAt = (p: Person) => ({ x: p.x + widthOf(p) - 14, y: ROW_Y + 4 });
const HIT = PEOPLE.filter((p) => p.hit);

/** Where the notifications leave from: the moved class, in box coordinates. */
const SOURCE = toBox({ x: TO.x + TO.w / 2, y: TO.y + TO.h / 2 });

/**
 * Edit the timetable once; everyone it affects hears about it, without a
 * mail.
 *
 * Builds (steps = 3):
 *   0 — the coordinator drags a class to a new slot on the grid.
 *   1 — save: notifications fan out to exactly the students and teacher affected.
 *   2 — the tally: N people told, 0 emails written, N have seen it (placeholder N).
 *
 * The browser window carries `flipId`, at the same size and place as the
 * other two coordinator demos, so it holds still between them.
 */
export function EditOnceNotify({ step, active, flipId }: EditOnceNotifyProps) {
  const ref = useRef<HTMLDivElement>(null);

  // On arrival: pick up Data Mining, carry it to Friday, drop it, go to Save.
  useIntro(ref, step, active, (tl) => {
    tl.fromTo(
      ".cur-a",
      { x: CURSOR_START.x, y: CURSOR_START.y },
      {
        x: CURSOR_GRAB.x,
        y: CURSOR_GRAB.y,
        duration: 0.75,
        ease: "deck.morph",
      },
    );
    // Grab: the pointer presses, the block lifts off the grid.
    tl.to(".cur-svg", { scale: 0.86, duration: 0.12, ease: "power2.out" }, ">");
    tl.to(
      ".dm",
      {
        scale: 1.05,
        rotation: -2,
        boxShadow: "0 22px 40px rgba(16,24,40,0.24)",
        duration: 0.28,
        ease: "power2.out",
      },
      "<",
    );
    tl.fromTo(".ghost", { opacity: 0 }, { opacity: 1, duration: 0.25 }, "<0.1");
    // The carry: block and pointer travel together, in lockstep.
    tl.addLabel("carry", ">0.05");
    tl.to(
      ".dm",
      { x: DRAG.x, y: DRAG.y, duration: 1.15, ease: "deck.morph" },
      "carry",
    );
    tl.to(
      ".cur-a",
      {
        x: CURSOR_GRAB.x + DRAG.x,
        y: CURSOR_GRAB.y + DRAG.y,
        duration: 1.15,
        ease: "deck.morph",
      },
      "carry",
    );
    tl.fromTo(
      ".target",
      { opacity: 0 },
      { opacity: 1, duration: 0.3 },
      "carry+=0.6",
    );
    // Drop.
    tl.to(
      ".dm",
      {
        scale: 1,
        rotation: 0,
        boxShadow: "0 0 0 rgba(16,24,40,0)",
        duration: 0.3,
        ease: "power2.out",
      },
      ">",
    );
    tl.to(".cur-svg", { scale: 1, duration: 0.15 }, "<");
    tl.to(".target", { opacity: 0, duration: 0.3 }, "<");
    tl.fromTo(".save", { opacity: 0.45 }, { opacity: 1, duration: 0.3 }, "<");
    tl.fromTo(
      ".save-count",
      { scale: 0 },
      { scale: 1, duration: 0.4, ease: "back.out(2.4)" },
      "<0.1",
    );
    // Over to Save.
    tl.to(
      ".cur-a",
      {
        x: CURSOR_SAVE.x,
        y: CURSOR_SAVE.y,
        duration: 0.7,
        ease: "deck.morph",
      },
      ">0.15",
    );
  });

  useSteps(ref, step, (tl, mark) => {
    // ── Build 1: Save. Then the change goes out, to exactly these people.
    tl.to(".cur-b", { scale: 0.84, duration: 0.1, ease: "power2.out" });
    tl.to(".cur-b", { scale: 1, duration: 0.18, ease: "power2.out" });
    tl.to(".save-done-bg", { opacity: 1, duration: 0.3 }, "<");
    tl.to(".save-idle", { opacity: 0, y: -10, duration: 0.25 }, "<");
    tl.fromTo(
      ".save-done",
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
      "<0.08",
    );
    tl.fromTo(
      ".ping",
      { scale: 1, opacity: 0.9 },
      {
        scale: 1.5,
        opacity: 0,
        duration: 0.7,
        ease: "power2.out",
        immediateRender: false,
      },
      "<0.1",
    );
    tl.to(".ghost", { opacity: 0, duration: 0.3 }, "<");
    tl.addLabel("fly", "<0.15");
    HIT.forEach((p, i) => {
      const end = badgeAt(p);
      const dx = SOURCE.x - end.x;
      const dy = SOURCE.y - end.y;
      const at = `fly+=${i * 0.08}`;
      const landed = `fly+=${i * 0.08 + 0.85}`;
      const sel = `.chip-${p.key}`;
      tl.set(sel, { x: dx, y: dy, opacity: 1, scale: 0.7 }, at);
      tl.to(
        sel,
        {
          motionPath: {
            path: [
              { x: dx * 0.55, y: dy * 0.55 - 150 },
              { x: 0, y: 0 },
            ],
            curviness: 1.1,
          },
          scale: 1,
          duration: 1,
          ease: "deck.morph",
        },
        at,
      );
      tl.to(`.lit-${p.key}`, { opacity: 1, duration: 0.3 }, landed);
      tl.fromTo(
        `.av-${p.key}`,
        { scale: 1 },
        {
          scale: 1.12,
          duration: 0.14,
          yoyo: true,
          repeat: 1,
          ease: "power2.out",
        },
        landed,
      );
    });
    tl.to(".glabel-hit", { color: "#10141b", duration: 0.4 }, ">-0.3");
    mark();

    // ── Build 2: who has seen it, and the tally.
    tl.addLabel("seen");
    HIT.filter((p) => p.seen).forEach((p, i) => {
      const at = `seen+=${0.15 + i * 0.12}`;
      tl.to(`.bell-${p.key}`, { opacity: 0, duration: 0.2 }, at);
      tl.fromTo(
        `.seen-${p.key}`,
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.6)" },
        at,
      );
    });
    tl.to(".scrim", { opacity: 1, duration: 0.5 }, "seen");
    tl.to(".cur-a", { opacity: 0, duration: 0.3 }, "seen");
    tl.fromTo(
      ".tally",
      { opacity: 0, y: 48 },
      { opacity: 1, y: 0, duration: 0.8, ease: "expo.out" },
      "seen+=0.1",
    );
    tl.from(
      ".n-sent",
      {
        textContent: 0,
        snap: { textContent: 1 },
        duration: 1,
        ease: "power2.out",
      },
      "seen+=0.3",
    );
    tl.from(
      ".n-seen",
      {
        textContent: 0,
        snap: { textContent: 1 },
        duration: 1.2,
        ease: "power2.out",
      },
      "seen+=0.4",
    );
    mark();
  });

  return (
    <Stage
      stageRef={ref}
      flipId={flipId}
      strip={<People />}
      overlay={
        <>
          {HIT.map((p) => {
            const b = badgeAt(p);
            return (
              <span
                key={p.key}
                className={`chip-${p.key} absolute flex items-center justify-center rounded-full`}
                style={{
                  left: b.x - 13,
                  top: b.y - 13,
                  width: 26,
                  height: 26,
                  opacity: 0,
                  background: "var(--accent)",
                  color: "#ffffff",
                  boxShadow:
                    "0 0 0 3px var(--bg), 0 6px 14px -4px rgba(16,24,40,0.3)",
                }}
              >
                <span
                  className={`bell-${p.key} absolute inset-0 flex items-center justify-center`}
                >
                  <Icon name="bell" size={15} stroke={2.4} />
                </span>
                <span
                  className={`seen-${p.key} absolute inset-0 flex items-center justify-center rounded-full`}
                  style={{
                    opacity: 0,
                    background: "var(--good)",
                    color: "#ffffff",
                  }}
                >
                  <Icon name="check" size={15} stroke={3} />
                </span>
              </span>
            );
          })}
          <Tally />
        </>
      }
    >
      <AppBar title="Timetable" chip="BCA-A" sub="Week of 5 Oct" />
      <SaveButton />
      <WeekGrid g={G} today={0} />
      {WEEK.map((c) => (
        <Block key={c.id} g={G} c={c} />
      ))}

      {/* Where it was, and where it is going. */}
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
          left: TO.x,
          top: TO.y,
          width: TO.w,
          height: TO.h,
          opacity: 0,
          background: "rgba(68,88,121,0.08)",
          outline: "2px dashed var(--slate)",
          outlineOffset: -2,
        }}
      />

      <Block
        g={G}
        c={MOVED}
        className="dm z-10 rounded-[10px]"
        style={{ transformOrigin: `${GRIP.x}px ${GRIP.y}px` }}
      >
        <span
          className="ping pointer-events-none absolute inset-0 rounded-[10px]"
          style={{
            opacity: 0,
            boxShadow: "0 0 0 3px var(--accent)",
          }}
        />
      </Block>

      <div
        className="scrim pointer-events-none absolute inset-0 z-20"
        style={{
          opacity: 0,
          background: "rgba(242,243,246,0.72)",
          backdropFilter: "blur(3px)",
        }}
      />

      <Cursor
        className="cur-a"
        innerClassName="cur-b"
        style={{
          transform: `translate(${CURSOR_SAVE.x}px, ${CURSOR_SAVE.y}px)`,
        }}
      />
    </Stage>
  );
}

function SaveButton() {
  return (
    <div
      className="save absolute overflow-hidden rounded-[10px] text-[16px] font-semibold text-white"
      style={{
        left: SAVE.x,
        top: SAVE.y,
        width: SAVE.w,
        height: SAVE.h,
        background: "var(--slate)",
      }}
    >
      <span
        className="save-done-bg absolute inset-0"
        style={{ opacity: 0, background: "var(--green)" }}
      />
      <span className="save-idle absolute inset-0 flex items-center justify-center gap-2.5">
        Save changes
        <span
          className="save-count flex h-5 min-w-5 items-center justify-center rounded-full font-mono text-[12px]"
          style={{ background: "var(--orange)", color: "#0d1117" }}
        >
          1
        </span>
      </span>
      <span
        className="save-done absolute inset-0 flex items-center justify-center gap-2"
        style={{ opacity: 0 }}
      >
        <Icon name="check" size={18} stroke={2.6} />
        Saved
      </span>
    </div>
  );
}

function People() {
  return (
    <>
      {GROUPS.map((g) => (
        <span
          key={g.label}
          className={`absolute text-center text-[22px] font-medium ${g.hit ? "glabel-hit" : ""}`}
          style={{
            left: g.x - 20,
            width: g.w + 40,
            top: ROW_Y - STRIP.y + AV + 14,
            color: "#8f97a6",
          }}
        >
          {g.label}
        </span>
      ))}
      {PEOPLE.map((p) => (
        <Face key={p.key} p={p} />
      ))}
    </>
  );
}

/** Avatars are rounded squares (30%); the "+59" tile shares the radius. */
const AV_RADIUS = Math.round(AV * 0.3);

function Face({ p }: { p: Person }) {
  const w = widthOf(p);
  const base =
    "absolute inset-0 flex items-center justify-center font-display font-semibold tabular-nums";
  const size = p.pill ? 19 : p.teacher ? 22 : 18;
  return (
    <span
      className={`av-${p.key} absolute`}
      style={{
        left: p.x,
        top: ROW_Y - STRIP.y,
        width: w,
        height: AV,
        borderRadius: AV_RADIUS,
        boxShadow: "0 0 0 4px var(--bg)",
      }}
    >
      <span
        className={`${base} bg-raised text-muted`}
        style={{
          fontSize: size,
          borderRadius: AV_RADIUS,
          boxShadow: "inset 0 0 0 1px var(--line-strong), var(--shadow-1)",
        }}
      >
        {p.initials}
      </span>
      {p.hit && (
        <span
          className={`lit-${p.key} ${base} text-accent`}
          style={{
            opacity: 0,
            fontSize: size,
            borderRadius: AV_RADIUS,
            background: "#f8e7ed",
            boxShadow: "inset 0 0 0 2px var(--accent-line), var(--shadow-1)",
          }}
        >
          {p.initials}
        </span>
      )}
    </span>
  );
}

function Tally() {
  const stats = [
    {
      n: (
        <Ph>
          <span className="n-sent">64</span>
        </Ph>
      ),
      label: "people told",
      accent: false,
    },
    { n: <span>0</span>, label: "emails written", accent: true },
    {
      n: (
        <Ph>
          <span className="n-seen">58</span>
        </Ph>
      ),
      label: "have seen it",
      accent: false,
    },
  ];
  const w = 780;
  return (
    <Card
      className="tally flex items-stretch"
      style={{
        position: "absolute",
        left: PAGE.x + (PAGE.w - w) / 2,
        top: PAGE.y + 150,
        width: w,
        height: 204,
        opacity: 0,
        boxShadow: "inset 0 0 0 1px var(--line), var(--shadow-3)",
      }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="flex flex-1 flex-col items-center justify-center gap-4"
          style={i > 0 ? { boxShadow: "inset 1px 0 0 var(--line)" } : undefined}
        >
          <span
            className={`font-display text-[80px] leading-none font-semibold tracking-[-0.04em] tabular-nums ${s.accent ? "text-accent" : "text-fg"}`}
          >
            {s.n}
          </span>
          <span className="text-muted text-[26px]">{s.label}</span>
        </div>
      ))}
    </Card>
  );
}
