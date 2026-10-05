"use client";

import { useId, useRef, type ReactNode } from "react";

import type { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import type { IconName } from "~/ui/icon";
import { SAFE } from "~/ui/layout";
import { Card, Chip } from "~/ui/surfaces";

import { ACCENT, INK, useEntrance } from "./_closing-motion";

export interface RoadmapPhase {
  /** "Now", "Next", "Later", or a term: "Sem VIII". */
  label: ReactNode;
  title: ReactNode;
  items: ReactNode[];
  status: "done" | "now" | "next" | "later";
}

export interface RoadmapProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  phases: RoadmapPhase[];
  /** Phase i appears on step i (the first from the start). Steps = phases.length. */
  step: number;
}

const STATUS: Record<RoadmapPhase["status"], { text: string; icon: IconName }> =
  {
    done: { text: "Shipped", icon: "checkCircle" },
    now: { text: "In progress", icon: "zap" },
    next: { text: "Planned", icon: "calendarCheck" },
    later: { text: "Exploring", icon: "sparkles" },
  };

/* Canvas geometry. */
const CONTENT_W = 1920 - SAFE.x * 2;
const LINE_Y = 404;
const CARD_TOP = 470;
const CARD_H = 440;
const GAP = 40;

/** The line's colours: the accent up to the current phase, quiet after it. */
const LINE_QUIET = "#b4bac5";

/**
 * Where Plannr goes from here, phase by phase.
 *
 * A line runs out from "Today" and draws itself to each phase as it arrives:
 * the node lands with a pulse and the phase rises beneath it. The current
 * phase (the first one not shipped) is the one that matters: its stretch of
 * line and its node are in the accent and it sits raised on a card; the
 * phases after it stand on the ground. On the last phase the line carries on
 * past it and fades out, because there is more after.
 */
export function Roadmap({ title, phases, step }: RoadmapProps) {
  const root = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = Math.max(1, phases.length);
  const cardW = (CONTENT_W - GAP * (n - 1)) / n;
  const nodeX = phases.map((_, i) => SAFE.x + i * (cardW + GAP) + cardW / 2);
  const end = 1920 - SAFE.x + 20;

  // The current phase: one in progress, else the first that is not shipped.
  const nowIndex = (() => {
    const inProgress = phases.findIndex((p) => p.status === "now");
    if (inProgress >= 0) return inProgress;
    const pending = phases.findIndex((p) => p.status !== "done");
    return pending >= 0 ? pending : 0;
  })();
  const color = (i: number) => (i <= nowIndex ? ACCENT : LINE_QUIET);

  // Segment i runs into node i; the last one runs on past the final node.
  const segments = [
    ...nodeX.map((x, i) => ({
      x0: i === 0 ? SAFE.x : (nodeX[i - 1] ?? SAFE.x),
      x1: x,
    })),
    { x0: nodeX[nodeX.length - 1] ?? SAFE.x, x1: end },
  ];
  const nowX = nodeX[nowIndex] ?? SAFE.x;
  const span = end - SAFE.x;

  const firstStep = useRef(step).current;
  useEntrance(root, (tl) => {
    if (firstStep > 0) {
      tl.from(".rm-all", { opacity: 0, duration: 0.7, ease: "power1.out" });
      return;
    }
    tl.from(".rm-head-in > *", {
      y: 36,
      opacity: 0,
      duration: 0.9,
      ease: "deck.enter",
      stagger: 0.08,
    });
    tl.from(
      ".rm-today",
      { opacity: 0, x: -20, duration: 0.6, ease: "deck.enter" },
      0.3,
    );
    tl.from(
      ".rm-seg-0",
      { drawSVG: "0% 0%", duration: 0.8, ease: "power3.out" },
      0.45,
    );
    arrive(tl, 0, 1.05);
  });

  function arrive(tl: gsap.core.Timeline, i: number, at: number | string) {
    tl.fromTo(
      `.rm-node-${i}`,
      { scale: 0, transformOrigin: "50% 50%" },
      {
        scale: 1,
        duration: 0.55,
        ease: "back.out(2.6)",
        immediateRender: true,
      },
      at,
    );
    tl.set(
      `.rm-halo-${i}`,
      { scale: 0.4, opacity: 0.9, transformOrigin: "50% 50%" },
      at,
    );
    tl.to(
      `.rm-halo-${i}`,
      { scale: 2.6, opacity: 0, duration: 1.1, ease: "power2.out" },
      at,
    );
    tl.fromTo(
      `.rm-label-${i}`,
      { y: 16, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.6,
        ease: "deck.enter",
        immediateRender: true,
      },
      typeof at === "number" ? at + 0.08 : `${at}+=0.08`,
    );
    tl.fromTo(
      `.rm-card-${i}`,
      { y: 70, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.95,
        ease: "deck.enter",
        immediateRender: true,
      },
      typeof at === "number" ? at + 0.12 : `${at}+=0.12`,
    );
  }

  useSteps(
    root,
    step,
    (tl, mark) => {
      for (let i = 1; i < phases.length; i++) {
        const at = `p${i}`;
        tl.addLabel(at);
        tl.fromTo(
          `.rm-seg-${i}`,
          { drawSVG: "0% 0%" },
          {
            drawSVG: "0% 100%",
            duration: 0.75,
            ease: "power3.out",
            immediateRender: true,
          },
          at,
        );
        arrive(tl, i, `${at}+=0.5`);
        if (i === phases.length - 1) {
          tl.fromTo(
            `.rm-seg-${phases.length}`,
            { drawSVG: "0% 0%" },
            {
              drawSVG: "0% 100%",
              duration: 0.9,
              ease: "power2.out",
              immediateRender: true,
            },
            `${at}+=0.95`,
          );
        }
        mark();
      }
    },
    [phases.length],
  );

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <div className="rm-all absolute inset-0">
        <header
          className="absolute"
          style={{ left: SAFE.x, top: SAFE.top, right: SAFE.x }}
        >
          <div className="rm-head-in flex flex-col">
            <h1 className="t-title text-fg text-balance">{title}</h1>
          </div>
        </header>

        <svg
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={1920}
          height={1080}
          viewBox="0 0 1920 1080"
          fill="none"
          aria-hidden
        >
          <defs>
            <linearGradient
              id={`${uid}-line`}
              x1={SAFE.x}
              y1="0"
              x2={end}
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor={ACCENT} />
              <stop offset={(nowX - SAFE.x) / span} stopColor={ACCENT} />
              <stop
                offset={Math.min(1, (nowX + 60 - SAFE.x) / span)}
                stopColor={LINE_QUIET}
              />
              <stop
                offset={((nodeX[nodeX.length - 1] ?? nowX) - SAFE.x) / span}
                stopColor={LINE_QUIET}
              />
              <stop offset="1" stopColor={LINE_QUIET} stopOpacity="0" />
            </linearGradient>
          </defs>

          <line
            x1={SAFE.x}
            y1={LINE_Y}
            x2={end}
            y2={LINE_Y}
            stroke="var(--line-strong)"
            strokeWidth="2"
            strokeDasharray="2 12"
            strokeLinecap="round"
          />
          {segments.map((s, i) => (
            <path
              key={i}
              className={`rm-seg-${i}`}
              d={`M${s.x0} ${LINE_Y}H${s.x1}`}
              stroke={`url(#${uid}-line)`}
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}

          <g className="rm-today">
            <circle cx={SAFE.x} cy={LINE_Y} r="7" fill={INK.fg} />
          </g>

          {nodeX.map((x, i) => {
            const now = i === nowIndex;
            const later = phases[i]?.status === "later";
            return (
              <g key={i}>
                <circle
                  className={`rm-halo-${i}`}
                  cx={x}
                  cy={LINE_Y}
                  r="16"
                  stroke={color(i)}
                  strokeWidth="2"
                  style={{ opacity: 0 }}
                />
                <g className={`rm-node-${i}`}>
                  <circle
                    cx={x}
                    cy={LINE_Y}
                    r={now ? 16 : 13}
                    fill={now ? ACCENT : INK.ground}
                    stroke={color(i)}
                    strokeWidth={now ? 0 : 3}
                  />
                  <circle
                    cx={x}
                    cy={LINE_Y}
                    r={now ? 6 : later ? 0 : 5}
                    fill={now ? "#ffffff" : LINE_QUIET}
                  />
                </g>
              </g>
            );
          })}
        </svg>

        <span
          className="rm-today text-muted absolute text-[24px] font-medium"
          style={{ left: SAFE.x, top: LINE_Y - 60 }}
        >
          Today
        </span>

        {phases.map((p, i) => (
          <span
            key={i}
            className={`rm-label-${i} absolute flex w-[400px] justify-center text-[26px] font-semibold ${i === nowIndex ? "text-accent" : "text-muted"}`}
            style={{ left: (nodeX[i] ?? 0) - 200, top: LINE_Y - 64 }}
          >
            {p.label}
          </span>
        ))}

        {phases.map((p, i) => (
          <div
            key={i}
            className={`rm-card-${i} absolute`}
            style={{
              left: SAFE.x + i * (cardW + GAP),
              top: CARD_TOP,
              width: cardW,
              height: CARD_H,
            }}
          >
            <PhaseCard
              phase={p}
              current={i === nowIndex}
              repeatStatus={i > 0 && phases[i - 1]?.status === p.status}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One phase: its state, its name, what it holds. The current phase is raised
 * on a card; the others are plain columns under a hairline, so elevation marks
 * only the phase that matters. A status that repeats the previous phase's
 * keeps its space (so titles line up) but is not drawn twice.
 */
function PhaseCard({
  phase,
  current,
  repeatStatus,
}: {
  phase: RoadmapPhase;
  current: boolean;
  repeatStatus: boolean;
}) {
  const status = STATUS[phase.status];
  const body = (
    <div
      className={`flex h-full flex-col pt-9 pb-10 ${current ? "px-10" : ""}`}
    >
      <Chip
        icon={status.icon}
        size={22}
        className={`self-start ${repeatStatus ? "invisible" : ""}`}
      >
        {status.text}
      </Chip>
      <h2 className="font-display text-fg mt-6 text-[44px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance">
        {phase.title}
      </h2>
      <ul className="mt-6 flex flex-col">
        {phase.items.map((item, j) => (
          <li
            key={j}
            className={`text-body py-3 text-[26px] leading-[1.35] text-balance ${j > 0 ? "[box-shadow:inset_0_1px_0_var(--line)]" : ""}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
  if (current) return <Card className="h-full">{body}</Card>;
  return (
    <div className="h-full [box-shadow:inset_0_2px_0_var(--line-strong)]">
      {body}
    </div>
  );
}
