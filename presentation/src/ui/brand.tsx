import Image from "next/image";

/** Intrinsic aspect of public/logo.svg (167 × 194), the app's own mark. */
const MARK_RATIO = 167 / 194;

/**
 * The Plannr mark, drawn from the same file the app uses.
 *
 * `flipId` goes on the wrapper so the mark can travel between slides: the
 * cover's large mark and the top bar's small one share "deck-mark".
 */
export function PlannrMark({
  height = 34,
  flipId,
  className,
}: {
  height?: number;
  flipId?: string;
  className?: string;
}) {
  return (
    <span
      data-flip-id={flipId}
      className={`inline-block shrink-0 ${className ?? ""}`}
      style={{ width: Math.round(height * MARK_RATIO), height }}
    >
      <Image
        src="/logo.svg"
        alt=""
        width={Math.round(height * MARK_RATIO)}
        height={height}
        unoptimized
        priority
        className="block h-full w-full"
      />
    </span>
  );
}

/** Mark and wordmark, as the app sets them side by side. */
export function PlannrLogo({
  height = 40,
  wordmarkSize = 30,
  flipId,
  className,
}: {
  height?: number;
  wordmarkSize?: number;
  flipId?: string;
  className?: string;
}) {
  return (
    <span
      data-flip-id={flipId}
      className={`inline-flex items-center gap-3 ${className ?? ""}`}
    >
      <PlannrMark height={height} />
      <span
        className="font-display font-bold tracking-[-0.02em]"
        style={{ fontSize: wordmarkSize }}
      >
        Plannr
      </span>
    </span>
  );
}
