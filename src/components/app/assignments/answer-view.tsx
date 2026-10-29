"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import SuperJSON from "superjson";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import {
  ASSIGNMENT_TYPE_META,
  unsavedAnswers,
  type Answers,
  type AssignmentType,
} from "~/lib/assignments";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { errorMessage } from "~/lib/error-message";
import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";

import {
  AnswerSheet,
  OptionList,
  QuestionText,
  marksLabel,
  questionsByKey,
} from "./answer-sheet";

const TZ = DEFAULT_TIMEZONE;
const POLL_MS = 20_000;
const OPEN_POLL_MS = 20_000;
const SAVE_DELAY_MS = 1_500;
const RETRY_MS = 5_000;
/** Keepalive requests may carry 64 KB in all; this leaves room for headers. */
const KEEPALIVE_MAX_BYTES = 60_000;

type Mine = RouterOutputs["submissions"]["mine"];
type SaveInput = RouterInputs["submissions"]["save"];
type SaveState = "idle" | "saving" | "saved" | "retrying";

const TYPE_COPY: Partial<Record<AssignmentType, string>> = {
  CLASS_TEST_ONLINE: "Take it from anywhere while the paper is open.",
  CLASS_TEST_IN_APP_OFFLINE: "Taken in the room, on your own device.",
};

/** "Tue 4 Nov, 10am" in the institution's time. */
const at = (d: Date) => `${formatDayLabel(d, TZ)}, ${formatHourLabel(d, TZ)}`;

/** "1:05:09" or "4:09": what is left on the clock. */
function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The time, once a second, for the countdown. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * The save request as the tRPC client would send it, or null when it is too
 * big to go with keepalive.
 */
function keepaliveBody(input: SaveInput): string | null {
  const body = JSON.stringify(SuperJSON.serialize(input));
  return new Blob([body]).size <= KEEPALIVE_MAX_BYTES ? body : null;
}

/**
 * Sends a save that outlives the page. A phone may freeze or throw away a tab
 * as it is hidden, before an ordinary request is answered; a keepalive one is
 * still delivered. A refusal comes back shaped like a tRPC client error, so
 * it is handled the same way.
 */
async function saveWithKeepalive(body: string): Promise<{ closed: boolean }> {
  const response = await fetch("/api/trpc/submissions.save", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body,
  });
  const payload = (await response.json().catch(() => null)) as {
    result?: { data?: { json?: { closed?: boolean } } };
    error?: { json?: { message?: string; data?: { code?: string } } };
  } | null;
  if (!response.ok || !payload?.result) {
    const error = payload?.error?.json;
    throw Object.assign(new Error(error?.message ?? "Not saved."), {
      data: error?.data,
    });
  }
  return { closed: Boolean(payload.result.data?.json?.closed) };
}

export function AnswerView({
  assignmentId,
  type,
  title,
}: {
  assignmentId: string;
  type: AssignmentType;
  title: string;
}) {
  const mine = api.submissions.mine.useQuery(
    { assignmentId },
    {
      // Before the paper opens, look again every 20 seconds.
      // Once it is open, as often, so a teacher closing it early stops the
      // screen soon even for somebody not typing (a save brings the close
      // back at once); after the close, not at all.
      refetchInterval: (q) =>
        !q.state.data?.released
          ? POLL_MS
          : q.state.data.closed
            ? false
            : OPEN_POLL_MS,
    },
  );
  const meta = ASSIGNMENT_TYPE_META[type];

  const header = (actions?: React.ReactNode) => (
    <PageHeader
      title={title}
      back={{ href: `/assignments/${assignmentId}`, label: "Test" }}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone="slate">{meta.label}</Badge>
          <span>{TYPE_COPY[type]}</span>
        </span>
      }
      actions={actions}
    />
  );

  if (mine.isLoading) {
    return (
      <>
        {header()}
        <PageBody width="narrow">
          <div
            role="status"
            aria-label="Loading the test"
            className="flex flex-col gap-5"
          >
            <Skeleton className="h-24" />
            <Skeleton className="h-64" />
          </div>
        </PageBody>
      </>
    );
  }

  // Only when there is nothing to show. A check that fails while the test is
  // on screen keeps it there: taking the answer boxes away mid-test would
  // lose what was typed during the outage.
  if (!mine.data) {
    return (
      <>
        {header()}
        <PageBody width="narrow">
          <Card pad={0}>
            <EmptyState
              icon="alert"
              title="The test could not be opened."
              action={
                <Button variant="secondary" onClick={() => void mine.refetch()}>
                  Try again
                </Button>
              }
            >
              {errorMessage(mine.error)}
            </EmptyState>
          </Card>
        </PageBody>
      </>
    );
  }

  const data = mine.data;
  if (!data.released || !data.sheet || !data.window) {
    return (
      <>
        {header()}
        <PageBody width="narrow">
          <Card pad={0}>
            <EmptyState icon="clock" title="The paper is not open yet.">
              The paper opens when your teacher opens it. This page checks every
              20 seconds, so you can leave it open.
            </EmptyState>
          </Card>
        </PageBody>
      </>
    );
  }

  const handedIn =
    data.submission?.status === "submitted" ||
    data.submission?.status === "handed in at the close";

  if (handedIn || data.closed) {
    return (
      <>
        {header()}
        <PageBody width="narrow">
          <Finished assignmentId={assignmentId} data={data} />
        </PageBody>
      </>
    );
  }

  return (
    <Answering
      assignmentId={assignmentId}
      data={data}
      // How far the device's clock is behind the server's, measured when the
      // answer arrived, so the countdown follows the clock that decides.
      offset={data.serverNow.getTime() - mine.dataUpdatedAt}
      checkFailed={Boolean(mine.error)}
      header={header}
      onClosed={() => void mine.refetch()}
    />
  );
}

/** While the window is open: the clock, the paper and the sheet. */
function Answering({
  assignmentId,
  data,
  offset,
  checkFailed,
  header,
  onClosed,
}: {
  assignmentId: string;
  data: Mine;
  /** Add to the device's clock to get the server's. */
  offset: number;
  /** The last look at the test failed; what is on screen still stands. */
  checkFailed: boolean;
  header: (actions?: React.ReactNode) => React.ReactNode;
  onClosed: () => void;
}) {
  const utils = api.useUtils();
  const paper = api.submissions.paper.useQuery({ assignmentId });
  const start = api.submissions.start.useMutation();
  const save = api.submissions.save.useMutation();
  const submit = api.submissions.submit.useMutation();

  const closesAt = data.window!.closesAt.getTime();
  const now = useNow(true) + offset;
  const left = closesAt - now;

  const [answers, setAnswers] = useState<Answers>(
    () => data.submission?.answers ?? {},
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // What is on screen, and what the server is known to have, question by
  // question: a save sends only the difference.
  const latest = useRef(answers);
  const acked = useRef<Answers>(data.submission?.answers ?? {});
  const started = useRef(Boolean(data.submission));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);
  // False once the screen has gone, so it never schedules another save.
  const alive = useRef(true);
  // The save on its way. One at a time, so an older one can never land after
  // a newer one and leave the server behind the screen's "Saved".
  const inFlight = useRef<Promise<void> | null>(null);
  // What that save carries, and whether it was sent with keepalive.
  const inFlightSent = useRef<{ json: string; keepalive: boolean } | null>(
    null,
  );

  const starting = useRef<Promise<void> | null>(null);

  // One start in flight at a time; a failed one is tried again next save.
  const ensureStarted = useCallback(() => {
    if (started.current) return Promise.resolve();
    starting.current ??= start
      .mutateAsync({ assignmentId })
      .then(() => {
        started.current = true;
      })
      .finally(() => {
        starting.current = null;
      });
    return starting.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const schedule = (ms: number) => {
    if (!alive.current || stopped.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), ms);
  };

  /**
   * Saves what the server does not have yet. With `keepalive`, the request
   * survives the page being hidden or closed.
   */
  const flush = useCallback(
    async (keepalive = false) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      while (inFlight.current) await inFlight.current;
      if (stopped.current) return;
      const changes = unsavedAnswers(latest.current, acked.current);
      if (!changes) {
        setSaveState((state) => (state === "idle" ? state : "saved"));
        return;
      }
      setSaveState("saving");
      const input = { assignmentId, answers: changes };
      const body = keepalive ? keepaliveBody(input) : null;
      const run = (async () => {
        try {
          await ensureStarted();
          const result = body
            ? await saveWithKeepalive(body)
            : await save.mutateAsync(input);
          acked.current = { ...acked.current, ...changes };
          if (stopped.current) return;
          const more = unsavedAnswers(latest.current, acked.current);
          setSaveState(more ? "saving" : "saved");
          if (more) schedule(SAVE_DELAY_MS);
          // The teacher has closed the paper: this save made the grace, and
          // the screen should stop taking answers now.
          if (result.closed) onClosed();
        } catch (error) {
          // Handed in meanwhile: a save racing the hand-in is refused, and
          // that is expected, not something to show.
          if (stopped.current) return;
          const code = (error as { data?: { code?: string } }).data?.code;
          if (code === "PRECONDITION_FAILED" || code === "BAD_REQUEST") {
            // Handed in elsewhere, or the time is over: retrying will not help.
            stopped.current = true;
            setSaveState("idle");
            toast.error(errorMessage(error));
            onClosed();
            return;
          }
          setSaveState("retrying");
          schedule(RETRY_MS);
        }
      })();
      const done = run.finally(() => {
        inFlight.current = null;
        inFlightSent.current = null;
      });
      inFlight.current = done;
      inFlightSent.current = {
        json: JSON.stringify(changes),
        keepalive: Boolean(body),
      };
      await done;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignmentId, ensureStarted, onClosed],
  );

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  const change = (key: string, answer: Answers[string]) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: answer };
      latest.current = next;
      return next;
    });
    // Start answering on the first keystroke, not with the first save: a
    // start gets no grace at the close, so it should not wait.
    if (!started.current) ensureStarted().catch(() => undefined);
    schedule(SAVE_DELAY_MS);
    if (saveState !== "retrying") setSaveState("saving");
  };

  // When the time runs out, hand over what is unsaved (the server allows a
  // little grace for it), then show what was handed in.
  const closed = left <= 0;
  useEffect(() => {
    if (!closed) return;
    void flush().finally(() => {
      void utils.submissions.mine.invalidate({ assignmentId });
      onClosed();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed]);

  useEffect(() => {
    alive.current = true;
    const unsaved = () =>
      unsavedAnswers(latest.current, acked.current) !== null;
    // Warn before leaving with answers the server does not have yet.
    const warn = (e: BeforeUnloadEvent) => {
      if (unsaved()) e.preventDefault();
    };
    // A phone hides the tab when the student switches apps or locks it, and
    // may throw the tab away afterwards without another word: send what is
    // unsaved now, in a request that outlives the page.
    const hidden = () => {
      if (document.visibilityState === "hidden") void flushRef.current(true);
    };
    // The page is going. A save already queued behind one on its way would
    // never be sent, so this one goes straight out, unless the save on its
    // way is a keepalive one that already carries the same answers.
    const leaving = () => {
      if (stopped.current || !started.current) return;
      const changes = unsavedAnswers(latest.current, acked.current);
      if (!changes) return;
      const sent = inFlightSent.current;
      if (sent?.keepalive && sent.json === JSON.stringify(changes)) return;
      const body = keepaliveBody({ assignmentId, answers: changes });
      if (body) void saveWithKeepalive(body).catch(() => undefined);
      else void flushRef.current();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
      // Leaving the screen (the server saying the paper has closed, say)
      // still sends what is unsaved, inside the server's grace, once; a
      // screen that has gone schedules no retries of its own, which could
      // land an old copy after the next screen's newer one.
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      void flushRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handIn = async () => {
    setSubmitError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // No more saves from here: one still in flight may be refused once the
    // answers are in, and that refusal is not an error.
    stopped.current = true;
    try {
      // Let a save on its way land first, so the hand-in carries only what
      // is still unsaved after it.
      while (inFlight.current) await inFlight.current;
      await ensureStarted();
      const changes = unsavedAnswers(latest.current, acked.current);
      await submit.mutateAsync({
        assignmentId,
        ...(changes ? { answers: changes } : {}),
      });
      if (changes) acked.current = { ...acked.current, ...changes };
      setConfirming(false);
      toast.success("Your answers are handed in.");
      await utils.submissions.mine.invalidate({ assignmentId });
    } catch (error) {
      stopped.current = false;
      setSubmitError(errorMessage(error));
      // Whatever is unsaved goes on saving while the student decides.
      schedule(SAVE_DELAY_MS);
    }
  };

  const questions = questionsByKey(paper.data?.releasedQuestions);
  const sheet = data.sheet ?? [];
  const answered = sheet.filter((e) => {
    const a = answers[e.key];
    return e.kind === "choice"
      ? a?.choice !== undefined
      : Boolean(a?.text?.trim());
  }).length;

  const timeLeft = (
    <div className="flex items-center gap-3">
      <SaveIndicator state={saveState} />
      <span
        className={`font-mono text-base font-semibold tabular-nums ${
          left < 5 * 60_000 ? "text-bad" : "text-title"
        }`}
        aria-label={`Time left ${clock(left)}`}
      >
        {clock(left)}
      </span>
    </div>
  );

  return (
    <>
      {header(timeLeft)}
      <PageBody width="narrow">
        <div className="flex flex-col gap-5">
          {checkFailed && (
            <Callout tone="warn">
              Plannr could not check the paper just now. Keep answering: your
              answers stay on this screen and save once the connection is back.
            </Callout>
          )}
          <p className="text-muted text-sm">
            The paper closes at{" "}
            <span className="font-mono tabular-nums">
              {at(data.window!.closesAt)}
            </span>
            . Your answers save as you type.
          </p>

          <Card title="The paper">
            <PaperContent assignmentId={assignmentId} />
          </Card>

          <Card title="Your answers">
            <AnswerSheet
              sheet={sheet}
              questions={questions}
              answers={answers}
              onChange={change}
            />
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted text-sm">
              <span className="font-mono tabular-nums">
                {answered} of {sheet.length}
              </span>{" "}
              answered
            </span>
            <Button variant="primary" onClick={() => setConfirming(true)}>
              Hand in my answers
            </Button>
          </div>
        </div>
      </PageBody>

      <Dialog
        open={confirming}
        title="Hand in your answers?"
        icon="check"
        onClose={() => {
          setConfirming(false);
          setSubmitError(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(false);
                setSubmitError(null);
              }}
            >
              Keep answering
            </Button>
            <Button
              variant="primary"
              disabled={submit.isPending || start.isPending}
              onClick={() => void handIn()}
            >
              {submit.isPending ? "Handing in" : "Hand in"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-ink text-sm">
            You have answered{" "}
            <span className="font-mono tabular-nums">
              {answered} of {sheet.length}
            </span>{" "}
            questions. Once you hand in, you cannot change your answers.
          </p>
          {submitError && <Callout tone="bad">{submitError}</Callout>}
        </div>
      </Dialog>
    </>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const copy =
    state === "saving"
      ? "Saving"
      : state === "saved"
        ? "Saved"
        : "Not saved, retrying";
  return (
    <span
      role="status"
      aria-live="polite"
      className={`text-xs ${state === "retrying" ? "text-warn" : "text-faint"}`}
    >
      {copy}
    </span>
  );
}

/** The paper itself: its pages for an upload, its questions for a written one. */
function PaperContent({ assignmentId }: { assignmentId: string }) {
  // The same query as the sheet's, so React Query fetches it once.
  const paper = api.submissions.paper.useQuery({ assignmentId });
  if (paper.isLoading) {
    return (
      <div role="status" aria-label="Loading the paper">
        <Skeleton className="h-64" />
      </div>
    );
  }
  // Only when there is no paper to show. The query refetches on window focus,
  // and a refetch that fails mid-test keeps the paper it already has rather
  // than taking the pages away from a student who is answering them.
  if (!paper.data) {
    return (
      <EmptyState
        compact
        icon="alert"
        title="The paper could not be loaded."
        action={
          <Button variant="secondary" onClick={() => void paper.refetch()}>
            Try again
          </Button>
        }
      >
        {errorMessage(paper.error)}
      </EmptyState>
    );
  }

  const content = paper.data.releasedQuestions;
  if (!content) {
    const pages = Array.from({ length: paper.data.pageCount }, (_, i) => i + 1);
    if (pages.length === 0) {
      return <p className="text-muted text-sm">The paper has no pages.</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {pages.map((n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={n}
            src={`/api/papers/${assignmentId}/pages/${n}`}
            alt={`Page ${n}`}
            loading={n > 2 ? "lazy" : "eager"}
            className="h-auto w-full rounded-[10px] bg-white shadow-[var(--ring)]"
          />
        ))}
        <a
          href={`/api/papers/${assignmentId}/paper.pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate self-start text-sm underline-offset-[3px] hover:underline"
        >
          Open the paper as a PDF
        </a>
      </div>
    );
  }

  const labels = new Map(paper.data.sheet.map((e) => [e.key, e.label]));
  return (
    <div className="flex flex-col gap-5">
      {content.instructions && (
        <p className="text-muted text-sm whitespace-pre-wrap">
          {content.instructions}
        </p>
      )}
      {content.sections.map((section, s) => (
        <section key={s} className="flex flex-col gap-4">
          {section.title && (
            <h3 className="text-title text-md font-semibold">
              {section.title}
            </h3>
          )}
          <ol className="flex flex-col gap-4">
            {section.questions.map((q) => (
              <li key={q.key} className="flex gap-3">
                <span className="text-title w-6 shrink-0 font-mono text-sm font-semibold">
                  {labels.get(q.key) ?? ""}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <QuestionText question={q} />
                  {q.kind === "choice" && q.options && (
                    <OptionList options={q.options} />
                  )}
                  <span className="text-faint font-mono text-xs">
                    {marksLabel(q.marks)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** After handing in or after the close: what was handed in, and marks once out. */
function Finished({
  assignmentId,
  data,
}: {
  assignmentId: string;
  data: Mine;
}) {
  const paper = api.submissions.paper.useQuery({ assignmentId });
  const sheet = data.sheet ?? [];
  const submission = data.submission;
  const total = sheet.reduce((sum, e) => sum + e.marks, 0);

  if (!submission) {
    return (
      <Card pad={0}>
        <EmptyState icon="clock" title="The paper has closed.">
          You did not answer this test.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Callout tone={data.marksPublished ? "good" : "info"}>
        {submission.submittedAt ? (
          <>
            You handed in your answers at{" "}
            <span className="font-mono tabular-nums">
              {at(submission.submittedAt)}
            </span>
            .
          </>
        ) : (
          "The paper closed, so your saved answers were handed in."
        )}{" "}
        {!data.marksPublished
          ? "Your marks show here once your teacher publishes them."
          : submission.score !== null
            ? "Your marks are out."
            : "Your teacher has not marked your answers yet."}
      </Callout>

      {data.marksPublished && submission.score !== null && (
        <Card title="Your marks">
          <div className="flex flex-col gap-3">
            <p className="text-title font-mono text-2xl font-semibold tabular-nums">
              {submission.score}
              <span className="text-faint text-base"> of {total}</span>
            </p>
            {submission.feedback && (
              <div className="flex flex-col gap-1">
                <span className="text-title text-xs font-semibold">
                  Feedback
                </span>
                <p className="text-ink text-sm whitespace-pre-wrap">
                  {submission.feedback}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="What you handed in">
        <AnswerSheet
          sheet={sheet}
          questions={questionsByKey(paper.data?.releasedQuestions)}
          answers={submission.answers}
          readOnly
          marks={
            data.marksPublished && submission.score !== null
              ? (submission.marks ?? {})
              : null
          }
        />
      </Card>
    </div>
  );
}
