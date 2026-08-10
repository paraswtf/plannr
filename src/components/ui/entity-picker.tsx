"use client";

import { useEffect, useState } from "react";

import { Icon } from "./icon";

export interface PickerOption {
  id: string;
  label: string;
  hint?: string | null;
}

export interface PickerPage {
  rows: PickerOption[];
  total: number;
  hasMore: boolean;
}

/**
 * Multi-select over a list too long to render in full.
 *
 * Chosen items always show as chips — the query that feeds this pins them, so
 * a search that excludes them cannot make them silently disappear. Everything
 * else is a page of results narrowed by typing, never the whole directory.
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
}) {
  const selectedIds = selected.map((s) => s.id);
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

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
              placeholder={placeholder}
              className="bg-surface w-full rounded-[10px] py-2 pr-3 pl-9 text-[13px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
          </div>

          {open && (
            <div
              className="plr-scroll max-h-[210px] overflow-y-auto rounded-[10px]"
              style={{ boxShadow: "var(--ring)" }}
            >
              {loading && !page ? (
                <p className="text-muted p-3 text-[12.5px]">Searching…</p>
              ) : page && page.rows.length > 0 ? (
                <>
                  {page.rows.map((o) => {
                    const on = selectedIds.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggle(o.id)}
                        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left"
                        style={{
                          boxShadow: "inset 0 -1px 0 var(--hair-soft)",
                          background: on
                            ? "rgba(68,88,121,0.06)"
                            : "transparent",
                        }}
                      >
                        <span
                          className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px]"
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
                        <span className="min-w-0 flex-1">
                          <span className="text-title block truncate text-[13px] font-semibold">
                            {o.label}
                          </span>
                          {o.hint && (
                            <span className="text-faint block truncate text-[11.5px]">
                              {o.hint}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  {page.hasMore && (
                    <button
                      type="button"
                      onClick={onLoadMore}
                      className="text-slate w-full cursor-pointer px-3 py-2 text-[12.5px] font-semibold"
                    >
                      Load more ({page.total - page.rows.length} more)
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
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
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
        >
          <div className="relative mb-1.5">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
              <Icon name="search" size={13} color="var(--faint)" />
            </span>
            <input
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder}
              className="bg-paper w-full rounded-lg py-1.5 pr-2 pl-8 text-[12.5px] outline-none"
            />
          </div>

          <div className="plr-scroll max-h-[200px] overflow-y-auto">
            {emptyOption && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-muted w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[12.5px]"
              >
                {emptyOption}
              </button>
            )}
            {loading && !page ? (
              <p className="text-muted p-2 text-[12.5px]">Searching…</p>
            ) : page && page.rows.length > 0 ? (
              <>
                {page.rows.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className="w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left"
                    style={{
                      background:
                        o.id === value?.id
                          ? "rgba(68,88,121,0.08)"
                          : "transparent",
                    }}
                  >
                    <span className="text-title block truncate text-[12.5px] font-medium">
                      {o.label}
                    </span>
                    {o.hint && (
                      <span className="text-faint block truncate text-[11px]">
                        {o.hint}
                      </span>
                    )}
                  </button>
                ))}
                {page.hasMore && (
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="text-slate w-full cursor-pointer px-2.5 py-1.5 text-[12px] font-semibold"
                  >
                    Load more ({page.total - page.rows.length} more)
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
