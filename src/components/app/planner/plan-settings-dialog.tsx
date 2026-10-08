"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Checkbox } from "~/components/ui/checkbox";
import { ToggleChip } from "~/components/ui/chip";
import { DatePicker } from "~/components/ui/date-picker";
import { Dialog } from "~/components/ui/dialog";
import { Field, Input, Textarea } from "~/components/ui/field";
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
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
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
          >
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {/* Eleven controls in three runs, a hairline between them: what the plan
          is, when it runs, and the rules the builder keeps. Every control is
          the same height now; the pickers in the middle used to be a size
          smaller than the date fields above them. */}
      <div className="flex flex-col gap-5">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        <div className="flex flex-col gap-4">
          <Field label="Plan name">
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="What this plan is for"
            optional
            hint="Shown to reviewers when they open it."
          >
            {(id) => (
              <Textarea
                id={id}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Sem III after the elective split, assuming the new lab is ready"
                className="plr-scroll"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-4 pt-5 shadow-[inset_0_1px_0_var(--hair-soft)]">
          {/* Stacked below `sm` because the calendar popover is 268px wide: in
              half a phone's dialog it would hang off the side of the screen. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Week it starts" hint="Snapped to the Monday.">
              {(id) => (
                <DatePicker
                  id={id}
                  value={weekStart}
                  onChange={setWeekStart}
                  timeZone={plan.timeZone}
                />
              )}
            </Field>
            <Field label="Repeats until" hint="How long the classes run for.">
              {(id) => (
                <DatePicker
                  id={id}
                  value={repeatUntil ?? weekStart}
                  onChange={setRepeatUntil}
                  timeZone={plan.timeZone}
                />
              )}
            </Field>
          </div>

          <Field label="Days the timetable may use">
            <div className="flex flex-wrap gap-1.5">
              {ISO_WEEKDAYS.map((day) => {
                const on = workingDays.includes(day);
                return (
                  <ToggleChip
                    key={day}
                    pressed={on}
                    className="min-w-10"
                    onClick={() =>
                      setWorkingDays((current) =>
                        on
                          ? current.filter((d) => d !== day)
                          : [...current, day].sort((a, b) => a - b),
                      )
                    }
                  >
                    {WEEKDAY_SHORT[day]}
                  </ToggleChip>
                );
              })}
            </div>
          </Field>

          {/* The two ends of the day stay on one line, since they are set against
              each other; the slot length drops beneath them on a phone. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Day starts">
              {(id) => (
                <Select
                  id={id}
                  value={dayStart}
                  options={hours.slice(0, 24)}
                  onChange={setDayStart}
                />
              )}
            </Field>
            <Field label="Day ends">
              {(id) => (
                <Select
                  id={id}
                  value={dayEnd}
                  options={hours.filter((h) => h.value > dayStart)}
                  onChange={setDayEnd}
                />
              )}
            </Field>
            <Field label="Slot length">
              {(id) => (
                <Select
                  id={id}
                  value={slot}
                  options={[15, 30, 45, 60, 90].map((minutes) => ({
                    value: minutes,
                    label: `${minutes} min`,
                  }))}
                  onChange={setSlot}
                />
              )}
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-5 shadow-[inset_0_1px_0_var(--hair-soft)]">
          {/* No hint: it said "Zero means no limit." over a list whose first
              choice already reads "No limit", which is the same fact told in
              a way the list never shows. */}
          <Field label="Most lectures a group may have in one day">
            {(id) => (
              <Select
                id={id}
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
            )}
          </Field>

          <Checkbox
            checked={spread}
            onChange={setSpread}
            label="Spread a subject's lectures across different days"
            description="Three lectures of the same subject land on three separate days where the week allows it."
          />
          <Checkbox
            checked={respectLive}
            onChange={setRespectLive}
            label="Schedule around the live timetable"
            description="Treats classes already scheduled that week as occupied. Turning this off produces a plan that will clash when applied."
          />
        </div>
      </div>
    </Dialog>
  );
}
