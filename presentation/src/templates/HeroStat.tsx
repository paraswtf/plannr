"use client";

import { useRef, type ReactNode } from "react";

import { Projected, projectedCount } from "~/content/research";
import { useSteps } from "~/deck/useSteps";
import { SlideBody, SlideHeader } from "~/ui/layout";

import { countUp, useArrival } from "./_research-motion";

export interface HeroStatProps {
  title: ReactNode;
  /** The number, as shown: "91%". */
  value: ReactNode;
  /** What it means, in a sentence. */
  sentence: ReactNode;
  /**
   * The answers behind it, on a scale (1 to 5, say): each step's label and
   * how many gave it (as collected; shown projected).
   */
  scale?: { label: string; count: number }[];
  /** Labels of the scale steps that make up the number, lit in the accent. */
  highlight?: string[];
  /** Where it comes from. */
  source: ReactNode;
  /** 0: the number counts up with its sentence. 1: the answers behind it. Steps = 2 (1 without a scale). */
  step: number;
  /** False while the slide is leaving or previewed: the count waits for it. */
  active?: boolean;
}

/** The chart of the scale, in canvas px. */
const CHART = { w: 720, plot: 380, col: 96 } as const;
const ACCENT = "#c8305f";
const REST = "#7c8596";

/**
 * One number that carries a section, said once and large: it counts up in
 * the accent with the sentence that says what it means. On the build, the
 * answers behind it stand up beside it as a column chart of the scale, the
 * steps that make up the number in the accent, so the room sees where the
 * number comes from. Each column's count rides up on its cap as it grows.
 */
export function HeroStat({
  title,
  value,
  sentence,
  scale,
  highlight = [],
  source,
  step,
  active = true,
}: HeroStatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const columns = scale ?? [];
  const lit = new Set(highlight);
  const top = Math.max(1, ...columns.map((c) => projectedCount(c.count)));

  useArrival(ref, { active, step }, (tl) => {
    const root = ref.current;
    if (!root) return;
    const num = root.querySelector(".hs-num");
    tl.from(num, { y: 80, opacity: 0, duration: 1, ease: "deck.enter" }, 0.2);
    const restore =
      num && countUp(tl, num, { duration: 1.6, ease: "power3.out" }, 0.2);
    tl.from(
      root.querySelector(".hs-sentence"),
      { y: 28, opacity: 0, duration: 0.8, ease: "deck.enter" },
      0.55,
    );
    tl.from(
      root.querySelector(".hs-source"),
      { opacity: 0, duration: 0.6, ease: "power2.out" },
      0.9,
    );
    return () => restore?.();
  });

  useSteps(ref, step, (tl, mark) => {
    const root = ref.current;
    if (!root || columns.length === 0) return;
    tl.from(
      root.querySelector(".hs-base"),
      {
        scaleX: 0,
        transformOrigin: "0% 50%",
        duration: 0.7,
        ease: "deck.enter",
      },
      0,
    );
    tl.from(
      root.querySelectorAll(".hs-label"),
      { y: 14, opacity: 0, duration: 0.5, ease: "deck.enter", stagger: 0.06 },
      0.1,
    );
    root.querySelectorAll<HTMLElement>(".hs-col").forEach((col, i) => {
      const at = 0.25 + i * 0.09;
      const bar = col.querySelector<HTMLElement>(".hs-bar");
      const h = bar?.offsetHeight ?? 0;
      tl.from(
        bar,
        {
          scaleY: 0,
          transformOrigin: "50% 100%",
          duration: 0.9,
          ease: "deck.enter",
        },
        at,
      );
      // The count sits on the cap and travels up with it.
      tl.from(
        col.querySelector(".hs-cap"),
        { y: h, duration: 0.9, ease: "deck.enter" },
        at,
      );
      tl.from(
        col.querySelector(".hs-cap"),
        { opacity: 0, duration: 0.35, ease: "power2.out" },
        at,
      );
    });
    mark();
  });

  const hasScale = columns.length > 0;

  return (
    <SlideBody>
      <SlideHeader title={title} />
      <div ref={ref} className="relative mt-10 flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-between gap-24">
          <div className="flex max-w-[820px] flex-col">
            <p
              className="hs-num text-accent tabular"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 272,
                lineHeight: 0.9,
                letterSpacing: "-0.05em",
              }}
            >
              {value}
            </p>
            <p className="hs-sentence t-lede text-body mt-8 max-w-[30ch] text-pretty">
              {sentence}
            </p>
          </div>

          {hasScale && (
            <div className="relative shrink-0" style={{ width: CHART.w }}>
              <div
                className="relative flex items-end justify-between"
                style={{ height: CHART.plot + 56 }}
                aria-hidden
              >
                {columns.map((c) => {
                  const n = projectedCount(c.count);
                  const on = lit.has(c.label);
                  // A zero still gets a sliver on the baseline, so the
                  // column reads as "nobody", not as missing.
                  const h = Math.max(4, Math.round((n / top) * CHART.plot));
                  return (
                    <div
                      key={c.label}
                      className="hs-col relative flex flex-col items-center justify-end"
                      style={{ width: CHART.col, height: "100%" }}
                      title={`${c.label}: ${n}`}
                    >
                      <span
                        className={`hs-cap tabular mb-3 text-[30px] leading-none font-semibold ${on ? "text-accent" : "text-fg"}`}
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        <Projected n={c.count} />
                      </span>
                      <span
                        className="hs-bar block w-full"
                        style={{
                          height: h,
                          background: on ? ACCENT : REST,
                          borderRadius: "4px 4px 0 0",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="hs-base bg-line-strong h-px w-full" />
              <div className="mt-4 flex justify-between" aria-hidden>
                {columns.map((c) => (
                  <span
                    key={c.label}
                    className={`hs-label tabular text-center text-[26px] leading-none font-medium ${lit.has(c.label) ? "text-accent" : "text-muted"}`}
                    style={{ width: CHART.col }}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
              <table className="sr-only">
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.label}>
                      <th scope="row">{c.label}</th>
                      <td>{projectedCount(c.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="hs-source text-muted mt-6 text-[22px] leading-[1.4]">
          {source}
        </p>
      </div>
    </SlideBody>
  );
}
