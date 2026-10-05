"use client";

import { useRef, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { Eyebrow, Glow, SlideBody } from "~/ui/layout";

import { riseWords, useEntrance } from "./_story-motion";

export interface QuestionsBoardProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** What we asked: about their day. */
  asked: ReactNode[];
  /** What we deliberately did not ask: about the system. */
  notAsked: ReactNode[];
  /** 0: the questions we asked. 1: the ones we didn't, struck through. Steps = 2. */
  step: number;
}

/** A warm chat bubble: the questions we did put to people. */
const WARM = {
  background:
    "linear-gradient(135deg, color-mix(in srgb, #e8455e 24%, var(--bg-card)) 0%, color-mix(in srgb, #f2743c 18%, var(--bg-card)) 100%)",
  boxShadow:
    "inset 0 0 0 1px rgba(246, 167, 59, 0.26), 0 18px 40px -24px rgba(232, 69, 94, 0.55)",
};

/** Questions are set a touch above body size: they are the slide. */
const BUBBLE_TYPE = { fontSize: 32, lineHeight: 1.36 } as const;

/** Text colour of a question we did not ask, before and after it is struck. */
const LIVE = "rgba(255, 255, 255, 0.86)";
const STRUCK = "rgba(255, 255, 255, 0.36)";

/**
 * "We asked about their day, not about our app."
 *
 * The questions we asked arrive as a conversation, one bubble after another.
 * On the build, the questions we did not ask slide in beside them, and a line
 * is drawn through each in turn (a real stroke, travelling the words, across
 * line breaks) before it fades back.
 */
export function QuestionsBoard({
  eyebrow,
  title,
  asked,
  notAsked,
  step,
}: QuestionsBoardProps) {
  const root = useRef<HTMLDivElement>(null);

  useEntrance(
    root,
    (tl) => {
      tl.from(".qb-glow", { opacity: 0, duration: 1.4, ease: "power2.out" }, 0);
      if (eyebrow) {
        tl.from(
          ".qb-eyebrow",
          { opacity: 0, y: 18, duration: 0.7, ease: "deck.enter" },
          0.1,
        );
      }
      tl.add(riseWords(root.current?.querySelector(".qb-title") ?? null), 0.16);
      tl.from(
        ".qb-asked-label",
        { opacity: 0, duration: 0.6, ease: "power2.out" },
        0.55,
      );
      tl.from(
        ".qb-bubble",
        {
          opacity: 0,
          y: 36,
          scale: 0.9,
          transformOrigin: "0% 100%",
          duration: 0.7,
          ease: "back.out(1.6)",
          stagger: 0.13,
        },
        0.6,
      );
    },
    step,
  );

  useSteps(
    root,
    step,
    (tl, mark) => {
      const asked = root.current?.querySelector<HTMLElement>(".qb-asked");
      const bubbles = Array.from(
        root.current?.querySelectorAll<HTMLElement>(".qb-bubble") ?? [],
      );
      const board = asked?.parentElement;
      if (asked && board) {
        // At rest the conversation sits centred on the stage; the build
        // moves it aside to make room for the questions we did not ask.
        const widest = Math.max(0, ...bubbles.map((b) => b.offsetWidth));
        const rest = Math.max(0, (board.offsetWidth - widest) / 2);
        tl.fromTo(
          asked,
          { x: rest },
          { x: 0, duration: 0.9, ease: "deck.morph", immediateRender: true },
          0,
        );
      }
      tl.fromTo(
        ".qb-skip-label",
        { opacity: 0, x: 40 },
        {
          opacity: 1,
          x: 0,
          duration: 0.6,
          ease: "deck.enter",
          immediateRender: true,
        },
        0.25,
      );
      tl.fromTo(
        ".qb-card",
        { opacity: 0, x: 120 },
        {
          opacity: 1,
          x: 0,
          duration: 0.85,
          ease: "power3.out",
          stagger: 0.12,
          immediateRender: true,
        },
        0.3,
      );
      const cards = Array.from(
        root.current?.querySelectorAll<HTMLElement>(".qb-card") ?? [],
      );
      cards.forEach((card, i) => {
        const at = 1.0 + i * 0.32;
        tl.fromTo(
          card.querySelector(".qb-strike"),
          { backgroundSize: "0% 4px" },
          {
            backgroundSize: "100% 4px",
            duration: 0.55,
            ease: "power2.inOut",
            immediateRender: true,
          },
          at,
        );
        tl.fromTo(
          card.querySelector(".qb-strike"),
          { color: LIVE },
          {
            color: STRUCK,
            duration: 0.5,
            ease: "power1.out",
            immediateRender: true,
          },
          at + 0.45,
        );
      });
      tl.to(
        ".qb-card",
        { backgroundColor: "rgba(255, 255, 255, 0.02)", duration: 0.6 },
        "-=0.2",
      );
      mark();
    },
    [notAsked.length],
  );

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <Glow
        className="qb-glow"
        x="26%"
        y="80%"
        size={1300}
        color="rgba(232, 69, 94, 0.17)"
      />
      <SlideBody>
        <header className="flex flex-col">
          {eyebrow && <Eyebrow className="qb-eyebrow">{eyebrow}</Eyebrow>}
          <h1 className="qb-title t-title mt-6 max-w-[22ch] text-balance">
            {title}
          </h1>
        </header>

        <div className="mt-16 flex items-start gap-24">
          <section className="qb-asked flex min-w-0 flex-1 flex-col">
            <p className="qb-asked-label t-eyebrow mb-7 flex items-center gap-3 text-[#f6a73b]">
              <span className="inline-block h-[10px] w-[10px] rounded-full bg-[#f6a73b]" />
              We asked
            </p>
            <ul className="flex flex-col items-start gap-4">
              {asked.map((q, i) => (
                <li
                  key={i}
                  className="qb-bubble text-fg max-w-full rounded-[28px] rounded-bl-[8px] px-8 py-[18px]"
                  style={{ ...WARM, ...BUBBLE_TYPE }}
                >
                  {q}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex w-[640px] shrink-0 flex-col">
            <p className="qb-skip-label t-eyebrow text-bad mb-7 flex items-center gap-3">
              <span className="bg-bad inline-block h-[10px] w-[10px] rounded-full" />
              We didn&apos;t ask
            </p>
            <ul className="flex flex-col items-start gap-4">
              {notAsked.map((q, i) => (
                <li
                  key={i}
                  className="qb-card ring-hair bg-raised max-w-full rounded-[28px] rounded-bl-[8px] px-8 py-[18px]"
                  style={BUBBLE_TYPE}
                >
                  <span
                    className="qb-strike"
                    style={{
                      color: LIVE,
                      backgroundImage:
                        "linear-gradient(var(--bad), var(--bad))",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "0 58%",
                      backgroundSize: "0% 4px",
                    }}
                  >
                    {q}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SlideBody>
    </div>
  );
}
