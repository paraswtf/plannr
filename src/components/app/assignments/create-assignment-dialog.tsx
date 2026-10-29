"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { DatePicker } from "~/components/ui/date-picker";
import { Dialog } from "~/components/ui/dialog";
import { Field, Input, Textarea } from "~/components/ui/field";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  ASSIGNMENT_TYPE_META,
  ASSIGNMENT_TYPES,
  type AssignmentType,
} from "~/lib/assignments";
import {
  addDays,
  DEFAULT_TIMEZONE,
  startOfLocalDay,
  toWallTime,
} from "~/lib/dates";
import { errorMessage } from "~/lib/error-message";
import { api } from "~/trpc/react";
import {
  defaultNewClass,
  NewClassFields,
  newClassSitting,
  type NewClassDraft,
} from "./new-class-fields";
import { SittingPicker, type SittingChoice } from "./sitting-picker";

const TZ = DEFAULT_TIMEZONE;

/** A day as YYYY-MM-DD, read in the institution's time (never via UTC). */
function ymd(day: Date) {
  const w = toWallTime(day, TZ);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** A whole number typed in a box, or null when it is empty; NaN when it is not one. */
function whole(raw: string) {
  const text = raw.trim();
  if (!text) return null;
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

/** The longest presentation window the server accepts, in days. */
export const MAX_WINDOW_DAYS = 120;

/**
 * The days from the first to the last of a window given as YYYY-MM-DD, counted
 * the way the server counts them, so the form refuses what it would refuse.
 */
export function windowDays(first: string, last: string) {
  return (
    (Date.parse(`${last}T00:00:00.000Z`) -
      Date.parse(`${first}T00:00:00.000Z`)) /
    86_400_000
  );
}

const pairKey = (p: { groupId: string; courseId: string | null }) =>
  `${p.groupId}:${p.courseId ?? "none"}`;

/** Setting a test or a presentation for a group the person teaches. */
export function CreateAssignmentDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const utils = api.useUtils();
  const teaching = api.assignments.teaching.useQuery();

  const [type, setType] = useState<AssignmentType | null>(null);
  const [title, setTitle] = useState("");
  const [pair, setPair] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [sitting, setSitting] = useState<SittingChoice | null>(null);
  const [newClass, setNewClass] = useState<NewClassDraft>(() =>
    defaultNewClass(TZ),
  );
  const [duration, setDuration] = useState("");
  const [firstDay, setFirstDay] = useState(() =>
    startOfLocalDay(new Date(), TZ),
  );
  const [lastDay, setLastDay] = useState(() =>
    startOfLocalDay(addDays(new Date(), 7, TZ), TZ),
  );
  const [perTeam, setPerTeam] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const meta = type ? ASSIGNMENT_TYPE_META[type] : null;
  const chosenPair = teaching.data?.find((p) => pairKey(p) === pair) ?? null;

  const create = api.assignments.create.useMutation({
    onSuccess: async (result) => {
      toast.success(
        meta?.isTest
          ? result.pending
            ? "Test set. The class is waiting for approval."
            : "Test set"
          : "Presentation set",
      );
      // The timetable and the class picker show what is pinned where, and a
      // test set in a new class is a new block on the timetable.
      await Promise.all([
        utils.assignments.list.invalidate(),
        utils.assignments.sittingsFor.invalidate(),
        utils.timetable.invalidate(),
      ]);
      router.push(`/assignments/${result.id}`);
      onClose();
    },
    // Every refusal is shown in the form, CONFLICT from a new class above
    // all: the room or the group is already taken at that time.
    onError: (e) => setError(errorMessage(e)),
  });

  const minutes = whole(duration);
  const durationBad =
    minutes !== null && (Number.isNaN(minutes) || minutes < 5 || minutes > 600);
  const team = whole(perTeam);
  const perTeamBad =
    team !== null && (Number.isNaN(team) || team < 1 || team > 240);
  const windowBad = lastDay.getTime() < firstDay.getTime();
  const windowLong =
    !windowBad && windowDays(ymd(firstDay), ymd(lastDay)) > MAX_WINDOW_DAYS;

  const sittingInput = !meta?.isTest
    ? undefined
    : mode === "existing"
      ? (sitting ?? undefined)
      : (newClassSitting(newClass, TZ) ?? undefined);

  const ready =
    !!meta &&
    !!chosenPair &&
    title.trim().length > 0 &&
    (meta.isTest
      ? !!sittingInput && !durationBad
      : !windowBad && !windowLong && !perTeamBad);

  const submit = () => {
    if (!ready || !meta || !chosenPair || !type) return;
    setError(null);
    create.mutate({
      type,
      title: title.trim(),
      instructions: instructions.trim() || undefined,
      groupId: chosenPair.groupId,
      courseId: chosenPair.courseId ?? undefined,
      ...(meta.isTest
        ? {
            sitting: sittingInput,
            durationMinutes:
              meta.answeredInApp && minutes !== null ? minutes : undefined,
          }
        : {
            window: { start: ymd(firstDay), end: ymd(lastDay) },
            minutesPerTeam: team ?? undefined,
          }),
    });
  };

  const busy = create.isPending;
  const action = !meta
    ? "Set assignment"
    : meta.isTest
      ? "Set test"
      : "Set presentation";

  return (
    <Dialog
      open
      title="New assignment"
      subtitle="A test or a presentation for one of your groups"
      icon="pencil"
      width={720}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready || busy} onClick={submit}>
            {busy ? "Setting…" : action}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p id="assignment-type" className="text-title text-xs font-semibold">
            What kind
          </p>
          <div
            role="radiogroup"
            aria-labelledby="assignment-type"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {ASSIGNMENT_TYPES.map((t) => {
              const m = ASSIGNMENT_TYPE_META[t];
              const chosen = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={busy}
                  onClick={() => setType(t)}
                  className={`flex min-h-12 cursor-pointer flex-col gap-1 rounded-[12px] px-3.5 py-3 text-left transition-[background-color,box-shadow] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${
                    chosen
                      ? "bg-tint-selected shadow-[inset_0_0_0_1.5px_var(--slate)]"
                      : "bg-surface hover:bg-tint-hover shadow-[inset_0_0_0_1px_var(--card-ring)]"
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${chosen ? "text-slate-ink" : "text-title"}`}
                  >
                    {m.label}
                  </span>
                  <span className="text-muted text-xs">{m.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Title">
          {(id) => (
            <Input
              id={id}
              value={title}
              maxLength={160}
              disabled={busy}
              placeholder="Unit 2: trees and graphs"
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>

        <Field label="Group and course">
          {(id) =>
            teaching.isLoading ? (
              <div role="status" aria-label="Loading your groups">
                <Skeleton className="h-10 w-full lg:h-9" />
              </div>
            ) : teaching.error ? (
              <Callout tone="bad" title="Could not load your groups">
                {errorMessage(teaching.error, "")} Close this and try again.
              </Callout>
            ) : (teaching.data?.length ?? 0) === 0 ? (
              <Callout tone="info">
                You are not on the timetable for any group this semester, so
                there is no class to set work for yet.
              </Callout>
            ) : (
              <Select
                id={id}
                value={pair}
                placeholder="Choose a group and course"
                onChange={(next) => {
                  setPair(next);
                  // A class picked for the last group is not one of this one's.
                  setSitting(null);
                }}
                options={(teaching.data ?? []).map((p) => ({
                  value: pairKey(p),
                  label: p.courseTitle
                    ? `${p.groupLabel}, ${p.courseTitle}`
                    : `${p.groupLabel}, classes with no course`,
                }))}
              />
            )
          }
        </Field>

        {meta?.isTest && chosenPair && (
          <div className="flex flex-col gap-3">
            <p className="text-title text-xs font-semibold">When it is held</p>
            <Segmented
              ariaLabel="When it is held"
              items={[
                { value: "existing" as const, label: "In one of your classes" },
                { value: "new" as const, label: "Schedule a new class" },
              ]}
              value={mode}
              onChange={setMode}
            />
            {mode === "existing" ? (
              <SittingPicker
                groupId={chosenPair.groupId}
                courseId={chosenPair.courseId ?? undefined}
                value={sitting}
                onChange={setSitting}
                timeZone={TZ}
              />
            ) : (
              <NewClassFields
                value={newClass}
                onChange={setNewClass}
                disabled={busy}
                timeZone={TZ}
              />
            )}
          </div>
        )}

        {meta?.isTest && meta.answeredInApp && (
          <Field
            label="Time to answer, in minutes"
            optional
            hint="Leave empty to give students until the class ends."
            error={
              durationBad ? "Give a number of minutes from 5 to 600." : null
            }
          >
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={duration}
                disabled={busy}
                invalid={durationBad}
                className="sm:max-w-40"
                inputClassName="font-mono tabular-nums"
                onChange={(e) => setDuration(e.target.value)}
              />
            )}
          </Field>
        )}

        {meta && !meta.isTest && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First day">
                {(id) => (
                  <DatePicker
                    id={id}
                    value={firstDay}
                    timeZone={TZ}
                    onChange={(day) => {
                      setFirstDay(day);
                      if (lastDay.getTime() < day.getTime()) setLastDay(day);
                    }}
                  />
                )}
              </Field>
              <Field
                label="Last day"
                error={
                  windowBad
                    ? "The last day must be on or after the first."
                    : windowLong
                      ? `A presentation can run over at most ${MAX_WINDOW_DAYS} days.`
                      : null
                }
              >
                {(id) => (
                  <DatePicker
                    id={id}
                    value={lastDay}
                    timeZone={TZ}
                    onChange={setLastDay}
                  />
                )}
              </Field>
            </div>
            <Field
              label="Minutes per team"
              optional
              error={
                perTeamBad ? "Give a number of minutes from 1 to 240." : null
              }
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={perTeam}
                  disabled={busy}
                  invalid={perTeamBad}
                  className="sm:max-w-40"
                  inputClassName="font-mono tabular-nums"
                  onChange={(e) => setPerTeam(e.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        {meta && (
          <Field label="Instructions" optional>
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                maxLength={4000}
                value={instructions}
                disabled={busy}
                placeholder="What to bring, what it covers"
                onChange={(e) => setInstructions(e.target.value)}
              />
            )}
          </Field>
        )}

        {error && (
          <Callout tone="bad" role="alert" title="Could not set it">
            {error}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
