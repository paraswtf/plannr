import { formatHourLabel } from "~/lib/dates";

export type EventStatus = "ongoing" | "upcoming" | undefined;

/**
 * A lecture as it appears in a list — the prototype's signature card. An
 * ongoing class gets a green status dot, the next one up gets a red ring so it
 * reads first.
 */
export function EventCard({
  title,
  start,
  end,
  faculty,
  timeZone,
  status,
  statusText,
  highlight = false,
  onClick,
}: {
  title: string;
  start: Date;
  end: Date;
  faculty?: string | null;
  timeZone: string;
  status?: EventStatus;
  statusText?: string;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const dotColor = status === "ongoing" ? "#4e7d3a" : "var(--red)";

  return (
    <div
      onClick={onClick}
      className={`plr-clip bg-surface rounded-[var(--radius-card)] px-[22px] py-4 ${
        onClick ? "plr-hoverlift cursor-pointer" : ""
      }`}
      style={{
        boxShadow: highlight
          ? "inset 0 0 0 1.5px var(--red), 0 8px 24px rgba(220,56,72,0.10)"
          : "var(--ring), var(--shadow-card)",
      }}
    >
      {status && statusText && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span
            className="h-[6px] w-[6px] rounded-full"
            style={{ background: dotColor }}
          />
          <span
            className="font-mono text-[11px] font-semibold"
            style={{ color: dotColor }}
          >
            {statusText}
          </span>
        </div>
      )}

      <div className="font-display text-title text-[16px] font-bold">
        {title}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-slate font-mono text-[12.5px]">
          {formatHourLabel(start, timeZone)} to {formatHourLabel(end, timeZone)}
        </span>
        {faculty && (
          <span className="text-muted text-[12.5px]">· {faculty}</span>
        )}
      </div>
    </div>
  );
}
