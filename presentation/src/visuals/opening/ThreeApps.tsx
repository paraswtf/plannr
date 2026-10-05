"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { BrowserFrame } from "~/ui/frames";
import { Icon, type IconName } from "~/ui/icon";

export interface ThreeAppsProps {
  step: number;
  active: boolean;
}

/**
 * Three windows side by side — the timetable site, Moodle, and the college
 * inbox — each correct on its own, contradicting each other together.
 *
 * The timetable window carries data-flip-id="app-timetable": the previous
 * slide's big timetable browser shrinks into it.
 *
 * Builds (steps = 3):
 *   0 — the three apps, calm.
 *   1 — a mail lands: "Design Thinking moved to 2:00 pm, Room 304".
 *   2 — the timetable still says 11:00, Room 301, and Moodle says something else: red links between the contradictions, into a badge "Which one is right?" (the title already says "No single source of truth").
 */

/* The stage is laid out in fixed canvas pixels, so the red links can be drawn
 * from constants rather than measured mid-morph. */
const STAGE = { width: 1664, height: 660 } as const;
const WIN = { width: 520, height: 520, gap: 52, bar: 52 } as const;
const winX = (i: number) => i * (WIN.width + WIN.gap);

/* Each window's contradicting fact sits in the same place: a full-width row
 * pinned to the bottom of the window's page. */
const FACT = { inset: 20, height: 68 } as const;
const FACT_TOP = WIN.height - FACT.inset - FACT.height; // 432
const FACT_BOTTOM = WIN.height - FACT.inset; // 500

const BADGE = { width: 392, height: 64, y: 594 } as const;
const BUS_Y = BADGE.y;
const BADGE_LEFT = STAGE.width / 2 - BADGE.width / 2;
const BADGE_RIGHT = STAGE.width / 2 + BADGE.width / 2;

/** A rounded ring around window i's fact, starting and ending bottom-centre. */
function ring(i: number) {
  const pad = 7;
  const r = 16;
  const x = winX(i) + FACT.inset - pad;
  const y = FACT_TOP - pad;
  const w = WIN.width - FACT.inset * 2 + pad * 2;
  const b = FACT_BOTTOM + pad;
  const cx = x + w / 2;
  return [
    `M${cx},${b}`,
    `H${x + r}`,
    `A${r},${r} 0 0 1 ${x},${b - r}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    `H${x + w - r}`,
    `A${r},${r} 0 0 1 ${x + w},${y + r}`,
    `V${b - r}`,
    `A${r},${r} 0 0 1 ${x + w - r},${b}`,
    `H${cx}`,
  ].join(" ");
}

/** Ring, then the run down to the bus and along it into the badge. */
function link(i: 0 | 1 | 2) {
  const cx = winX(i) + WIN.width / 2;
  const r = 26;
  if (i === 1) return `${ring(1)} V${BADGE.y - BADGE.height / 2}`;
  if (i === 0)
    return `${ring(0)} V${BUS_Y - r} Q${cx},${BUS_Y} ${cx + r},${BUS_Y} H${BADGE_LEFT}`;
  return `${ring(2)} V${BUS_Y - r} Q${cx},${BUS_Y} ${cx - r},${BUS_Y} H${BADGE_RIGHT}`;
}

const OLD_FONT: CSSProperties = {
  fontFamily: "Verdana, Tahoma, Arial, sans-serif",
};
const ALARM = "#dc3848";

export function ThreeApps({ step, active }: ThreeAppsProps) {
  const root = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const stepNow = useRef(step);
  stepNow.current = step;

  /* Moodle and the inbox wait out of the way while the timetable window
   * shrinks in from the slide before, then slide in beside it once it has
   * nearly landed — so the travelling window never crosses another one. */
  useGSAP(
    () => {
      if (instant || (active && stepNow.current > 0)) {
        gsap.set(".ta-later", { autoAlpha: 1, x: 0 });
        return;
      }
      if (!active) return;
      gsap.fromTo(
        ".ta-later",
        { autoAlpha: 0, x: 120 },
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.7,
          ease: "deck.enter",
          stagger: 0.1,
          delay: 0.6,
        },
      );
    },
    { scope: root, dependencies: [active, instant] },
  );

  useSteps(root, step, (tl, mark) => {
    // 1 — a new mail pushes the list down, then opens into the reading pane.
    tl.addLabel("mail");
    tl.to(
      ".ta-list",
      { y: MAIL_ROW, duration: 0.6, ease: "power3.inOut" },
      "mail",
    );
    tl.fromTo(
      ".ta-newrow",
      { y: -MAIL_ROW, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.6, ease: "power3.inOut" },
      "mail",
    );
    tl.set(".ta-count-old", { autoAlpha: 0 }, "mail+=0.3");
    tl.set(".ta-count-new", { autoAlpha: 1 }, "mail+=0.3");
    tl.fromTo(
      ".ta-pane",
      { top: LIST_TOP, height: MAIL_ROW, autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.15, ease: "none" },
      "mail+=0.8",
    );
    tl.to(
      ".ta-pane",
      { top: PANE_TOP, height: PANE_HEIGHT, duration: 0.7, ease: "deck.morph" },
      "mail+=0.8",
    );
    tl.fromTo(
      ".ta-pane-in",
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.45, ease: "deck.enter", stagger: 0.07 },
      "mail+=1.25",
    );
    mark();

    // 2 — the three facts go red, a pen rings each one and runs to the badge.
    tl.addLabel("clash");
    tl.to(
      ".ta-fact-value",
      { color: ALARM, duration: 0.4, ease: "power2.out", stagger: 0.12 },
      "clash",
    );
    tl.set(".ta-link", { opacity: 1 }, "clash");
    tl.fromTo(
      ".ta-link",
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 1.05, ease: "power2.inOut", stagger: 0.12 },
      "clash",
    );
    tl.fromTo(
      ".ta-badge",
      { autoAlpha: 0, scale: 0.86 },
      { autoAlpha: 1, scale: 1, duration: 0.55, ease: "back.out(1.6)" },
      "clash+=0.95",
    );
    mark();
  });

  return (
    <div
      ref={root}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div className="relative shrink-0" style={STAGE}>
        <BrowserFrame
          url="time-table.sicsr.ac.in"
          insecure
          width={WIN.width}
          height={WIN.height}
          flipId="app-timetable"
          style={{ position: "absolute", top: 0, left: winX(0) }}
        >
          <TimetableSite />
        </BrowserFrame>
        <div
          data-no-enter
          className="ta-later invisible absolute top-0"
          style={{ left: winX(1) }}
        >
          <BrowserFrame
            url="moodle.sicsr.ac.in"
            width={WIN.width}
            height={WIN.height}
          >
            <MoodlePage />
          </BrowserFrame>
        </div>
        <div
          data-no-enter
          className="ta-later invisible absolute top-0"
          style={{ left: winX(2) }}
        >
          <BrowserFrame
            url="mail.sicsr.ac.in"
            width={WIN.width}
            height={WIN.height}
          >
            <Inbox />
          </BrowserFrame>
        </div>

        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={STAGE.width}
          height={STAGE.height}
          viewBox={`0 0 ${STAGE.width} ${STAGE.height}`}
        >
          {([0, 1, 2] as const).map((i) => (
            <path
              key={i}
              className="ta-link"
              d={link(i)}
              fill="none"
              stroke="var(--bad)"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0}
            />
          ))}
        </svg>

        <div
          className="ta-badge invisible absolute flex items-center justify-center gap-3 rounded-full"
          style={{
            left: BADGE_LEFT,
            top: BADGE.y - BADGE.height / 2,
            width: BADGE.width,
            height: BADGE.height,
            background: "color-mix(in srgb, var(--bad) 16%, var(--bg))",
            boxShadow:
              "inset 0 0 0 2px var(--bad), 0 18px 40px rgba(0,0,0,0.35)",
          }}
        >
          <Icon name="alert" size={30} stroke={2.2} color="var(--bad)" />
          <span className="font-display text-[30px] font-semibold tracking-[-0.02em] text-white">
            Which one is right?
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The fact row every window ends on.                                        */

function Fact({
  label,
  value,
  tone = "#f3f5f8",
  ring = "rgba(13,17,23,0.08)",
  icon,
  iconColor,
  font,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: string;
  ring?: string;
  icon?: IconName;
  iconColor?: string;
  font?: CSSProperties;
}) {
  return (
    <div
      className="absolute flex items-center gap-4 rounded-[12px] px-4"
      style={{
        left: FACT.inset,
        right: FACT.inset,
        // Positions are measured from the top of the window, bar included.
        top: FACT_TOP - WIN.bar,
        height: FACT.height,
        background: tone,
        boxShadow: `inset 0 0 0 1px ${ring}`,
        ...font,
      }}
    >
      {icon && (
        <span
          className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: iconColor, color: "#fff" }}
        >
          <Icon name={icon} size={22} stroke={2} />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] leading-tight text-[rgba(44,49,53,0.62)]">
          {label}
        </span>
        <span className="ta-fact-value mt-1 truncate font-mono text-[25px] leading-none font-bold tracking-[-0.02em] text-[#0d1117]">
          {value}
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 1. The timetable site: MRBS, as it has looked for fifteen years.          */

const ROOMS = ["301", "302", "304", "Lab 1", "Lab 2"];
const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
/* The same navy and stock MRBS colours as the full page on the slide before. */
const NAVY = "#1d3b6e";
const TH = "#4a6a99";
const LINK = "#1a3fa8";
const MRBS = {
  a: "#99cccc",
  b: "#c0e0ff",
  c: "#ffccff",
  d: "#ffcc99",
  e: "#ddffdd",
  dt: "#ffff99",
};

/** [room][hour]: [label, colour] or null. */
const BOOKINGS: ([string, string] | null)[][] = [
  [
    ["BCA-A WT (DM)", MRBS.a],
    ["BCA-A WT (DM)", MRBS.a],
    ["BCA-A DT (PK)", MRBS.dt],
    null,
    ["BBA-A BA (PI)", MRBS.d],
    ["BCA-C WT (DF)", MRBS.b],
  ],
  [
    null,
    ["BCA-B CS (DF)", MRBS.b],
    ["BCA-B CS (DF)", MRBS.b],
    ["BCA-C ST (PI)", MRBS.e],
    null,
    ["BBA-A CC (DM)", MRBS.c],
  ],
  // 304 is free at 14:00 — which is where the mail moves Design Thinking.
  [
    ["BBA-A CC (DM)", MRBS.c],
    null,
    ["BCA-C DM (PK)", MRBS.d],
    ["BCA-C DM (PK)", MRBS.d],
    ["BCA-B WT (DF)", MRBS.b],
    null,
  ],
  [
    ["BCA-B Lab", MRBS.e],
    ["BCA-B Lab", MRBS.e],
    null,
    ["BBA-A ST (DF)", MRBS.a],
    ["BBA-A ST (DF)", MRBS.a],
    ["BCA-A Lab", MRBS.e],
  ],
  [
    null,
    ["BCA-A CS (PI)", MRBS.c],
    ["BCA-A CS (PI)", MRBS.c],
    null,
    ["BCA-C CC (DM)", MRBS.d],
    null,
  ],
];

function TimetableSite() {
  const timeCol = 56;
  const colW = (WIN.width - 32 - timeCol) / ROOMS.length;
  return (
    <div className="absolute inset-0 bg-white text-black" style={OLD_FONT}>
      <div
        className="flex h-[48px] items-center gap-2.5 px-4 text-white"
        style={{ background: NAVY }}
      >
        <svg width="30" height="30" viewBox="0 0 34 34" aria-hidden>
          <circle cx="17" cy="17" r="15.5" fill="#fff" />
          <circle
            cx="17"
            cy="17"
            r="12"
            fill="none"
            stroke={NAVY}
            strokeWidth="1.5"
          />
          <path
            d="M11 21.5h12M12.5 20V13M17 20V12M21.5 20V13M10.5 12.5 17 9l6.5 3.5z"
            stroke={NAVY}
            strokeWidth="1.4"
            fill="none"
          />
        </svg>
        <span className="flex flex-col leading-tight">
          <span className="text-[13.5px] font-bold">SICSR</span>
          <span className="text-[11px] opacity-85">Timetable</span>
        </span>
        <span className="ml-auto text-[11px] underline opacity-90">
          Help · Report · Log in
        </span>
      </div>
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2.5">
        <span className="text-[14px] font-bold">Thursday 13 August 2026</span>
        <span className="text-[11px] underline" style={{ color: LINK }}>
          &lt;&lt; Day Before · Day After &gt;&gt;
        </span>
      </div>
      <div
        className="mx-4 text-[10.5px]"
        style={{ boxShadow: "inset 0 0 0 1px #9c9c9c" }}
      >
        <div className="flex font-bold text-white" style={{ background: TH }}>
          <span className="shrink-0 px-1.5 py-[6px]" style={{ width: timeCol }}>
            Time
          </span>
          {ROOMS.map((room) => (
            <span
              key={room}
              className="py-[6px] text-center"
              style={{ width: colW }}
            >
              {room}
            </span>
          ))}
        </div>
        {HOURS.map((hour, h) => (
          <div
            key={hour}
            className="flex"
            style={{ boxShadow: "inset 0 1px 0 #c8c8c8" }}
          >
            <span
              className="shrink-0 px-1.5 py-[13px]"
              style={{ width: timeCol, background: "#e4eaf4", color: LINK }}
            >
              {hour}
            </span>
            {ROOMS.map((room, r) => {
              const booking = BOOKINGS[r]?.[h] ?? null;
              const isDT = r === 0 && h === 2;
              return (
                <span
                  key={room}
                  className="truncate px-1 py-[13px]"
                  style={{
                    width: colW,
                    background: booking?.[1] ?? "#fff",
                    boxShadow: isDT
                      ? `inset 0 0 0 2px ${NAVY}`
                      : "inset 1px 0 0 #c8c8c8",
                    fontWeight: isDT ? 700 : 400,
                  }}
                >
                  {booking?.[0] ?? ""}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <Fact
        label={
          <>
            <b className="text-black">Design Thinking</b> · BCA-A · Prof.
            Kulkarni
          </>
        }
        value="11:00 · Room 301"
        tone="#ffffb8"
        ring="#c9c25a"
        font={OLD_FONT}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 2. Moodle: the course page, where assignments and attendance live.        */

const MOODLE = "#f98012";

function MoodleRow({
  icon,
  color,
  title,
  meta,
}: {
  icon: IconName;
  color: string;
  title: string;
  meta: string;
}) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-[11px]"
      style={{ boxShadow: "inset 0 -1px 0 rgba(13,17,23,0.08)" }}
    >
      <span
        className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: color, color: "#fff" }}
      >
        <Icon name={icon} size={22} stroke={2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[16px] font-semibold text-[#0f6cbf]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[13.5px] text-[rgba(44,49,53,0.62)]">
          {meta}
        </span>
      </span>
    </div>
  );
}

function MoodlePage() {
  return (
    <div className="font-body absolute inset-0 bg-white text-[#1d2125]">
      <div
        className="flex h-[52px] items-center justify-between px-4"
        style={{ background: MOODLE }}
      >
        <span className="flex items-center gap-2.5 text-white">
          <span
            className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-white"
            style={{ color: MOODLE }}
          >
            <Icon name="cap" size={20} stroke={2.2} />
          </span>
          <span className="text-[21px] font-bold tracking-[-0.01em]">
            Moodle
          </span>
        </span>
        <span className="flex items-center gap-3 text-white">
          <Icon name="bell" size={20} stroke={2} />
          <span className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-white/25 text-[12px] font-bold">
            SA
          </span>
        </span>
      </div>
      <div className="px-5 pt-3">
        <p className="truncate text-[12.5px] text-[#0f6cbf]">
          Dashboard / My courses / BCA-A / Design Thinking
        </p>
        <h3 className="mt-1.5 text-[26px] leading-tight font-bold tracking-[-0.01em]">
          Design Thinking
        </h3>
        <p className="mt-2 text-[13px] font-semibold tracking-[0.04em] text-[rgba(44,49,53,0.6)] uppercase">
          Week 6 · Prototyping
        </p>
      </div>
      <div className="mt-2">
        <MoodleRow
          icon="edit"
          color="#c43c8a"
          title="Assignment 2: Empathy map"
          meta="Due Friday, 9 October, 11:59 PM"
        />
        <MoodleRow
          icon="file"
          color="#3d7fd6"
          title="Week 6 slides: Prototyping.pdf"
          meta="2.4 MB · added yesterday"
        />
        <MoodleRow
          icon="message"
          color="#7a5bc4"
          title="Forum: Choose your prototype groups"
          meta="14 replies · last post 9:30 AM"
        />
      </div>
      <Fact
        label={
          <>
            <b className="text-[#1d2125]">Attendance</b> · next session
          </>
        }
        value="Today 11:00 · Lab 2"
        icon="checkCircle"
        iconColor="#3f9b52"
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 3. The college inbox: where every change actually arrives.               */

const MAIL_RED = "#d93025";
const MAIL_ROW = 74;
/** Where the list starts, from the top of the page. */
const LIST_TOP = 60;
/** The open mail covers the list, from just under the inbox's own bar. */
const PANE_TOP = 60;
const PANE_HEIGHT = WIN.height - WIN.bar - PANE_TOP;

const MAILS = [
  {
    from: "Exam Cell",
    subject: "Hall tickets for internal exams",
    time: "9:12 AM",
  },
  { from: "Library", subject: "2 books due back on Friday", time: "Yesterday" },
  {
    from: "Placement Cell",
    subject: "Registrations close tonight",
    time: "Yesterday",
  },
  { from: "Student Council", subject: "Cultural fest volunteers", time: "Sat" },
  { from: "Accounts", subject: "Fee receipt, semester V", time: "Fri" },
];

function MailRow({
  from,
  subject,
  time,
  unread,
}: {
  from: string;
  subject: string;
  time: string;
  unread?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 px-5"
      style={{
        height: MAIL_ROW,
        boxShadow: "inset 0 -1px 0 rgba(13,17,23,0.07)",
        background: unread ? "#fff" : "#f6f8fb",
      }}
    >
      <span
        className="h-[9px] w-[9px] shrink-0 rounded-full"
        style={{ background: unread ? MAIL_RED : "transparent" }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={`truncate text-[16px] ${unread ? "font-bold" : "font-medium"}`}
          >
            {from}
          </span>
          <span
            className={`shrink-0 text-[13px] ${unread ? "font-bold text-[#0d1117]" : "text-[rgba(44,49,53,0.55)]"}`}
          >
            {time}
          </span>
        </span>
        <span
          className={`mt-1 block truncate text-[14.5px] ${unread ? "font-semibold" : "text-[rgba(44,49,53,0.7)]"}`}
        >
          {subject}
        </span>
      </span>
    </div>
  );
}

function Inbox() {
  return (
    <div className="font-body absolute inset-0 overflow-hidden bg-white text-[#0d1117]">
      <div
        className="relative z-10 flex items-center justify-between bg-white px-5"
        style={{
          height: LIST_TOP,
          boxShadow: "inset 0 -1px 0 rgba(13,17,23,0.08)",
        }}
      >
        <span className="flex items-center gap-2.5">
          <Icon name="mail" size={26} stroke={2.2} color={MAIL_RED} />
          <span className="text-[21px] font-bold">Inbox</span>
          <span className="relative ml-1 inline-block h-[24px] w-[34px]">
            <span
              className="ta-count-old absolute inset-0 flex items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: MAIL_RED }}
            >
              12
            </span>
            <span
              className="ta-count-new invisible absolute inset-0 flex items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: MAIL_RED }}
            >
              13
            </span>
          </span>
        </span>
        <span className="flex h-[34px] w-[190px] items-center gap-2 rounded-full bg-[#eef1f5] px-3 text-[13.5px] text-[rgba(44,49,53,0.5)]">
          <Icon name="search" size={16} stroke={2} />
          Search mail
        </span>
      </div>

      <div className="absolute inset-x-0" style={{ top: LIST_TOP }}>
        <div className="ta-newrow invisible absolute inset-x-0 top-0">
          <MailRow
            from="BCA Coordinator"
            subject="Change in today's schedule"
            time="10:41 AM"
            unread
          />
        </div>
        <div className="ta-list">
          {MAILS.map((m) => (
            <MailRow key={m.from} {...m} />
          ))}
        </div>
      </div>

      <div
        className="ta-pane invisible absolute inset-x-0 overflow-hidden bg-white"
        style={{
          top: PANE_TOP,
          height: PANE_HEIGHT,
          boxShadow: "inset 0 1px 0 rgba(13,17,23,0.08)",
        }}
      >
        <div className="px-5 pt-5">
          <div className="ta-pane-in flex items-center gap-3">
            <span
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white"
              style={{ background: "#7a2e8f" }}
            >
              BC
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-bold">
                BCA Coordinator
              </span>
              <span className="block truncate text-[13px] text-[rgba(44,49,53,0.6)]">
                to BCA-A · 10:41 AM
              </span>
            </span>
          </div>
          <h4 className="ta-pane-in mt-4 text-[22px] leading-tight font-bold tracking-[-0.01em]">
            Change in today&apos;s schedule
          </h4>
          <p className="ta-pane-in mt-3 text-[16.5px] leading-snug text-[rgba(44,49,53,0.86)]">
            Dear students, today&apos;s{" "}
            <b className="text-[#0d1117]">Design Thinking</b> lecture (BCA-A,
            Prof. Kulkarni) has been moved from 11:00 AM to{" "}
            <b className="text-[#0d1117]">2:00 PM, Room 304</b>, as the faculty
            has a meeting in the morning. Kindly inform your classmates.
          </p>
          <p className="ta-pane-in mt-3 text-[16.5px] leading-snug text-[rgba(44,49,53,0.86)]">
            Regards,
            <br />
            Office of the BCA Coordinator
          </p>
        </div>
      </div>
      {/* The fact sits outside the pane so it can be pinned to the window. */}
      <div className="ta-pane-in invisible absolute inset-0">
        <Fact
          label={
            <>
              <b className="text-[#0d1117]">Design Thinking</b> moved to
            </>
          }
          value="2:00 PM · Room 304"
          tone="#fdeceb"
          ring="rgba(217,48,37,0.3)"
          icon="mail"
          iconColor={MAIL_RED}
        />
      </div>
    </div>
  );
}
