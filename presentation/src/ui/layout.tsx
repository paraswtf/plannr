import type { CSSProperties, ReactNode } from "react";

/**
 * The page furniture every content slide shares.
 *
 * The canvas is 1920 × 1080. The deck's top bar owns the strip above y = 112
 * and the progress line owns the bottom 16px, so a slide's own content lives
 * inside SlideBody's padding: 128px either side, 132px top, 104px bottom —
 * a 1664 × 844 box.
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

/** The small mono label above a title: "STUDENTS · WHAT WE HEARD". */
export function Eyebrow({
  children,
  color,
  className,
  flipId,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  flipId?: string;
}) {
  return (
    <p
      data-flip-id={flipId}
      className={`t-eyebrow text-muted flex items-center gap-3 ${className ?? ""}`}
      style={color ? { color } : undefined}
    >
      {color && (
        <span
          className="inline-block h-[10px] w-[10px] rounded-full"
          style={{ background: color }}
        />
      )}
      {children}
    </p>
  );
}

/**
 * Eyebrow, title and an optional line under it, in the deck's standard place.
 * `titleFlipId` lets a title travel from the slide before.
 */
export function SlideHeader({
  eyebrow,
  eyebrowColor,
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
      {eyebrow && <Eyebrow color={eyebrowColor}>{eyebrow}</Eyebrow>}
      <h1
        data-flip-id={titleFlipId}
        className={`t-title mt-6 max-w-[22ch] self-start text-balance ${titleClassName ?? ""}`}
      >
        {title}
      </h1>
      {lede && (
        <p className="t-lede text-muted mt-6 max-w-[48ch] text-pretty">
          {lede}
        </p>
      )}
    </header>
  );
}

/** Gradient-filled words: the one phrase on a slide that carries it. */
export function Grad({ children }: { children: ReactNode }) {
  return <span className="grad-text">{children}</span>;
}

/** A soft glow of the brand's warm end, behind hero type. */
export function Glow({
  x = "20%",
  y = "40%",
  size = 1100,
  color = "var(--glow)",
  className,
}: {
  x?: string;
  y?: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute ${className ?? ""}`}
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
        background: `radial-gradient(circle at center, ${color} 0%, transparent 62%)`,
      }}
    />
  );
}
