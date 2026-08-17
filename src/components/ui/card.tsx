import type { CSSProperties, ReactNode } from "react";

/**
 * The surface everything sits on. Elevation is a drawn inset hairline plus a
 * soft shadow — never a CSS border, which is what gives the prototype its flat,
 * crisp edges.
 */
export function Card({
  children,
  title,
  action,
  pad = 20,
  hover = false,
  className = "",
  style,
  onClick,
}: {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  pad?: number;
  hover?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface rounded-[var(--radius-card)] ${hover ? "plr-clip plr-hoverlift cursor-pointer" : ""} ${className}`}
      style={{
        // The padding a caller asks for, unless the screen is too narrow to
        // spare it: 4vw only undercuts these values below about 500px wide, so
        // a phone gets its width back and every larger screen is untouched.
        padding: `min(${pad}px, 4vw)`,
        boxShadow: "var(--ring), var(--shadow-card)",
        ...style,
      }}
    >
      {(title ?? action) && (
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <h2 className="font-display text-title min-w-0 text-[15px] font-bold">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
