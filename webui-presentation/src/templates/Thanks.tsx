"use client";

import { Fragment, useRef, type ReactNode } from "react";

import { PlannrMark } from "~/ui/brand";
import { Icon, type IconName } from "~/ui/icon";

import { TimetableDrift } from "./_closing-backdrop";
import { useEntrance, useSlideActive } from "./_closing-motion";

export interface ThanksProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * Small line at the bottom: the site and the repository. A string with
   * " · " between its parts is set as separate links with an icon each.
   */
  footer?: ReactNode;
  step: number;
  /** Lets the backdrop drift only while on screen; watched from the frame if omitted. */
  active?: boolean;
}

/**
 * The last slide, held during questions. Chrome off.
 *
 * The corner mark ("deck-mark") travels from the top bar into the middle of
 * the slide, the title rises under it, and the cover's drifting week comes
 * back around the edges: the deck ends where it began.
 */
export function Thanks({ title, subtitle, footer, active }: ThanksProps) {
  const root = useRef<HTMLDivElement>(null);
  const live = useSlideActive(root, active);

  useEntrance(root, (tl) => {
    // The drift waits for the mark to land, so the only thing moving during
    // the morph is the mark itself.
    tl.fromTo(
      ".th-drift",
      { opacity: 0 },
      { opacity: 1, duration: 1.8, ease: "power1.out", immediateRender: true },
      1.05,
    );
    tl.from(
      ".th-title",
      { y: 60, opacity: 0, duration: 1.1, ease: "deck.enter" },
      0.35,
    );
    tl.from(
      ".th-sub",
      { y: 30, opacity: 0, duration: 0.9, ease: "deck.enter" },
      0.6,
    );
    tl.from(
      ".th-foot",
      { y: 16, opacity: 0, duration: 0.8, ease: "deck.enter", stagger: 0.08 },
      0.85,
    );
  });

  const parts =
    typeof footer === "string" && footer.includes(" · ")
      ? footer.split(" · ")
      : null;

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <div className="th-drift absolute inset-0">
        <TimetableDrift active={live} variant="thanks" seed={23} />
      </div>

      <div className="absolute inset-x-0 top-[214px] flex flex-col items-center text-center">
        <PlannrMark height={170} flipId="deck-mark" />
        <h1 className="th-title t-hero text-fg mt-16">{title}</h1>
        {subtitle && (
          <p className="th-sub font-display text-muted mt-10 text-[64px] leading-none font-medium tracking-[-0.03em]">
            {subtitle}
          </p>
        )}
      </div>

      {footer && (
        <div className="absolute inset-x-0 bottom-[84px] flex items-center justify-center gap-8">
          {parts ? (
            parts.map((part, i) => (
              <Fragment key={part}>
                {i > 0 && (
                  <span className="th-foot bg-line-strong h-[28px] w-px" />
                )}
                <span className="th-foot t-mono text-body inline-flex items-center gap-3 text-[24px]">
                  <span className="text-muted inline-flex">
                    <Icon name={footerIcon(part)} size={28} />
                  </span>
                  {part}
                </span>
              </Fragment>
            ))
          ) : (
            <span className="th-foot t-mono text-muted text-[24px]">
              {footer}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function footerIcon(part: string): IconName {
  return /github|gitlab|repo/i.test(part) ? "gitBranch" : "globe";
}
