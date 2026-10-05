"use client";

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { BrowserFrame } from "~/ui/frames";
import { Icon, type IconName } from "~/ui/icon";

import { GMAIL, GMAIL_FONT, GmailPage } from "./_gmail-page";
import { MRBS_CSS, mrbsHtml, VIEW } from "./_mrbs-snapshot";
import { SCALE } from "./_oldtimetable-page";
import { WHATSAPP, WHATSAPP_FONT, WhatsAppPage } from "./_whatsapp-page";

export interface ThreeAppsProps {
  step: number;
  active: boolean;
}

/**
 * Three windows side by side (the timetable site, Gmail and the class's
 * WhatsApp group), each sure of itself, contradicting each other together.
 * Each app is drawn as it really looks; the single accent is kept for the one
 * thing that matters, the contradiction.
 *
 * The timetable window carries data-flip-id="app-timetable": the previous
 * slide's big timetable browser shrinks into it. The page inside is the same
 * copy of the site at the same scale, so the smaller window only crops it.
 *
 * The story runs on that page's real data: Design Thinking for BCA Sem VII
 * Div A is at 09:00 in 405. 406 is free at 2:00 PM and 701 at 3:00 PM, so
 * neither the mail nor the group contradicts the page by accident.
 *
 * Builds (steps = 3):
 *   0: the three apps, calm.
 *   1: a mail lands in Gmail: Design Thinking moved to 2:00 PM, Room 406.
 *   2: the class group says 3:00 PM, Room 701. Accent links ring the three
 *      facts and run into a marker, "Which one is right?".
 */

/* The stage is laid out in fixed canvas pixels, so the links can be drawn
 * from constants rather than measured mid-morph. */
const STAGE = { width: 1664, height: 660 } as const;
const WIN = { width: 520, height: 520, gap: 52, bar: 52 } as const;
const winX = (i: number) => i * (WIN.width + WIN.gap);

/* Each window's contradicting fact sits in the same place: a full-width row
 * pinned to the bottom of the window's page. */
const FACT = { inset: 20, height: 68 } as const;
const FACT_TOP = WIN.height - FACT.inset - FACT.height; // 432
const FACT_BOTTOM = WIN.height - FACT.inset; // 500

const BADGE = { width: 404, height: 72, y: 594 } as const;
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

/* The timetable site's own face, for the fact under its page. */
const MRBS_FONT: CSSProperties = {
  fontFamily: "Arial, Helvetica, sans-serif",
};
/* The deck's accent, as hex: GSAP tweens the fact values to it, and cannot
 * interpolate towards a var(). Keep in step with --accent in globals.css. */
const ACCENT = "#c8305f";

export function ThreeApps({ step, active }: ThreeAppsProps) {
  const root = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const stepNow = useRef(step);
  stepNow.current = step;

  /* Gmail and WhatsApp wait out of the way while the timetable window
   * shrinks in from the slide before, then slide in beside it once it has
   * nearly landed, so the travelling window never crosses another one. */
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
    // 1: a new mail pushes the list down, then opens into the reading pane.
    tl.addLabel("mail");
    tl.to(
      ".ta-list",
      { y: GMAIL.row, duration: 0.7, ease: "deck.morph" },
      "mail",
    );
    tl.fromTo(
      ".ta-newrow",
      { y: -GMAIL.row, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.7, ease: "deck.morph" },
      "mail",
    );
    tl.set(".ta-count-old", { autoAlpha: 0 }, "mail+=0.3");
    tl.set(".ta-count-new", { autoAlpha: 1 }, "mail+=0.3");
    tl.fromTo(
      ".ta-pane",
      { top: GMAIL.listTop, height: GMAIL.row, autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.15, ease: "power1.out" },
      "mail+=0.8",
    );
    tl.to(
      ".ta-pane",
      {
        top: GMAIL.paneTop,
        height: GMAIL.paneHeight,
        duration: 0.7,
        ease: "deck.morph",
      },
      "mail+=0.8",
    );
    tl.fromTo(
      ".ta-pane-in",
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.45, ease: "deck.enter", stagger: 0.07 },
      "mail+=1.25",
    );
    mark();

    // 2: the class group says something else again, the way WhatsApp shows
    // it: "Ishaan is typing…" in the header, then the message lands whole and
    // the conversation scrolls up by its height. Then the three facts turn
    // accent, a pen rings each one and runs to the marker, which rises into
    // place as the lines arrive.
    tl.addLabel("chat");
    tl.set(".ta-wa-typing", { autoAlpha: 1 }, "chat");
    tl.addLabel("landed", "chat+=0.8");
    tl.set(".ta-wa-typing", { autoAlpha: 0 }, "landed");
    tl.set(".ta-wa-new", { autoAlpha: 1 }, "landed");
    tl.to(
      ".ta-wa-msgs",
      { y: -WHATSAPP.lift, duration: 0.35, ease: "power2.out" },
      "landed",
    );
    tl.fromTo(
      ".ta-wa-fact",
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.45, ease: "deck.enter" },
      "landed+=0.45",
    );

    tl.addLabel("clash", "landed+=1");
    tl.to(
      ".ta-fact-value",
      { color: ACCENT, duration: 0.4, ease: "power2.out", stagger: 0.12 },
      "clash",
    );
    tl.set(".ta-link", { opacity: 1 }, "clash");
    tl.fromTo(
      ".ta-link",
      { drawSVG: "0%" },
      { drawSVG: "100%", duration: 1.1, ease: "deck.morph", stagger: 0.12 },
      "clash",
    );
    tl.fromTo(
      ".ta-badge",
      { autoAlpha: 0, y: 28, scale: 0.94 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, ease: "deck.enter" },
      "clash+=0.9",
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
          url="time-table.sicsr.ac.in/day.php?year=2026&month=10&day=06&area=1&room=29"
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
            url="mail.google.com/mail/u/0/#inbox"
            width={WIN.width}
            height={WIN.height}
          >
            <GmailPage />
          </BrowserFrame>
          {/* Over the open mail's foot, once it has opened. */}
          <div className="ta-pane-in pointer-events-none invisible absolute inset-0">
            <Fact
              label={
                <>
                  <b className="text-[#1f1f1f]">Design Thinking</b> moved to
                </>
              }
              value="2:00 PM · Room 406"
              tone="#fce8e6"
              ring="rgba(217,48,37,0.3)"
              icon="mail"
              iconColor="#d93025"
              font={GMAIL_FONT}
            />
          </div>
        </div>
        <div
          data-no-enter
          className="ta-later invisible absolute top-0"
          style={{ left: winX(2) }}
        >
          <BrowserFrame
            url="web.whatsapp.com"
            width={WIN.width}
            height={WIN.height}
          >
            <WhatsAppPage />
          </BrowserFrame>
          {/* Over the composer, once the new message is in. */}
          <div className="ta-wa-fact pointer-events-none invisible absolute inset-0">
            <Fact
              label={
                <>
                  <b className="text-[#111b21]">Class group</b>: Design Thinking
                  at
                </>
              }
              value="3:00 PM · Room 701"
              tone="#d9fdd3"
              ring="rgba(0,168,132,0.32)"
              icon="whatsapp"
              iconColor="#25d366"
              font={WHATSAPP_FONT}
            />
          </div>
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
              stroke="var(--accent)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0}
            />
          ))}
        </svg>

        {/* The marker the three lines run into: a raised plate on the stage,
            ringed in the accent's hairline, so it reads as the slide's
            question rather than as part of any one app. */}
        <div
          className="ta-badge bg-raised invisible absolute flex items-center justify-center gap-4 rounded-[22px]"
          style={{
            left: BADGE_LEFT,
            top: BADGE.y - BADGE.height / 2,
            width: BADGE.width,
            height: BADGE.height,
            boxShadow: "inset 0 0 0 1.5px var(--accent-line), var(--shadow-2)",
          }}
        >
          <span className="bg-accent-soft text-accent flex h-[44px] w-[44px] items-center justify-center rounded-[12px]">
            <Icon name="alert" size={26} stroke={2} />
          </span>
          <span className="font-display text-fg text-[32px] font-semibold tracking-[-0.025em]">
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
        // Pinned to the foot of the page (FACT_BOTTOM in window terms), so
        // while the timetable window morphs in at another size the row stays
        // under the page rather than over it.
        bottom: FACT.inset,
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
        <span className="ta-fact-value mt-1.5 truncate font-mono text-[25px] leading-none font-semibold tracking-[-0.02em] text-[#0d1117] tabular-nums">
          {value}
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 1. The timetable site: the college's own page (see _mrbs-snapshot.ts), at */
/*    the scale the slide before shows it, so the morph only crops it.       */

let mrbsMarkup: string | null = null;

function TimetableSite() {
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    mrbsMarkup ??= `<style>${MRBS_CSS}</style>${mrbsHtml()}`;
    (el.shadowRoot ?? el.attachShadow({ mode: "open" })).innerHTML = mrbsMarkup;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-white">
      {/* A picture of the page: inert, so its fields never take the keys
          that drive the deck. */}
      <div
        ref={host}
        inert
        className="absolute top-0 left-0"
        style={{
          width: VIEW.width,
          height: VIEW.height,
          transform: `scale(${SCALE})`,
          transformOrigin: "0 0",
        }}
      />
      <Fact
        label={
          <>
            <b className="text-black">Design Thinking</b>, BCA Sem VII Div A
          </>
        }
        value="09:00 · Room 405"
        icon="calendar"
        iconColor="#cc0066"
        font={MRBS_FONT}
      />
    </div>
  );
}
