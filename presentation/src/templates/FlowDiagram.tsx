"use client";

import { useId, useRef, type CSSProperties, type ReactNode } from "react";

import type { FlowNode } from "~/content/types";
import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { SlideBody, SlideHeader } from "~/ui/layout";

export interface FlowDiagramProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  nodes: FlowNode[];
  /** Where it ends up: "and 3 of 60 students never saw the mail". */
  outcome?: ReactNode;
  accent?: string;
  /**
   * Node i arrives on step i (node 0 from the start); one more step shows the
   * outcome. Steps = nodes.length + (outcome ? 1 : 0).
   */
  step: number;
}

/* Geometry, in canvas pixels: the diagram spans the 1664-wide content box. */
const WIDTH = 1664;
const GAP = 112;
/** Room above the cards for the hand-off arcs and their wait labels. */
const ARC_H = 176;
/** How far in from a card's edge an arc leaves or lands. */
const INSET = 72;
const LIFT = 130;
const HOP = 1.05;

const BRAND = "#e8455e";

/**
 * How a job gets done today, hop by hop: who passes what to whom, and how
 * long each hand-off waits. Used for every "how it works today" slide.
 *
 * Each build draws the next hand-off as an arc from one card to the next, and
 * sends a token along it — an envelope, really travelling — into the next
 * card as it rises in. A wait ("hours to a day") rides on the arc's crest in
 * amber.
 * The outcome lands last, large, in red.
 */
export function FlowDiagram({
  eyebrow,
  title,
  lede,
  nodes,
  outcome,
  accent,
  step,
}: FlowDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const gradId = `flow-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const solid = accent ?? BRAND;
  const stroke = accent ?? `url(#${gradId})`;
  const n = Math.max(1, nodes.length);
  const cardW = (WIDTH - (n - 1) * GAP) / n;
  const left = (i: number) => i * (cardW + GAP);

  const arcs = nodes.slice(1).map((node, k) => {
    const i = k + 1;
    const sx = left(i - 1) + cardW - INSET;
    const ex = left(i) + INSET;
    const y = ARC_H - 2;
    return {
      i,
      node,
      sx,
      ex,
      d: `M${sx},${y} C${sx},${y - LIFT} ${ex},${y - LIFT} ${ex},${y - 8}`,
      head: `M${ex - 11},${y - 22} L${ex},${y - 9} L${ex + 11},${y - 22}`,
      // The wait label sits just above the arc's crest, clear of the token.
      label: { x: (sx + ex) / 2, y: y - LIFT * 0.75 - 38 },
    };
  });

  useSteps(ref, step, (tl, mark) => {
    const root = ref.current;
    if (!root) return;
    const one = (sel: string) => root.querySelector(sel);
    for (const arc of arcs) {
      const at = tl.duration();
      const path = one(`[data-arc="${arc.i}"] .fd-path`);
      const head = one(`[data-arc="${arc.i}"] .fd-head`);
      const token = one(`[data-token="${arc.i}"]`);
      const pill = one(`[data-wait="${arc.i}"]`);
      const card = one(`[data-node="${arc.i}"]`);
      if (!path || !token || !card) continue;
      tl.set(path, { opacity: 1 }, at);
      tl.fromTo(
        path,
        { drawSVG: "0%" },
        { drawSVG: "100%", duration: HOP, ease: "power2.inOut" },
        at,
      );
      tl.fromTo(
        token,
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" },
        at,
      );
      tl.to(
        token,
        {
          motionPath: {
            path: path as SVGPathElement,
            align: path as SVGPathElement,
            alignOrigin: [0.5, 0.5],
          },
          duration: HOP,
          ease: "power2.inOut",
        },
        at,
      );
      if (pill) {
        tl.from(
          pill,
          { opacity: 0, scale: 0.6, duration: 0.55, ease: "back.out(2.2)" },
          at + HOP * 0.42,
        );
      }
      if (head)
        tl.fromTo(
          head,
          { opacity: 0 },
          { opacity: 1, duration: 0.2, ease: "power1.out" },
          at + HOP - 0.12,
        );
      tl.from(
        card,
        { y: 48, opacity: 0, scale: 0.96, duration: 0.85, ease: "deck.enter" },
        at + HOP - 0.3,
      );
      tl.to(
        token,
        { scale: 0.2, opacity: 0, duration: 0.3, ease: "power2.in" },
        at + HOP - 0.06,
      );
      mark();
    }
    if (outcome) {
      const at = tl.duration();
      tl.from(
        one(".fd-outcome-icon"),
        { scale: 0, rotate: -25, duration: 0.7, ease: "back.out(2)" },
        at,
      );
      tl.from(
        one(".fd-outcome-text"),
        { y: 36, opacity: 0, duration: 0.85, ease: "deck.enter" },
        at + 0.08,
      );
      mark();
    }
  });

  return (
    <SlideBody>
      <SlideHeader
        eyebrow={eyebrow}
        eyebrowColor={accent}
        title={title}
        lede={lede}
        titleClassName="max-w-none!"
      />
      <div
        ref={ref}
        className="flex min-h-0 flex-1 flex-col justify-center pt-4"
      >
        <div className="relative" style={{ width: WIDTH, paddingTop: ARC_H }}>
          <div className="flex items-stretch" style={{ gap: GAP }}>
            {nodes.map((node, i) => (
              <NodeCard
                key={node.id}
                node={node}
                index={i}
                width={cardW}
                accent={solid}
              />
            ))}
          </div>

          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width={WIDTH}
            height={ARC_H}
            viewBox={`0 0 ${WIDTH} ${ARC_H}`}
          >
            <defs>
              <linearGradient
                id={gradId}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={0}
                x2={WIDTH}
                y2={0}
              >
                <stop offset="0%" stopColor="#c174d6" />
                <stop offset="35%" stopColor="#e05088" />
                <stop offset="65%" stopColor="#e8455e" />
                <stop offset="100%" stopColor="#f6a73b" />
              </linearGradient>
            </defs>
            {arcs.map((arc) => (
              <g key={arc.i} data-arc={arc.i}>
                <path
                  className="fd-path"
                  d={arc.d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={3}
                  strokeLinecap="butt"
                  style={{ opacity: 0 }}
                />
                <path
                  className="fd-head"
                  d={arc.head}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ opacity: 0 }}
                />
              </g>
            ))}
          </svg>

          {arcs.map((arc) => (
            <span
              key={arc.i}
              data-token={arc.i}
              className="absolute top-0 left-0 flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                opacity: 0,
                color: "#fff",
                background: accent ?? "var(--grad-brand)",
                boxShadow: `0 0 0 6px color-mix(in srgb, ${solid} 18%, transparent), 0 10px 30px -6px color-mix(in srgb, ${solid} 70%, transparent)`,
              }}
            >
              <Icon name="mail" size={24} stroke={2.1} />
            </span>
          ))}

          {arcs.map(
            (arc) =>
              arc.node.wait && (
                <span
                  key={arc.i}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: arc.label.x, top: arc.label.y }}
                >
                  <span
                    data-wait={arc.i}
                    className="t-mono text-warn flex items-center gap-2.5 rounded-full px-5 py-2.5 text-[22px] leading-none whitespace-nowrap"
                    style={{
                      background:
                        "color-mix(in srgb, var(--warn) 13%, var(--bg))",
                      boxShadow:
                        "inset 0 0 0 1.5px color-mix(in srgb, var(--warn) 45%, transparent)",
                    }}
                  >
                    <Icon name="clock" size={22} stroke={2} />
                    {arc.node.wait}
                  </span>
                </span>
              ),
          )}
        </div>

        {outcome && (
          <div className="mt-16 flex items-center gap-7">
            <span
              className="fd-outcome-icon flex h-19 w-19 shrink-0 items-center justify-center rounded-full"
              style={{
                color: "var(--bad)",
                background: "color-mix(in srgb, var(--bad) 15%, transparent)",
                boxShadow:
                  "inset 0 0 0 1.5px color-mix(in srgb, var(--bad) 50%, transparent)",
              }}
            >
              <Icon name="alert" size={38} stroke={2} />
            </span>
            <p className="fd-outcome-text t-h2 text-bad max-w-[1480px] text-balance">
              {outcome}
            </p>
          </div>
        )}
      </div>
    </SlideBody>
  );
}

function NodeCard({
  node,
  index,
  width,
  accent,
}: {
  node: FlowNode;
  index: number;
  width: number;
  accent: string;
}) {
  const tone = node.tone ?? "neutral";
  const c =
    tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : accent;
  const surface: CSSProperties =
    tone === "neutral"
      ? {
          background: "var(--bg-card)",
          boxShadow: "inset 0 0 0 1px var(--line)",
        }
      : {
          background: `linear-gradient(180deg, color-mix(in srgb, ${c} 14%, var(--bg-card)), color-mix(in srgb, ${c} 6%, var(--bg-card)))`,
          boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${c} 42%, transparent)`,
        };
  return (
    <div
      data-node={index}
      className="flex shrink-0 flex-col rounded-[28px] px-8 pt-8 pb-9"
      style={{ width, minHeight: 300, ...surface }}
    >
      <div className="flex items-center justify-between">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            color: c,
            background: `color-mix(in srgb, ${c} 15%, transparent)`,
            boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${c} 40%, transparent)`,
          }}
        >
          <Icon name={node.icon} size={30} stroke={1.9} />
        </span>
        <span className="t-mono text-faint text-[22px]">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <span className="t-eyebrow mt-7 text-[22px]" style={{ color: c }}>
        {node.actor}
      </span>
      <span className="font-display mt-3 text-[30px] leading-[1.22] font-semibold tracking-[-0.015em] text-pretty">
        {node.action}
      </span>
    </div>
  );
}
