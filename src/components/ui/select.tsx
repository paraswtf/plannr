"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "./icon";

/**
 * A short list of choices, drawn the way the rest of the app is drawn.
 *
 * The browser's own `<select>` renders as the operating system sees fit, which
 * is the one control on these screens that ignored the design language. This is
 * the same popover as {@link SearchSelect} with the search box taken out — that
 * one is for lists too long to read, this one is for lists you pick from at a
 * glance.
 */

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Second line, for a count or a qualifier. */
  hint?: string;
  disabled?: boolean;
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
  placeholder = "Select…",
  ariaLabel,
  className,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // Opening lands the highlight on what is already chosen, so arrowing moves
  // from there rather than from the top of the list.
  const show = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const pick = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const step = (delta: number) => {
    if (options.length === 0) return;
    setActive((i) => {
      let next = i;
      // Skip past anything that cannot be chosen, giving up after one full lap
      // so a list of nothing but disabled options cannot spin forever.
      let remaining = options.length;
      while (remaining-- > 0) {
        next = (next + delta + options.length) % options.length;
        if (!options[next]?.disabled) break;
      }
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      // Escape dismisses the list, and stops there: a control inside a dialog
      // should not take the dialog down with it.
      if (e.key === "Escape") e.stopPropagation();
      setOpen(false);
    }
  };

  // Clicking away closes the popover; without this it survives until the next
  // toggle, which reads as the control being stuck open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Escape closes the list and goes no further. Taken during the capture phase
  // because a dialog wrapping this control listens for escape on the document,
  // and dismissing a dropdown must not dismiss the form behind it.
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

  const pad =
    size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-2 text-[13px]";

  return (
    <div className={`relative ${className ?? ""}`} ref={boxRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`bg-surface text-ink flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] text-left font-medium ${pad}`}
        style={{ boxShadow: "var(--ring)" }}
      >
        <span className={selected ? "text-title truncate" : "text-faint"}>
          {selected?.label ?? placeholder}
        </span>
        <Icon
          name="chevronDown"
          size={size === "sm" ? 12 : 14}
          color="var(--muted)"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="bg-surface plr-scroll absolute z-30 mt-1 max-h-[280px] w-full min-w-max overflow-y-auto rounded-[10px] p-1.5"
          style={{ boxShadow: "var(--ring), var(--shadow-float)" }}
          // Callers put this inside a <label>, and a <button> is labelable:
          // without this, picking a row would also forward a click to the
          // trigger and pop the list straight back open.
          onClick={(e) => e.preventDefault()}
        >
          {options.map((option, i) => {
            const isSelected = option.value === value;
            return (
              <div
                key={String(option.value)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                style={{
                  background: option.disabled
                    ? "transparent"
                    : isSelected
                      ? "rgba(68,88,121,0.08)"
                      : i === active
                        ? "rgba(68,88,121,0.06)"
                        : "transparent",
                  cursor: option.disabled ? "not-allowed" : "pointer",
                  opacity: option.disabled ? 0.45 : 1,
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-title block truncate text-[12.5px] font-medium">
                    {option.label}
                  </span>
                  {option.hint && (
                    <span className="text-faint block truncate text-[11px]">
                      {option.hint}
                    </span>
                  )}
                </span>
                {isSelected && (
                  <Icon
                    name="check"
                    size={12}
                    color="var(--slate)"
                    stroke={3}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
