"use client";

import { useRef, type ReactNode } from "react";

import { useEntrance } from "~/templates/_story-motion";
import { SlideBody } from "~/ui/layout";

import { TechStrip, type TechItem } from "./TechStrip";

export interface SlideFrameProps {
  /** Optional short label, in sentence case ("Sign-in"). Muted, above the title. */
  eyebrow?: ReactNode;
  /** The benefit, two lines at most. Wrap the key phrase in <Grad>. */
  title: ReactNode;
  /** One line under the title, 25 words at most. */
  subhead?: ReactNode;
  /** The exact method names that prove it. */
  tech?: TechItem[];
  /** The one focused visual. Fills the area between header and strip. */
  children: ReactNode;
  className?: string;
}

/**
 * The shared marketing layout, on the 1664 x 844 content box:
 * header (eyebrow, title, subhead) at the top, the visual in the middle taking
 * all remaining height, the TechStrip along the foot. The title carries flip
 * id "slide-title", so it travels between two slides built with this frame.
 * Entrance: header rises, visual fades up, chips stagger. Builds of the visual
 * itself are the slide's job (use useSteps with its own root ref).
 */
export function SlideFrame({
  eyebrow,
  title,
  subhead,
  tech,
  children,
  className,
}: SlideFrameProps) {
  const root = useRef<HTMLDivElement>(null);

  useEntrance(root, (tl) => {
    tl.from(
      ".sf-rise",
      { y: 32, opacity: 0, duration: 0.9, ease: "deck.enter", stagger: 0.08 },
      0.1,
    );
    tl.from(
      ".sf-visual",
      { y: 40, opacity: 0, duration: 1, ease: "deck.enter" },
      0.3,
    );
    tl.from(
      ".sf-chip",
      { y: 20, opacity: 0, duration: 0.7, ease: "deck.enter", stagger: 0.06 },
      0.7,
    );
  });

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <SlideBody className={className}>
        <header className="flex flex-col">
          {eyebrow && (
            <p className="sf-rise t-label text-muted mb-4">{eyebrow}</p>
          )}
          <h1
            data-flip-id="slide-title"
            className="sf-rise font-display text-fg max-w-[24ch] text-[68px] leading-[1.04] font-semibold tracking-[-0.02em]"
          >
            {title}
          </h1>
          {subhead && (
            <p className="sf-rise t-lede text-muted mt-5 max-w-[56ch]">
              {subhead}
            </p>
          )}
        </header>
        <div className="sf-visual relative min-h-0 flex-1">{children}</div>
        {tech && tech.length > 0 && (
          <div className="pt-6">
            <TechStrip items={tech} />
          </div>
        )}
      </SlideBody>
    </div>
  );
}
