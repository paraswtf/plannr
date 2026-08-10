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
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 px-9 py-5 backdrop-blur"
      style={{
        background: "rgba(238,240,243,0.82)",
        boxShadow: "0 1px 0 var(--hair-soft)",
      }}
    >
      <div className="min-w-0">
        <h1 className="font-display text-title text-[26px] leading-tight font-bold tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted mt-0.5 text-[13.5px]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  );
}
