"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "~/components/ui/icon";
import {
  formatMinutesOfDay,
  minutesOfDay,
  parseTimeInput,
  SNAP_MINUTES,
} from "~/lib/dates";

/**
 * A time: typed to the minute, stepped in quarter hours, or dialled in from an
 * hour / minute / am-pm picker.
 *
 * The browser's own time input was the last control here drawn by the operating
 * system rather than by the app, and its keyboard behaviour (segment by segment,
 * arrows only) is worse than simply typing "915". This parses what people
 * actually type — "9", "915", "9:15", "9:15pm", "21:15" — and drops the three
 * parts of a clock time into three short columns for everyone else.
 */

type Period = "am" | "pm";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const PERIODS: Period[] = ["am", "pm"];

const to24 = (hour12: number, period: Period) =>
  (hour12 % 12) + (period === "pm" ? 12 : 0);

export function TimeField({
  label,
  value,
  timeZone,
  onChange,
  onStep,
  canStepBack = true,
  canStepForward = true,
  disabled = false,
  minMinutes = 0,
  maxMinutes = 24 * 60,
}: {
  label: string;
  value: Date | null;
  timeZone: string;
  /** Given minutes from local midnight, as typed or picked. */
  onChange: (minutesFromMidnight: number) => void;
  /** Omit to drop the nudge buttons. */
  onStep?: (deltaMinutes: number) => void;
  canStepBack?: boolean;
  canStepForward?: boolean;
  disabled?: boolean;
  /** The window the list offers; typing is not restricted to it. */
  minMinutes?: number;
  maxMinutes?: number;
}) {
  const current = value ? minutesOfDay(value, timeZone) : null;
  const settled = current === null ? "" : formatMinutesOfDay(current);

  // Null while the field is showing the value; a string once it is being typed
  // into, so a half-finished "9:" is never parsed out from under the cursor.
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The three parts of what is showing, so each column knows what is chosen.
  // With nothing set yet, the picker starts at the top of the window.
  const base = current ?? minMinutes;
  const hour24 = Math.floor(base / 60);
  const period: Period = hour24 < 12 ? "am" : "pm";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minute = base % 60;

  const compose = (parts: {
    hour12?: number;
    minute?: number;
    period?: Period;
  }) =>
    to24(parts.hour12 ?? hour12, parts.period ?? period) * 60 +
    (parts.minute ?? minute);

  /** In the working window, which is all the columns offer. */
  const allowed = (minutes: number) =>
    minutes >= minMinutes && minutes <= maxMinutes;

  /**
   * A half of the day is offered whenever any of it is bookable — judging it by
   * the hour that happens to be chosen would strand someone on 9am with the pm
   * column greyed out and no way across.
   */
  const periodAllowed = (p: Period) => {
    const from = p === "am" ? 0 : 12 * 60;
    return from <= maxMinutes && from + 12 * 60 - 1 >= minMinutes;
  };

  const commit = (text: string) => {
    const parsed = parseTimeInput(text);
    if (parsed !== null) onChange(parsed);
    setDraft(null);
  };

  const take = (parts: {
    hour12?: number;
    minute?: number;
    period?: Period;
  }) => {
    onChange(compose(parts));
    setDraft(null);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Escape closes the picker and goes no further — a drawer or dialog around
  // this field listens for escape too, and should not close along with it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Each column opens on its own current value rather than at the top.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelectorAll('[data-current="true"]')
      .forEach((cell) => cell.scrollIntoView({ block: "center" }));
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      <div className="relative" ref={boxRef}>
        <div
          className="bg-surface flex items-center gap-1 rounded-[10px] px-1.5 py-1.5"
          style={{ boxShadow: "var(--ring)", opacity: disabled ? 0.5 : 1 }}
        >
          {onStep && (
            <StepButton
              icon="chevronLeft"
              label={`${label} earlier`}
              onClick={
                canStepBack && !disabled
                  ? () => onStep(-SNAP_MINUTES)
                  : undefined
              }
            />
          )}

          <input
            value={draft ?? settled}
            disabled={disabled}
            inputMode="numeric"
            aria-label={label}
            placeholder="--:--"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(e.currentTarget.value);
                setOpen(false);
              } else if (e.key === "Escape") {
                // Only the picker gets dismissed; a dialog around this field
                // stays put.
                if (open) e.stopPropagation();
                setDraft(null);
                setOpen(false);
              } else if (e.key === "ArrowDown" && !open) {
                e.preventDefault();
                setOpen(true);
              } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                // Nudging from the keyboard beats retyping the whole time.
                e.preventDefault();
                if (current !== null) {
                  onChange(
                    current + (e.key === "ArrowUp" ? 1 : -1) * SNAP_MINUTES,
                  );
                }
              }
            }}
            className="text-title min-w-0 flex-1 bg-transparent text-center font-mono text-[13px] font-bold outline-none"
          />

          <button
            type="button"
            disabled={disabled}
            aria-label={`Choose ${label.toLowerCase()}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md"
          >
            <Icon name="chevronDown" size={12} color="var(--muted)" />
          </button>

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

        {/*
         * Hour, minute and am/pm as three short columns rather than one long
         * list of every quarter hour: picking 2:30pm is three glances instead
         * of a scroll through forty rows.
         */}
        {open && !disabled && (
          <div
            ref={listRef}
            className="bg-surface absolute z-30 mt-1 flex w-full min-w-[186px] gap-1 rounded-[10px] p-1.5"
            style={{ boxShadow: "var(--ring), var(--shadow-float)" }}
            onClick={(e) => e.preventDefault()}
          >
            <Column label="Hour">
              {HOURS.map((h) => (
                <Cell
                  key={h}
                  current={h === hour12}
                  // An hour is offered when any minute of it is bookable.
                  disabled={
                    !allowed(compose({ hour12: h, minute: 0 })) &&
                    !allowed(compose({ hour12: h, minute: 55 }))
                  }
                  onPick={() => take({ hour12: h })}
                >
                  {h}
                </Cell>
              ))}
            </Column>

            <Column label="Minute">
              {MINUTES.map((m) => (
                <Cell
                  key={m}
                  current={m === minute}
                  disabled={!allowed(compose({ minute: m }))}
                  onPick={() => take({ minute: m })}
                >
                  {String(m).padStart(2, "0")}
                </Cell>
              ))}
            </Column>

            <Column label="AM/PM">
              {PERIODS.map((p) => (
                <Cell
                  key={p}
                  current={p === period}
                  disabled={!periodAllowed(p)}
                  onPick={() => take({ period: p })}
                >
                  {p}
                </Cell>
              ))}
            </Column>
          </div>
        )}
      </div>
    </div>
  );
}

/** Keeps a minutes-from-midnight value inside a window. */
export const clampMinutes = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/** One scrolling column of the picker. */
function Column({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-faint pb-1 text-center font-mono text-[10px] font-bold tracking-wider uppercase">
        {label}
      </div>
      <div
        role="listbox"
        aria-label={label}
        className="plr-scroll flex max-h-[180px] flex-col gap-0.5 overflow-y-auto"
      >
        {children}
      </div>
    </div>
  );
}

function Cell({
  current,
  disabled,
  onPick,
  children,
}: {
  current: boolean;
  disabled?: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={current}
      aria-disabled={disabled}
      data-current={current}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      className="shrink-0 rounded-lg py-1 text-center font-mono text-[12.5px] font-semibold"
      style={{
        background: current ? "var(--slate)" : "transparent",
        color: current ? "#fff" : "var(--app-title)",
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

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
