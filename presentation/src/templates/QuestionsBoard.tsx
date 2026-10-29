"use client";

import { useRef, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { SlideBody } from "~/ui/layout";

import { riseWords, useEntrance } from "./_story-motion";

export interface QuestionsBoardProps {
  /** Accepted and not drawn: the deck puts no label above a title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** What we asked: about their day. */
  asked: ReactNode[];
  /** What we deliberately did not ask: about the system. */
  notAsked: ReactNode[];
  /** 0: the questions we asked. 1: the ones we didn't, struck through. Steps = 2. */
  step: number;
}

/** Questions are set a touch above body size: they are the slide. */
const BUBBLE_TYPE = { fontSize: 32, lineHeight: 1.36 } as const;

/** A chat bubble's shape: round, with the tail's corner at its foot. */
const BUBBLE = "max-w-full rounded-[22px] rounded-bl-[6px] px-8 py-[18px]";

/**
 * A question we did not ask, before and after it is struck: raised like the
 * ones we asked, then pressed flat into the ground. Tweened, so real colours,
 * and the shadows keep one shape so they can be tweened between.
 */
const SKIP_LIVE = {
  backgroundColor: "#fbfbfd",
  boxShadow:
    "inset 0 0 0 1px rgba(16,24,40,0.08), 0 1px 1px rgba(16,24,40,0.04), 0 2px 8px -2px rgba(16,24,40,0.06)",
};
const SKIP_STRUCK = {
  backgroundColor: "#e9ebf0",
  boxShadow:
    "inset 0 0 0 1px rgba(16,24,40,0.03), 0 1px 1px rgba(16,24,40,0), 0 2px 8px -2px rgba(16,24,40,0)",
};

/** Text colour of a question we did not ask, before and after it is struck. */
const LIVE = "#353d4a";
const STRUCK = "#8f97a6";

/**
 * "We asked about their day, not about our app."
 *
 * The questions we asked arrive as a conversation, one bubble after another.
 * On the build, the questions we did not ask slide in beside them, and a line
 * is drawn through each in turn (a real stroke, travelling the words, across
 * line breaks) before it fades back.
 */
export function QuestionsBoard({
  title,
  asked,
  notAsked,
  step,
}: QuestionsBoardProps) {
  const root = useRef<HTMLDivElement>(null);

  useEntrance(
    root,
    (tl) => {
      tl.add(riseWords(root.current?.querySelector(".qb-title") ?? null), 0.12);
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
          scale: 0.92,
          transformOrigin: "0% 100%",
          duration: 0.75,
          ease: "back.out(1.4)",
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
          { backgroundSize: "0% 3px" },
          {
            backgroundSize: "100% 3px",
            duration: 0.6,
            ease: "power3.out",
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
      tl.fromTo(
        ".qb-card",
        SKIP_LIVE,
        {
          ...SKIP_STRUCK,
          duration: 0.7,
          ease: "power2.out",
          stagger: 0.12,
          immediateRender: true,
        },
        "-=0.3",
      );
      mark();
    },
    [notAsked.length],
  );

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <SlideBody>
        <header className="flex flex-col">
          <h1 className="qb-title t-title text-fg max-w-[22ch] text-balance">
            {title}
          </h1>
        </header>

        <div className="mt-16 flex items-start gap-24">
          <section className="qb-asked flex min-w-0 flex-1 flex-col">
            <p className="qb-asked-label t-small text-muted mb-6 font-medium">
              We asked
            </p>
            <ul className="flex flex-col items-start gap-4">
              {asked.map((q, i) => (
                <li
                  key={i}
                  className={`qb-bubble bg-raised text-fg ${BUBBLE}`}
                  style={{
                    ...BUBBLE_TYPE,
                    boxShadow: "inset 0 0 0 1px var(--line), var(--shadow-2)",
                  }}
                >
                  {q}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex w-160 shrink-0 flex-col">
            <p className="qb-skip-label t-small text-muted mb-6 font-medium">
              We didn’t ask
            </p>
            <ul className="flex flex-col items-start gap-4">
              {notAsked.map((q, i) => (
                <li
                  key={i}
                  className={`qb-card ${BUBBLE}`}
                  style={{ ...BUBBLE_TYPE, ...SKIP_LIVE }}
                >
                  <span
                    className="qb-strike"
                    style={{
                      color: LIVE,
                      backgroundImage:
                        "linear-gradient(var(--accent), var(--accent))",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "0 60%",
                      backgroundSize: "0% 3px",
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
