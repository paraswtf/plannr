"use client";

import { forwardRef, useRef, type ReactNode } from "react";

import { gsap, useGSAP } from "./gsap";
import type { DeckSlide, SectionId } from "./types";

/**
 * A section's colour. The deck has one accent, so every section shares it;
 * kept as a function so the presenter's tools have one place to ask.
 */
export function sectionColor(_id: SectionId): string {
  return "var(--accent)";
}

/**
 * The deck's frame: the mark and section top-left and a progress line along
 * the bottom. Nothing else: no speaker (the cover and the thanks slide name
 * the whole group, and every slide between is the group's work too), no
 * slide numbers (the audience does not need them; the presenter view has
 * them) and no colour.
 *
 * It sits on the canvas above the slides, so it scales with them. The mark
 * in the corner is not drawn here but by each slide (see SlideFrame), so that
 * it can take part in the slide's morph: the cover's big mark shrinks into
 * the corner on the way to the second slide.
 */
export const Chrome = forwardRef<
  HTMLDivElement,
  { slide: DeckSlide; slides: DeckSlide[] }
>(function Chrome({ slide, slides }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const visible = slide.chrome;

  useGSAP(
    () => {
      const vars = { autoAlpha: visible ? 1 : 0 };
      if (first.current) gsap.set(root.current, vars);
      else
        gsap.to(root.current, { ...vars, duration: 0.5, ease: "power1.inOut" });
      first.current = false;
    },
    { dependencies: [visible] },
  );

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-20">
      <div ref={root} data-theme={slide.theme} className="absolute inset-0">
        <div className="absolute top-[44px] left-[115px] flex h-[40px] items-center gap-5">
          <span className="bg-line h-[26px] w-px" />
          <SwapIn swapKey={slide.section.id}>
            <span className="font-display text-muted text-[21px] font-medium tracking-[-0.01em]">
              {slide.section.title}
            </span>
          </SwapIn>
        </div>

        <Progress slide={slide} slides={slides} />
      </div>
    </div>
  );
});

/** Re-mounts its child when `swapKey` changes, rising it into place. */
function SwapIn({
  swapKey,
  children,
}: {
  swapKey: string;
  children: ReactNode;
}) {
  return <SwapInner key={swapKey}>{children}</SwapInner>;
}

function SwapInner({ children }: { children: ReactNode }) {
  const el = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    gsap.from(el.current, {
      y: 16,
      opacity: 0,
      duration: 0.6,
      delay: 0.25,
      ease: "deck.enter",
    });
  });
  return (
    <span ref={el} className="inline-flex">
      {children}
    </span>
  );
}

/**
 * One segment per section, each as long as its share of the slides, filled up
 * to the current slide.
 */
function Progress({
  slide,
  slides,
}: {
  slide: DeckSlide;
  slides: DeckSlide[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const sections: { id: SectionId; first: number; count: number }[] = [];
  for (const s of slides) {
    const last = sections[sections.length - 1];
    if (last?.id === s.section.id) last.count += 1;
    else sections.push({ id: s.section.id, first: s.index, count: 1 });
  }

  useGSAP(
    () => {
      sections.forEach((section) => {
        const done = Math.min(
          1,
          Math.max(0, (slide.index - section.first + 1) / section.count),
        );
        gsap.to(`[data-progress="${section.id}"]`, {
          scaleX: done,
          duration: 0.7,
          ease: "deck.enter",
        });
      });
    },
    { scope: root, dependencies: [slide.index] },
  );

  return (
    <div
      ref={root}
      className="absolute inset-x-[64px] bottom-[18px] flex h-[3px] gap-[6px]"
    >
      {sections.map((section) => (
        <span
          key={section.id}
          className="bg-line relative h-full overflow-hidden rounded-full"
          style={{ flex: section.count }}
        >
          <span
            data-progress={section.id}
            className="bg-fg absolute inset-0 origin-left rounded-full opacity-70"
            style={{ transform: "scaleX(0)" }}
          />
        </span>
      ))}
    </div>
  );
}
