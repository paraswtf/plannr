"use client";

import { useRef, useState } from "react";

import { Icon } from "~/components/ui/icon";
import { Popover } from "~/components/ui/popover";
import { initialsOf } from "~/components/ui/entity-card";

/**
 * Whose schedule is on screen, and the handful you keep one tap away.
 *
 * One control, where there were two. The old shape had a dropdown for "which of
 * my own angles" and, when you chose "Someone else…", a second search box
 * beside it — so switching from the coordinator view to a lecturer's day meant
 * two controls, and the second one only existed some of the time, which is what
 * made the toolbar impossible to lay out. They are one question, and they are
 * asked once: a list you type into, with your own perspectives pinned at the
 * top of it and everybody else underneath.
 *
 * The strip of avatars beside it is the same question answered without opening
 * anything. A coordinator covering four lecturers is switching between the same
 * five schedules all week; making that a search every time is the sort of thing
 * that gets a screen quietly abandoned.
 */

/** What "view as" can be pointed at. */
export interface ViewAsSubject {
  kind: "perspective" | "person";
  /** A perspective name, or a user id. */
  subject: string;
  name: string;
  /** The line under the name in the list. Not drawn on an avatar. */
  hint?: string | null;
}

export interface ViewAsProps {
  /** What is on screen now. */
  current: ViewAsSubject;
  /** The viewer's own angles, pinned above the search results. */
  perspectives: ViewAsSubject[];
  /** Whoever the current search turned up. */
  people: ViewAsSubject[];
  /** In the order they were starred. */
  favourites: ViewAsSubject[];
  total: number;
  query: string;
  onQueryChange: (query: string) => void;
  onPick: (subject: ViewAsSubject) => void;
  onToggleFavourite: (subject: ViewAsSubject, on: boolean) => void;
  /**
   * Told when the list is opened, so the screen can hold the people search back
   * until somebody actually wants it. Every student loading their own timetable
   * would otherwise pay for a directory query they were never going to read.
   */
  onOpen?: () => void;
  loading?: boolean;
}

const keyOf = (s: { kind: string; subject: string }) =>
  `${s.kind}:${s.subject}`;

export function ViewAs({
  current,
  perspectives,
  people,
  favourites,
  total,
  query,
  onQueryChange,
  onPick,
  onToggleFavourite,
  onOpen,
  loading = false,
}: ViewAsProps) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const starred = new Set(favourites.map(keyOf));

  /**
   * The perspectives are filtered here rather than on the server.
   *
   * There are at most four of them and they are already in hand, so a round
   * trip to narrow a list that short would only make typing feel worse. The
   * people half is searched server side because there are thousands.
   */
  const needle = query.trim().toLowerCase();
  const shownPerspectives = needle
    ? perspectives.filter((p) => p.name.toLowerCase().includes(needle))
    : perspectives;

  const pick = (subject: ViewAsSubject) => {
    onPick(subject);
    setOpen(false);
  };

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
      <span className="text-faint shrink-0 font-mono text-[12px]">view as</span>

      <div
        ref={boxRef}
        className="min-w-0 flex-1 sm:max-w-[240px] sm:flex-none"
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            if (!open) onOpen?.();
            setOpen((v) => !v);
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="bg-surface flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-[13px] lg:min-h-0 lg:py-1.5"
          style={{ boxShadow: "var(--ring)" }}
        >
          <span className="text-title min-w-0 truncate font-medium">
            {current.name}
          </span>
          <Icon name="chevronDown" size={14} color="var(--muted)" />
        </button>

        <Popover
          open={open}
          anchorRef={boxRef}
          onClose={() => setOpen(false)}
          match="width"
          className="bg-surface flex flex-col rounded-[10px] p-1.5"
          style={{ boxShadow: "var(--ring), var(--shadow-float)" }}
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
                if (e.key === "Escape") {
                  setOpen(false);
                  triggerRef.current?.focus();
                }
                // Tab leaves the picker rather than walking its rows: the panel
                // hangs off <body>, so the stop after it is the browser's own
                // chrome rather than the next control in the toolbar.
                if (e.key === "Tab") {
                  triggerRef.current?.focus();
                  setOpen(false);
                }
              }}
              placeholder="Search perspectives, students and staff…"
              // 16px on a phone: anything smaller and Safari zooms the page on
              // focus, which on this toolbar throws the calendar off screen.
              className="bg-paper min-h-10 w-full rounded-lg py-1.5 pr-2 pl-8 text-[16px] outline-none sm:min-h-0 sm:text-[12.5px]"
            />
          </div>

          <div
            role="listbox"
            className="plr-scroll max-h-[280px] min-h-0 overflow-y-auto"
          >
            {shownPerspectives.map((option) => (
              <Row
                key={keyOf(option)}
                option={option}
                hint="you"
                selected={keyOf(option) === keyOf(current)}
                starred={starred.has(keyOf(option))}
                onPick={pick}
                onToggleFavourite={onToggleFavourite}
              />
            ))}

            {shownPerspectives.length > 0 && people.length > 0 && (
              <div
                className="mx-2.5 my-1"
                style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
              />
            )}

            {people.map((option) => (
              <Row
                key={keyOf(option)}
                option={option}
                hint={option.hint}
                selected={keyOf(option) === keyOf(current)}
                starred={starred.has(keyOf(option))}
                onPick={pick}
                onToggleFavourite={onToggleFavourite}
              />
            ))}

            {shownPerspectives.length === 0 && people.length === 0 && (
              <p className="text-muted p-2 text-[12.5px]">
                {loading ? "Searching…" : "Nobody matches that."}
              </p>
            )}

            {/*
             * How many matched, rather than how many are listed. A full page
             * used to be the only clue that there were more, and it could not
             * say how many more.
             */}
            {total > people.length && (
              <p className="text-faint px-2.5 py-1.5 text-[11.5px]">
                {total - people.length} more — keep typing to narrow it.
              </p>
            )}
          </div>
        </Popover>
      </div>

      {favourites.length > 0 && (
        <Favourites favourites={favourites} current={current} onPick={onPick} />
      )}
    </div>
  );
}

/** One row: the name, what it is, and the star that keeps it. */
function Row({
  option,
  hint,
  selected,
  starred,
  onPick,
  onToggleFavourite,
}: {
  option: ViewAsSubject;
  hint?: string | null;
  selected: boolean;
  starred: boolean;
  onPick: (subject: ViewAsSubject) => void;
  onToggleFavourite: (subject: ViewAsSubject, on: boolean) => void;
}) {
  return (
    // A row rather than a button wrapping one, because the star inside it is
    // its own control and a button inside a button is invalid HTML with
    // genuinely undefined activation behaviour.
    <div
      role="option"
      aria-selected={selected}
      className="flex min-h-10 items-center gap-2 rounded-lg pr-1 lg:min-h-0"
      style={selected ? { background: "var(--card-soft)" } : undefined}
    >
      <button
        type="button"
        onClick={() => onPick(option)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left"
      >
        <Avatar option={option} size={22} />
        <span className="min-w-0 flex-1">
          <span className="text-title block truncate text-[12.5px] font-medium">
            {option.name}
          </span>
          {hint && (
            <span className="text-faint block truncate text-[11px]">
              {hint}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        aria-label={starred ? `Unstar ${option.name}` : `Star ${option.name}`}
        aria-pressed={starred}
        onClick={() => onToggleFavourite(option, !starred)}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-7 lg:w-7"
      >
        <Icon
          name="star"
          size={14}
          color={starred ? "var(--orange)" : "var(--faint)"}
          stroke={starred ? 2.4 : 1.8}
        />
      </button>
    </div>
  );
}

/** The strip of one-tap schedules. */
function Favourites({
  favourites,
  current,
  onPick,
}: {
  favourites: ViewAsSubject[];
  current: ViewAsSubject;
  onPick: (subject: ViewAsSubject) => void;
}) {
  return (
    // Scrolls inside itself rather than wrapping: a row that grows a second
    // line as somebody stars a fifth colleague would move the calendar down
    // the page for a control they are not looking at.
    <div className="plr-scroll -my-1 flex max-w-full min-w-0 items-center gap-1.5 overflow-x-auto py-1">
      {favourites.map((option) => {
        const on = keyOf(option) === keyOf(current);
        return (
          <button
            key={keyOf(option)}
            type="button"
            title={option.name}
            aria-label={`View as ${option.name}`}
            aria-pressed={on}
            onClick={() => onPick(option)}
            className="shrink-0 cursor-pointer rounded-full"
            style={{
              // The ring rather than a fill, so the avatar underneath still
              // reads as the person it names.
              boxShadow: on ? "0 0 0 2px var(--slate)" : undefined,
            }}
          >
            <Avatar option={option} size={28} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Initials for a person, an icon for a perspective.
 *
 * Initials rather than a Google picture, deliberately: `searchPeople` answers
 * with four fields and no photo — it is narrow on purpose — and widening it so
 * a toolbar could be prettier is the wrong trade. Initials also read the same
 * whether or not somebody ever set a picture.
 */
function Avatar({ option, size }: { option: ViewAsSubject; size: number }) {
  const icon =
    option.kind === "perspective"
      ? (PERSPECTIVE_ICONS[option.subject] ?? "users")
      : null;

  return (
    <span
      className="text-title flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: "var(--card-soft)",
        boxShadow: "inset 0 0 0 1px var(--hair)",
      }}
    >
      {icon ? (
        <Icon
          name={icon}
          size={Math.round(size * 0.5)}
          color="var(--slate)"
          stroke={1.9}
        />
      ) : (
        initialsOf(option.name)
      )}
    </span>
  );
}

/** One glyph per angle, so a strip of them can be told apart at 28px. */
const PERSPECTIVE_ICONS: Record<
  string,
  "book" | "users" | "grid" | "settings"
> = {
  student: "book",
  faculty: "users",
  coordinator: "grid",
  admin: "settings",
};
