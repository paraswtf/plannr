"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { Segmented } from "~/components/ui/segmented";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { errorMessage } from "~/lib/error-message";
import { api, type RouterOutputs } from "~/trpc/react";

import {
  NewClassFields,
  defaultNewClass,
  newClassSitting,
  type NewClassDraft,
} from "./new-class-fields";
import { SittingPicker } from "./sitting-picker";

export type AssignmentDetailData = RouterOutputs["assignments"]["byId"];
export type DetailSitting = AssignmentDetailData["sittings"][number];
export type SittingState = DetailSitting["state"];

/** What the server's setSitting and setSlot take. */
export type SittingChoice =
  | { eventId: string; originalStart: Date }
  | { newClass: { roomId: string; startTime: Date; endTime: Date } };

export const TZ = DEFAULT_TIMEZONE;

/** "9am-10am" in the institution's time. */
export function timeRange(start: Date, end: Date) {
  return `${formatHourLabel(start, TZ)}-${formatHourLabel(end, TZ)}`;
}

/** What a sitting that is not ok means, and what to do about it. */
export const STATE_COPY: Record<
  Exclude<SittingState, "ok">,
  { badge: string; tone: "orange" | "red"; text: string }
> = {
  pending: {
    badge: "Waiting for approval",
    tone: "orange",
    text: "The class is waiting for a coordinator's approval in Approvals. Students see it once it is approved.",
  },
  cancelled: {
    badge: "Class called off",
    tone: "red",
    text: "The class was called off. Pick another class.",
  },
  lost: {
    badge: "Not on the timetable",
    tone: "red",
    text: "The class is no longer on the timetable. Pick another.",
  },
};

/** Day, time and room of a sitting, on one line. */
export function SittingLine({ sitting }: { sitting: DetailSitting }) {
  return (
    <span className="text-ink inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="text-title font-semibold">
        {formatDayLabel(sitting.startsAt, TZ)}
      </span>
      <span className="font-mono text-xs tabular-nums">
        {timeRange(sitting.startsAt, sitting.endsAt)}
      </span>
      {sitting.roomCode && (
        <span className="text-muted font-mono text-xs">{sitting.roomCode}</span>
      )}
    </span>
  );
}

/**
 * The dialog that picks a class for a test or a team: one of the group's own
 * classes, or a new class scheduled for it.
 */
export function ChooseSittingDialog({
  open,
  onClose,
  title,
  subtitle,
  assignmentId,
  groupId,
  courseId,
  from,
  to,
  saveLabel,
  saving,
  error,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  assignmentId: string;
  groupId: string;
  courseId: string | null;
  from?: Date;
  to?: Date;
  saveLabel: string;
  saving: boolean;
  error: string | null;
  onSave: (choice: SittingChoice) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [existing, setExisting] = useState<{
    eventId: string;
    originalStart: Date;
  } | null>(null);
  const [fresh, setFresh] = useState<NewClassDraft>(() => {
    const draft = defaultNewClass(TZ);
    // A presentation's new class starts on its first day, not before it.
    return from && from > draft.day ? { ...draft, day: from } : draft;
  });

  const choice: SittingChoice | null =
    mode === "existing" ? existing : newClassSitting(fresh, TZ);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon="calendar"
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!choice || saving}
            onClick={() => choice && onSave(choice)}
          >
            {saving ? "Saving..." : saveLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          ariaLabel="Where it happens"
          items={[
            { value: "existing", label: "One of their classes" },
            { value: "new", label: "Schedule a new class" },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === "existing" ? (
          <SittingPicker
            groupId={groupId}
            courseId={courseId}
            currentAssignmentId={assignmentId}
            value={existing}
            onChange={setExisting}
            from={from}
            to={to}
          />
        ) : (
          <NewClassFields value={fresh} onChange={setFresh} timeZone={TZ} />
        )}
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}

/** A test's class: when and where it sits, and the way to move it. */
export function SittingCard({ detail }: { detail: AssignmentDetailData }) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sitting = detail.sittings.find((s) => s.teamId === null) ?? null;

  const setSitting = api.assignments.setSitting.useMutation({
    onSuccess: async (result) => {
      setOpen(false);
      toast.success(
        result.pending
          ? "Class changed. It waits for a coordinator's approval."
          : "Class changed. The students have been told.",
      );
      // The timetable's blocks and the picker's "already holds" both say
      // where the test is, and a new class is a new block.
      await Promise.all([
        utils.assignments.byId.invalidate({ id: detail.id }),
        utils.assignments.list.invalidate(),
        utils.assignments.sittingsFor.invalidate(),
        utils.timetable.invalidate(),
      ]);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const state = sitting && sitting.state !== "ok" ? sitting.state : null;

  return (
    <Card
      title="Class"
      action={
        <Button
          size="sm"
          variant="secondary"
          icon="swap"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          {sitting ? "Change class" : "Pick a class"}
        </Button>
      }
    >
      {sitting ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SittingLine sitting={sitting} />
            {sitting.scheduledForIt && (
              <Badge tone="neutral">Scheduled for this test</Badge>
            )}
            {state && (
              <Badge tone={STATE_COPY[state].tone}>
                {STATE_COPY[state].badge}
              </Badge>
            )}
          </div>
        </div>
      ) : (
        <Callout tone="warn">
          This test has no class to happen in. Pick one of the group&apos;s
          classes, or schedule one.
        </Callout>
      )}

      {open && (
        <ChooseSittingDialog
          open={open}
          onClose={() => setOpen(false)}
          title={sitting ? "Change class" : "Pick a class"}
          subtitle={`${detail.title} · ${detail.group.label}`}
          assignmentId={detail.id}
          groupId={detail.group.id}
          courseId={detail.course?.id ?? null}
          saveLabel="Move the test here"
          saving={setSitting.isPending}
          error={error}
          onSave={(choice) => {
            setError(null);
            setSitting.mutate({ id: detail.id, sitting: choice });
          }}
        />
      )}
    </Card>
  );
}
