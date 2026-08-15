import Image from "next/image";

/**
 * The Plannr mark and lockup.
 *
 * Both render `/logo.svg` straight from `public/`, so the artwork has exactly
 * one source of truth — the same file the social card and the favicons are cut
 * from. `unoptimized` is deliberate: Next refuses to run SVGs through the image
 * optimiser unless `dangerouslyAllowSVG` is on, and there is nothing to
 * optimise in a 1.8 KB vector anyway.
 */

/** Intrinsic aspect of public/logo.svg (167 × 194). */
const MARK_RATIO = 167 / 194;

interface MarkProps {
  /** Rendered height in px; width follows the mark's aspect. */
  height?: number;
  /**
   * Accessible name. Leave unset when a visible "Plannr" sits next to the mark,
   * so screen readers do not hear the name twice.
   */
  alt?: string;
  className?: string;
}

export function PlannrMark({ height = 28, alt = "", className }: MarkProps) {
  return (
    <Image
      src="/logo.svg"
      alt={alt}
      width={Math.round(height * MARK_RATIO)}
      height={height}
      priority
      unoptimized
      className={className}
    />
  );
}

interface LogoProps extends MarkProps {
  /** Font size of the wordmark in px. */
  wordmarkSize?: number;
}

/** Mark plus wordmark — the lockup used wherever the app names itself. */
export function PlannrLogo({
  height = 26,
  wordmarkSize = 19,
  className,
}: LogoProps) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <PlannrMark height={height} />
      <span
        className="font-display text-title font-bold tracking-[-0.02em]"
        style={{ fontSize: `${wordmarkSize}px` }}
      >
        Plannr
      </span>
    </span>
  );
}
