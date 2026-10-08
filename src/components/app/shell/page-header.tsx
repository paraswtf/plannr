import Link from "next/link";

import { Icon } from "~/components/ui/icon";

export function PageHeader({
  title,
  subtitle,
  actions,
  wideActions = false,
  back,
  compact = false,
  opaque = false,
}: {
  title: string;
  /**
   * A node rather than a string, so a screen can put something in the line that
   * is not words — the course page draws its own colour here, beside the code
   * and the programme that already identify it.
   */
  subtitle?: React.ReactNode;
  /**
   * Give the actions a definite width below `sm`, for a screen whose controls
   * ask for one.
   *
   * Opt-in, and it has to be: a `w-full` actions row can never share the
   * title's line again, so a screen passing one short button would have that
   * button drop to a row of its own and the sticky header would grow by about
   * fifty pixels on every screenful. Only the two calendars want it, because
   * only they hand `actions` a control — the date picker — that sizes itself
   * against the line it is given.
   */
  wideActions?: boolean;
  actions?: React.ReactNode;
  /**
   * Where "up" is, for a screen that is one record out of a list — a course,
   * a register, a plan. Drawn as a small link above the title, the way a
   * breadcrumb is, rather than as a button among the actions: there it was the
   * thing that wrapped onto a row of its own on a phone, and it read as one
   * more action instead of as where the page sits.
   */
  back?: { href: string; label: string };
  /**
   * Tighter wherever the sidebar is gone (below `lg`): less padding above and
   * below and between the rows. For the screens whose sticky header carries
   * controls as well as a title — the calendars — where every pixel it grows
   * is schedule the reader no longer sees. The breakpoint is the sidebar's
   * because that is the one the timetable's height constant (`--tt-ceiling`)
   * is written against. The subtitle is never clamped: on the schedule it
   * carries notices, such as the day having opened on the next class, that
   * must be read in full.
   */
  compact?: boolean;
  /**
   * The paper itself instead of the frosted strip, for a screen whose content
   * is loud enough to show through the glass as noise — the timetable's
   * coloured grid scrolling under the header.
   */
  opaque?: boolean;
}) {
  return (
    <header
      className={`sticky z-20 flex flex-wrap items-center justify-between gap-x-4 px-4 backdrop-blur sm:px-6 lg:px-9 lg:py-5 ${
        compact ? "gap-y-2 py-3 lg:gap-y-3" : "gap-y-3 py-4"
      }`}
      style={{
        // Below the sidebar's breakpoint the hamburger bar is already at the
        // top of the screen; sticking to 0 would park this on top of it.
        top: "var(--topbar-h)",
        background: opaque ? "var(--paper)" : "var(--glass)",
        boxShadow: "0 1px 0 var(--hair-soft)",
      }}
    >
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            // The words are small, so the pad around them is what a finger
            // actually hits; the negative margin keeps the chevron on the
            // title's left edge.
            className="text-muted hover:text-title -mx-1.5 mb-1 inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-xs font-semibold transition-colors duration-150"
          >
            <Icon name="chevronLeft" size={13} stroke={2.2} />
            {back.label}
          </Link>
        )}
        {/*
         * One size at every width. The title was 21px on a phone and 26px on a
         * laptop, and neither was a step on the scale; 24px is, and it is a
         * comfortable size for the one- and two-word names every screen has.
         * Semibold, because the display face at bold was the heaviest thing
         * on every page, heavier than the content it was naming.
         */}
        <h1 className="font-display text-title text-xl font-semibold tracking-[-0.025em]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted mt-1 max-w-[72ch] text-sm">{subtitle}</p>
        )}
      </div>
      {actions && (
        // A definite width below sm where it is asked for, so a control sizing
        // itself against the line — the day controls, whose date picker takes
        // whatever the arrows leave — has a line to size against rather than a
        // box being sized by its own contents. Above sm both shapes are the
        // same: take what you need, on the title's right.
        <div
          className={`flex flex-wrap items-center gap-2.5 ${wideActions ? "w-full sm:w-auto" : ""}`}
        >
          {actions}
        </div>
      )}
    </header>
  );
}
