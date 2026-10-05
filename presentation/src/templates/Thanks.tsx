"use client";

import { Fragment, useRef, type ReactNode } from "react";

import { PlannrMark } from "~/ui/brand";
import { Icon, type IconName } from "~/ui/icon";
import { Glow } from "~/ui/layout";

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
 * back around the edges — the deck ends where it began.
 */
export function Thanks({ title, subtitle, footer, active }: ThanksProps) {
  const root = useRef<HTMLDivElement>(null);
  const live = useSlideActive(root, active);

  useEntrance(root, (tl) => {
    tl.from(".th-drift", { opacity: 0, duration: 2.4, ease: "power1.out" }, 0);
    tl.from(
      ".th-glow",
      { opacity: 0, scale: 0.7, duration: 1.8, ease: "power2.out" },
      0.1,
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
      <div className="th-glow absolute inset-0">
        <Glow x="50%" y="46%" size={1500} />
      </div>

      <div className="absolute inset-x-0 top-[214px] flex flex-col items-center text-center">
        <PlannrMark height={170} flipId="deck-mark" />
        <h1 className="th-title t-hero mt-16">{title}</h1>
        {subtitle && (
          <p className="th-sub font-display text-muted mt-8 text-[64px] leading-none font-semibold tracking-[-0.03em]">
            {subtitle}
          </p>
        )}
      </div>

      {footer && (
        <div className="absolute inset-x-0 bottom-[72px] flex items-center justify-center gap-6">
          {parts ? (
            parts.map((part, i) => (
              <Fragment key={part}>
                {i > 0 && (
                  <span className="th-foot bg-line-strong h-[6px] w-[6px] rounded-full" />
                )}
                <span className="th-foot t-mono text-muted inline-flex items-center gap-3 text-[24px]">
                  <Icon name={footerIcon(part)} size={26} stroke={1.75} />
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
