"use client";

import { forwardRef } from "react";

import { PlannrMark } from "~/ui/brand";

import type { DeckSlide } from "./types";

/** Where the top bar's mark sits; the cover's mark morphs into this spot. */
export const DECK_MARK = { left: 64, top: 46, height: 36 } as const;

/**
 * One slide on the canvas: a transparent, full-size layer with the slide's
 * theme. Transparent on purpose — the stage behind paints the background, so
 * two slides can dissolve into each other during a transition.
 *
 * The corner mark is drawn here rather than by the top bar so that it is part
 * of the slide's morph: between two ordinary slides it stays put, and on the
 * way out of the cover the cover's big mark travels into it.
 */
export const SlideFrame = forwardRef<
  HTMLDivElement,
  { slide: DeckSlide; step: number; active: boolean }
>(function SlideFrame({ slide, step, active }, ref) {
  return (
    <div
      ref={ref}
      data-slide={slide.id}
      data-theme={slide.theme}
      aria-hidden={!active}
      className="text-fg absolute inset-0 overflow-hidden"
    >
      {slide.render({ step, active })}
      {slide.chrome && (
        <div
          className="absolute z-20"
          style={{ left: DECK_MARK.left, top: DECK_MARK.top }}
        >
          <PlannrMark height={DECK_MARK.height} flipId="deck-mark" />
        </div>
      )}
    </div>
  );
});
