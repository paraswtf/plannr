"use client";

import { useRef, useState } from "react";

import {
  formatFullDate,
  formatMonthLabel,
  fromWallTime,
  toWallTime,
} from "~/lib/dates";
import { Icon } from "./icon";
import { Popover } from "./popover";

/**
 * A day, chosen from a month grid.
 *
 * Everything the app shows is a wall-clock day in the institution's timezone,
 * so this works in calendar fields (year, month, day) and only converts to an
 * instant at the moment of choosing. The month arithmetic runs against UTC
 * proxies, which is safe because it is pure calendar counting — no instant ever
 * passes through it.
 */

interface Ymd {
  year: number;
  month: number; // 1-12
  day: number;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const proxy = ({ year, month, day }: Ymd) => Date.UTC(year, month - 1, day);
const fromProxy = (ms: number): Ymd => {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
};
const shiftDays = (ymd: Ymd, days: number) =>
  fromProxy(proxy(ymd) + days * 86_400_000);
const sameYmd = (a: Ymd, b: Ymd) =>
  a.year === b.year && a.month === b.month && a.day === b.day;

export function DatePicker({
  value,
  onChange,
  timeZone,
  size = "md",
  ariaLabel = "Date",
  className,
}: {
  /** The chosen day, as an instant; read in `timeZone`. */
  value: Date;
  /** Given local midnight of the day picked. */
  onChange: (day: Date) => void;
  timeZone: string;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const wall = toWallTime(value, timeZone);
  const selected: Ymd = {
    year: wall.year,
    month: wall.month,
    day: wall.day,
  };
  const todayWall = toWallTime(new Date(), timeZone);
  const today: Ymd = {
    year: todayWall.year,
    month: todayWall.month,
    day: todayWall.day,
  };

  // The month on screen and the cell the keyboard is on. Both are reset from
  // the value each time the grid opens, so it never comes back somewhere else.
  const [view, setView] = useState({ year: wall.year, month: wall.month });
  const [cursor, setCursor] = useState<Ymd>(selected);

  const show = () => {
    setView({ year: selected.year, month: selected.month });
    setCursor(selected);
    setOpen(true);
  };

  const choose = (ymd: Ymd) => {
    onChange(fromWallTime({ ...ymd, hour: 0, minute: 0, second: 0 }, timeZone));
    setOpen(false);
  };

  const moveCursor = (days: number) => {
    const next = shiftDays(cursor, days);
    setCursor(next);
    setView({ year: next.year, month: next.month });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        show();
      }
      return;
    }
    const by: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    };
    if (by[e.key] !== undefined) {
      e.preventDefault();
      moveCursor(by[e.key]!);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(cursor);
    } else if (e.key === "Escape" || e.key === "Tab") {
      // Escape closes the grid, and stops there: a control inside a dialog
      // should not take the dialog down with it.
      if (e.key === "Escape") e.stopPropagation();
      setOpen(false);
    }
  };

  // Six weeks from the Monday on or before the 1st: enough for any month, and
  // a fixed height so the popover does not jump between months.
  const firstOfMonth: Ymd = { year: view.year, month: view.month, day: 1 };
  const leadIn = (new Date(proxy(firstOfMonth)).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) =>
    shiftDays(firstOfMonth, i - leadIn),
  );

  const pad =
    size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-2 text-[13px]";

  return (
    <div className={className} ref={boxRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`bg-surface text-title flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] text-left font-medium lg:min-h-0 ${pad}`}
        style={{ boxShadow: "var(--ring)" }}
      >
        {/*
          `truncate` has to sit on the text itself. On the row it used to be on
          it did nothing at all: that row is an inline-flex, and clipping a flex
          container does not shorten the items inside it — so the date kept its
          full width and pushed whatever held it. The icons are pinned for the
          same reason, or they would be squeezed to slivers before the words
          they sit beside gave up a single character.
        */}
        <span className="inline-flex min-w-0 items-center gap-2">
          <Icon
            name="calendar"
            size={size === "sm" ? 13 : 15}
            color="var(--muted)"
            className="shrink-0"
          />
          <span className="truncate">{formatFullDate(value, timeZone)}</span>
        </span>
        <Icon
          name="chevronDown"
          size={size === "sm" ? 12 : 14}
          color="var(--muted)"
          className="shrink-0"
        />
      </button>

      <Popover
        open={open}
        anchorRef={boxRef}
        onClose={() => setOpen(false)}
        role="dialog"
        ariaLabel={ariaLabel}
        // 312px is what seven 40px cells, six 2px gaps and the panel's own
        // padding come to: a touch-sized grid measured backwards. It gives that
        // up rather than run past the edge of a window too narrow to hold it —
        // the start of the month is worth more than square cells — and scrolls
        // rather than run past the bottom of one too short, which a phone in
        // landscape with a keyboard up genuinely is.
        className="bg-surface plr-scroll w-[312px] overflow-y-auto rounded-[12px] p-2.5 sm:w-[268px]"
        style={{ boxShadow: "var(--ring), var(--shadow-float)" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <MonthStep
            icon="chevronLeft"
            label="Previous month"
            onClick={() =>
              setView(({ year, month }) =>
                month === 1
                  ? { year: year - 1, month: 12 }
                  : { year, month: month - 1 },
              )
            }
          />
          <span className="font-display text-title text-[13.5px] font-bold">
            {formatMonthLabel(view.year, view.month)}
          </span>
          <MonthStep
            icon="chevronRight"
            label="Next month"
            onClick={() =>
              setView(({ year, month }) =>
                month === 12
                  ? { year: year + 1, month: 1 }
                  : { year, month: month + 1 },
              )
            }
          />
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((letter, i) => (
            <span
              key={i}
              className="text-faint pb-1 text-center font-mono text-[10.5px] font-bold"
            >
              {letter}
            </span>
          ))}

          {cells.map((cell) => {
            const inMonth = cell.month === view.month;
            const isSelected = sameYmd(cell, selected);
            const isToday = sameYmd(cell, today);
            const isCursor = sameYmd(cell, cursor);
            return (
              <button
                key={proxy(cell)}
                type="button"
                aria-current={isSelected ? "date" : undefined}
                onClick={() => choose(cell)}
                onMouseEnter={() => setCursor(cell)}
                className="plr-clip flex h-10 cursor-pointer items-center justify-center rounded-[8px] text-[12.5px] font-semibold sm:h-8"
                style={{
                  background: isSelected
                    ? "var(--slate)"
                    : isCursor
                      ? "rgba(68,88,121,0.08)"
                      : "transparent",
                  color: isSelected
                    ? "#fff"
                    : inMonth
                      ? "var(--app-title)"
                      : "var(--faint)",
                  boxShadow:
                    isToday && !isSelected
                      ? "inset 0 0 0 1px var(--slate-muted)"
                      : undefined,
                }}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => choose(today)}
          className="text-slate mt-2 w-full cursor-pointer rounded-[8px] py-2.5 text-[12.5px] font-semibold sm:py-1.5"
          style={{ background: "rgba(68,88,121,0.07)" }}
        >
          Today
        </button>
      </Popover>
    </div>
  );
}

function MonthStep({
  icon,
  label,
  onClick,
}: {
  icon: "chevronLeft" | "chevronRight";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      // Changing month is the one thing in the grid that does not close it, so
      // it is the one thing that could leave the caret parked inside a panel
      // hanging off <body>: arrow keys, which the trigger listens for, would
      // stop moving the day cursor, and Tab would walk out of the dialog the
      // grid was opened in rather than around it. Keeping focus where it was
      // costs nothing — the button is reached with a pointer either way.
      onMouseDown={(e) => e.preventDefault()}
      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg sm:h-7 sm:w-7"
      style={{ background: "rgba(68,88,121,0.07)" }}
    >
      <Icon name={icon} size={13} color="var(--slate)" stroke={2.2} />
    </button>
  );
}
