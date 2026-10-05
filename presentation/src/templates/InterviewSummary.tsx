"use client";

import { useRef, type ReactNode } from "react";

import { STAKEHOLDERS } from "~/content/team";
import type { Research } from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { SlideBody, SlideHeader } from "~/ui/layout";

import { countUp, useArrival } from "./_research-motion";

export interface InterviewSummaryProps {
  stakeholder: StakeholderId;
  eyebrow?: ReactNode;
  title: ReactNode;
  research: Research;
  /** 0: the numbers and how we got them. 1: what people said. Steps = 2. */
  step: number;
  /** False while the slide is leaving or previewed: the count waits for it. */
  active?: boolean;
}

/** How much the numbers shrink to make room for the quotes. */
const MAX_SHRINK = 0.72;

/**
 * Who we spoke to, how, and three things they said.
 *
 * On arrival the numbers count up in the stakeholder's colour (a number in a
 * <Ph> counts too; anything that is not a number just rises in) and the
 * methods follow as chips, all centred in the space. On the build the block
 * travels up out of the way and the three quotes rise in beneath it.
 */
export function InterviewSummary({
  stakeholder,
  eyebrow,
  title,
  research,
  step,
  active = true,
}: InterviewSummaryProps) {
  const color = STAKEHOLDERS[stakeholder].color;
  const ref = useRef<HTMLDivElement>(null);

  useArrival(ref, { active, step }, (tl) => {
    const root = ref.current;
    if (!root) return;
    const restores: (() => void)[] = [];
    root.querySelectorAll(".is-stat").forEach((stat, i) => {
      const at = 0.3 + i * 0.14;
      tl.from(
        stat.querySelector(".is-num"),
        { y: 40, opacity: 0, duration: 0.8, ease: "deck.enter" },
        at,
      );
      const num = stat.querySelector(".is-num");
      const restore =
        num && countUp(tl, num, { duration: 1.5, ease: "power3.out" }, at);
      if (restore) restores.push(restore);
      tl.from(
        stat.querySelector(".is-label"),
        { y: 16, opacity: 0, duration: 0.7, ease: "power3.out" },
        at + 0.2,
      );
    });
    tl.from(
      root.querySelectorAll(".is-chip"),
      {
        y: 18,
        opacity: 0,
        scale: 0.94,
        duration: 0.6,
        ease: "back.out(1.6)",
        stagger: 0.08,
      },
      0.85,
    );
    return () => restores.forEach((r) => r());
  });

  useSteps(ref, step, (tl, mark) => {
    const root = ref.current;
    const block = root?.querySelector<HTMLElement>(".is-block");
    const quotes = root?.querySelector<HTMLElement>(".is-quotes");
    if (!root || !block || !quotes) return;
    const room = root.clientHeight;
    const blockH = block.offsetHeight;
    const quotesH = quotes.offsetHeight;
    // Step 0: the block sits in the middle of the space. Step 1: at the top,
    // as small as it must be for the quotes to fit below it.
    const centred = Math.max(0, (room - blockH) / 2);
    const shrink = Math.max(
      MAX_SHRINK,
      Math.min(1, (room - quotesH - 56) / blockH),
    );
    tl.fromTo(
      block,
      { y: centred, scale: 1 },
      {
        y: 0,
        scale: shrink,
        duration: 0.95,
        ease: "power3.inOut",
        transformOrigin: "0% 0%",
      },
      0,
    );
    const cards = quotes.querySelectorAll(".is-quote");
    tl.from(
      cards,
      { y: 140, opacity: 0, duration: 0.95, ease: "deck.enter", stagger: 0.12 },
      0.5,
    );
    tl.from(
      quotes.querySelectorAll(".is-mark"),
      {
        scale: 0.3,
        opacity: 0,
        duration: 0.7,
        ease: "back.out(2)",
        stagger: 0.12,
        transformOrigin: "0% 70%",
      },
      0.75,
    );
    mark();
  });

  return (
    <SlideBody>
      <SlideHeader
        eyebrow={eyebrow}
        eyebrowColor={color}
        title={title}
        titleClassName="max-w-none!"
      />
      <div ref={ref} className="relative mt-14 min-h-0 flex-1">
        <div
          className="is-block absolute inset-x-0 top-0"
          style={{ transformOrigin: "0% 0%" }}
        >
          <div className="flex gap-24">
            {research.stats.map((s, i) => (
              <div key={i} className="is-stat flex min-w-75 flex-col">
                <span
                  className="is-num t-hero inline-block self-start tabular-nums"
                  style={{ color, fontSize: 160, lineHeight: 0.9 }}
                >
                  {s.value}
                </span>
                <span className="is-label t-body text-muted mt-4 inline-block">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-14 flex flex-wrap gap-3.5">
            {research.methods.map((m, i) => (
              <span
                key={i}
                className="is-chip bg-raised ring-hair inline-flex items-center gap-3 rounded-full py-3 pr-6 pl-5 text-[24px] leading-none"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="text-fg/85">{m}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="is-quotes absolute inset-x-0 bottom-0 grid grid-cols-3 gap-7">
          {research.quotes.map((q, i) => (
            <figure
              key={i}
              className="is-quote bg-card ring-hair relative flex flex-col rounded-[28px] px-10 pt-9 pb-9"
            >
              <QuoteMark color={color} />
              <blockquote className="mt-6 text-[30px] leading-[1.36] tracking-[-0.005em] text-pretty">
                {q.text}
              </blockquote>
              <figcaption className="text-muted mt-auto flex items-center gap-3 pt-7 text-[24px] leading-tight">
                <span
                  className="h-0.5 w-6 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                {q.who}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </SlideBody>
  );
}

/** A heavy opening quote mark, drawn so it reads as one in any font. */
function QuoteMark({ color }: { color: string }) {
  return (
    <svg
      aria-hidden
      className="is-mark block"
      width={64}
      height={50}
      viewBox="0 0 32 25"
      fill={color}
    >
      <path d="M0 25V15.2C0 7.6 4.1 2.4 11.9 0l1.5 3.6C9.1 5.3 7 8 6.8 11.6h6.1V25H0Z" />
      <path d="M18.6 25V15.2C18.6 7.6 22.7 2.4 30.5 0L32 3.6c-4.3 1.7-6.4 4.4-6.6 8h6.1V25H18.6Z" />
    </svg>
  );
}
