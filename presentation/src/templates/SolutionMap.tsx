"use client";

import { useRef, type ReactNode } from "react";

import type { Feature, Problem } from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { SlideBody, SlideHeader } from "~/ui/layout";

import { PROBLEM_CARD } from "./_problem-tone";

export interface SolutionMapProps {
  stakeholder: StakeholderId;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** The top problems from the ranking, in rank order. */
  problems: Problem[];
  /** The features that answer them; a line is drawn for each id in `solves`. */
  features: Feature[];
  /** 0: the problems. 1: the features, with lines drawn to what they solve. Steps = 2. */
  step: number;
}

const RANK_W = 60;
const RANK_GAP = 18;
const PROBLEM_W = 660;
const FEATURE_W = 600;

interface Link {
  key: string;
  problem: string;
  feature: string;
  featureIndex: number;
}

/** Where `el` sits inside `container`, from layout alone (transforms ignored). */
function boxIn(el: HTMLElement, container: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/**
 * Problem on the left, feature on the right, a line between.
 *
 * Problems carry `${stakeholder}-problem-${id}` (from the ranking), features
 * carry `${stakeholder}-feature-${id}` on their name (into each
 * FeatureShowcase title). The lines are measured from the laid-out cells, so
 * they start and end exactly on the cell edges whatever the text wraps to.
 */
export function SolutionMap({
  stakeholder,
  eyebrow,
  title,
  problems,
  features,
  step,
}: SolutionMapProps) {
  const root = useRef<HTMLDivElement>(null);
  const links: Link[] = features.flatMap((f, fi) =>
    problems
      .filter((p) => f.solves.includes(p.id))
      .map((p) => ({
        key: `${p.id}->${f.id}`,
        problem: p.id,
        feature: f.id,
        featureIndex: fi,
      })),
  );

  useSteps(root, step, (tl, mark) => {
    const scope = root.current;
    if (!scope) return;
    const find = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const findSvg = (sel: string) => scope.querySelector<SVGElement>(sel);

    // Place each feature beside the problems it answers: at the mean height
    // of their centres, kept a minimum gap apart and inside the column, so
    // the lines run as flat as they can and cross as little as possible.
    const colH = scope.offsetHeight;
    const placed = features
      .map((f, fi) => {
        const row = find(`[data-sm-rise="${f.id}"]`);
        const centres = problems
          .filter((p) => f.solves.includes(p.id))
          .map((p) => find(`[data-sm-problem="${p.id}"]`))
          .filter((el): el is HTMLElement => el !== null)
          .map((el) => {
            const b = boxIn(el, scope);
            return b.y + b.h / 2;
          });
        const want =
          centres.length > 0
            ? centres.reduce((a, c) => a + c, 0) / centres.length
            : ((fi + 0.5) * colH) / features.length;
        return {
          row,
          h: row?.offsetHeight ?? 0,
          want,
          first: centres[0] ?? want,
        };
      })
      .sort((a, b) => a.want - b.want || a.first - b.first);
    const MIN_GAP = 48;
    const centre = placed.map((p) => p.want);
    for (let i = 1; i < placed.length; i++) {
      const prev = placed[i - 1]!;
      const min = centre[i - 1]! + (prev.h + placed[i]!.h) / 2 + MIN_GAP;
      if (centre[i]! < min) centre[i] = min;
    }
    // Keep the stack inside the column: lift it if it runs off the bottom,
    // then drop it if that lifted it off the top.
    const lastP = placed[placed.length - 1];
    const firstP = placed[0];
    if (lastP && firstP) {
      const over = centre[centre.length - 1]! + lastP.h / 2 - colH;
      if (over > 0)
        for (let i = 0; i < centre.length; i++) centre[i] = centre[i]! - over;
      const under = firstP.h / 2 - centre[0]!;
      if (under > 0)
        for (let i = 0; i < centre.length; i++) centre[i] = centre[i]! + under;
    }
    placed.forEach((p, i) => {
      if (p.row) p.row.style.top = `${Math.round(centre[i]! - p.h / 2)}px`;
    });

    // Lay the lines on the real cells: right edge of the problem, left edge
    // of the feature's badge, both at their vertical middle.
    for (const link of links) {
      const from = find(`[data-sm-problem="${link.problem}"]`);
      const to = find(`[data-sm-feature="${link.feature}"]`);
      const path = findSvg(`[data-sm-line="${link.key}"]`);
      const dot = findSvg(`[data-sm-start="${link.key}"]`);
      if (!from || !to || !path || !dot) continue;
      const a = boxIn(from, scope);
      const b = boxIn(to, scope);
      const x1 = a.x + a.w;
      const y1 = a.y + a.h / 2;
      const x2 = b.x;
      const y2 = b.y + b.h / 2;
      const pull = (x2 - x1) * 0.5;
      path.setAttribute(
        "d",
        `M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`,
      );
      dot.setAttribute("cx", String(x1));
      dot.setAttribute("cy", String(y1));
    }
    features.forEach((f) => {
      const to = find(`[data-sm-feature="${f.id}"]`);
      const end = findSvg(`[data-sm-end="${f.id}"]`);
      if (!to || !end) return;
      const b = boxIn(to, scope);
      end.setAttribute("cx", String(b.x - 10));
      end.setAttribute("cy", String(b.y + b.h / 2));
    });

    // 1. For each feature in turn: its lines draw out of the problems it
    // answers, and the feature rises in as they arrive.
    features.forEach((f, fi) => {
      const at = fi * 0.34;
      const mine = links.filter((l) => l.featureIndex === fi);
      const lines = mine
        .map((l) => findSvg(`[data-sm-line="${l.key}"]`))
        .filter(Boolean);
      const starts = mine
        .map((l) => findSvg(`[data-sm-start="${l.key}"]`))
        .filter(Boolean);
      if (starts.length > 0) {
        tl.from(
          starts,
          {
            scale: 0,
            transformOrigin: "50% 50%",
            duration: 0.3,
            ease: "back.out(3)",
          },
          at,
        );
      }
      if (lines.length > 0) {
        tl.fromTo(
          lines,
          { drawSVG: "0% 0%" },
          {
            drawSVG: "0% 100%",
            duration: 0.85,
            ease: "deck.morph",
            stagger: 0.08,
          },
          at + 0.05,
        );
        tl.from(
          findSvg(`[data-sm-end="${f.id}"]`),
          {
            scale: 0,
            transformOrigin: "50% 50%",
            duration: 0.32,
            ease: "back.out(3)",
          },
          at + 0.72,
        );
      }
      tl.from(
        find(`[data-sm-rise="${f.id}"]`),
        { autoAlpha: 0, y: 44, duration: 0.7, ease: "deck.enter" },
        at + (lines.length > 0 ? 0.62 : 0.2),
      );
    });
    mark();
  });

  return (
    <SlideBody>
      <SlideHeader eyebrow={eyebrow} title={title} />
      <div className="mt-8 flex min-h-0 flex-1 items-center">
        <div
          ref={root}
          className="relative flex w-full items-stretch justify-between"
        >
          {/* The connectors: the one thing on this slide in the accent. */}
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            fill="none"
          >
            {links.map((l) => (
              <path
                key={l.key}
                data-sm-line={l.key}
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            ))}
            {links.map((l) => (
              <circle
                key={l.key}
                data-sm-start={l.key}
                r={6}
                fill="var(--accent)"
              />
            ))}
            {features.map((f) => (
              <circle
                key={f.id}
                data-sm-end={f.id}
                r={6.5}
                fill="var(--bg)"
                stroke="var(--accent)"
                strokeWidth={2.5}
                style={{
                  display: links.some((l) => l.feature === f.id)
                    ? undefined
                    : "none",
                }}
              />
            ))}
          </svg>

          <div className="flex flex-col gap-6">
            {problems.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center"
                style={{ gap: RANK_GAP }}
              >
                <span
                  data-flip-id={`${stakeholder}-rank-${i}`}
                  className="font-display tabular text-faint inline-flex shrink-0 items-center justify-center text-[40px] font-semibold tracking-[-0.03em]"
                  style={{ width: RANK_W }}
                >
                  {i + 1}
                </span>
                <div
                  data-sm-problem={p.id}
                  data-flip-id={`${stakeholder}-problem-${p.id}`}
                  className={`${PROBLEM_CARD} text-fg flex min-h-[92px] items-center`}
                  style={{
                    width: PROBLEM_W,
                    padding: "16px 28px",
                    borderRadius: 22,
                  }}
                >
                  <span className="text-[28px] leading-[1.18] font-medium tracking-[-0.005em]">
                    {p.text}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="relative" style={{ width: FEATURE_W }}>
            {features.map((f, fi) => (
              <div
                key={f.id}
                data-sm-rise={f.id}
                data-no-enter
                className="absolute left-0 flex w-full items-center gap-6"
                style={{ top: fi * 160 }}
              >
                <span
                  data-sm-feature={f.id}
                  className={`${PROBLEM_CARD} text-body flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-[22px]`}
                >
                  <Icon name={f.icon} size={38} stroke={1.5} />
                </span>
                <span
                  data-flip-id={`${stakeholder}-feature-${f.id}`}
                  className="font-display text-fg inline-block text-[40px] leading-[1.12] font-semibold tracking-[-0.025em] text-balance"
                >
                  {f.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideBody>
  );
}
