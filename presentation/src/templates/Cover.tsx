"use client";

import { useRef, type ReactNode } from "react";

import type { SpeakerId } from "~/deck/types";
import { PlannrMark } from "~/ui/brand";
import { Glow } from "~/ui/layout";
import { SpeakerChip } from "~/ui/people";

import { TimetableDrift } from "./_closing-backdrop";
import { useEntrance, useSlideActive } from "./_closing-motion";

export interface CoverProps {
  /** Small line above the title: "Design Thinking · UI/UX". */
  kicker: ReactNode;
  /** "Presenting Plannr" */
  title: ReactNode;
  subtitle: ReactNode;
  /** Presenters, in speaking order. */
  team: SpeakerId[];
  /** "SICSR, Pune · 2026" */
  footer: ReactNode;
  step: number;
  /**
   * Lets the backdrop drift only while the slide is on screen. Optional: when
   * the section does not pass it, the slide's frame is watched instead.
   */
  active?: boolean;
}

/**
 * The title slide. Its big mark carries flip id "deck-mark", so on the way to
 * slide two it shrinks into the top bar's corner. No chrome on this slide.
 *
 * Behind it, a week of class blocks drifts by on a tilted plane, masked away
 * from the type (see _closing-backdrop). The words rise in as it opens.
 */
export function Cover({
  kicker,
  title,
  subtitle,
  team,
  footer,
  active,
}: CoverProps) {
  const root = useRef<HTMLDivElement>(null);
  const live = useSlideActive(root, active);

  useEntrance(root, (tl) => {
    tl.from(".cv-drift", { opacity: 0, duration: 2.4, ease: "power1.out" }, 0);
    tl.from(
      ".cv-glow",
      { opacity: 0, scale: 0.8, duration: 1.8, ease: "power2.out" },
      0,
    );
    tl.from(
      ".cv-rise",
      { y: 42, opacity: 0, duration: 1, ease: "deck.enter", stagger: 0.09 },
      0.15,
    );
    tl.from(
      ".cv-chip",
      { y: 24, opacity: 0, duration: 0.8, ease: "deck.enter", stagger: 0.07 },
      0.6,
    );
  });

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <div className="cv-drift absolute inset-0">
        <TimetableDrift active={live} variant="cover" />
      </div>
      <div className="cv-glow absolute inset-0">
        <Glow x="22%" y="46%" size={1500} />
      </div>

      <div className="absolute top-[300px] left-[160px]">
        <PlannrMark height={260} flipId="deck-mark" />
      </div>

      <div className="absolute top-[280px] left-[480px] flex max-w-[1240px] flex-col">
        <p className="cv-rise t-eyebrow text-muted">{kicker}</p>
        <h1 className="cv-rise t-hero mt-8">{title}</h1>
        <p className="cv-rise t-lede text-muted mt-8 max-w-[34ch] text-pretty">
          {subtitle}
        </p>
      </div>

      <div className="absolute bottom-[110px] left-[480px] flex gap-10">
        {team.map((p) => (
          <span key={p} className="cv-chip inline-flex">
            <SpeakerChip person={p} size={48} />
          </span>
        ))}
      </div>

      <p className="cv-chip t-mono text-faint absolute right-[96px] bottom-[64px] text-[20px]">
        {footer}
      </p>
    </div>
  );
}
