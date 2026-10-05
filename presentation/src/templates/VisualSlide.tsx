"use client";

import { useRef, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { SlideBody } from "~/ui/layout";

import { riseWords, textOf, useEntrance } from "./_story-motion";

export interface VisualSlideProps {
  /** Accepted and not drawn: the deck puts no label above a title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /**
   * The picture: usually one of src/visuals, given the same `step`. It is
   * placed and sized by the layout; it should fill the box it is given.
   */
  visual: ReactNode;
  /**
   * "side" (default): text in a 640px column on the left; the visual gets a
   * 960 × 844 box on the right.
   * "below": header across the top; the visual gets the full 1664px width and
   * the height left under the header (about 660px under a one-line title).
   */
  layout?: "side" | "below";
  /** Short lines under the lede, one per build (point i from step i + 1). */
  points?: ReactNode[];
  /**
   * A row under the lede, a few app icons say. Its children rise in one
   * after another, just after the lede.
   */
  footer?: ReactNode;
  /** Ignored: the tick beside a point is always the deck's one accent. */
  accent?: string;
  step: number;
}

/**
 * The type size for a side-column title: the long ones come down a notch so
 * they still sit in four lines of the 640px column.
 */
function sideTitleSize(title: ReactNode): number {
  const length = textOf(title).length;
  if (length > 56) return 72;
  return 80;
}

/**
 * The deck's workhorse: a headline and a visual that carries the argument.
 * The visual drives its own builds from `step`; this template lays out the
 * text and the box, raises the headline a word at a time as the slide
 * arrives, and brings in `points` one per build.
 */
export function VisualSlide({
  title,
  lede,
  visual,
  layout = "side",
  points = [],
  footer,
  step,
}: VisualSlideProps) {
  const text = useRef<HTMLDivElement>(null);
  const side = layout === "side";

  useEntrance(
    text,
    (tl) => {
      tl.add(riseWords(text.current?.querySelector(".vs-title") ?? null), 0.12);
      if (lede) {
        tl.from(
          ".vs-lede",
          { opacity: 0, y: 28, duration: 0.85, ease: "deck.enter" },
          side ? 0.6 : 0.5,
        );
      }
      if (footer) {
        tl.from(
          ".vs-footer > *",
          {
            opacity: 0,
            y: 28,
            duration: 0.75,
            ease: "deck.enter",
            stagger: 0.08,
          },
          side ? 0.85 : 0.75,
        );
      }
    },
    step,
  );

  useSteps(
    text,
    step,
    (tl, mark) => {
      const items = Array.from(
        text.current?.querySelectorAll<HTMLElement>(".vs-point") ?? [],
      );
      items.forEach((li) => {
        tl.fromTo(
          li.querySelector(".vs-tick"),
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 0.5,
            ease: "power3.out",
            immediateRender: true,
          },
        );
        tl.fromTo(
          li.querySelector(".vs-point-text"),
          { opacity: 0, x: -36 },
          {
            opacity: 1,
            x: 0,
            duration: 0.8,
            ease: "deck.enter",
            immediateRender: true,
          },
          "<0.12",
        );
        mark();
      });
    },
    [points.length],
  );

  const titleSize = side ? sideTitleSize(title) : 80;

  const column = (
    <div
      ref={text}
      data-no-enter
      className={
        side
          ? "flex w-[640px] shrink-0 flex-col justify-center pb-10"
          : "flex flex-col"
      }
    >
      <h1
        className="vs-title t-title text-fg text-balance"
        style={{ fontSize: titleSize }}
      >
        {title}
      </h1>
      {lede && (
        <p
          className={`vs-lede t-lede text-muted text-pretty ${side ? "mt-10 max-w-[30ch]" : "mt-6 max-w-[48ch]"}`}
        >
          {lede}
        </p>
      )}
      {footer && (
        <div
          className={`vs-footer flex items-center gap-5 ${side ? "mt-12" : "mt-8"}`}
        >
          {footer}
        </div>
      )}
      {points.length > 0 && (
        <ul className="mt-12 flex flex-col gap-6">
          {points.map((p, i) => (
            <li key={i} className="vs-point flex items-start gap-5">
              <span
                aria-hidden
                className="vs-tick bg-accent mt-[19px] block h-[3px] w-[28px] shrink-0 origin-left rounded-full"
              />
              <span className="vs-point-text t-body text-body block text-pretty">
                {p}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <SlideBody className={side ? "flex-row gap-16" : "gap-10"}>
      {column}
      <div className="relative min-h-0 min-w-0 flex-1">{visual}</div>
    </SlideBody>
  );
}
