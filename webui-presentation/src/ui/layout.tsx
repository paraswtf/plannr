import type { CSSProperties, ReactNode } from "react";

/**
 * The page furniture every content slide shares.
 *
 * The canvas is 1920 × 1080. The deck's top bar owns the strip above y = 112
 * and the progress line owns the bottom 16px, so a slide's own content lives
 * inside SlideBody's padding: 128px either side, 132px top, 104px bottom, a
 * 1664 × 844 box.
 */
export const SAFE = { x: 128, top: 132, bottom: 104 } as const;

export function SlideBody({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`absolute inset-0 flex flex-col ${className ?? ""}`}
      style={{
        paddingLeft: SAFE.x,
        paddingRight: SAFE.x,
        paddingTop: SAFE.top,
        paddingBottom: SAFE.bottom,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A slide's title and the line under it, in the deck's standard place.
 * `titleFlipId` lets a title travel from the slide before.
 *
 * `eyebrow` is accepted and deliberately not drawn: the top bar already names
 * the section, and a label above every title is a template's rhythm.
 */
export function SlideHeader({
  title,
  lede,
  titleFlipId,
  className,
  titleClassName,
}: {
  eyebrow?: ReactNode;
  eyebrowColor?: string;
  title: ReactNode;
  lede?: ReactNode;
  titleFlipId?: string;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <header className={`flex flex-col ${className ?? ""}`}>
      <h1
        data-flip-id={titleFlipId}
        className={`t-title text-fg max-w-[22ch] self-start ${titleClassName ?? ""}`}
      >
        {title}
      </h1>
      {lede && <p className="t-lede text-muted mt-6 max-w-[46ch]">{lede}</p>}
    </header>
  );
}

/**
 * The phrase on a slide that carries it, in the accent.
 *
 * `brand` paints it with the full brand gradient instead. That is reserved
 * for two moments in the whole deck: the cover's name and the closing thesis.
 */
export function Grad({
  children,
  brand = false,
}: {
  children: ReactNode;
  brand?: boolean;
}) {
  return (
    <span className={brand ? "grad-text" : "text-accent"}>{children}</span>
  );
}
