"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

import type { FlowNode } from "~/content/types";
import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";
import { SlideBody, SlideHeader } from "~/ui/layout";
import { Card } from "~/ui/surfaces";

export interface FlowDiagramProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  nodes: FlowNode[];
  /** Where it ends up: "and 3 of 60 students never saw the mail". */
  outcome?: ReactNode;
  /** The glyph beside the outcome. Default "alert". */
  outcomeIcon?: IconName;
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

/** The hand-off lines: quiet slate, so the travelling token is what leads. */
const ARC = "var(--fg-faint)";

/**
 * How a job gets done today, hop by hop: who passes what to whom, and how
 * long each hand-off waits. Used for every "how it works today" slide.
 *
 * Each build draws the next hand-off as an arc from one card to the next, and
 * sends a token along it (an envelope, really travelling) into the next card
 * as it rises in. The lines are quiet slate and the token is the accent, so
 * the eye follows the change. A wait ("hours to a day") sits over the arc's
 * crest: quiet grey, or in the warn tone when the step it leads into is
 * friction (or worse); a step where it breaks is the accent card. The
 * outcome lands last, large, in the accent.
 */
export function FlowDiagram({
  title,
  lede,
  nodes,
  outcome,
  outcomeIcon = "alert",
  accent,
  step,
}: FlowDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const token = accent ?? "var(--accent)";
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
      d: `M${sx},${y - 8} C${sx},${y - LIFT} ${ex},${y - LIFT} ${ex},${y - 8}`,
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
        { drawSVG: "100%", duration: HOP, ease: "deck.morph" },
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
          ease: "deck.morph",
        },
        at,
      );
      if (pill) {
        tl.from(
          pill,
          {
            opacity: 0,
            y: 14,
            scale: 0.8,
            duration: 0.6,
            ease: "back.out(1.8)",
          },
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
        {
          scale: 0.4,
          opacity: 0,
          rotate: -12,
          duration: 0.7,
          ease: "back.out(1.8)",
        },
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
      <SlideHeader title={title} lede={lede} titleClassName="max-w-none!" />
      <div
        ref={ref}
        className="flex min-h-0 flex-1 flex-col justify-center pt-4"
      >
        <div className="relative" style={{ width: WIDTH, paddingTop: ARC_H }}>
          <div className="flex items-stretch" style={{ gap: GAP }}>
            {nodes.map((node, i) => (
              <NodeCard key={node.id} node={node} index={i} width={cardW} />
            ))}
          </div>

          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width={WIDTH}
            height={ARC_H}
            viewBox={`0 0 ${WIDTH} ${ARC_H}`}
          >
            {arcs.map((arc) => (
              <g key={arc.i} data-arc={arc.i}>
                <path
                  className="fd-path"
                  d={arc.d}
                  fill="none"
                  stroke={ARC}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  style={{ opacity: 0 }}
                />
                <path
                  className="fd-head"
                  d={arc.head}
                  fill="none"
                  stroke={ARC}
                  strokeWidth={2.5}
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
              className="absolute top-0 left-0 flex h-14 w-14 items-center justify-center rounded-[16px]"
              style={{
                opacity: 0,
                color: "#ffffff",
                background: token,
                boxShadow: "var(--shadow-2)",
              }}
            >
              <Icon name="mail" size={28} />
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
                    className={`flex items-center gap-2.5 rounded-[12px] px-4 py-2.5 text-[23px] leading-none font-medium whitespace-nowrap ${
                      (arc.node.tone ?? "neutral") === "neutral"
                        ? "bg-sunken text-muted"
                        : "text-warn"
                    }`}
                    style={
                      (arc.node.tone ?? "neutral") === "neutral"
                        ? undefined
                        : {
                            background:
                              "color-mix(in srgb, var(--warn) 10%, var(--bg))",
                          }
                    }
                  >
                    <Icon name={arc.node.waitIcon ?? "clock"} size={24} />
                    {arc.node.wait}
                  </span>
                </span>
              ),
          )}
        </div>

        {outcome && (
          <div className="mt-20 flex items-center gap-8">
            <span className="fd-outcome-icon bg-accent-soft text-accent flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px]">
              <Icon name={outcomeIcon} size={40} />
            </span>
            <p className="fd-outcome-text t-h2 text-accent max-w-[1440px] text-balance">
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
}: {
  node: FlowNode;
  index: number;
  width: number;
}) {
  const tone = node.tone ?? "neutral";
  const tile: CSSProperties =
    tone === "bad"
      ? { color: "var(--accent)", background: "var(--accent-soft)" }
      : tone === "warn"
        ? {
            color: "var(--warn)",
            background: "color-mix(in srgb, var(--warn) 11%, transparent)",
          }
        : { color: "var(--fg-body)", background: "var(--bg-sunken)" };
  const actor =
    tone === "bad"
      ? "text-accent"
      : tone === "warn"
        ? "text-warn"
        : "text-muted";
  return (
    <div data-node={index} className="flex shrink-0" style={{ width }}>
      <Card accent={tone === "bad"} className="flex w-full flex-col p-8">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-[12px]"
          style={tile}
        >
          <Icon name={node.icon} size={32} />
        </span>
        <span className={`t-small mt-8 font-medium ${actor}`}>
          {node.actor}
        </span>
        <span className="font-display text-fg mt-2 text-[31px] leading-[1.2] font-semibold tracking-[-0.018em] text-pretty">
          {node.action}
        </span>
      </Card>
    </div>
  );
}
