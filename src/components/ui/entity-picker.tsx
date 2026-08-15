"use client";

import { useEffect, useRef, useState } from "react";

import { EntityCardBody, type EntityCard } from "./entity-card";
import { Icon } from "./icon";

export type { EntityCard } from "./entity-card";
export { initialsOf } from "./entity-card";

export interface PickerOption {
  id: string;
  label: string;
  hint?: string | null;
  /** Rich result card. Falls back to label/hint when absent. */
  card?: EntityCard;
  /** Listed but not choosable — the hint should say why. */
  disabled?: boolean;
}

export interface PickerPage {
  rows: PickerOption[];
  total: number;
  hasMore: boolean;
}

/** Turns a row into the shape both controls render. */
const toCard = (o: PickerOption): EntityCard =>
  o.card ?? { label: o.label, title: o.label, subtitle: o.hint };

/**
 * Keyboard handling shared by both controls: arrows move the highlight, enter
 * takes it, escape closes.
 */
function useActiveIndex(
  count: number,
  onPick: (i: number) => void,
  onClose: () => void,
) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [count]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (count === 0 ? 0 : (i + 1) % count));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (count === 0 ? 0 : (i - 1 + count) % count));
    } else if (e.key === "Enter") {
      if (count > 0) {
        e.preventDefault();
        onPick(active);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return { active, setActive, onKeyDown };
}

const rowBackground = (selected: boolean, active: boolean) =>
  selected
    ? "rgba(68,88,121,0.08)"
    : active
      ? "rgba(68,88,121,0.06)"
      : "transparent";

/**
 * Multi-select over a list too long to render in full.
 *
 * Chosen items always show as chips — the query that feeds this pins them, so
 * a search that excludes them cannot make them silently disappear. Everything
 * else is a page of result cards narrowed by typing, never the whole directory.
 */
export function EntityPicker({
  selected,
  onChange,
  page,
  query,
  onQueryChange,
  onLoadMore,
  loading = false,
  disabled = false,
  placeholder = "Search…",
  emptyLabel = "Nothing selected",
  listId,
}: {
  selected: PickerOption[];
  onChange: (ids: string[]) => void;
  page: PickerPage | undefined;
  query: string;
  onQueryChange: (q: string) => void;
  onLoadMore?: () => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  listId?: string;
}) {
  const selectedIds = selected.map((s) => s.id);
  const [open, setOpen] = useState(false);
  const rows = page?.rows ?? [];

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  const { active, setActive, onKeyDown } = useActiveIndex(
    rows.length,
    (i) => rows[i] && toggle(rows[i].id),
    () => setOpen(false),
  );

  const base = listId ?? "entity-picker";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {selected.length > 0 ? (
          selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2 pl-3 text-[12.5px] font-semibold text-white"
              style={{ background: "var(--slate)" }}
            >
              {s.label}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-label={`Remove ${s.label}`}
                  className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full"
                  style={{ background: "rgba(255,255,255,0.25)" }}
                >
                  <Icon name="x" size={10} color="#fff" stroke={3} />
                </button>
              )}
            </span>
          ))
        ) : (
          <span className="text-faint py-1.5 text-[12.5px]">{emptyLabel}</span>
        )}
      </div>

      {!disabled && (
        <>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
              <Icon name="search" size={14} color="var(--faint)" />
            </span>
            <input
              value={query}
              onChange={(e) => {
                onQueryChange(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              role="combobox"
              aria-expanded={open}
              aria-controls={`${base}-list`}
              aria-autocomplete="list"
              aria-activedescendant={
                open && rows[active]
                  ? `${base}-opt-${rows[active].id}`
                  : undefined
              }
              className="bg-surface w-full rounded-[10px] py-2 pr-3 pl-9 text-[13px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
          </div>

          {open && (
            <div
              id={`${base}-list`}
              role="listbox"
              aria-multiselectable
              className="plr-scroll max-h-[280px] overflow-y-auto rounded-[10px]"
              style={{ boxShadow: "var(--ring)" }}
            >
              {loading && !page ? (
                <p className="text-muted p-3 text-[12.5px]">Searching…</p>
              ) : rows.length > 0 ? (
                <>
                  {rows.map((o, i) => {
                    const on = selectedIds.includes(o.id);
                    return (
                      <div
                        key={o.id}
                        id={`${base}-opt-${o.id}`}
                        role="option"
                        aria-selected={on}
                        onMouseEnter={() => setActive(i)}
                        // Keeps focus in the input so typing continues to work.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggle(o.id)}
                        className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left"
                        style={{
                          boxShadow: "inset 0 -1px 0 var(--hair-soft)",
                          background: rowBackground(on, i === active),
                        }}
                      >
                        <span
                          className="mt-0.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px]"
                          style={{
                            background: on ? "var(--slate)" : "var(--surface)",
                            boxShadow: on ? "none" : "var(--ring)",
                          }}
                        >
                          {on && (
                            <Icon
                              name="check"
                              size={11}
                              color="#fff"
                              stroke={3}
                            />
                          )}
                        </span>
                        <EntityCardBody card={toCard(o)} />
                      </div>
                    );
                  })}
                  {page?.hasMore && (
                    <button
                      type="button"
                      onClick={onLoadMore}
                      className="text-slate w-full cursor-pointer px-3 py-2 text-[12.5px] font-semibold"
                    >
                      Load more ({page.total - rows.length} more)
                    </button>
                  )}
                </>
              ) : (
                <p className="text-muted p-3 text-[12.5px]">
                  {query ? "No matches." : "Type to search."}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Debounces a value so a search query does not fire on every keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Single-select over a paged list. Same contract as EntityPicker: the chosen
 * option is pinned by the query feeding it, so it survives a search that would
 * otherwise exclude it.
 */
export function SearchSelect({
  value,
  onChange,
  page,
  query,
  onQueryChange,
  onLoadMore,
  loading = false,
  disabled = false,
  placeholder = "Search…",
  emptyOption,
  listId,
}: {
  value: PickerOption | null;
  onChange: (id: string | null) => void;
  page: PickerPage | undefined;
  query: string;
  onQueryChange: (q: string) => void;
  onLoadMore?: () => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Label for a "none" choice, when the field is optional. */
  emptyOption?: string;
  listId?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const rows = page?.rows ?? [];

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  const { active, setActive, onKeyDown } = useActiveIndex(
    rows.length,
    (i) => {
      const row = rows[i];
      if (row && !row.disabled) pick(row.id);
    },
    () => setOpen(false),
  );

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

  const base = listId ?? "search-select";

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="bg-surface flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-[13px]"
        style={{
          boxShadow: "var(--ring)",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <span className={value ? "text-title font-medium" : "text-faint"}>
          {value?.label ?? emptyOption ?? placeholder}
        </span>
        <Icon name="chevronDown" size={14} color="var(--muted)" />
      </button>

      {open && !disabled && (
        <div
          className="bg-surface absolute z-30 mt-1 w-full rounded-[10px] p-1.5"
          style={{ boxShadow: "var(--ring), var(--shadow-float)" }}
          // Callers wrap this control in a <label>, and a <button> is
          // labelable: without this, picking a row would also forward a click
          // to the toggle and pop the list straight back open.
          onClick={(e) => e.preventDefault()}
        >
          <div className="relative mb-1.5">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
              <Icon name="search" size={13} color="var(--faint)" />
            </span>
            <input
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              role="combobox"
              aria-expanded={open}
              aria-controls={`${base}-list`}
              aria-autocomplete="list"
              aria-activedescendant={
                rows[active] ? `${base}-opt-${rows[active].id}` : undefined
              }
              className="bg-paper w-full rounded-lg py-1.5 pr-2 pl-8 text-[12.5px] outline-none"
            />
          </div>

          <div
            id={`${base}-list`}
            role="listbox"
            className="plr-scroll max-h-[260px] overflow-y-auto"
          >
            {emptyOption && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="text-muted w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[12.5px]"
              >
                {emptyOption}
              </button>
            )}
            {loading && !page ? (
              <p className="text-muted p-2 text-[12.5px]">Searching…</p>
            ) : rows.length > 0 ? (
              <>
                {rows.map((o, i) => (
                  <div
                    key={o.id}
                    id={`${base}-opt-${o.id}`}
                    role="option"
                    aria-selected={o.id === value?.id}
                    aria-disabled={o.disabled}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => !o.disabled && pick(o.id)}
                    className="flex items-start gap-2.5 rounded-lg px-2.5 py-2"
                    style={{
                      background: o.disabled
                        ? "transparent"
                        : rowBackground(o.id === value?.id, i === active),
                      cursor: o.disabled ? "not-allowed" : "pointer",
                      opacity: o.disabled ? 0.45 : 1,
                    }}
                  >
                    <EntityCardBody card={toCard(o)} />
                  </div>
                ))}
                {page?.hasMore && (
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="text-slate w-full cursor-pointer px-2.5 py-1.5 text-[12px] font-semibold"
                  >
                    Load more ({page.total - rows.length} more)
                  </button>
                )}
              </>
            ) : (
              <p className="text-muted p-2 text-[12.5px]">No matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
