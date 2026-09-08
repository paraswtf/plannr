"use client";

import { useRef, useState } from "react";

import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { Popover } from "~/components/ui/popover";
import { useLongPress } from "~/components/ui/use-long-press";
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
   * Puts the screen back on your own schedule. Absent when it already is.
   *
   * Its own callback rather than picking the first perspective, because those
   * are not the same thing: the default is whatever the server would choose if
   * it had never been asked, and the screen is the only thing that knows it has
   * stopped asking.
   */
  onClear?: () => void;
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
  onClear,
  onOpen,
  loading = false,
}: ViewAsProps) {
  const [open, setOpen] = useState(false);
  /** The favourite being held down and read about, if any. */
  const [detail, setDetail] = useState<ViewAsSubject | null>(null);
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
  const matches = (option: ViewAsSubject) =>
    !needle || option.name.toLowerCase().includes(needle);

  /*
   * Starred first, and only once.
   *
   * The star is how a favourite is taken back, and until now the only place it
   * could be reached was wherever that name happened to fall in a directory of
   * hundreds — so unstarring somebody meant searching for them first, which is
   * exactly the thing starring them was meant to stop. They are pulled out of
   * the groups below rather than repeated in them: one name listed twice, with
   * a star on both, is two answers to whether it is starred.
   */
  const shownFavourites = favourites.filter(matches);
  /*
   * Deduplicated against the favourites actually drawn, not against every
   * favourite there is — which is not the same set, and the difference deleted
   * people.
   *
   * The server searches names *and* PRNs; this narrows favourites by name,
   * because a PRN is not in `name`. So a starred student found by their PRN
   * matched the server and failed `matches`: dropped from the top group for
   * failing the name test, dropped from the people group for being starred, and
   * so missing from a search that had just found exactly them. Keyed on what
   * survived, a favourite the needle excluded falls back to its ordinary group.
   */
  const drawn = new Set(shownFavourites.map(keyOf));
  const shownPerspectives = perspectives.filter(
    (option) => matches(option) && !drawn.has(keyOf(option)),
  );
  // Already narrowed by the server, which is what `query` was sent to it for.
  const shownPeople = people.filter((option) => !drawn.has(keyOf(option)));
  const nothing =
    shownFavourites.length === 0 &&
    shownPerspectives.length === 0 &&
    shownPeople.length === 0;

  const pick = (subject: ViewAsSubject) => {
    onPick(subject);
    setOpen(false);
  };

  return (
    <>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        {/*
         * The label and the control are one item, full width until there is a
         * row to share.
         *
         * They used to be two, with the trigger `flex-1` — which meant the
         * favourites strip competed with it for the same line and the panel,
         * sized off the trigger, narrowed as somebody starred people. A phone
         * ended up with a list about two hundred pixels wide whose width moved
         * while it was open. Now the strip wraps beneath instead, and the panel
         * is as wide as the screen allows and stays there.
         */}
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <span className="text-faint shrink-0 font-mono text-[12px]">
            view as
          </span>

          {/*
           * A real width. The panel is sized off this box, so `flex-none` with
           * no width — which resolves to "as wide as the name currently in it" —
           * made the list about a hundred pixels across, and inside that the
           * avatar and the star are `shrink-0` while the name is `min-w-0
           * flex-1`, so the name was the only thing that could give way: it
           * truncated to nothing and every row came out as an icon, a gap and a
           * star. On a phone it takes the rest of its own line instead, which is
           * a good deal wider than a fixed 288 would be.
           */}
          <div
            ref={boxRef}
            className="min-w-0 flex-1 sm:w-[288px] sm:flex-none"
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
              /*
               * A fixed width, taken from the trigger, and deliberately not
               * `min-width`.
               *
               * `min-width` lets the panel size itself off its own content — and
               * `usePopoverPlacement` watches the panel with a ResizeObserver, so
               * every keystroke that changed the results changed the width, which
               * re-measured, which could cap the width against the viewport, which
               * re-measured again. A long name is what made it visible: the list
               * jittered as you typed. The trigger is a fixed width, so the panel
               * is too, and a name longer than it truncates with the whole of it
               * on the row's `title`.
               */
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
                {shownFavourites.map((option) => (
                  <Row
                    key={keyOf(option)}
                    option={option}
                    // The same word the ungrouped row uses, so starring a
                    // perspective does not quietly reword it.
                    hint={
                      option.hint ??
                      (option.kind === "perspective" ? "you" : null)
                    }
                    selected={keyOf(option) === keyOf(current)}
                    starred
                    onPick={pick}
                    onToggleFavourite={onToggleFavourite}
                  />
                ))}

                {shownFavourites.length > 0 &&
                  (shownPerspectives.length > 0 || shownPeople.length > 0) && (
                    <Divider />
                  )}

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

                {shownPerspectives.length > 0 && shownPeople.length > 0 && (
                  <Divider />
                )}

                {shownPeople.map((option) => (
                  <Row
                    key={keyOf(option)}
                    option={option}
                    hint={option.hint}
                    selected={keyOf(option) === keyOf(current)}
                    // Not always false: a favourite the needle kept out of the
                    // group above lands here, and its star has to say so.
                    starred={starred.has(keyOf(option))}
                    onPick={pick}
                    onToggleFavourite={onToggleFavourite}
                  />
                ))}

                {nothing && (
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

          {/*
           * Out of somebody else's schedule, in one press.
           *
           * Only here when there is something to leave — a cross that undoes
           * nothing is a control that has to be read before it can be ignored.
           * Outside the box the panel is measured against, so starring people
           * does not narrow the list they are starred from.
           */}
          {onClear && (
            <button
              type="button"
              // The trigger takes focus first, because this control is about to
              // stop existing: activated from the keyboard it would otherwise
              // drop focus to <body> and the next Tab would restart at the top
              // of the page. The same move the search box makes on Escape.
              onClick={() => {
                triggerRef.current?.focus();
                onClear();
              }}
              title="Back to your own schedule"
              aria-label="Back to your own schedule"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] lg:h-8.5 lg:w-8.5"
              style={{ background: "rgba(68,88,121,0.07)" }}
            >
              <Icon name="x" size={15} color="var(--slate)" stroke={2.2} />
            </button>
          )}
        </div>

        {favourites.length > 0 && (
          <Favourites
            favourites={favourites}
            current={current}
            onPick={onPick}
            onDetails={setDetail}
          />
        )}
      </div>

      {/*
       * What a favourite is, and how to stop it being one.
       *
       * Held down or right-clicked, the same way a class on the calendar is —
       * so the gesture is learnt once and means the same thing in both places:
       * "tell me more about this, without going anywhere."
       */}
      <Dialog
        open={detail !== null}
        title={detail?.name ?? ""}
        subtitle={detail?.hint ?? undefined}
        onClose={() => setDetail(null)}
        width={360}
      >
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar option={detail} size={40} />
              <p className="text-muted m-0 text-[13px]">
                {detail.kind === "perspective"
                  ? "One of your own angles on your timetable. Starred, so it is one tap away."
                  : "Starred, so their schedule is one tap away from yours."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onPick(detail);
                  setDetail(null);
                }}
                className="min-h-10 cursor-pointer rounded-lg px-3 py-2 text-[12.5px] font-semibold"
                style={{ background: "var(--slate)", color: "#fff" }}
              >
                View this schedule
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleFavourite(detail, false);
                  setDetail(null);
                }}
                className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
                style={{
                  background: "rgba(200,60,60,0.08)",
                  color: "var(--danger, #b3261e)",
                }}
              >
                <Icon name="star" size={13} stroke={2.2} color="currentColor" />
                Remove from favourites
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** The hairline between two groups of the list. */
function Divider() {
  return (
    <div
      className="mx-2.5 my-1"
      style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
    />
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
        // The panel is a fixed width, so a long name truncates — and the title
        // is where the whole of it stays reachable.
        title={option.name}
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
  onDetails,
}: {
  favourites: ViewAsSubject[];
  current: ViewAsSubject;
  onPick: (subject: ViewAsSubject) => void;
  onDetails: (subject: ViewAsSubject) => void;
}) {
  return (
    // Scrolls inside itself rather than wrapping: a row that grows a second
    // line as somebody stars a fifth colleague would move the calendar down
    // the page for a control they are not looking at.
    /*
     * The padding on both axes is what the selected ring lives in. It is a
     * `box-shadow`, so it is drawn outside the avatar's own box, and a scroller
     * clips both axes whichever one it was asked to scroll — without this the
     * ring is shaved off the top and bottom of every avatar and off the sides
     * of the first and last. The negative margin hands the space back, so
     * nothing around it moves.
     */
    <div className="plr-scroll -m-1 flex max-w-full min-w-0 items-center gap-1.5 overflow-x-auto p-1">
      {favourites.map((option) => (
        <FavouriteChip
          key={keyOf(option)}
          option={option}
          on={keyOf(option) === keyOf(current)}
          onPick={onPick}
          onDetails={onDetails}
        />
      ))}
    </div>
  );
}

/** One starred schedule: a tap to take it, a hold to ask about it. */
function FavouriteChip({
  option,
  on,
  onPick,
  onDetails,
}: {
  option: ViewAsSubject;
  on: boolean;
  onPick: (subject: ViewAsSubject) => void;
  onDetails: (subject: ViewAsSubject) => void;
}) {
  // Its own component because this is a hook, and the strip is a map. The hook
  // swallows the click a finished press leaves behind, so a hold does not also
  // switch the schedule out from under the dialog it just opened.
  const press = useLongPress(() => onDetails(option));

  return (
    <button
      type="button"
      title={option.name}
      aria-label={`View as ${option.name}`}
      aria-pressed={on}
      onClick={() => onPick(option)}
      {...press}
      className="shrink-0 cursor-pointer rounded-full"
      style={{
        // The ring rather than a fill, so the avatar underneath still reads as
        // the person it names.
        boxShadow: on ? "0 0 0 2px var(--slate)" : undefined,
      }}
    >
      <Avatar option={option} size={28} />
    </button>
  );
}

/**
 * The colours an avatar can take, as a fill and an ink that reads on it.
 *
 * Pairs rather than one tone with a tint computed from it, because the two
 * things a tone has to do — sit behind two letters and be those two letters —
 * are not the same brightness. `--orange` is the case that proves it: readable
 * as a fill at 16%, and illegible as text on anything. These are the pairs
 * `Badge` already settled, plus the two tones in the palette it had no use for.
 */
const TONES: ReadonlyArray<{ fill: string; ink: string }> = [
  { fill: "rgba(68,88,121,0.12)", ink: "#324464" },
  { fill: "rgba(122,46,143,0.12)", ink: "#6b2880" },
  { fill: "rgba(78,125,58,0.14)", ink: "#3f6a2e" },
  { fill: "rgba(220,56,72,0.10)", ink: "#b02636" },
  // Darker than the `--orange` ink `Badge` uses. That one is 4.18:1 here and
  // fails AA: a badge sets it at 11px semibold against a 16% tint, and these
  // are two letters that have to be told apart at a glance. 5.60:1.
  { fill: "rgba(246,167,59,0.18)", ink: "#8a5309" },
  // Pink rather than the palette's `--magenta`, whose readable ink is #c02a44
  // — twenty-one units from the red above it, which is to say the same colour.
  // Six tones are only worth having if all six are distinguishable.
  { fill: "rgba(168,37,138,0.12)", ink: "#a8258a" },
];

/**
 * Which tone a subject gets. The same one every time, on every device.
 *
 * Hashed from the subject rather than handed out by position, because position
 * changes: star somebody new, unstar somebody else, and a colour-by-index strip
 * repaints itself — which is precisely the thing that stops a colour being
 * worth anything. What a person learns is "Rao is the green one", and that has
 * to survive them starring a sixth colleague.
 *
 * Six tones and no attempt at uniqueness: with a strip of five, two of them
 * sharing a colour is ordinary and not worth the complexity of avoiding. The
 * colour is a memory aid — something to aim a thumb at — and not an identifier;
 * the name is on the tooltip and in the label for anybody who needs to be sure.
 *
 * Exported for the test, which cares about the stability rather than the hash.
 */
export function toneFor(subject: { kind: string; subject: string }): {
  fill: string;
  ink: string;
} {
  const key = keyOf(subject);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    // djb2, near enough: cheap, stable, and spread well enough for six buckets.
    hash = (hash * 33 + key.charCodeAt(i)) % 100_000_007;
  }
  return TONES[hash % TONES.length]!;
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
  const tone = toneFor(option);

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: tone.fill,
        color: tone.ink,
        // The hairline is the ink at low opacity rather than the shared
        // `--hair`, so an avatar reads as one colour rather than as a tinted
        // disc somebody has drawn a grey ring around.
        boxShadow: `inset 0 0 0 1px ${tone.ink}22`,
      }}
    >
      {icon ? (
        <Icon
          name={icon}
          size={Math.round(size * 0.5)}
          color={tone.ink}
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
