"use client";

import { useRef, type ReactNode } from "react";

import type { Research } from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { Bezel } from "~/ui/frames";
import { SlideBody, SlideHeader } from "~/ui/layout";
import { Chip } from "~/ui/surfaces";

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
const MAX_SHRINK = 0.7;

/**
 * Who we spoke to, how, and three things they said.
 *
 * On arrival the numbers count up in ink, each over a hairline that draws
 * across (a number in a <Ph> counts too; anything that is not a number just
 * rises in), and the methods follow as chips, all centred in the space. On
 * the build the block travels up out of the way and the quotes rise in
 * beneath it: the first one leads, large, in a bezel; the other two stand
 * beside it as quieter lines.
 */
export function InterviewSummary({
  title,
  research,
  step,
  active = true,
}: InterviewSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [lead, ...rest] = research.quotes;

  useArrival(ref, { active, step }, (tl) => {
    const root = ref.current;
    if (!root) return;
    const restores: (() => void)[] = [];
    root.querySelectorAll(".is-stat").forEach((stat, i) => {
      const at = 0.3 + i * 0.14;
      tl.from(
        stat.querySelector(".is-rule"),
        {
          scaleX: 0,
          duration: 1.1,
          ease: "deck.enter",
          transformOrigin: "0% 50%",
        },
        at - 0.1,
      );
      const num = stat.querySelector(".is-num");
      tl.from(
        num,
        { y: 48, opacity: 0, duration: 0.85, ease: "deck.enter" },
        at,
      );
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
        duration: 0.6,
        ease: "deck.enter",
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
        duration: 1,
        ease: "deck.morph",
        transformOrigin: "0% 0%",
      },
      0,
    );
    tl.from(
      quotes.querySelector(".is-lead"),
      { y: 160, opacity: 0, duration: 1, ease: "deck.enter" },
      0.5,
    );
    tl.from(
      quotes.querySelectorAll(".is-quote"),
      { y: 120, opacity: 0, duration: 0.95, ease: "deck.enter", stagger: 0.12 },
      0.66,
    );
    tl.from(
      quotes.querySelector(".is-mark"),
      {
        y: 24,
        scale: 0.5,
        opacity: 0,
        duration: 0.75,
        ease: "back.out(1.8)",
        transformOrigin: "0% 100%",
      },
      0.8,
    );
    mark();
  });

  return (
    <SlideBody>
      <SlideHeader title={title} titleClassName="max-w-none!" />
      <div ref={ref} className="relative mt-14 min-h-0 flex-1">
        <div
          className="is-block absolute inset-x-0 top-0"
          style={{ transformOrigin: "0% 0%" }}
        >
          <div className="flex gap-20">
            {research.stats.map((s, i) => (
              <div key={i} className="is-stat flex w-[360px] flex-col">
                <span className="is-rule bg-line-strong block h-px w-full" />
                <span
                  className="is-num font-display text-fg mt-7 inline-block self-start font-semibold tabular-nums"
                  style={{
                    fontSize: 156,
                    lineHeight: 0.9,
                    letterSpacing: "-0.05em",
                  }}
                >
                  {s.value}
                </span>
                <span className="is-label t-body text-muted mt-5 inline-block">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-14 flex flex-wrap gap-3">
            {research.methods.map((m, i) => (
              <Chip key={i} size={28} className="is-chip">
                {m}
              </Chip>
            ))}
          </div>
        </div>

        <div className="is-quotes absolute inset-x-0 bottom-0 flex items-stretch gap-16">
          {lead && (
            <Bezel className="is-lead w-[920px] shrink-0">
              <figure className="flex h-full flex-col px-12 pt-11 pb-10">
                <QuoteMark />
                <blockquote className="font-display text-fg mt-7 text-[40px] leading-[1.24] font-medium tracking-[-0.02em] text-pretty">
                  {lead.text}
                </blockquote>
                <figcaption className="t-small text-muted mt-auto pt-8">
                  {lead.who}
                </figcaption>
              </figure>
            </Bezel>
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-end gap-10 pb-2">
            {rest.map((q, i) => (
              <figure
                key={i}
                className="is-quote border-line-strong flex flex-col border-t pt-7"
              >
                <blockquote className="text-body text-[28px] leading-[1.38] text-pretty">
                  <span className="text-faint">&ldquo;</span>
                  {q.text}
                  <span className="text-faint">&rdquo;</span>
                </blockquote>
                <figcaption className="t-small text-muted mt-4">
                  {q.who}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </SlideBody>
  );
}

/** A heavy opening quote mark, drawn so it reads as one in any font. */
function QuoteMark() {
  return (
    <svg
      aria-hidden
      className="is-mark text-accent block"
      width={52}
      height={41}
      viewBox="0 0 32 25"
      fill="currentColor"
    >
      <path d="M0 25V15.2C0 7.6 4.1 2.4 11.9 0l1.5 3.6C9.1 5.3 7 8 6.8 11.6h6.1V25H0Z" />
      <path d="M18.6 25V15.2C18.6 7.6 22.7 2.4 30.5 0L32 3.6c-4.3 1.7-6.4 4.4-6.6 8h6.1V25H18.6Z" />
    </svg>
  );
}
