"use client";

import { useId, useRef, type ReactNode } from "react";

import type { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";
import { Eyebrow, Glow, SAFE } from "~/ui/layout";

import { useEntrance } from "./_closing-motion";

export interface RoadmapPhase {
  /** "Now", "Next", "Later" — or a term: "Sem VIII". */
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

/** Phase colours, left to right along the brand gradient. */
const PHASE_COLORS = ["#c45fd6", "#ef4f6a", "#f6a73b", "#f2743c"];

/* Canvas geometry. */
const CONTENT_W = 1920 - SAFE.x * 2;
const LINE_Y = 388;
const CARD_TOP = 456;
const CARD_H = 456;
const GAP = 40;

/**
 * Where Plannr goes from here, phase by phase.
 *
 * A line runs out from "Today" and draws itself to each phase as it arrives:
 * the node lands with a pulse and the phase's card rises beneath it. On the
 * last phase the line carries on past it and fades out — there is more after.
 */
export function Roadmap({ eyebrow, title, phases, step }: RoadmapProps) {
  const root = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = Math.max(1, phases.length);
  const cardW = (CONTENT_W - GAP * (n - 1)) / n;
  const nodeX = phases.map((_, i) => SAFE.x + i * (cardW + GAP) + cardW / 2);
  const end = 1920 - SAFE.x + 20;
  const color = (i: number) =>
    PHASE_COLORS[i % PHASE_COLORS.length] ?? "#e8455e";

  // Segment i runs into node i; the last one runs on past the final node.
  const segments = [
    ...nodeX.map((x, i) => ({
      x0: i === 0 ? SAFE.x : (nodeX[i - 1] ?? SAFE.x),
      x1: x,
    })),
    { x0: nodeX[nodeX.length - 1] ?? SAFE.x, x1: end },
  ];

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
      { drawSVG: "0% 0%", duration: 0.8, ease: "power2.inOut" },
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
            ease: "power2.inOut",
            immediateRender: true,
          },
          at,
        );
        arrive(tl, i, `${at}+=0.6`);
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
            `${at}+=1.05`,
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
        <Glow x="50%" y="70%" size={1700} color="rgba(201, 48, 108, 0.12)" />

        <header
          className="absolute"
          style={{ left: SAFE.x, top: SAFE.top, right: SAFE.x }}
        >
          <div className="rm-head-in flex flex-col">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h1 className="t-title mt-6 text-balance">{title}</h1>
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
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
              {nodeX.map((x, i) => (
                <stop
                  key={i}
                  offset={(x - SAFE.x) / (end - SAFE.x)}
                  stopColor={color(i)}
                />
              ))}
              <stop
                offset="1"
                stopColor={color(nodeX.length - 1)}
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          <line
            x1={SAFE.x}
            y1={LINE_Y}
            x2={end}
            y2={LINE_Y}
            stroke="var(--line)"
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
              strokeWidth="4"
              strokeLinecap="round"
            />
          ))}

          <g className="rm-today">
            <circle
              cx={SAFE.x}
              cy={LINE_Y}
              r="8"
              fill="var(--bg)"
              stroke="#ffffff"
              strokeWidth="3"
            />
          </g>

          {nodeX.map((x, i) => (
            <g key={i}>
              <circle
                className={`rm-halo-${i}`}
                cx={x}
                cy={LINE_Y}
                r="18"
                stroke={color(i)}
                strokeWidth="2"
                style={{ opacity: 0 }}
              />
              <g className={`rm-node-${i}`}>
                <circle
                  cx={x}
                  cy={LINE_Y}
                  r="18"
                  fill="var(--bg)"
                  stroke={color(i)}
                  strokeWidth="4"
                />
                <circle
                  cx={x}
                  cy={LINE_Y}
                  r={phases[i]?.status === "later" ? 0 : 8}
                  fill={color(i)}
                />
              </g>
            </g>
          ))}
        </svg>

        <span
          className="rm-today t-eyebrow text-muted absolute"
          style={{ left: SAFE.x, top: LINE_Y - 56 }}
        >
          Today
        </span>

        {phases.map((p, i) => (
          <span
            key={i}
            className={`rm-label-${i} t-eyebrow absolute flex w-[400px] justify-center`}
            style={{
              left: (nodeX[i] ?? 0) - 200,
              top: LINE_Y - 60,
              color: color(i),
            }}
          >
            <span className="opacity-60">{String(i + 1).padStart(2, "0")}</span>
            <span className="mx-3 opacity-40">·</span>
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
            <PhaseCard phase={p} color={color(i)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PhaseCard({ phase, color }: { phase: RoadmapPhase; color: string }) {
  const status = STATUS[phase.status];
  return (
    <div
      className="bg-card relative flex h-full flex-col overflow-hidden rounded-[28px] px-10 pt-9 pb-10"
      style={{
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 24%, var(--line))`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[200px]"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${color} 12%, transparent), transparent)`,
        }}
      />
      <span
        aria-hidden
        className="absolute top-0 left-1/2 h-[4px] w-[72px] -translate-x-1/2 rounded-b-full"
        style={{ background: color }}
      />
      <span
        className="t-mono relative inline-flex items-center gap-2 self-start rounded-full py-[7px] pr-4 pl-3 text-[20px] font-medium"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)`,
        }}
      >
        <Icon name={status.icon} size={22} stroke={2} />
        {status.text}
      </span>
      <h2 className="font-display relative mt-6 text-[44px] leading-[1.08] font-bold tracking-[-0.03em] text-balance">
        {phase.title}
      </h2>
      <ul className="relative mt-7 flex flex-col gap-4">
        {phase.items.map((item, j) => (
          <li
            key={j}
            className="text-muted flex gap-4 text-[26px] leading-[1.35]"
          >
            <span
              className="mt-[13px] h-[9px] w-[9px] shrink-0 rounded-full"
              style={{ background: color }}
            />
            <span className="text-pretty">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
