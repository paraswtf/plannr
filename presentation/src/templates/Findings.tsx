"use client";

import { useRef, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import type { StakeholderId } from "~/deck/types";
import { Icon, type IconName } from "~/ui/icon";
import { SAFE } from "~/ui/layout";

import { ACCENT, useEntrance } from "./_closing-motion";

export interface Finding {
  /** Whose research it came from; omit for one that cuts across everyone. */
  stakeholder?: StakeholderId;
  icon: IconName;
  title: ReactNode;
  body: ReactNode;
}

export interface FindingsProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  findings: Finding[];
  /** The one-line conclusion they add up to, on the last build. */
  conclusion?: ReactNode;
  /**
   * Finding i appears on step i (the first from the start); one more step
   * shows the conclusion. Steps = findings.length + (conclusion ? 1 : 0).
   */
  step: number;
}

/* Canvas geometry. The four findings sit under the title as columns on a
 * shared rule, then rise into the title's place on the last build to make
 * room for the conclusion. */
const CANVAS_W = 1920;
const CONTENT_W = CANVAS_W - SAFE.x * 2;
const GAP = 56;
const CARD_TOP = 420;
const CARD_H = 380;
const RAISED_TOP = SAFE.top + 8;
const LIFT = RAISED_TOP - CARD_TOP;
const JOIN_Y = RAISED_TOP + CARD_H + 118;
const CONCLUSION_TOP = JOIN_Y + 48;

/**
 * What the research added up to, stakeholder by stakeholder.
 *
 * Four columns hang from one hairline, so the row reads as four from the
 * first build. Each finding rises into its column as its rule fills in ink.
 * On the last build the title steps out, the row travels up into its place,
 * a line runs from every column into one point (the accent: the thing that
 * connects them), and the conclusion arrives under it, large.
 */
export function Findings({ title, findings, conclusion, step }: FindingsProps) {
  const root = useRef<HTMLDivElement>(null);
  const n = Math.max(1, findings.length);
  const cardW = (CONTENT_W - GAP * (n - 1)) / n;
  const centres = findings.map(
    (_, i) => SAFE.x + i * (cardW + GAP) + cardW / 2,
  );
  const mid = CANVAS_W / 2;

  // Arriving on a later build (coming back from the next slide), the slide
  // simply fades up; the rise belongs to arriving at the start.
  const firstStep = useRef(step).current;
  useEntrance(root, (tl) => {
    if (firstStep > 0) {
      tl.from(".fd-all", { opacity: 0, duration: 0.7, ease: "power1.out" });
      return;
    }
    tl.from(".fd-head-in > *", {
      y: 36,
      opacity: 0,
      duration: 0.9,
      ease: "deck.enter",
      stagger: 0.08,
    });
    tl.from(
      ".fd-slot",
      {
        scaleX: 0,
        transformOrigin: "0% 50%",
        duration: 0.9,
        ease: "deck.enter",
        stagger: 0.06,
      },
      0.2,
    );
    tl.from(
      ".fd-card-in-0",
      { y: 70, opacity: 0, duration: 0.95, ease: "deck.enter" },
      0.25,
    );
    tl.from(
      ".fd-card-in-0 .fd-fill",
      {
        scaleX: 0,
        transformOrigin: "0% 50%",
        duration: 0.9,
        ease: "deck.enter",
      },
      0.35,
    );
  });

  useSteps(
    root,
    step,
    (tl, mark) => {
      for (let i = 1; i < findings.length; i++) {
        const at = `f${i}`;
        tl.addLabel(at);
        tl.fromTo(
          `.fd-card-${i}`,
          { y: 90, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.95,
            ease: "deck.enter",
            immediateRender: true,
          },
          at,
        );
        tl.fromTo(
          `.fd-card-${i} .fd-fill`,
          { scaleX: 0, transformOrigin: "0% 50%" },
          {
            scaleX: 1,
            duration: 0.9,
            ease: "deck.enter",
            immediateRender: true,
          },
          `${at}+=0.1`,
        );
        tl.fromTo(
          `.fd-card-${i} .fd-icon`,
          { scale: 0.4, rotate: -20 },
          {
            scale: 1,
            rotate: 0,
            duration: 0.8,
            ease: "back.out(2)",
            immediateRender: true,
          },
          `${at}+=0.25`,
        );
        mark();
      }
      if (!conclusion) return;
      tl.addLabel("c");
      tl.to(
        ".fd-head",
        { y: -60, opacity: 0, duration: 0.55, ease: "power2.in" },
        "c",
      );
      tl.to(".fd-row", { y: LIFT, duration: 1, ease: "deck.morph" }, "c+=0.1");
      tl.to(
        ".fd-slots",
        { y: LIFT, duration: 1, ease: "deck.morph" },
        "c+=0.1",
      );
      tl.fromTo(
        ".fd-join",
        { drawSVG: "0% 0%", opacity: 0 },
        {
          drawSVG: "0% 100%",
          opacity: 1,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.06,
          immediateRender: true,
        },
        "c+=0.85",
      );
      tl.fromTo(
        ".fd-knot",
        { scale: 0, opacity: 0, transformOrigin: "50% 50%" },
        {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          ease: "back.out(2.4)",
          immediateRender: true,
        },
        "c+=1.45",
      );
      tl.fromTo(
        ".fd-conclusion",
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: "deck.enter",
          immediateRender: true,
        },
        "c+=1.4",
      );
      mark();
    },
    [findings.length, Boolean(conclusion)],
  );

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <div className="fd-all absolute inset-0">
        <header
          className="fd-head absolute"
          style={{ left: SAFE.x, top: SAFE.top, width: CONTENT_W }}
        >
          <div className="fd-head-in flex flex-col">
            <h1 className="t-title text-fg max-w-[22ch] text-balance">
              {title}
            </h1>
          </div>
        </header>

        {/* The empty rule over each column, so the row reads as four from
            the first build; each finding fills its rule in ink. */}
        <div
          className="fd-slots absolute"
          style={{ left: SAFE.x, top: CARD_TOP, width: CONTENT_W }}
        >
          {findings.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className="fd-slot bg-line-strong absolute top-0 h-[2px]"
              style={{ left: i * (cardW + GAP), width: cardW }}
            />
          ))}
        </div>

        <div
          className="fd-row absolute"
          style={{ left: SAFE.x, top: CARD_TOP, width: CONTENT_W }}
        >
          {findings.map((f, i) => (
            <div
              key={i}
              className={`fd-card-${i} absolute top-0`}
              style={{ left: i * (cardW + GAP), width: cardW, height: CARD_H }}
            >
              <div className={`fd-card-in-${i} h-full`}>
                <FindingColumn finding={f} />
              </div>
            </div>
          ))}
        </div>

        {conclusion && (
          <>
            <svg
              className="pointer-events-none absolute inset-0"
              width={CANVAS_W}
              height={1080}
              viewBox={`0 0 ${CANVAS_W} 1080`}
              fill="none"
              aria-hidden
            >
              {findings.map((_, i) => {
                const x = centres[i] ?? mid;
                const y0 = RAISED_TOP + CARD_H + 10;
                return (
                  <path
                    key={i}
                    className="fd-join"
                    d={`M${x} ${y0} C${x} ${y0 + 62} ${mid} ${JOIN_Y - 58} ${mid} ${JOIN_Y}`}
                    stroke={ACCENT}
                    strokeOpacity={0.55}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                );
              })}
              <circle
                className="fd-knot"
                cx={mid}
                cy={JOIN_Y}
                r={8}
                fill={ACCENT}
              />
            </svg>

            <p
              className="fd-conclusion font-display text-fg absolute text-center text-balance [&_.grad-text]:inline-block"
              style={{
                left: SAFE.x,
                width: CONTENT_W,
                top: CONCLUSION_TOP,
                fontSize: 84,
                fontWeight: 600,
                lineHeight: 1.04,
                letterSpacing: "-0.035em",
              }}
            >
              {conclusion}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** One finding: its rule, its icon, the claim and the evidence. */
function FindingColumn({ finding }: { finding: Finding }) {
  return (
    <div className="relative flex h-full flex-col">
      <span
        aria-hidden
        className="fd-fill bg-fg absolute inset-x-0 top-0 h-[2px]"
      />
      <div className="mt-9 flex items-center">
        <span className="fd-icon bg-sunken text-fg flex h-[56px] w-[56px] items-center justify-center rounded-[12px]">
          <Icon name={finding.icon} size={30} />
        </span>
      </div>
      <h2 className="font-display text-fg mt-8 text-[36px] leading-[1.14] font-semibold tracking-[-0.02em] text-pretty!">
        {finding.title}
      </h2>
      <p className="text-muted mt-4 text-[26px] leading-[1.42] text-pretty">
        {finding.body}
      </p>
    </div>
  );
}
