import type { ReactNode } from "react";

/**
 * The column a screen's content sits in, under its `PageHeader`.
 *
 * Every screen wrote this wrapper out for itself, and one forgot it — the
 * approvals queue ran flush against the sidebar — so the gutters now live in
 * one place, matched to the header's own (16, 24, 36px across the three
 * widths) so a title and the content under it always start on the same line.
 *
 * The gap under the header is a little more than the 8px the screens used to
 * leave themselves: enough that the first toolbar or card reads as the start
 * of the page rather than as something caught under the header's edge.
 *
 * `width` caps how wide the content may grow on a large monitor. Grids and
 * tables want every pixel and keep `full`; a form or a settings page is a
 * column of reading and stops at `narrow`, where a line of help text is still
 * a comfortable length to read. The cap is on an inner box, so the gutters
 * stay where they are and the content stays aligned to the title.
 */
export function PageBody({
  width = "full",
  className = "",
  children,
}: {
  width?: "full" | "wide" | "narrow";
  /** Layout for the inner column: a `flex flex-col gap-6`, say. */
  className?: string;
  children: ReactNode;
}) {
  const cap =
    width === "narrow"
      ? "max-w-[860px]"
      : width === "wide"
        ? "max-w-[1320px]"
        : "";
  return (
    <div className="px-4 pt-4 pb-10 sm:px-6 lg:px-9 lg:pt-5 lg:pb-12">
      <div className={`${cap} ${className}`}>{children}</div>
    </div>
  );
}
