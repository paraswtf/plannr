import type { CSSProperties } from "react";

/**
 * A shape standing in for content that is on its way.
 *
 * The same breathing wash the calendar skeletons use — Tailwind's opacity
 * pulse, which the compositor can run without repainting — and still under
 * reduced motion. Give it the size of the thing it replaces, so nothing moves
 * when the real thing arrives; the shapes are deliberately plain so nothing
 * about them can be mistaken for data.
 *
 * Hidden from assistive technology on its own: the region holding a group of
 * these says it is loading (`role="status"` with a label), once, instead of
 * every bar announcing itself.
 */
export function Skeleton({
  className = "",
  style,
  round = false,
  radius,
}: {
  className?: string;
  style?: CSSProperties;
  /** A circle or a rounded-square avatar rather than a bar. */
  round?: boolean;
  /**
   * The corner, when the shape stands in for something rounder than a line of
   * text — a card, a field. A `rounded-*` class works as well; either one
   * replaces the default 6px rather than fighting it for the last word.
   */
  radius?: string;
}) {
  // The default corner is only added when nothing else asks for one: two
  // `rounded-*` utilities on one element are settled by the order Tailwind
  // happens to emit them in, which is not the order they were written in.
  const ownCorner =
    radius !== undefined || round || /\brounded-/.test(className);
  return (
    <span
      aria-hidden
      className={`bg-tint-strong block animate-pulse motion-reduce:animate-none ${ownCorner ? "" : "rounded-[6px]"} ${className}`}
      style={{
        ...(radius !== undefined
          ? { borderRadius: radius }
          : round
            ? { borderRadius: "30%" }
            : {}),
        ...style,
      }}
    />
  );
}
