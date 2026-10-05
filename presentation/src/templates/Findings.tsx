"use client";

import { useId, useRef, type ReactNode } from "react";

import { STAKEHOLDERS } from "~/content/team";
import { useSteps } from "~/deck/useSteps";
import type { StakeholderId } from "~/deck/types";
import { Icon, type IconName } from "~/ui/icon";
import { Eyebrow, Glow, SAFE } from "~/ui/layout";

import { useEntrance } from "./_closing-motion";

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

/* Canvas geometry. The row of cards sits under the title, then rises into
 * the title's place on the last build to make room for the conclusion. */
const CANVAS_W = 1920;
const CONTENT_W = CANVAS_W - SAFE.x * 2;
const GAP = 28;
const CARD_TOP = 404;
const CARD_H = 404;
const RAISED_TOP = SAFE.top;
const LIFT = RAISED_TOP - CARD_TOP;
const JOIN_Y = RAISED_TOP + CARD_H + 124;
const CONCLUSION_TOP = JOIN_Y + 46;

/**
 * What the research added up to, stakeholder by stakeholder.
 *
 * A card in each stakeholder's colour rises in per build. On the last build
 * the title steps out, the row travels up into its place, a line runs from
 * every card into one point, and the conclusion arrives under it, large.
 */
export function Findings({
  eyebrow,
  title,
  findings,
  conclusion,
  step,
}: FindingsProps) {
  const root = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
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
      { opacity: 0, duration: 0.8, ease: "power1.out", stagger: 0.06 },
      0.2,
    );
    tl.from(
      ".fd-card-in-0",
      { y: 70, opacity: 0, duration: 0.95, ease: "deck.enter" },
      0.25,
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
      tl.fromTo(
        ".fd-join",
        { drawSVG: "0% 0%", opacity: 0 },
        {
          drawSVG: "0% 100%",
          opacity: 1,
          duration: 0.75,
          ease: "power2.inOut",
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
      tl.fromTo(
        ".fd-glow",
        { opacity: 0 },
        {
          opacity: 1,
          duration: 1.4,
          ease: "power2.out",
          immediateRender: true,
        },
        "c+=1.3",
      );
      mark();
    },
    [findings.length, Boolean(conclusion)],
  );

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <div className="fd-all absolute inset-0">
        {conclusion && (
          <div className="fd-glow absolute inset-0">
            <Glow
              x="50%"
              y={`${((CONCLUSION_TOP + 80) / 1080) * 100}%`}
              size={1500}
            />
          </div>
        )}

        <header
          className="fd-head absolute"
          style={{ left: SAFE.x, top: SAFE.top, width: CONTENT_W }}
        >
          <div className="fd-head-in flex flex-col">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h1 className="t-title mt-6 max-w-[22ch] text-balance">{title}</h1>
          </div>
        </header>

        <div
          className="fd-row absolute"
          style={{ left: SAFE.x, top: CARD_TOP, width: CONTENT_W }}
        >
          {/* Empty slots, so the row reads as four from the first build. */}
          {findings.map((_, i) => (
            <div
              key={`slot-${i}`}
              aria-hidden
              className="fd-slot absolute top-0 rounded-[28px]"
              style={{
                left: i * (cardW + GAP),
                width: cardW,
                height: CARD_H,
                outline: "2px dashed var(--line)",
                outlineOffset: -2,
              }}
            />
          ))}
          {findings.map((f, i) => (
            <div
              key={i}
              className={`fd-card-${i} absolute top-0`}
              style={{ left: i * (cardW + GAP), width: cardW, height: CARD_H }}
            >
              <div className={`fd-card-in-${i} h-full`}>
                <FindingCard finding={f} />
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
              <defs>
                <linearGradient id={`${uid}-knot`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#c9306c" />
                  <stop offset="1" stopColor="#f6a73b" />
                </linearGradient>
              </defs>
              {findings.map((f, i) => {
                const x = centres[i] ?? mid;
                const y0 = RAISED_TOP + CARD_H + 14;
                return (
                  <path
                    key={i}
                    className="fd-join"
                    d={`M${x} ${y0} C${x} ${y0 + 62} ${mid} ${JOIN_Y - 58} ${mid} ${JOIN_Y}`}
                    strokeWidth={3}
                    strokeLinecap="round"
                    style={{
                      stroke: f.stakeholder
                        ? STAKEHOLDERS[f.stakeholder].color
                        : "var(--fg-muted)",
                    }}
                  />
                );
              })}
              <circle
                className="fd-knot"
                cx={mid}
                cy={JOIN_Y}
                r={9}
                fill={`url(#${uid}-knot)`}
              />
            </svg>

            <p
              className="fd-conclusion font-display absolute text-center text-balance [&_.grad-text]:inline-block"
              style={{
                left: SAFE.x,
                width: CONTENT_W,
                top: CONCLUSION_TOP,
                fontSize: 84,
                fontWeight: 700,
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

function FindingCard({ finding }: { finding: Finding }) {
  const s = finding.stakeholder ? STAKEHOLDERS[finding.stakeholder] : undefined;
  const color = s?.color ?? "var(--fg)";
  return (
    <div
      className="bg-card relative flex h-full flex-col overflow-hidden rounded-[28px] p-9"
      style={{
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, var(--line))`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[180px]"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${color} 13%, transparent), transparent)`,
        }}
      />
      <span
        aria-hidden
        className="absolute top-0 left-9 h-[4px] w-[64px] rounded-b-full"
        style={{ background: color }}
      />
      <div className="relative flex items-center gap-4">
        <span
          className="fd-icon flex h-[56px] w-[56px] items-center justify-center rounded-[16px]"
          style={{
            color,
            background: `color-mix(in srgb, ${color} 16%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)`,
          }}
        >
          <Icon name={finding.icon} size={30} stroke={2} />
        </span>
        {s && (
          <span className="t-eyebrow" style={{ color }}>
            {s.title}
          </span>
        )}
      </div>
      <h2 className="font-display relative mt-7 text-[36px] leading-[1.14] font-semibold tracking-[-0.02em] text-balance">
        {finding.title}
      </h2>
      <p className="text-muted relative mt-4 text-[26px] leading-[1.42] text-pretty">
        {finding.body}
      </p>
    </div>
  );
}
