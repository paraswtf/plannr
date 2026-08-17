"use client";

import { useState } from "react";

import { DatePicker } from "~/components/ui/date-picker";
import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { Select } from "~/components/ui/select";
import { formatMinutesOfDay } from "~/lib/dates";
import { ISO_WEEKDAYS, WEEKDAY_SHORT } from "~/lib/schedule-plan";
import { api, type RouterOutputs } from "~/trpc/react";

type Plan = RouterOutputs["plans"]["byId"];

/**
 * The rules the builder works to.
 *
 * These are a snapshot taken from the institution's settings when the plan was
 * created, not a live reference — a plan under review must not shift because
 * someone shortened the working day this morning. Changing them here changes
 * this plan only.
 */
export function PlanSettingsDialog({
  plan,
  onClose,
  onSaved,
}: {
  plan: Plan;
  onClose: () => void;
  onSaved: () => void | Promise<unknown>;
}) {
  const [name, setName] = useState(plan.name);
  const [notes, setNotes] = useState(plan.notes ?? "");
  const [weekStart, setWeekStart] = useState<Date>(new Date(plan.weekStart));
  const [repeatUntil, setRepeatUntil] = useState<Date | null>(
    plan.repeatUntil ? new Date(plan.repeatUntil) : null,
  );
  const [workingDays, setWorkingDays] = useState<number[]>(
    plan.settings.workingDays,
  );
  const [dayStart, setDayStart] = useState(plan.settings.dayStartMinutes);
  const [dayEnd, setDayEnd] = useState(plan.settings.dayEndMinutes);
  const [slot, setSlot] = useState(plan.settings.slotMinutes);
  const [maxPerDay, setMaxPerDay] = useState(plan.settings.maxPerDay);
  const [spread, setSpread] = useState(plan.settings.spreadAcrossDays);
  const [respectLive, setRespectLive] = useState(
    plan.settings.respectLiveTimetable,
  );
  const [error, setError] = useState<string | null>(null);

  const update = api.plans.update.useMutation({
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const hours = Array.from({ length: 25 }, (_, i) => ({
    value: i * 60,
    label: i === 24 ? "midnight" : formatMinutesOfDay(i * 60),
  }));

  const ready =
    name.trim().length > 0 && workingDays.length > 0 && dayEnd > dayStart;

  return (
    <Dialog
      open
      width={580}
      icon="settings"
      title="How this plan is built"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-muted flex min-h-10 cursor-pointer items-center rounded-lg px-3.5 text-[13px] font-semibold lg:min-h-0 lg:py-2"
            style={{ boxShadow: "var(--ring)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || update.isPending}
            onClick={() => {
              setError(null);
              update.mutate({
                id: plan.id,
                name: name.trim(),
                notes: notes.trim() || null,
                weekStart,
                repeatUntil,
                workingDays,
                dayStartMinutes: dayStart,
                dayEndMinutes: dayEnd,
                slotMinutes: slot,
                maxPerDay,
                spreadAcrossDays: spread,
                respectLiveTimetable: respectLive,
              });
            }}
            className="flex min-h-10 items-center rounded-lg px-3.5 text-[13px] font-semibold text-white lg:min-h-0 lg:py-2"
            style={{
              background: "var(--grad-brand)",
              opacity: ready && !update.isPending ? 1 : 0.5,
              cursor: ready && !update.isPending ? "pointer" : "not-allowed",
            }}
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {error && (
          <div
            className="rounded-xl p-3 text-[13px] font-medium text-[#b02636]"
            style={{
              background: "rgba(220,56,72,0.07)",
              boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
            }}
          >
            {error}
          </div>
        )}

        <Field label="Plan name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-surface w-full rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Field>

        <Field
          label="What this plan is for"
          hint="Shown to reviewers when they open it."
        >
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Sem III after the elective split, assuming the new lab is ready"
            className="bg-surface plr-scroll w-full resize-y rounded-[10px] px-3 py-2 text-[13px] outline-none"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Field>

        {/* Stacked below `sm` because the calendar popover is 268px wide: in
            half a phone's dialog it would hang off the side of the screen. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Week it starts" hint="Snapped to the Monday.">
            <DatePicker
              value={weekStart}
              onChange={setWeekStart}
              timeZone={plan.timeZone}
              ariaLabel="Week the plan starts"
            />
          </Field>
          <Field label="Repeats until" hint="How long the classes run for.">
            <DatePicker
              value={repeatUntil ?? weekStart}
              onChange={setRepeatUntil}
              timeZone={plan.timeZone}
              ariaLabel="Last week the classes run"
            />
          </Field>
        </div>

        <Field label="Days the timetable may use">
          <div className="flex flex-wrap gap-1.5">
            {ISO_WEEKDAYS.map((day) => {
              const on = workingDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    setWorkingDays((current) =>
                      on
                        ? current.filter((d) => d !== day)
                        : [...current, day].sort((a, b) => a - b),
                    )
                  }
                  className="plr-clip flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold lg:min-h-0 lg:min-w-0 lg:py-1.5"
                  style={
                    on
                      ? { background: "var(--slate)", color: "#fff" }
                      : { boxShadow: "var(--ring)", color: "var(--muted)" }
                  }
                >
                  {on && (
                    <Icon name="check" size={11} color="#fff" stroke={3} />
                  )}
                  {WEEKDAY_SHORT[day]}
                </button>
              );
            })}
          </div>
        </Field>

        {/* The two ends of the day stay on one line, since they are set against
            each other; the slot length drops beneath them on a phone. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Day starts">
            <Select
              ariaLabel="Day start"
              size="sm"
              value={dayStart}
              options={hours.slice(0, 24)}
              onChange={setDayStart}
            />
          </Field>
          <Field label="Day ends">
            <Select
              ariaLabel="Day end"
              size="sm"
              value={dayEnd}
              options={hours.filter((h) => h.value > dayStart)}
              onChange={setDayEnd}
            />
          </Field>
          <Field label="Slot length">
            <Select
              ariaLabel="Slot length"
              size="sm"
              value={slot}
              options={[15, 30, 45, 60, 90].map((minutes) => ({
                value: minutes,
                label: `${minutes} min`,
              }))}
              onChange={setSlot}
            />
          </Field>
        </div>

        <Field
          label="Most lectures a group may have in one day"
          hint="Zero means no limit."
        >
          <Select
            ariaLabel="Daily cap"
            size="sm"
            value={maxPerDay}
            options={[
              { value: 0, label: "No limit" },
              ...[2, 3, 4, 5, 6, 7, 8].map((n) => ({
                value: n,
                label: `${n} a day`,
              })),
            ]}
            onChange={setMaxPerDay}
          />
        </Field>

        <Toggle
          checked={spread}
          onChange={setSpread}
          label="Spread a subject's lectures across different days"
          hint="Three lectures of the same subject land on three separate days where the week allows it."
        />
        <Toggle
          checked={respectLive}
          onChange={setRespectLive}
          label="Schedule around the live timetable"
          hint="Treats classes already scheduled that week as occupied. Turning this off produces a plan that will clash when applied."
        />
      </div>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-faint text-[11.5px]">{hint}</span>}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="text-ink block text-[13px] font-semibold">
          {label}
        </span>
        <span className="text-faint block text-[11.5px]">{hint}</span>
      </span>
    </label>
  );
}
