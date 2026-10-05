"use client";

import { forwardRef, useRef, type ReactNode } from "react";

import { STAKEHOLDERS } from "~/content/team";
import { SpeakerChip } from "~/ui/people";

import { gsap, useGSAP } from "./gsap";
import type { DeckSlide, SectionId } from "./types";

/** A section's colour: its stakeholder's, or the brand gradient for ours. */
export function sectionColor(id: SectionId): string {
  return id in STAKEHOLDERS
    ? STAKEHOLDERS[id as keyof typeof STAKEHOLDERS].color
    : "var(--grad-brand-h)";
}

/**
 * The deck's frame: the mark and section top-left, the speaker top-right,
 * the slide count and a progress line along the bottom.
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
            <span className="flex items-center gap-3">
              <span
                className="h-[10px] w-[10px] rounded-full"
                style={{ background: sectionColor(slide.section.id) }}
              />
              <span className="font-display text-fg text-[22px] font-semibold tracking-[-0.01em]">
                {slide.section.title}
              </span>
            </span>
          </SwapIn>
        </div>

        <div className="absolute top-[42px] right-[64px] flex h-[44px] items-center">
          <SwapIn swapKey={slide.speaker}>
            <SpeakerChip person={slide.speaker} size={40} label="Presenting" />
          </SwapIn>
        </div>

        <span className="t-mono text-faint absolute right-[64px] bottom-[30px] text-[16px]">
          {String(slide.index + 1).padStart(2, "0")}
          <span className="opacity-60"> / {slides.length}</span>
        </span>

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
      className="absolute inset-x-[64px] bottom-[16px] flex h-[4px] gap-[6px]"
    >
      {sections.map((section) => (
        <span
          key={section.id}
          className="bg-line relative h-full overflow-hidden rounded-full"
          style={{ flex: section.count }}
        >
          <span
            data-progress={section.id}
            className="absolute inset-0 origin-left rounded-full"
            style={{
              background: sectionColor(section.id),
              transform: "scaleX(0)",
            }}
          />
        </span>
      ))}
    </div>
  );
}
