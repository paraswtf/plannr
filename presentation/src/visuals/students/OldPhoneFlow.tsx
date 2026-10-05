"use client";

import { useRef } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { PhoneFrame } from "~/ui/frames";
import { Icon, type IconName } from "~/ui/icon";

import {
  ASK,
  BrowserApp,
  cellCentre,
  ChatApp,
  MailApp,
  OldStatusBar,
  PAGE,
  SCREEN_W,
  TARGET,
  Touch,
  VIEWPORT,
} from "./_oldphone-screens";

export interface OldPhoneFlowProps {
  step: number;
  active: boolean;
}

const STEPS: readonly { title: string; sub: string; icon: IconName }[] = [
  { title: "Open the site", sub: "on mobile data, and wait", icon: "globe" },
  {
    title: "Find your division",
    sub: "in a grid of the whole college",
    icon: "grid",
  },
  { title: "Check Gmail", sub: "in case something changed", icon: "mail" },
  { title: "Ask the group", sub: "and hope somebody knows", icon: "message" },
];

/*
 * The step list's colours, as plain hex and rgb for GSAP to interpolate. The
 * step being talked about wears the accent; a step left behind goes grey.
 */
const ACCENT = "#c8305f";
const ACCENT_SOFT = "rgba(200, 48, 95, 0.09)";
const SUNKEN = "#e7e9ee";
const MUTED = "#5f6878";

const ROW_H = 150;
const ROW_GAP = 14;
const PHONE_H = 800;

/* The pinch and the pan, worked out in the browser viewport's pixels. */
const S0 = SCREEN_W / PAGE.width; // the desktop page, shrunk to fit
const S1 = 1.25; // zoomed far enough to read a cell
const PINCH = { x: 250, y: 70 }; // where the two fingers meet
const FINGER = { x: 20, y: 16 }; // each finger's offset from there, at first
const AFTER_PINCH = {
  x: PINCH.x - (PINCH.x / S0) * S1,
  y: PINCH.y - (PINCH.y / S0) * S1,
};
const found = cellCentre(TARGET.col, TARGET.row);
const AFTER_PAN = {
  x: SCREEN_W / 2 - found.x * S1,
  y: VIEWPORT.height / 2 - found.y * S1,
};
const SWIPES = 2;
const SWIPE_FROM = { x: 290, y: 560 }; // screen pixels
const APP_GAP = SCREEN_W + 18; // one app's width plus the gap between cards

/**
 * Checking today's classes on a phone, the way students do it now, in a
 * PhoneFrame, step by painful step.
 *
 * Builds (steps = 4):
 *   0: open the timetable site on mobile data: a spinner, seconds counting.
 *   1: pinch, zoom and scroll sideways to find your division in the college-wide grid.
 *   2: switch to Gmail and search for changes.
 *   3: give up and ask the class WhatsApp group.
 */
export function OldPhoneFlow({ step, active }: OldPhoneFlowProps) {
  const root = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();

  // Build 0 runs by itself: the spinner turns and the seconds count up for
  // as long as the page is (not) loading.
  useGSAP(
    () => {
      if (!active || step !== 0) return;
      const counter = root.current?.querySelector<HTMLElement>(".op-counter");
      if (!counter) return;
      if (instant) {
        counter.textContent = "0:12";
        return;
      }
      const clock = { s: 0 };
      gsap.to(clock, {
        s: 599,
        duration: 599,
        ease: "none",
        onUpdate: () => {
          const s = Math.floor(clock.s);
          counter.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        },
      });
      gsap.to(".op-spinner", {
        rotation: 360,
        duration: 0.9,
        ease: "none",
        repeat: -1,
        transformOrigin: "50% 50%",
      });
      gsap.fromTo(
        ".op-progress-fill",
        { scaleX: 0.04 },
        { scaleX: 0.6, duration: 16, ease: "power3.out" },
      );
    },
    {
      scope: root,
      dependencies: [active, step === 0, instant],
      revertOnUpdate: true,
    },
  );

  useSteps(root, step, (tl, mark) => {
    gsap.set(".op-page", { transformOrigin: "0 0", scale: S0, x: 0, y: 0 });
    gsap.set(".op-mail, .op-chat", { x: APP_GAP }); // parked just off the right edge

    /** The caption beside the phone moves on to step k. */
    const indicate = (k: number, at: number) => {
      tl.to(
        ".op-pill",
        { y: k * (ROW_H + ROW_GAP), duration: 0.75, ease: "deck.morph" },
        at,
      );
      tl.fromTo(
        `[data-row="${k}"]`,
        { autoAlpha: 0, x: -24 },
        { autoAlpha: 1, x: 0, duration: 0.6, ease: "deck.enter" },
        at + 0.25,
      );
      const prev = `[data-row="${k - 1}"]`;
      tl.to(
        `${prev} .op-row-text`,
        { opacity: 0.6, duration: 0.5, ease: "power2.out" },
        at,
      );
      tl.to(
        `${prev} .op-badge`,
        { backgroundColor: SUNKEN, color: MUTED, duration: 0.5 },
        at,
      );
      tl.to(
        `${prev} .op-num`,
        { autoAlpha: 0, scale: 0.5, duration: 0.25 },
        at,
      );
      tl.fromTo(
        `${prev} .op-check`,
        { autoAlpha: 0, scale: 0.4 },
        { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2.5)" },
        at + 0.15,
      );
      // Just after the build starts: a set exactly on the mark would also
      // fire when the previous build lands there.
      tl.set(
        ".op-time",
        { text: ["8:52", "8:53", "8:55", "8:57"][k] ?? "8:57" },
        at + 0.02,
      );
    };

    /**
     * An app switch: a finger along the bottom edge carries one app off to
     * the left and the next one on from the right. Returns when it lands.
     */
    const switchApps = (out: string, into: string, at: number) => {
      const swipe = { duration: 0.7, ease: "deck.morph" };
      tl.set(".op-t1", { x: 330, y: 836 }, at + 0.02);
      tl.fromTo(
        ".op-t1",
        { autoAlpha: 0, scale: 0.6 },
        { autoAlpha: 1, scale: 1, duration: 0.12 },
        at,
      );
      tl.to(out, { x: -APP_GAP, ...swipe }, at + 0.06);
      tl.to(into, { x: 0, ...swipe }, at + 0.06);
      tl.to(".op-t1", { x: 50, ...swipe }, at + 0.06);
      tl.to(".op-t1", { autoAlpha: 0, scale: 1.3, duration: 0.16 }, at + 0.7);
      return at + 0.76;
    };

    // 1: the page arrives, shrunk to a desktop grid; pinch, then pan to BCA-A.
    indicate(1, 0);
    tl.to(
      ".op-loading",
      { autoAlpha: 0, duration: 0.25, ease: "power1.out" },
      0,
    );
    tl.to(".op-progress", { autoAlpha: 0, duration: 0.3 }, 0.1);
    tl.fromTo(
      ".op-pagewrap",
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.3 },
      0.05,
    );

    const fingerA = {
      x: PINCH.x - FINGER.x,
      y: PINCH.y - FINGER.y + VIEWPORT.top,
    };
    const fingerB = {
      x: PINCH.x + FINGER.x,
      y: PINCH.y + FINGER.y + VIEWPORT.top,
    };
    const spread = S1 / S0; // the fingers spread exactly as much as the page grows
    tl.set(".op-t1", fingerA, 0.3);
    tl.set(".op-t2", fingerB, 0.3);
    tl.fromTo(
      ".op-t1, .op-t2",
      { autoAlpha: 0, scale: 0.6 },
      { autoAlpha: 1, scale: 1, duration: 0.14 },
      0.3,
    );
    const pinch = { duration: 0.85, ease: "deck.morph" };
    tl.to(
      ".op-page",
      { scale: S1, x: AFTER_PINCH.x, y: AFTER_PINCH.y, ...pinch },
      0.42,
    );
    tl.to(
      ".op-t1",
      {
        x: PINCH.x - FINGER.x * spread,
        y: PINCH.y - FINGER.y * spread + VIEWPORT.top,
        ...pinch,
      },
      0.42,
    );
    tl.to(
      ".op-t2",
      {
        x: PINCH.x + FINGER.x * spread,
        y: PINCH.y + FINGER.y * spread + VIEWPORT.top,
        ...pinch,
      },
      0.42,
    );
    tl.to(".op-t1, .op-t2", { autoAlpha: 0, scale: 1.3, duration: 0.14 }, 1.22);

    // The pan, in strokes a thumb can make: the page follows the finger exactly.
    const dx = (AFTER_PAN.x - AFTER_PINCH.x) / SWIPES;
    const dy = (AFTER_PAN.y - AFTER_PINCH.y) / SWIPES;
    let at = 1.3;
    for (let i = 0; i < SWIPES; i++) {
      const drag = { duration: 0.42, ease: "deck.morph" };
      tl.set(".op-t1", SWIPE_FROM, at);
      tl.fromTo(
        ".op-t1",
        { autoAlpha: 0, scale: 0.6 },
        { autoAlpha: 1, scale: 1, duration: 0.1 },
        at,
      );
      tl.to(
        ".op-t1",
        { x: SWIPE_FROM.x + dx, y: SWIPE_FROM.y + dy, ...drag },
        at + 0.08,
      );
      tl.to(
        ".op-page",
        {
          x: AFTER_PINCH.x + dx * (i + 1),
          y: AFTER_PINCH.y + dy * (i + 1),
          ...drag,
        },
        at + 0.08,
      );
      tl.to(".op-t1", { autoAlpha: 0, scale: 1.3, duration: 0.12 }, at + 0.5);
      at += 0.6;
    }
    tl.fromTo(
      ".op-found",
      { autoAlpha: 0, scale: 1.35 },
      { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2)" },
      at - 0.05,
    );
    mark();

    // 2: over to the mail app, and search it.
    const b2 = tl.duration();
    indicate(2, b2);
    let t = switchApps(".op-browser", ".op-mail", b2);
    tl.set(".op-search-ph", { autoAlpha: 0 }, t - 0.05);
    tl.to(
      ".op-search",
      { text: "timetable", duration: 0.4, ease: "none" },
      t - 0.05,
    );
    tl.fromTo(
      ".op-result",
      { autoAlpha: 0, y: 22 },
      { autoAlpha: 1, y: 0, duration: 0.4, ease: "deck.enter", stagger: 0.05 },
      t + 0.4,
    );
    tl.fromTo(
      ".op-hit-bg",
      { autoAlpha: 0, scale: 0.94 },
      { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2)" },
      t + 0.85,
    );
    mark();

    // 3: and on to the class group.
    const b3 = tl.duration();
    indicate(3, b3);
    t = switchApps(".op-mail", ".op-chat", b3);
    tl.to(".op-type", { text: ASK, duration: 0.36, ease: "none" }, t - 0.05);
    tl.set(".op-type", { text: "" }, t + 0.4);
    gsap.utils
      .toArray<HTMLElement>(".op-msg", root.current)
      .forEach((msg, i) => {
        tl.fromTo(
          msg,
          { height: 0, marginTop: 0, autoAlpha: 0 },
          {
            height: "auto",
            marginTop: 6,
            autoAlpha: 1,
            duration: 0.3,
            ease: "power3.out",
          },
          t + 0.4 + i * 0.36,
        );
      });
    mark();
  });

  return (
    <div ref={root} className="relative flex h-full w-full items-center gap-16">
      <PhoneFrame height={PHONE_H} statusBar={false} screenBg="#ffffff">
        <div className="absolute inset-0 overflow-hidden">
          <BrowserApp />
          <MailApp />
          <ChatApp />
        </div>
        <OldStatusBar time="8:52" />
        <Touch className="op-t1" />
        <Touch className="op-t2" />
      </PhoneFrame>

      <div
        className="relative min-w-0 flex-1"
        style={{ height: STEPS.length * ROW_H + (STEPS.length - 1) * ROW_GAP }}
      >
        <span
          className="op-pill bg-raised absolute inset-x-0 top-0 rounded-[22px]"
          style={{
            height: ROW_H,
            boxShadow: "inset 0 0 0 1px var(--line), var(--shadow-2)",
          }}
        />
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            data-row={i}
            className="absolute inset-x-0 flex items-start gap-6 px-7 pt-7"
            style={{ top: i * (ROW_H + ROW_GAP), height: ROW_H }}
          >
            <span
              className="op-badge relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px]"
              style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}
            >
              <span className="op-num flex">
                <Icon name={s.icon} size={30} weight="regular" />
              </span>
              <span
                className="op-check absolute inset-0 flex items-center justify-center"
                style={{ visibility: "hidden" }}
              >
                <Icon name="check" size={28} weight="bold" />
              </span>
            </span>
            <span className="op-row-text min-w-0 pt-1">
              <span className="t-h3 text-fg block">{s.title}</span>
              <span className="text-muted mt-1.5 block text-[26px] leading-snug">
                {s.sub}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
