export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
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
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </header>
  );
}
