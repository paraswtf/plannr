"use client";

import { useEffect, useRef } from "react";

import { DatePicker } from "~/components/ui/date-picker";
import { Icon, type IconName } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import {
  formatDayLabel,
  formatDuration,
  localTimeOnDay,
  minutesOfDay,
  SNAP_MINUTES,
} from "~/lib/dates";
import { api } from "~/trpc/react";
import { AttendeeFields } from "./attendee-fields";
import { ConflictBanner } from "./conflict-banner";
import {
  FEATURE_LABELS,
  ROOM_FEATURES,
  type FittableRoom,
  type RoomFeatureName,
} from "./room-fit";
import { RecurringConflicts } from "./recurring-conflicts";
import { RoomPicker } from "./room-picker";
import { TimeField } from "./time-field";
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

  return (
    <BookingPanel
      ref={ref}
      icon="calendar"
      title={isSelfServe ? "Book a slot" : "New session"}
      subtitle={`${formatDayLabel(start, timeZone)} · ${formatDuration(durationMinutes)}`}
      onClose={onClose}
      footer={
        <>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted cursor-pointer rounded-[var(--radius-btn)] px-4 py-2.5 text-[13.5px] font-semibold"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!draft.canBook}
            onClick={draft.book}
            className="rounded-[var(--radius-btn)] px-5 py-2.5 text-[14px] font-semibold text-white"
            style={{
              background: "var(--grad-brand)",
              opacity: draft.canBook ? 1 : 0.5,
              cursor: draft.canBook ? "pointer" : "not-allowed",
            }}
          >
            {draft.create.isPending
              ? "Booking…"
              : draft.shortfalls.length > 0
                ? "Pick a room that fits"
                : draft.hardConflicts.length > 0
                  ? "Resolve the clash"
                  : `Book ${room?.code ?? ""}`.trim()}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RoomPicker
          rooms={rooms}
          value={roomId}
          needs={draft.needs}
          onChange={(id) => onChange({ ...span, roomId: id })}
        />

        {draft.shortfalls.length > 0 && (
          <div
            className="flex items-start gap-2.5 rounded-xl p-3"
            style={{
              background: "rgba(220,56,72,0.07)",
              boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
            }}
          >
            <Icon name="alert" size={17} color="var(--red)" stroke={2} />
            <span className="text-ink text-[12.5px]">
              {room?.code} does not fit this session:{" "}
              {draft.shortfalls.join(", ")}.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">Date</span>
          <DatePicker value={start} timeZone={timeZone} onChange={setDay} />
        </div>

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

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink text-[13px] font-semibold">Repeats</span>
            <Segmented
              items={REPEATS}
              value={draft.repeat}
              onChange={draft.setRepeat}
              size="sm"
            />
          </div>

          {draft.repeat !== "none" && (
            <div
              className="flex flex-col gap-2 rounded-xl p-2.5"
              style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted text-[12.5px]">Ends</span>
                <Segmented
                  items={ENDS}
                  value={draft.endMode}
                  onChange={draft.setEndMode}
                  size="sm"
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
                  <span className="text-faint shrink-0 font-mono text-[11.5px]">
                    {draft.dates.length} dates
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CountField
                    value={draft.count}
                    max={draft.maxCount}
                    onChange={draft.setCount}
                  />
                  <span className="text-faint shrink-0 font-mono text-[11.5px]">
                    {draft.lastDate
                      ? `to ${formatDayLabel(draft.lastDate, timeZone)}`
                      : "—"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {!isSelfServe && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink text-[13px] font-semibold">Type</span>
            <Segmented
              items={KINDS}
              value={draft.kind}
              onChange={draft.setKind}
              size="sm"
            />
          </div>
        )}

        {/*
         * Two to a line only while the panel is the width of the page; back in
         * its dock there is no room for a second column.
         */}
        {!isSelfServe && (
          <AttendeeFields
            draft={draft}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"
          />
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-ink text-[13px] font-semibold">
              Requirements
            </span>
            <span className="text-faint font-mono text-[11.5px]">
              {draft.needs.seats > 0
                ? `${draft.needs.seats} seats needed`
                : "any size"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ROOM_FEATURES.map((feature) => (
              <FeatureChip
                key={feature}
                feature={feature}
                on={draft.features.includes(feature)}
                onToggle={() => draft.toggleFeature(feature)}
              />
            ))}
          </div>
          <p className="text-faint mt-2 text-[11.5px]">
            Rooms without these — or too small for the class — are greyed out on
            the calendar.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">
            {isSelfServe ? "Purpose" : "Session title"}
          </span>
          <input
            value={draft.title}
            onChange={(e) => draft.setTitle(e.target.value)}
            className="bg-surface rounded-[10px] px-3 py-2.5 text-[16px] outline-none sm:text-[13.5px] lg:py-2"
            style={{ boxShadow: "var(--ring)" }}
          />
        </label>

        <RecurringConflicts
          draft={draft}
          timeZone={timeZone}
          canCancelOthers={canCancelOthers}
          onCancelled={onOtherCancelled}
        />

        <ConflictBanner
          conflicts={draft.conflicts}
          checking={draft.isChecking}
          onUseNextFree={
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
              : undefined
          }
        />

        {draft.create.error && (
          <div className="text-[12.5px] font-medium text-[#b02636]">
            {draft.create.error.message}
          </div>
        )}
      </div>
    </BookingPanel>
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
      // `scroll-mt` keeps the panel's own heading clear of the topbar when a
      // screen scrolls to it; above lg the offset is zero, as is the need.
      className="bg-surface flex w-full scroll-mt-(--topbar-h) flex-col shadow-[inset_0_1px_0_var(--hair)] lg:sticky lg:h-screen lg:w-105 lg:max-w-[92vw] lg:shrink-0 lg:animate-[plrSlideIn_0.24s_cubic-bezier(0.4,0,0.2,1)] lg:shadow-[inset_1px_0_0_var(--hair),-12px_0_34px_rgba(13,17,23,0.07)]"
      style={{ top: "var(--topbar-h)" }}
    >
      <div
        className="flex items-start gap-3 px-4 pt-5 pb-4 sm:px-6 lg:pt-6"
        style={{ boxShadow: "0 1px 0 var(--hair-soft)" }}
      >
        {icon && (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "color-mix(in srgb, var(--slate) 14%, #fff)",
            }}
          >
            <Icon name={icon} size={19} color="var(--slate)" stroke={1.9} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-title text-[19px] font-bold tracking-[-0.02em]">
            {title}
          </h2>
          {subtitle && (
            <p className="text-muted mt-0.5 text-[12.5px]">{subtitle}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-8 lg:w-8"
          >
            <Icon name="x" size={16} color="var(--muted)" />
          </button>
        )}
      </div>

      {/*
       * Only the docked panel scrolls on its own; in the flow the page is the
       * scroller, which also lets the pickers inside hang past its edges.
       */}
      <div className="plr-scroll flex-1 px-4 py-5 sm:px-6 lg:overflow-y-auto">
        {children}
      </div>

      {footer && (
        <div
          className="bg-surface sticky bottom-0 flex items-center justify-end gap-2.5 px-4 pt-4 pb-5 sm:px-6 lg:static lg:pb-6"
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
    <div
      className="bg-surface flex min-w-0 flex-1 items-center gap-1 rounded-[10px] px-1.5 py-1"
      style={{ boxShadow: "var(--ring)" }}
    >
      <Nudge
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
        className="text-title min-w-0 flex-1 bg-transparent text-center font-mono text-[16px] font-bold outline-none sm:text-[13px]"
      />
      <span className="text-faint shrink-0 pr-0.5 text-[11.5px]">
        {value === 1 ? "date" : "dates"}
      </span>
      <Nudge
        icon="chevronRight"
        label="One more date"
        onClick={value < max ? () => onChange(value + 1) : undefined}
      />
    </div>
  );
}

function Nudge({
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
      // Wide enough for a thumb until there is a sidebar to prove there is a
      // mouse, the same trade the calendar's day stepper makes.
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md lg:h-6 lg:w-6"
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
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="plr-clip inline-flex min-h-10 cursor-pointer items-center rounded-full px-3 text-[12px] font-semibold lg:min-h-0 lg:px-2.5 lg:py-1"
      style={
        on
          ? {
              background: "var(--slate)",
              color: "#fff",
              boxShadow: "0 2px 8px rgba(68,88,121,0.28)",
            }
          : { color: "var(--muted)", boxShadow: "var(--ring)" }
      }
    >
      {FEATURE_LABELS[feature]}
    </button>
  );
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));
