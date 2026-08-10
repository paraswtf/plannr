"use client";

import { Icon } from "~/components/ui/icon";
import { SNAP_MINUTES, toWallTime } from "~/lib/dates";

/**
 * A time that can be typed to the minute, or nudged a quarter hour at a time.
 *
 * The value is an instant but the field shows — and reads back — wall-clock
 * minutes in the institution's timezone, which is the only clock a user of this
 * app is thinking in.
 */
export function TimeField({
  label,
  value,
  timeZone,
  onChange,
  onStep,
  canStepBack = true,
  canStepForward = true,
  disabled = false,
}: {
  label: string;
  value: Date | null;
  timeZone: string;
  /** Given minutes from local midnight, as typed. */
  onChange: (minutesFromMidnight: number) => void;
  /** Omit to drop the nudge buttons. */
  onStep?: (deltaMinutes: number) => void;
  canStepBack?: boolean;
  canStepForward?: boolean;
  disabled?: boolean;
}) {
  const wall = value ? toWallTime(value, timeZone) : null;
  const text = wall
    ? `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}`
    : "";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      <div
        className="bg-surface flex items-center gap-1 rounded-[10px] px-1.5 py-1.5"
        style={{ boxShadow: "var(--ring)", opacity: disabled ? 0.5 : 1 }}
      >
        {onStep && (
          <StepButton
            icon="chevronLeft"
            label={`${label} earlier`}
            onClick={
              canStepBack && !disabled ? () => onStep(-SNAP_MINUTES) : undefined
            }
          />
        )}
        <input
          type="time"
          value={text}
          disabled={disabled}
          onChange={(e) => {
            // An empty or half-typed field reads back as blank; ignore it
            // rather than snapping the booking to midnight.
            const [hourText, minuteText] = e.target.value.split(":");
            const hour = Number(hourText);
            const minute = Number(minuteText);
            if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
            if (minuteText === undefined || minuteText === "") return;
            onChange(hour * 60 + minute);
          }}
          className="text-title min-w-0 flex-1 bg-transparent text-center font-mono text-[13px] font-bold outline-none"
        />
        {onStep && (
          <StepButton
            icon="chevronRight"
            label={`${label} later`}
            onClick={
              canStepForward && !disabled
                ? () => onStep(SNAP_MINUTES)
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

/** Keeps a minutes-from-midnight value inside a window. */
export const clampMinutes = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

function StepButton({
  icon,
  label,
  onClick,
}: {
  icon: "chevronLeft" | "chevronRight";
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
      style={{
        background: "rgba(68,88,121,0.07)",
        opacity: onClick ? 1 : 0.35,
        cursor: onClick ? "pointer" : "not-allowed",
      }}
    >
      <Icon name={icon} size={13} color="var(--slate)" stroke={2.2} />
    </button>
  );
}
