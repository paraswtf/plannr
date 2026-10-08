"use client";

import { useEffect, useId, useRef } from "react";

import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { ToggleChip } from "~/components/ui/chip";
import { DatePicker } from "~/components/ui/date-picker";
import { Field, Input } from "~/components/ui/field";
import { Icon, type IconName } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import {
  formatDayLabel,
  formatDuration,
  formatHourLabel,
  localTimeOnDay,
  minutesOfDay,
  SNAP_MINUTES,
} from "~/lib/dates";
import { api } from "~/trpc/react";
import { AttendeeFields } from "./attendee-fields";
import { ConflictBanner, ConflictVerdict } from "./conflict-banner";
import {
  FEATURE_LABELS,
  ROOM_FEATURES,
  type FittableRoom,
  type RoomFeatureName,
} from "./room-fit";
import { RecurringConflicts } from "./recurring-conflicts";
import { RoomPicker } from "./room-picker";
import {
  FIELD_LABEL,
  STEPPER_FIELD,
  StepButton,
  TimeField,
} from "./time-field";
import type { BookingDraft } from "./use-booking-draft";

/**
 * The booking form: permanently docked on the Book screen, opened by a pick on
 * the Timetable.
 *
 * Neither the span nor the draft belongs to it — both are held by the screen, so
 * that the calendar alongside can draw the span being edited and grey out the
 * rooms the draft has ruled out.
 */

const KINDS = [
  { value: "BOOKING" as const, label: "Booking" },
  { value: "CLASS" as const, label: "Class" },
];

const REPEATS = [
  { value: "none" as const, label: "Once" },
  { value: "weekly" as const, label: "Weekly" },
  { value: "daily" as const, label: "Daily" },
];

const ENDS = [
  { value: "until" as const, label: "On date" },
  { value: "count" as const, label: "After" },
];

export interface BookingSpan {
  roomId: string;
  start: Date;
  end: Date;
}

export function BookingDrawer({
  span,
  rooms,
  draft,
  timeZone,
  dayStartMinutes,
  dayEndMinutes,
  canCancelOthers = false,
  onChange,
  onClose,
  onOtherCancelled,
  ref,
}: {
  span: BookingSpan;
  rooms: FittableRoom[];
  draft: BookingDraft;
  timeZone: string;
  /** The working window, in minutes from local midnight. */
  dayStartMinutes: number;
  dayEndMinutes: number;
  /** Whether this user may cancel other people's events to clear a clash. */
  canCancelOthers?: boolean;
  onChange: (span: BookingSpan) => void;
  /** Omit on a screen where the panel is permanent. */
  onClose?: () => void;
  /** Refetch after a clashing booking has been cancelled. */
  onOtherCancelled: () => void | Promise<unknown>;
  /**
   * The panel element. Handed out so a screen can scroll to it — where the
   * panel is under the calendar rather than beside it, retiming it from the
   * calendar happens off screen unless someone takes the reader there.
   */
  ref?: React.Ref<HTMLElement>;
}) {
  const { roomId, start, end } = span;
  const room = rooms.find((r) => r.id === roomId);
  const isSelfServe = draft.isSelfServe;

  const nextFree = api.rooms.nextFreeSlot.useQuery(
    {
      roomId,
      after: start,
      durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
    },
    { enabled: false },
  );

  const durationMinutes = Math.round(
    (end.getTime() - start.getTime()) / 60_000,
  );
  const startMinutes = minutesOfDay(start, timeZone);
  const endMinutes = startMinutes + durationMinutes;

  // Both ends stay inside the working window: it is the only stretch of the day
  // the calendars draw, so a booking outside it would be invisible there.
  const setStartMinutes = (minutes: number) => {
    const at = clamp(minutes, dayStartMinutes, dayEndMinutes - durationMinutes);
    const nextStart = localTimeOnDay(start, at, timeZone);
    onChange({
      roomId,
      start: nextStart,
      end: new Date(nextStart.getTime() + durationMinutes * 60_000),
    });
  };

  const setEndMinutes = (minutes: number) => {
    const at = clamp(minutes, startMinutes + 1, dayEndMinutes);
    onChange({ roomId, start, end: localTimeOnDay(start, at, timeZone) });
  };

  // Changing the date carries the times with it, and the screen follows the
  // booking to that day — the calendar shows one day, so leaving it behind
  // would hide the very block being edited.
  const setDay = (day: Date) => {
    const nextStart = localTimeOnDay(day, startMinutes, timeZone);
    onChange({
      roomId,
      start: nextStart,
      end: new Date(nextStart.getTime() + durationMinutes * 60_000),
    });
  };

  const verdictId = useId();

  // Why a slot that is free still cannot be booked, said beside the button in
  // the verdict's words rather than by the button's label.
  const blockedBy =
    draft.shortfalls.length > 0
      ? "Pick a room that fits"
      : draft.needsGroup
        ? "A class needs a group attending it."
        : null;

  // A series' clashing dates are listed one by one, with what to do about
  // each, by RecurringConflicts; the red detail keeps only what that list does
  // not already say, so the same three dates are not written out twice.
  const unlisted =
    draft.repeat === "none"
      ? draft.conflicts
      : draft.conflicts.filter((c) => !(c.candidate && c.clashesWith));

  const useNextFree =
    draft.hardConflicts.length > 0
      ? async () => {
          const result = await nextFree.refetch();
          if (result.data) {
            onChange({
              roomId,
              start: result.data.start,
              end: new Date(
                result.data.start.getTime() + durationMinutes * 60_000,
              ),
            });
          }
        }
      : undefined;

  return (
    <BookingPanel
      ref={ref}
      // The glyph plate belongs to the panel that opens over the Timetable,
      // where it matches every other drawer. Docked for good on the Book
      // screen, beside a page already titled "Book a room", it was a second
      // heading competing with the first.
      icon={onClose ? "calendar" : undefined}
      title={isSelfServe ? "Book a slot" : "New session"}
      // What has been picked rather than the date again: the date is in the
      // field below and beside the page title, and on a phone this line is
      // what a tap on the calendar scrolls into view.
      subtitle={
        room
          ? `${room.code} · ${formatHourLabel(start, timeZone)}-${formatHourLabel(end, timeZone)}`
          : `${formatDayLabel(start, timeZone)} · ${formatDuration(durationMinutes)}`
      }
      onClose={onClose}
      footer={
        <>
          {draft.create.error && (
            <Callout tone="bad" role="alert" className="basis-full">
              {draft.create.error.message}
            </Callout>
          )}
          {/*
           * The verdict and the button it decides are one unit. It takes the
           * row with the button where there is width for both, and a row of
           * its own when it carries a way out of the clash, or beside the
           * Timetable's Cancel.
           *
           * Which of the two is decided by the last settled answer, not the
           * current one: a nudge out of a clash sets the check running and
           * empties the conflicts, and deciding by those dropped the bar from
           * two rows to one and back on every nudge. The "Checking" line now
           * holds the clash's row until the answer says otherwise.
           */}
          <ConflictVerdict
            id={verdictId}
            conflicts={draft.conflicts}
            checking={draft.isChecking}
            blockedBy={blockedBy}
            onUseNextFree={useNextFree}
            className={draft.clashed ? "basis-full" : "min-w-0 grow basis-56"}
          />
          <div className="flex items-center justify-end gap-2.5">
            {onClose && (
              <Button variant="ghost" size="lg" onClick={onClose}>
                Cancel
              </Button>
            )}
            {/*
             * Always says what it does. It used to turn into the instruction
             * ("Resolve the clash") at half opacity on the gradient, a reason
             * nobody could read carried by a control nobody could press; the
             * reason is the verdict's now, and the button is described by it.
             */}
            <Button
              variant="primary"
              size="lg"
              disabled={!draft.canBook}
              onClick={draft.book}
              aria-describedby={verdictId}
            >
              {draft.create.isPending
                ? "Booking…"
                : `Book ${room?.code ?? ""}`.trim()}
            </Button>
          </div>
        </>
      }
    >
      {/*
       * Grouped by what the fields are about, with air and a hairline between
       * the groups and less inside them: the room and time first, which is
       * what a pick on the calendar sets, then who it is for, what it needs,
       * and what it is called. The groups are presentation only; every field
       * reads and writes the same draft it always did.
       */}
      <div className="flex flex-col gap-5">
        <Section>
          <RoomPicker
            rooms={rooms}
            value={roomId}
            needs={draft.needs}
            onChange={(id) => onChange({ ...span, roomId: id })}
          />

          {draft.shortfalls.length > 0 && (
            <Callout tone="bad">
              {room?.code} does not fit this session:{" "}
              {draft.shortfalls.join(", ")}.
            </Callout>
          )}

          <Field label="Date">
            {(id) => (
              <DatePicker
                id={id}
                value={start}
                timeZone={timeZone}
                onChange={setDay}
              />
            )}
          </Field>

          {/*
           * Side by side the two times are 170px each on a phone, which is not
           * enough for a field carrying two nudges, a chevron and a clock time.
           */}
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeField
              label="Starts"
              value={start}
              timeZone={timeZone}
              minMinutes={dayStartMinutes}
              maxMinutes={dayEndMinutes}
              onChange={setStartMinutes}
              onStep={(delta) => setStartMinutes(startMinutes + delta)}
              canStepBack={startMinutes - SNAP_MINUTES >= dayStartMinutes}
              canStepForward={endMinutes + SNAP_MINUTES <= dayEndMinutes}
            />
            <TimeField
              label="Ends"
              value={end}
              timeZone={timeZone}
              minMinutes={dayStartMinutes + SNAP_MINUTES}
              maxMinutes={dayEndMinutes + SNAP_MINUTES}
              onChange={setEndMinutes}
              onStep={(delta) => setEndMinutes(endMinutes + delta)}
              canStepBack={endMinutes - SNAP_MINUTES > startMinutes}
              canStepForward={endMinutes + SNAP_MINUTES <= dayEndMinutes}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className={FIELD_LABEL}>Repeats</span>
              <Segmented
                items={REPEATS}
                value={draft.repeat}
                onChange={draft.setRepeat}
                size="sm"
                ariaLabel="Repeats"
              />
            </div>

            {/*
             * How the series ends belongs to "Repeats", so it hangs under it,
             * indented on a rule, rather than in a ringed box of its own.
             */}
            {draft.repeat !== "none" && (
              <div className="flex flex-col gap-2 pl-3 shadow-[inset_2px_0_0_var(--hair)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted text-sm">Ends</span>
                  <Segmented
                    items={ENDS}
                    value={draft.endMode}
                    onChange={draft.setEndMode}
                    size="sm"
                    ariaLabel="Ends"
                  />
                </div>

                {/*
                 * Each mode shows what the other would have said, so switching
                 * between them is never a guess.
                 */}
                {draft.endMode === "until" ? (
                  <div className="flex items-center gap-2">
                    {draft.until && (
                      <DatePicker
                        value={draft.until}
                        timeZone={timeZone}
                        size="sm"
                        ariaLabel="Repeat until"
                        onChange={draft.setUntil}
                        className="min-w-0 flex-1"
                      />
                    )}
                    <span className="text-faint shrink-0 text-xs">
                      <span className="font-mono tabular-nums">
                        {draft.dates.length}
                      </span>{" "}
                      dates
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CountField
                      value={draft.count}
                      max={draft.maxCount}
                      onChange={draft.setCount}
                    />
                    {/* Nothing at all rather than a dash when there are no dates. */}
                    {draft.lastDate && (
                      <span className="text-faint shrink-0 text-xs">
                        to {formatDayLabel(draft.lastDate, timeZone)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <RecurringConflicts
            draft={draft}
            timeZone={timeZone}
            canCancelOthers={canCancelOthers}
            onCancelled={onOtherCancelled}
          />

          {/*
           * The detail behind the verdict, beside the times that caused it.
           * Its way out ("Use next free slot") is the verdict's, by the button.
           */}
          <ConflictBanner conflicts={unlisted} checking={draft.isChecking} />
        </Section>

        {!isSelfServe && (
          <Section>
            <div className="flex items-center justify-between gap-3">
              <span className={FIELD_LABEL}>Type</span>
              <Segmented
                items={KINDS}
                value={draft.kind}
                onChange={draft.setKind}
                size="sm"
                ariaLabel="Type"
              />
            </div>

            {/*
             * Two to a line only while the panel is the width of the page; back
             * in its dock there is no room for a second column.
             */}
            <AttendeeFields
              draft={draft}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"
            />
          </Section>
        )}

        <Section>
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className={FIELD_LABEL}>Requirements</span>
              {/* Mono for the count only; the words are words. */}
              <span className="text-faint text-xs">
                {draft.needs.seats > 0 ? (
                  <>
                    <span className="font-mono tabular-nums">
                      {draft.needs.seats}
                    </span>{" "}
                    seats needed
                  </>
                ) : (
                  "Any size"
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ROOM_FEATURES.map((feature) => (
                <FeatureChip
                  key={feature}
                  feature={feature}
                  on={draft.features.includes(feature)}
                  onToggle={() => draft.toggleFeature(feature)}
                />
              ))}
            </div>
            <p className="text-faint mt-2 text-xs">
              Rooms without these, or too small for the class, are greyed out on
              the calendar.
            </p>
          </div>
        </Section>

        <Section>
          <Field label={isSelfServe ? "Purpose" : "Session title"}>
            {(id) => (
              <Input
                id={id}
                value={draft.title}
                onChange={(e) => draft.setTitle(e.target.value)}
              />
            )}
          </Field>
        </Section>
      </div>
    </BookingPanel>
  );
}

/**
 * One group of the form. The hairline above every group but the first is what
 * separates them; a box around each would be a card inside the panel.
 */
function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 not-first:pt-5 not-first:shadow-[inset_0_1px_0_var(--hair-soft)]">
      {children}
    </section>
  );
}

/**
 * The panel the form sits in.
 *
 * Docking a 420px column beside the calendar is a desktop idea: on a phone it
 * would leave the grid a sliver, and a form squeezed next to a grid helps
 * nobody. So the dock only exists from `lg` — the width at which the sidebar
 * comes back and there is room to spare. Below that the panel is simply the
 * next thing down the page: full width, in the flow, scrolling with it, with
 * the action bar riding the bottom of the screen so the Book button is never a
 * scroll away.
 *
 * The shared Drawer stacks the same way, and from `lg` the two are the same
 * panel down to the pixel. What is not shared is that action bar: Drawer leaves
 * its footer at the end of the form, and on a phone this particular form runs
 * several screens long, so Book would be a scroll away rather than under the
 * thumb. That is the whole of the difference, and the day Drawer can pin its
 * own footer the two should become one again.
 */
function BookingPanel({
  title,
  subtitle,
  icon,
  onClose,
  footer,
  children,
  ref,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Omit to make the panel permanent, as the Book screen does. */
  onClose?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}) {
  // The screens above write `onClose` as an inline arrow, so a new function
  // arrives on every render of the page around this — and the page re-renders
  // on every keystroke in the form. Keyed on the callback's identity, the
  // effect below would tear its listener down and put it back between
  // characters; read through a ref it can key on whether the panel is
  // dismissible at all, which changes never.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  const dismissible = Boolean(onClose);

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape belongs to whatever is laid over the page, and this panel never
      // is — docked it is a column beside the calendar, stacked it is a block
      // under it, and either way the page around it is still live. Without
      // this, one press aimed at the shell's nav overlay or at a dialog opened
      // from the grid behind takes the half-written booking down with it: both
      // listen on the document, and neither can see the other. `aria-modal` is
      // the mark of the layer that is actually on top. The Drawer this panel
      // was forked from carries the same guard, and for the same reason.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      close.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismissible]);

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-label={title}
      // `lg:w-105` is the spacing scale's spelling of the Drawer's 420px dock.
      // The slide-in belongs to that docked panel only: on a full-width one it
      // would be 26px of the page hanging off the right edge mid-animation.
      // And only to a panel that arrives: docked for good on the Book screen
      // nothing has arrived, and it slid in on every page load regardless.
      // `scroll-mt` keeps the panel's own heading clear of the topbar when a
      // screen scrolls to it; above lg the offset is zero, as is the need.
      // The edge's shadow is the Drawer's, slate-tinted.
      className={`bg-surface flex w-full scroll-mt-(--topbar-h) flex-col shadow-[inset_0_1px_0_var(--hair)] lg:sticky lg:h-screen lg:w-105 lg:max-w-[92vw] lg:shrink-0 lg:shadow-[inset_1px_0_0_var(--hair),var(--shadow-edge)] ${
        dismissible
          ? "lg:animate-[plrSlideIn_0.24s_var(--ease-out)] motion-reduce:lg:animate-[plrFade_0.18s_ease]"
          : ""
      }`}
      style={{ top: "var(--topbar-h)" }}
    >
      <div
        className="flex items-start gap-3 px-4 pt-5 pb-4 sm:px-6 lg:pt-6"
        style={{ boxShadow: "0 1px 0 var(--hair-soft)" }}
      >
        {icon && (
          <span className="bg-tint-strong text-slate flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]">
            <Icon name={icon} size={19} stroke={1.9} />
          </span>
        )}
        {/* The Drawer's heading, so the two panels still read as one. */}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-title text-lg font-semibold tracking-[-0.015em]">
            {title}
          </h2>
          {subtitle && <p className="text-muted mt-0.5 text-sm">{subtitle}</p>}
        </div>
        {onClose && (
          <IconButton
            icon="x"
            label="Close"
            size="sm"
            onClick={onClose}
            className="-mt-0.5 -mr-1.5"
          />
        )}
      </div>

      {/*
       * Only the docked panel scrolls on its own; in the flow the page is the
       * scroller, which also lets the pickers inside hang past its edges.
       */}
      <div className="plr-scroll flex-1 px-4 py-5 sm:px-6 lg:overflow-y-auto">
        {children}
      </div>

      {/*
       * Wraps, so the verdict can share the button's row when both fit and
       * take a row above it when they do not.
       */}
      {footer && (
        <div
          className="bg-surface sticky bottom-0 flex flex-wrap items-center justify-end gap-3 px-4 pt-4 pb-5 sm:px-6 lg:static lg:pb-6"
          style={{ boxShadow: "0 -1px 0 var(--hair-soft)" }}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}

/** How many dates the series runs for: typed, or nudged one at a time. */
function CountField({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    // The same stepped field as the times, so the two read as one control.
    <div className={`${STEPPER_FIELD} min-w-0 flex-1`}>
      <StepButton
        icon="chevronLeft"
        label="One fewer date"
        onClick={value > 1 ? () => onChange(value - 1) : undefined}
      />
      <input
        value={value}
        inputMode="numeric"
        aria-label="Number of dates"
        onChange={(e) => {
          const next = Number(e.target.value.replace(/\D/g, ""));
          if (Number.isFinite(next) && next > 0) onChange(next);
        }}
        // The frame draws the focus ring; 16px on a phone for iOS's sake.
        className="text-title min-w-0 flex-1 bg-transparent text-center font-mono text-[16px] font-semibold tabular-nums outline-none sm:text-sm"
      />
      <span className="text-faint shrink-0 pr-0.5 text-xs">
        {value === 1 ? "date" : "dates"}
      </span>
      <StepButton
        icon="chevronRight"
        label="One more date"
        onClick={value < max ? () => onChange(value + 1) : undefined}
      />
    </div>
  );
}

/** One piece of kit the session does or does not need. */
function FeatureChip({
  feature,
  on,
  onToggle,
}: {
  feature: RoomFeatureName;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <ToggleChip pressed={on} onClick={onToggle}>
      {FEATURE_LABELS[feature]}
    </ToggleChip>
  );
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));
