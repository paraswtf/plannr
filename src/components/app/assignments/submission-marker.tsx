"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Field, Input, Textarea } from "~/components/ui/field";
import { Skeleton } from "~/components/ui/skeleton";
import { sameMarks, type SheetEntry } from "~/lib/assignments";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { errorMessage } from "~/lib/error-message";
import { api, type RouterOutputs } from "~/trpc/react";

import {
  AnswerValue,
  QuestionText,
  marksLabel,
  optionLetter,
  questionsByKey,
} from "./answer-sheet";

const TZ = DEFAULT_TIMEZONE;
const FEEDBACK_MAX = 4000;

type Detail = RouterOutputs["submissions"]["byId"];

/** What the form tells the screen around it, so leaving it can ask first. */
interface FormHandle {
  /** Marks or feedback differ from what is saved. */
  dirty: boolean;
  /** Saves them, and says whether that worked. */
  save: () => Promise<boolean>;
}

/** "Tue 4 Nov, 10am" in the institution's time. */
const at = (d: Date) => `${formatDayLabel(d, TZ)}, ${formatHourLabel(d, TZ)}`;

/** Why a typed mark will not do, or null when it is fine (an empty box is fine). */
function markError(raw: string, entry: SheetEntry): string | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Type a number.";
  if (n < 0 || n > entry.marks) return `Between 0 and ${entry.marks}.`;
  if (!Number.isInteger(n * 2)) return "Marks go in steps of a half.";
  return null;
}

/** One student's answers beside the paper, with a marks box per question. */
export function SubmissionMarker({
  submissionId,
  totalMarks,
  onBack,
  onPrevious,
  onNext,
  position,
}: {
  submissionId: string;
  totalMarks: number | null;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position?: { at: number; of: number };
}) {
  const detail = api.submissions.byId.useQuery({ submissionId });
  // The form below registers itself here, so moving to another student can
  // ask before marks that are not saved are thrown away.
  const form = useRef<FormHandle | null>(null);
  const [leavingTo, setLeavingTo] = useState<(() => void) | null>(null);
  const [savingFirst, setSavingFirst] = useState(false);

  // Closing or reloading the tab with marks not saved asks too.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (form.current?.dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const go = (to: (() => void) | undefined) =>
    to &&
    (() => {
      if (form.current?.dirty) setLeavingTo(() => to);
      else to();
    });

  const saveAndGo = async () => {
    const to = leavingTo;
    setSavingFirst(true);
    const saved = (await form.current?.save()) ?? true;
    setSavingFirst(false);
    setLeavingTo(null);
    // A save that did not work leaves the teacher on the form, with its error.
    if (saved) to?.();
  };

  const nav = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" icon="chevronLeft" onClick={go(onBack)}>
        Back to the roster
      </Button>
      <div className="flex items-center gap-2">
        {position && (
          <span className="text-faint font-mono text-xs tabular-nums">
            {position.at} of {position.of}
          </span>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={!onPrevious}
          onClick={go(onPrevious)}
        >
          Previous student
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!onNext}
          onClick={go(onNext)}
        >
          Next student
        </Button>
      </div>
      <Dialog
        open={leavingTo !== null}
        title="Save these marks first?"
        icon="alert"
        onClose={() => setLeavingTo(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeavingTo(null)}>
              Keep marking
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const to = leavingTo;
                setLeavingTo(null);
                to?.();
              }}
            >
              Discard them
            </Button>
            <Button
              variant="primary"
              disabled={savingFirst}
              onClick={() => void saveAndGo()}
            >
              {savingFirst ? "Saving marks" : "Save and go on"}
            </Button>
          </>
        }
      >
        <p className="text-ink text-sm">
          This student&apos;s marks or feedback are not saved. That includes the
          marks the key suggests for choice questions, until you save them.
          Students see only saved marks.
        </p>
      </Dialog>
    </div>
  );

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {nav}
        <div
          role="status"
          aria-label="Loading the answers"
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-20" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  // Only when there is nothing to show: a failed check in the background
  // keeps the form, and the marks typed into it, on screen.
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-4">
        {nav}
        <Card pad={0}>
          <EmptyState
            icon="alert"
            title="These answers could not be loaded."
            action={
              <Button variant="secondary" onClick={() => void detail.refetch()}>
                Try again
              </Button>
            }
          >
            {errorMessage(detail.error)}
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {nav}
      {detail.error && (
        <Callout tone="warn">
          These answers could not be checked again just now. What is on screen
          stands, and saving works once the connection is back.
        </Callout>
      )}
      <MarkForm data={detail.data} totalMarks={totalMarks} handle={form} />
    </div>
  );
}

function MarkForm({
  data,
  totalMarks,
  handle,
}: {
  data: Detail;
  totalMarks: number | null;
  handle: React.RefObject<FormHandle | null>;
}) {
  const utils = api.useUtils();
  const questions = questionsByKey(data.releasedQuestions);

  // Marks already given, or what the key gives a choice question.
  const [marks, setMarks] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const entry of data.sheet) {
      const given = data.marks?.[entry.key] ?? data.autoMarks[entry.key];
      start[entry.key] = given === undefined ? "" : String(given);
    }
    return start;
  });
  const [feedback, setFeedback] = useState(data.feedback ?? "");
  // What the server has, kept here as well as in `data` so the form reads as
  // saved the moment a save is answered, before the refetch comes back.
  const [saved, setSaved] = useState(() => ({
    marks: data.marks ?? {},
    feedback: data.feedback ?? "",
  }));
  const [formError, setFormError] = useState<string | null>(null);

  const mark = api.submissions.mark.useMutation({
    onSuccess: async (result, input) => {
      setSaved({ marks: input.marks, feedback: input.feedback ?? "" });
      setFormError(null);
      toast.success(`Marks saved. ${data.student.name} has ${result.score}.`);
      await Promise.all([
        utils.submissions.roster.invalidate({
          assignmentId: data.assignmentId,
        }),
        utils.submissions.byId.invalidate({ submissionId: data.id }),
      ]);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const errors = Object.fromEntries(
    data.sheet.map((e) => [e.key, markError(marks[e.key] ?? "", e)]),
  );
  const invalid = Object.values(errors).some(Boolean);
  const score = data.sheet.reduce((sum, e) => {
    const n = Number(marks[e.key]);
    return errors[e.key] || !marks[e.key]?.trim() ? sum : sum + n;
  }, 0);
  const total = totalMarks ?? data.sheet.reduce((sum, e) => sum + e.marks, 0);
  const stillAnswering = data.status === "in progress";

  // The marks as they would be saved. A mark that is not a number yet counts
  // as a change, so leaving asks.
  const given: Record<string, number> = {};
  for (const entry of data.sheet) {
    const raw = marks[entry.key]?.trim();
    if (raw) given[entry.key] = Number(raw);
  }
  // Compared with what is saved, not with what was first on screen: the key's
  // suggestions for choice questions are not saved until the teacher saves.
  const dirty =
    !stillAnswering &&
    (!sameMarks(given, saved.marks) || feedback.trim() !== saved.feedback);

  const save = async (): Promise<boolean> => {
    if (invalid) {
      setFormError("Some marks need fixing before they can be saved.");
      return false;
    }
    try {
      await mark.mutateAsync({
        submissionId: data.id,
        marks: given,
        feedback: feedback.trim(),
      });
      return true;
    } catch {
      // onError has put the reason on the form.
      return false;
    }
  };

  useEffect(() => {
    handle.current = { dirty, save };
  });
  useEffect(
    () => () => {
      handle.current = null;
    },
    [handle],
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-title text-md font-semibold">
              {data.student.name}
            </span>
            <span className="text-faint font-mono text-xs">
              {data.student.prn}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-title font-mono text-xl font-semibold tabular-nums">
              {score}
              <span className="text-faint text-sm"> of {total}</span>
            </span>
            {data.markedAt && (
              <span className="text-faint text-xs">
                Marked{" "}
                <span className="font-mono tabular-nums">
                  {at(data.markedAt)}
                </span>
              </span>
            )}
          </div>
        </div>
        <p className="text-muted mt-2 text-sm">
          {data.submittedAt ? (
            <>
              Handed in at{" "}
              <span className="font-mono tabular-nums">
                {at(data.submittedAt)}
              </span>
              .
            </>
          ) : stillAnswering ? (
            "Still answering. You can mark these answers once they are handed in or the test closes."
          ) : (
            "Handed in when the paper closed."
          )}
        </p>
      </Card>

      <Card title="Answers">
        <ol className="flex flex-col">
          {data.sheet.map((entry) => {
            const question = questions.get(entry.key);
            const correct = data.answerKey[entry.key];
            const auto = data.autoMarks[entry.key];
            return (
              <li
                key={entry.key}
                className="flex flex-col gap-3 py-4 shadow-[0_1px_0_var(--hair-soft)] first:pt-0 last:pb-0 last:shadow-none"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-title text-sm font-semibold">
                    Question {entry.label}
                  </span>
                  <span className="text-faint font-mono text-xs">
                    {marksLabel(entry.marks)}
                  </span>
                </div>
                {question && <QuestionText question={question} />}
                <div className="bg-tint flex flex-col gap-1 rounded-[10px] px-3 py-2">
                  <span className="text-muted text-xs font-semibold">
                    Answer
                  </span>
                  <AnswerValue
                    entry={entry}
                    answer={data.answers[entry.key]}
                    question={question}
                  />
                </div>
                {entry.kind === "choice" && correct !== undefined && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted">
                      Correct:{" "}
                      <span className="text-ink font-mono">
                        {optionLetter(correct)}
                      </span>
                      {question?.options?.[correct]
                        ? ` ${question.options[correct]}`
                        : ""}
                    </span>
                    {auto !== undefined && (
                      <Badge tone={auto > 0 ? "green" : "red"}>
                        {auto > 0 ? "Right" : "Wrong"}
                      </Badge>
                    )}
                  </div>
                )}
                <Field
                  label="Marks"
                  error={errors[entry.key]}
                  hint={`0 to ${entry.marks}, in halves`}
                  className="max-w-40"
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={entry.marks}
                      step={0.5}
                      value={marks[entry.key] ?? ""}
                      invalid={Boolean(errors[entry.key])}
                      disabled={stillAnswering}
                      inputClassName="font-mono tabular-nums"
                      onChange={(e) => {
                        setMarks((prev) => ({
                          ...prev,
                          [entry.key]: e.target.value,
                        }));
                      }}
                    />
                  )}
                </Field>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card title="Feedback">
        <Field
          label="For the student"
          optional
          hint="The student sees this with their marks once you publish them."
        >
          {(id) => (
            <Textarea
              id={id}
              rows={4}
              maxLength={FEEDBACK_MAX}
              value={feedback}
              disabled={stillAnswering}
              onChange={(e) => setFeedback(e.target.value)}
            />
          )}
        </Field>
      </Card>

      {formError && <Callout tone="bad">{formError}</Callout>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty && (
          <span className="text-faint text-xs">
            {data.markedAt
              ? "Not saved yet"
              : "Not saved yet. Students see only saved marks."}
          </span>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={mark.isPending || stillAnswering}
        >
          {mark.isPending ? "Saving marks" : "Save marks"}
        </Button>
      </div>
    </form>
  );
}
