export function PageHeader({
  title,
  subtitle,
  actions,
  wideActions = false,
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
}) {
  return (
    <header
      className="sticky z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 backdrop-blur sm:px-6 lg:px-9 lg:py-5"
      style={{
        // Below the sidebar's breakpoint the hamburger bar is already at the
        // top of the screen; sticking to 0 would park this on top of it.
        top: "var(--topbar-h)",
        background: "rgba(238,240,243,0.82)",
        boxShadow: "0 1px 0 var(--hair-soft)",
      }}
    >
      <div className="min-w-0">
        <h1 className="font-display text-title text-[21px] leading-tight font-bold tracking-[-0.02em] sm:text-[26px]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted mt-0.5 text-[12.5px] sm:text-[13.5px]">
            {subtitle}
          </p>
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
