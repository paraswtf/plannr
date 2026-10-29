"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Button, buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { DatePicker } from "~/components/ui/date-picker";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Field, Input, Textarea } from "~/components/ui/field";
import { Icon } from "~/components/ui/icon";
import { Skeleton } from "~/components/ui/skeleton";
import { ASSIGNMENT_TYPE_META } from "~/lib/assignments";
import { formatDayLabel, toWallTime } from "~/lib/dates";
import { errorMessage } from "~/lib/error-message";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api } from "~/trpc/react";

import { MAX_WINDOW_DAYS, windowDays } from "./create-assignment-dialog";
import { PaperCard } from "./paper-card";
import {
  STATE_COPY,
  SittingCard,
  SittingLine,
  TZ,
  type AssignmentDetailData,
} from "./sitting-card";
import { SlotsTable, dayStart } from "./slots-table";
import { RefreshFailed, StudentAssignment } from "./student-assignment";
import { TeamsEditor } from "./teams-editor";

/** A local-midnight instant as YYYY-MM-DD in the institution's time. */
function isoDay(instant: Date) {
  const w = toWallTime(instant, TZ);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

export function AssignmentDetail({
  id,
  permissions,
  initial,
}: {
  id: string;
  /** The viewer's permission bits, as a decimal string. */
  permissions: string;
  initial?: AssignmentDetailData;
}) {
  const query = api.assignments.byId.useQuery({ id }, { initialData: initial });

  if (query.isLoading) {
    return (
      <>
        <PageHeader
          title="Assignment"
          back={{ href: "/assignments", label: "Assignments" }}
        />
        <PageBody width="wide">
          <div
            role="status"
            aria-label="Loading the assignment"
            className="flex flex-col gap-5"
          >
            <Skeleton className="h-36" />
            <Skeleton className="h-48" />
          </div>
        </PageBody>
      </>
    );
  }

  // A failed background refresh keeps the page that is already showing; only a
  // first load that fails has nothing to show but the error.
  if (!query.data) {
    return (
      <>
        <PageHeader
          title="Assignment"
          back={{ href: "/assignments", label: "Assignments" }}
        />
        <PageBody width="narrow">
          <Card pad={0}>
            <EmptyState
              icon="alert"
              title={
                query.error?.data?.code === "NOT_FOUND"
                  ? "This assignment has been deleted, or it is not one of yours."
                  : "This assignment could not be opened."
              }
              action={
                <Button
                  variant="secondary"
                  onClick={() => void query.refetch()}
                >
                  Try again
                </Button>
              }
            >
              {errorMessage(query.error)}
            </EmptyState>
          </Card>
        </PageBody>
      </>
    );
  }

  const detail = query.data;
  const canSet = new PermissionBitField(BigInt(permissions)).has(
    PermissionFlags.ManageOwnAssignments,
  );
  const refreshFailed = Boolean(query.error);
  if (detail.role !== "manager" || !canSet) {
    return <StudentAssignment detail={detail} refreshFailed={refreshFailed} />;
  }
  return <ManagerView detail={detail} refreshFailed={refreshFailed} />;
}

function ManagerView({
  detail,
  refreshFailed,
}: {
  detail: AssignmentDetailData;
  refreshFailed: boolean;
}) {
  const meta = ASSIGNMENT_TYPE_META[detail.type];
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const troubled = detail.sittings.filter((s) => s.state !== "ok");
  const worst = (["lost", "cancelled", "pending"] as const).find((s) =>
    troubled.some((t) => t.state === s),
  );

  return (
    <>
      <PageHeader
        title={detail.title}
        back={{ href: "/assignments", label: "Assignments" }}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone="slate">{meta.label}</Badge>
            <span>
              {[detail.course?.title, detail.group.label]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon="pencil"
              onClick={() => setEditing(true)}
            >
              Edit details
            </Button>
            <Button
              variant="danger-quiet"
              icon="trash"
              onClick={() => setDeleting(true)}
            >
              Delete
            </Button>
          </div>
        }
      />
      <PageBody width="wide">
        <div className="flex flex-col gap-5">
          {refreshFailed && <RefreshFailed />}
          <Card title="Summary">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <SummaryItem label="Group">{detail.group.label}</SummaryItem>
              <SummaryItem label="Course">
                {detail.course?.title ?? "No course"}
              </SummaryItem>
              <SummaryItem label="Set by">
                {detail.setBy
                  ? detail.isMine
                    ? `${detail.setBy.name} (you)`
                    : detail.setBy.name
                  : "Nobody on record"}
              </SummaryItem>
              <SummaryItem label="When">
                <When detail={detail} />
              </SummaryItem>
              {meta.answeredInApp && detail.durationMinutes && (
                <SummaryItem label="Time allowed">
                  <span className="font-mono tabular-nums">
                    {detail.durationMinutes} min
                  </span>
                </SummaryItem>
              )}
            </dl>
            {worst && (
              <Callout
                className="mt-4"
                tone={worst === "pending" ? "warn" : "bad"}
              >
                {meta.isTest
                  ? STATE_COPY[worst].text
                  : `${troubled.length} ${troubled.length === 1 ? "slot needs" : "slots need"} attention. ${STATE_COPY[worst].text}`}
              </Callout>
            )}
            {detail.instructions && (
              <div className="mt-4 flex flex-col gap-1">
                <span className="text-title text-xs font-semibold">
                  Instructions
                </span>
                <p className="text-ink text-sm whitespace-pre-wrap">
                  {detail.instructions}
                </p>
              </div>
            )}
          </Card>

          {meta.isTest ? (
            <>
              <SittingCard detail={detail} />
              <PaperCard
                assignmentId={detail.id}
                type={detail.type}
                isOwner={
                  detail.paper && "isOwner" in detail.paper
                    ? (detail.paper.isOwner ?? true)
                    : true
                }
              />
              {meta.answeredInApp && (
                <Card title="Answers">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-ink text-sm">
                      <span className="font-mono tabular-nums">
                        {detail.counts.submitted}
                      </span>{" "}
                      of{" "}
                      <span className="font-mono tabular-nums">
                        {detail.counts.students}
                      </span>{" "}
                      students have handed in.
                    </p>
                    <Link
                      href={`/assignments/${detail.id}/marking`}
                      className={buttonClass("secondary", "md")}
                    >
                      Answers and marking
                      <Icon name="arrowRight" size={15} stroke={2} />
                    </Link>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <>
              <PresentationDays detail={detail} />
              <TeamsEditor detail={detail} />
              <SlotsTable detail={detail} />
            </>
          )}
        </div>
      </PageBody>

      {editing && (
        <EditDetailsDialog detail={detail} onClose={() => setEditing(false)} />
      )}
      {deleting && (
        <DeleteDialog detail={detail} onClose={() => setDeleting(false)} />
      )}
    </>
  );
}

function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="text-ink text-sm">{children}</dd>
    </div>
  );
}

function When({ detail }: { detail: AssignmentDetailData }) {
  const meta = ASSIGNMENT_TYPE_META[detail.type];
  if (meta.isTest) {
    const sitting = detail.sittings.find((s) => s.teamId === null);
    return sitting ? (
      <SittingLine sitting={sitting} />
    ) : (
      <span className="text-muted">No class yet</span>
    );
  }
  if (!detail.window) return <span className="text-muted">No days set</span>;
  const booked = detail.sittings.filter((s) => s.teamId !== null).length;
  return (
    <span>
      {formatDayLabel(dayStart(detail.window.start), TZ)} to{" "}
      {formatDayLabel(dayStart(detail.window.end), TZ)}
      <span className="text-faint">
        {" "}
        · <span className="font-mono tabular-nums">{booked}</span> of{" "}
        <span className="font-mono tabular-nums">{detail.teams.length}</span>{" "}
        teams booked
      </span>
    </span>
  );
}

/** The days a presentation runs over and the minutes each team has. */
function PresentationDays({ detail }: { detail: AssignmentDetailData }) {
  const utils = api.useUtils();
  const today = new Date();
  const [start, setStart] = useState<Date>(
    detail.window ? dayStart(detail.window.start) : today,
  );
  const [end, setEnd] = useState<Date>(
    detail.window ? dayStart(detail.window.end) : today,
  );
  const [minutes, setMinutes] = useState(
    detail.minutesPerTeam ? String(detail.minutesPerTeam) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const startDay = isoDay(start);
  const endDay = isoDay(end);
  const minutesValue = minutes.trim() === "" ? null : Number(minutes);
  const minutesBad =
    minutesValue !== null &&
    (!Number.isInteger(minutesValue) || minutesValue < 1 || minutesValue > 240);
  const rangeBad = endDay < startDay;
  const rangeLong = !rangeBad && windowDays(startDay, endDay) > MAX_WINDOW_DAYS;
  const changed =
    startDay !== detail.window?.start ||
    endDay !== detail.window?.end ||
    minutesValue !== detail.minutesPerTeam;

  const update = api.assignments.update.useMutation({
    onSuccess: async () => {
      toast.success("Days and minutes saved.");
      await Promise.all([
        utils.assignments.byId.invalidate({ id: detail.id }),
        utils.assignments.list.invalidate(),
      ]);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Card title="Days and minutes">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="First day">
            {(id) => (
              <DatePicker
                id={id}
                value={start}
                onChange={(d) => {
                  setStart(d);
                  setError(null);
                }}
                timeZone={TZ}
                ariaLabel="First day"
              />
            )}
          </Field>
          <Field
            label="Last day"
            error={
              rangeBad
                ? "The last day must be on or after the first."
                : rangeLong
                  ? `A presentation can run over at most ${MAX_WINDOW_DAYS} days.`
                  : undefined
            }
          >
            {(id) => (
              <DatePicker
                id={id}
                value={end}
                onChange={(d) => {
                  setEnd(d);
                  setError(null);
                }}
                timeZone={TZ}
                ariaLabel="Last day"
              />
            )}
          </Field>
          <Field
            label="Minutes per team"
            optional
            error={
              minutesBad ? "Give a whole number from 1 to 240." : undefined
            }
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={240}
                value={minutes}
                invalid={minutesBad}
                onChange={(e) => {
                  setMinutes(e.target.value);
                  setError(null);
                }}
              />
            )}
          </Field>
        </div>
        <p className="text-muted text-sm">
          With minutes set, teams that share a class get an estimated start
          within it.
        </p>
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}
        <div className="flex justify-end">
          <Button
            variant="secondary"
            disabled={
              !changed ||
              minutesBad ||
              rangeBad ||
              rangeLong ||
              update.isPending
            }
            onClick={() =>
              update.mutate({
                id: detail.id,
                window: { start: startDay, end: endDay },
                minutesPerTeam: minutesValue,
              })
            }
          >
            {update.isPending ? "Saving..." : "Save days and minutes"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EditDetailsDialog({
  detail,
  onClose,
}: {
  detail: AssignmentDetailData;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const meta = ASSIGNMENT_TYPE_META[detail.type];
  const [title, setTitle] = useState(detail.title);
  const [instructions, setInstructions] = useState(detail.instructions ?? "");
  const [duration, setDuration] = useState(
    detail.durationMinutes ? String(detail.durationMinutes) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const durationValue = duration.trim() === "" ? null : Number(duration);
  const durationBad =
    durationValue !== null &&
    (!Number.isInteger(durationValue) ||
      durationValue < 5 ||
      durationValue > 600);

  const update = api.assignments.update.useMutation({
    onSuccess: async () => {
      toast.success("Details saved.");
      await Promise.all([
        utils.assignments.byId.invalidate({ id: detail.id }),
        utils.assignments.list.invalidate(),
        // A new title is what the timetable's blocks and the picker show.
        utils.assignments.sittingsFor.invalidate(),
        utils.timetable.invalidate(),
      ]);
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const save = () => {
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    update.mutate({
      id: detail.id,
      title: title.trim(),
      instructions: instructions.trim() || null,
      ...(meta.answeredInApp ? { durationMinutes: durationValue } : {}),
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit details"
      subtitle={meta.label}
      icon="pencil"
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={update.isPending || durationBad}
            onClick={save}
          >
            {update.isPending ? "Saving..." : "Save details"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Title"
          error={!title.trim() ? "Give it a title." : undefined}
        >
          {(id) => (
            <Input
              id={id}
              value={title}
              maxLength={160}
              invalid={!title.trim()}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Instructions"
          optional
          hint="What students should bring, read or prepare."
        >
          {(id) => (
            <Textarea
              id={id}
              rows={5}
              maxLength={4000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          )}
        </Field>
        {meta.answeredInApp && (
          <Field
            label="Time allowed, in minutes"
            optional
            hint="Left empty, the paper is open until the class ends."
            error={
              durationBad ? "Give a whole number from 5 to 600." : undefined
            }
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={5}
                max={600}
                value={duration}
                invalid={durationBad}
                onChange={(e) => setDuration(e.target.value)}
              />
            )}
          </Field>
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

function DeleteDialog({
  detail,
  onClose,
}: {
  detail: AssignmentDetailData;
  onClose: () => void;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const meta = ASSIGNMENT_TYPE_META[detail.type];
  const scheduled = detail.sittings.filter((s) => s.scheduledForIt);
  const [cancelClasses, setCancelClasses] = useState(false);
  /** The server's word that students have answered, once it has said so. */
  const [answered, setAnswered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = api.assignments.remove.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.cancelledClasses > 0
          ? `${meta.label} deleted, and ${result.cancelledClasses} ${result.cancelledClasses === 1 ? "class" : "classes"} called off.`
          : `${meta.label} deleted.`,
      );
      await Promise.all([
        utils.assignments.list.invalidate(),
        utils.assignments.sittingsFor.invalidate(),
        utils.timetable.invalidate(),
      ]);
      router.push("/assignments");
    },
    onError: (e) => {
      if (e.data?.code === "PRECONDITION_FAILED") {
        setAnswered(errorMessage(e));
        setError(null);
      } else {
        setError(errorMessage(e));
      }
    },
  });

  const send = () =>
    remove.mutate({
      id: detail.id,
      cancelScheduledClasses: cancelClasses,
      confirmAnswers: answered !== null,
    });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Delete ${meta.label.toLowerCase()}`}
      subtitle={detail.title}
      icon="trash"
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" disabled={remove.isPending} onClick={send}>
            {remove.isPending
              ? "Deleting..."
              : answered
                ? "Delete it and the answers"
                : `Delete ${meta.label.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ink text-sm">
          {meta.isTest
            ? "The test comes off the class it was set in, and students are told it is withdrawn."
            : "The teams and their slots go with it, and students are told it is withdrawn."}{" "}
          This cannot be undone.
        </p>
        {scheduled.length > 0 && (
          <Checkbox
            checked={cancelClasses}
            onChange={setCancelClasses}
            label={
              scheduled.length === 1
                ? "Also call off the class scheduled for it"
                : "Also call off the classes scheduled for it"
            }
            description="Left unticked, the class stays on the timetable. A class still waiting for approval is withdrawn either way."
          />
        )}
        {answered && (
          <Callout tone="warn" role="alert" title="Students have answered">
            {answered} To go ahead, choose Delete it and the answers.
          </Callout>
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
