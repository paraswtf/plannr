"use client";

import { useEffect, useRef, useState } from "react";

import { EntityCardBody, type EntityCard } from "./entity-card";
import { triggerClass } from "./field";
import { Icon } from "./icon";
import { Popover } from "./popover";

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

/**
 * A page from a `groups.*`-style list procedure, as the two controls want it.
 *
 * They only ever ask whether there is another page, while the API answers with
 * `page` and `pageCount` — which is the honest form, because a list that pins
 * the chosen rows into its page can hand back more rows than it was asked for
 * and counting them proves nothing. Derived once here rather than at each of
 * the dozen call sites, all of which used to spread a `hasMore` the server
 * computed for them.
 *
 * The mapper takes the whole array rather than a row: a couple of pickers drop
 * rows before drawing them — the group already in the room does not want
 * offering as a second occupant of it — and doing that outside the helper would
 * mean unpacking the envelope again.
 */
export function pickerPage<T>(
  page:
    { rows: T[]; total: number; page: number; pageCount: number } | undefined,
  toOptions: (rows: T[]) => PickerOption[],
): PickerPage | undefined {
  return (
    page && {
      rows: toOptions(page.rows),
      total: page.total,
      hasMore: page.page < page.pageCount,
    }
  );
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

/** The wash behind a result: chosen beats hovered, and neither is a fill. */
const rowBackground = (selected: boolean, active: boolean) =>
  selected ? "bg-tint-selected" : active ? "bg-tint-hover" : "";

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
  id,
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
  /**
   * The id of the search box, which is what a `<label htmlFor>` should name:
   * it is the part that takes the caret. Pass the id `Field` hands its render
   * function, and the visible label becomes the control's accessible name.
   */
  id?: string;
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
              // A chosen item is a tile in the selected wash, not a slate pill:
              // a dialog with a dozen students picked was a dozen dark blots,
              // each louder than the button that saves them.
              className="bg-tint-selected text-slate-ink inline-flex max-w-full items-center gap-1.5 rounded-[8px] py-1 pr-1.5 pl-2.5 text-xs font-semibold shadow-[inset_0_0_0_1px_var(--hair)]"
            >
              {/*
               * A chip is one line, and a room or group with a long name is
               * not: left to itself the label would push the chip wider than
               * the screen. It gives way instead, and the remove button's
               * accessible name still carries it in full.
               */}
              <span className="min-w-0 truncate">{s.label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-label={`Remove ${s.label}`}
                  // The cross stays the size the chip was drawn at; what grows
                  // for a finger is an invisible pad around it, since a 40px
                  // button would be taller than the chip holding it.
                  className="hover:bg-tint-strong relative flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] transition-colors duration-150 before:absolute before:-inset-2.5 before:content-['']"
                >
                  <Icon name="x" size={10} stroke={3} />
                </button>
              )}
            </span>
          ))
        ) : (
          <span className="text-faint py-1.5 text-sm">{emptyLabel}</span>
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
              onKeyDown={(e) => {
                // Escape dismisses the suggestions and stops there. This is the
                // one list in the file that stays in the page rather than going
                // through `Popover`, so nothing upstream takes the key for it:
                // left alone it reaches the dialog listening on the document
                // and closes the whole form, losing a half-filled booking to a
                // keypress meant for a dropdown. With the list already down it
                // is not this control's key to take.
                if (e.key === "Escape" && open) e.stopPropagation();
                onKeyDown(e);
              }}
              placeholder={placeholder}
              id={id}
              role="combobox"
              aria-expanded={open}
              aria-controls={`${base}-list`}
              aria-autocomplete="list"
              aria-activedescendant={
                open && rows[active]
                  ? `${base}-opt-${rows[active].id}`
                  : undefined
              }
              // Text below 16px makes mobile Safari zoom the page in the moment
              // the field takes focus, and a zoomed page is one that scrolls
              // sideways; the pointer size comes back at the first breakpoint.
              className="bg-field text-title placeholder:text-placeholder min-h-10 w-full rounded-[10px] py-2 pr-3 pl-9 text-[16px] shadow-[inset_0_0_0_1px_var(--field-line)] transition-[box-shadow] duration-150 outline-none hover:shadow-[inset_0_0_0_1px_var(--field-line-hover)] focus:shadow-[inset_0_0_0_1.5px_var(--focus),0_0_0_3px_var(--focus-halo)] sm:min-h-0 sm:text-sm"
            />
          </div>

          {open && (
            <div
              id={`${base}-list`}
              role="listbox"
              aria-multiselectable
              className="plr-scroll bg-surface max-h-[280px] overflow-y-auto rounded-[12px] shadow-[var(--ring)]"
            >
              {loading && !page ? (
                <p className="text-muted p-3 text-sm">Searching…</p>
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
                        className={`flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left shadow-[inset_0_-1px_0_var(--hair-soft)] ${rowBackground(on, i === active)}`}
                      >
                        <span
                          className={`mt-0.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] ${
                            on
                              ? "bg-slate"
                              : "bg-surface shadow-[inset_0_0_0_1px_var(--field-line)]"
                          }`}
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
                      className="text-slate hover:bg-tint-hover min-h-10 w-full cursor-pointer px-3 py-2 text-sm font-semibold transition-colors duration-150 lg:min-h-0"
                    >
                      Show {page.total - rows.length} more
                    </button>
                  )}
                </>
              ) : (
                <p className="text-muted p-3 text-sm">
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
  id,
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
  /**
   * The id of the trigger button, for a `<label htmlFor>` to name — pass the
   * id `Field` hands its render function.
   */
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  const base = listId ?? "search-select";

  return (
    <div ref={boxRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={triggerClass("md", disabled ? "cursor-default" : "")}
      >
        <span
          className={`min-w-0 truncate ${value ? "text-title font-medium" : "text-placeholder font-normal"}`}
        >
          {value?.label ?? emptyOption ?? placeholder}
        </span>
        <Icon name="chevronDown" size={14} color="var(--muted)" />
      </button>

      <Popover
        open={open && !disabled}
        anchorRef={boxRef}
        onClose={() => setOpen(false)}
        // As wide as the control, as it has always been — `w-full` no longer
        // says that once the panel hangs off <body>. A column so that the
        // search box stays put and only the results give ground when the
        // placement has less height to offer than the list would like.
        match="width"
        className="bg-surface flex flex-col rounded-[12px] p-1.5"
        style={{ boxShadow: "var(--ring), var(--shadow-md)" }}
      >
        <div className="relative mb-1.5 shrink-0">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
            <Icon name="search" size={13} color="var(--faint)" />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              // Tab leaves the picker rather than walking its rows. The panel
              // hangs off <body>, so the stop after this box is whatever ends
              // the document — the browser's own chrome, not the next field in
              // the form. Handing the caret back to the control before the key
              // does its work puts Tab back where the reader expects it.
              if (e.key === "Tab") {
                triggerRef.current?.focus();
                setOpen(false);
                return;
              }
              onKeyDown(e);
            }}
            placeholder={placeholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${base}-list`}
            aria-autocomplete="list"
            aria-activedescendant={
              rows[active] ? `${base}-opt-${rows[active].id}` : undefined
            }
            // 16px on a phone for the same reason as the multi-select's
            // field: anything smaller and Safari zooms the page on focus.
            className="bg-paper text-title placeholder:text-placeholder min-h-10 w-full rounded-[8px] py-1.5 pr-2 pl-8 text-[16px] outline-none focus:shadow-[inset_0_0_0_1px_var(--field-line-hover)] sm:min-h-0 sm:text-sm"
          />
        </div>

        <div
          id={`${base}-list`}
          role="listbox"
          // 260px of results by choice, and less than that when the placement
          // had less height to give: a flex child refuses to shrink below its
          // content unless `min-h-0` says it may, and the one that has to give
          // way is this one — the search box above it keeps its size.
          className="plr-scroll max-h-[260px] min-h-0 overflow-y-auto"
        >
          {emptyOption && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="text-muted hover:bg-tint-hover min-h-10 w-full cursor-pointer rounded-[8px] px-2.5 py-1.5 text-left text-sm lg:min-h-0"
            >
              {emptyOption}
            </button>
          )}
          {loading && !page ? (
            <p className="text-muted p-2 text-sm">Searching…</p>
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
                  className={`flex min-h-10 items-start gap-2.5 rounded-[8px] px-2.5 py-2 lg:min-h-0 ${
                    o.disabled
                      ? "[&_*]:text-muted cursor-not-allowed"
                      : `cursor-pointer ${rowBackground(o.id === value?.id, i === active)}`
                  }`}
                >
                  <EntityCardBody card={toCard(o)} />
                </div>
              ))}
              {page?.hasMore && (
                <button
                  type="button"
                  onClick={onLoadMore}
                  // The only control in the panel that leaves it open, and the
                  // panel hangs off <body>: taking the caret would stop typing
                  // from reaching the search box above it, and Tab from here
                  // walks out of the dialog rather than around it.
                  onMouseDown={(e) => e.preventDefault()}
                  className="text-slate hover:bg-tint-hover min-h-10 w-full cursor-pointer rounded-[8px] px-2.5 py-1.5 text-xs font-semibold lg:min-h-0"
                >
                  Show {page.total - rows.length} more
                </button>
              )}
            </>
          ) : (
            <p className="text-muted p-2 text-sm">No matches.</p>
          )}
        </div>
      </Popover>
    </div>
  );
}
