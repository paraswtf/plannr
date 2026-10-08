import type { CSSProperties, ReactNode } from "react";

/**
 * The surface everything sits on. Elevation is a drawn inset hairline plus a
 * soft shadow — never a CSS border, which is what gives the prototype its flat,
 * crisp edges.
 *
 * The ring and the shadow are a class rather than an inline style so that a
 * card that lifts under the pointer can deepen its shadow on hover; an inline
 * `boxShadow` would outrank any hover state. A caller that passes its own
 * `boxShadow` in `style` still wins, as it always did.
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
      // A card that does something when clicked has to be reachable and
      // pressable without a pointer too: focusable, announced as a button, and
      // answering Enter and Space the way a real one does.
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`bg-surface rounded-[var(--radius-card)] shadow-[var(--ring),var(--shadow-card)] ${
        hover
          ? "plr-clip plr-hoverlift cursor-pointer hover:shadow-[var(--ring),var(--shadow-md)]"
          : ""
      } ${className}`}
      style={{
        // The padding a caller asks for, unless the screen is too narrow to
        // spare it: 4vw only undercuts these values below about 500px wide, so
        // a phone gets its width back and every larger screen is untouched.
        padding: `min(${pad}px, 4vw)`,
        ...style,
      }}
    >
      {(title ?? action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <h2 className="font-display text-title text-md min-w-0 font-semibold tracking-[-0.01em]">
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
