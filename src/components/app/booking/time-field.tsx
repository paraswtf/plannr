"use client";

import { useEffect, useRef, useState } from "react";

import { IconButton } from "~/components/ui/button";
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

/**
 * The frame a stepped value sits in: the time here, the number of dates in the
 * booking panel's repeat options.
 *
 * It is the field's own look (`fieldClass`), drawn on a box rather than on the
 * input, because the input is only the middle of it: the nudges and the picker
 * toggle live inside the same ring. So the focus ring answers to the input
 * inside being focused (`has-[input:focus]`) rather than to the box, which can
 * never be focused itself, and it stays lit while the picker hangs open, the
 * way a picker trigger's does. A nudge focused from the keyboard keeps the
 * global outline of its own and does not light the whole field.
 *
 * 4px of padding around 28px controls makes it 36px tall from `lg`, the height
 * of every other field in the panel; below that the controls are thumb-sized
 * and the field grows to fit them.
 */
export const STEPPER_FIELD =
  "bg-field flex items-center gap-1 rounded-[var(--radius-btn)] p-1 shadow-[inset_0_0_0_1px_var(--field-line)] transition-[box-shadow] duration-150 ease-out hover:shadow-[inset_0_0_0_1px_var(--field-line-hover)] has-[input:focus]:shadow-[inset_0_0_0_1.5px_var(--focus),0_0_0_3px_var(--focus-halo)] has-[[aria-expanded=true]]:shadow-[inset_0_0_0_1.5px_var(--focus),0_0_0_3px_var(--focus-halo)]";

/** The label above a stepped field, in the shared field label's type. */
export const FIELD_LABEL = "text-title text-xs font-semibold";

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
      <span className={FIELD_LABEL}>{label}</span>
      <div className="relative" ref={boxRef}>
        <div className={`${STEPPER_FIELD} ${disabled ? "opacity-50" : ""}`}>
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
            // The field's frame draws the focus ring, so the input itself opts
            // out of the global outline. 16px on a phone, where iOS zooms into
            // anything smaller; semibold rather than bold, because the time
            // was the heaviest type on the form and louder than the room.
            className="text-title placeholder:text-placeholder min-w-0 flex-1 bg-transparent text-center font-mono text-[16px] font-semibold tabular-nums outline-none sm:text-sm"
          />

          <IconButton
            variant="ghost"
            size="xs"
            icon="chevronDown"
            iconSize={13}
            disabled={disabled}
            label={`Choose ${label.toLowerCase()}`}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
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

        {/*
         * Hour, minute and am/pm as three short columns rather than one long
         * list of every quarter hour: picking 2:30pm is three glances instead
         * of a scroll through forty rows.
         */}
        {open && !disabled && (
          <div
            ref={listRef}
            // Never wider than the narrowest field it hangs off — 180px in the
            // docked booking panel — or the panel gains a sideways scrollbar.
            // A raised panel, like every other picker's: the 12px corner less
            // its 6px of padding is the 6px each option is rounded to.
            className="bg-surface absolute z-30 mt-1 flex w-full min-w-[168px] gap-1 rounded-[12px] p-1.5 shadow-[var(--ring),var(--shadow-md)]"
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

            <Column label="AM/PM" heading="am/pm">
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
  heading = label,
  children,
}: {
  /** The listbox's accessible name. */
  label: string;
  /**
   * What the column says above itself, when that should differ from the
   * name: the cells read "am" and "pm", so the head does too.
   */
  heading?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      {/* Sentence case in the body face: a small head, not a mono stamp. */}
      <div className="text-2xs text-muted pb-1 text-center font-semibold">
        {heading}
      </div>
      <div
        role="listbox"
        aria-label={label}
        className="plr-scroll flex max-h-[240px] flex-col gap-0.5 overflow-y-auto lg:max-h-[180px]"
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
      // The chosen value is the selected row of every other list in the app:
      // a slate wash with slate ink, not a solid slate block.
      className={`flex min-h-10 shrink-0 items-center justify-center rounded-[6px] font-mono text-sm font-semibold tabular-nums transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-0 lg:py-1 ${
        current
          ? "bg-tint-selected text-slate-ink"
          : "text-title enabled:hover:bg-tint-hover cursor-pointer"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A quarter hour earlier or later, or one date fewer or more: the nudge either
 * side of a stepped field. Disabled by leaving out `onClick`.
 */
export function StepButton({
  icon,
  label,
  onClick,
}: {
  icon: "chevronLeft" | "chevronRight";
  label: string;
  onClick?: () => void;
}) {
  return (
    <IconButton
      variant="quiet"
      size="xs"
      icon={icon}
      label={label}
      onClick={onClick}
      disabled={!onClick}
      className="disabled:active:scale-100"
    />
  );
}
