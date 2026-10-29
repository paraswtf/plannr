"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button, buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import { Skeleton } from "~/components/ui/skeleton";
import { ASSIGNMENT_TYPE_META, type AssignmentType } from "~/lib/assignments";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { api, type RouterOutputs } from "~/trpc/react";

import { PasswordDialog } from "./password-dialog";
import { UploadPaperDialog } from "./upload-paper-dialog";

const TZ = DEFAULT_TIMEZONE;
/** How long after a print is sent to look again for a lockout it caused. */
const PRINT_RECHECK_MS = 5_000;

type Paper = NonNullable<RouterOutputs["papers"]["status"]["paper"]>;
type Asking = "print" | "release" | "change" | null;

const fmtMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

/** "Tue 4 Nov, " then the time in the mono face. */
function When({ at }: { at: Date }) {
  return (
    <>
      {formatDayLabel(at, TZ)},{" "}
      <span className="font-mono tabular-nums">{formatHourLabel(at, TZ)}</span>
    </>
  );
}

/**
 * The question paper's place on a test's page, for the people who manage the
 * test: whether there is a paper, where it stands, and (for the teacher who
 * saved it) the things its password unlocks.
 */
export function PaperCard({
  assignmentId,
  type,
  // The page's guess. Once a paper exists, papers.status says who owns it,
  // and before one exists anybody who manages the test may make it.
  isOwner: _isOwner,
}: {
  assignmentId: string;
  type: AssignmentType;
  isOwner: boolean;
}) {
  const meta = ASSIGNMENT_TYPE_META[type];
  const status = api.papers.status.useQuery({ assignmentId });
  // The detail page has this already; it comes from the cache.
  const detail = api.assignments.byId.useQuery({ id: assignmentId });

  if (status.isLoading || detail.isLoading) {
    return (
      <Card title="Question paper">
        <div
          role="status"
          aria-label="Loading the question paper"
          className="flex flex-col gap-3"
        >
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-10 w-56 max-w-full" radius="10px" />
        </div>
      </Card>
    );
  }

  if (status.error || !status.data || detail.error || !detail.data) {
    return (
      <Card title="Question paper">
        <Callout
          tone="bad"
          title="The question paper could not be loaded"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (status.error) void status.refetch();
                if (detail.error) void detail.refetch();
              }}
            >
              Try again
            </Button>
          }
        >
          {status.error?.message ??
            detail.error?.message ??
            "Try again in a moment."}
        </Callout>
      </Card>
    );
  }

  if (!status.data.enabled) {
    return (
      <Card title="Question paper">
        <Callout tone="info">
          Question papers are not set up on this server. An administrator can
          turn them on.
        </Callout>
      </Card>
    );
  }

  const paper = status.data.paper;
  if (!paper) {
    return <NoPaper assignmentId={assignmentId} type={type} />;
  }

  const hasSitting = detail.data.sittings.some((s) => s.teamId === null);
  const setBy =
    detail.data.setBy && !detail.data.isMine ? detail.data.setBy.name : null;

  return (
    <PaperDetails
      assignmentId={assignmentId}
      type={type}
      paper={paper}
      isOwner={paper.isOwner}
      hasSitting={hasSitting}
      setBy={setBy}
      answeredInApp={meta.answeredInApp}
    />
  );
}

function NoPaper({
  assignmentId,
  type,
}: {
  assignmentId: string;
  type: AssignmentType;
}) {
  const meta = ASSIGNMENT_TYPE_META[type];
  const [uploading, setUploading] = useState(false);
  return (
    <Card title="Question paper">
      <EmptyState
        compact
        icon="book"
        title="No question paper yet"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              icon="upload"
              onClick={() => setUploading(true)}
            >
              Upload a PDF
            </Button>
            <Link
              href={`/assignments/${assignmentId}/paper`}
              className={buttonClass("primary", "md")}
            >
              <Icon name="pencil" size={15} stroke={2} />
              Write the paper
            </Link>
          </div>
        }
      >
        {meta.answeredInApp
          ? "Write the questions here, or upload the paper as a PDF. Students read and answer it in Plannr once you open it to them."
          : "Write the questions here, or upload the paper as a PDF, then unlock it to print for the class."}
      </EmptyState>
      <UploadPaperDialog
        open={uploading}
        onClose={() => setUploading(false)}
        assignmentId={assignmentId}
        type={type}
      />
    </Card>
  );
}

function PaperDetails({
  assignmentId,
  type,
  paper,
  isOwner,
  hasSitting,
  setBy,
  answeredInApp,
}: {
  assignmentId: string;
  type: AssignmentType;
  paper: Paper;
  isOwner: boolean;
  hasSitting: boolean;
  setBy: string | null;
  answeredInApp: boolean;
}) {
  const utils = api.useUtils();
  const [asking, setAsking] = useState<Asking>(null);
  const [uploading, setUploading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const printForm = useRef<HTMLFormElement>(null);
  const printPassword = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  const released = Boolean(paper.releasedAt);
  const open = released && !paper.closedAt;
  const authored = paper.source === "AUTHORED";
  const lockedUntil = paper.locked ? paper.lockedUntil : null;
  const locked = lockedUntil !== null;

  // A lockout ends on its own; look again when it does, so the buttons come
  // back without a reload.
  const lockedAt = lockedUntil?.getTime() ?? null;
  useEffect(() => {
    if (lockedAt === null) return;
    const wait = Math.max(0, lockedAt - Date.now()) + 1_000;
    const timer = window.setTimeout(
      () => void utils.papers.status.invalidate({ assignmentId }),
      wait,
    );
    return () => window.clearTimeout(timer);
  }, [lockedAt, assignmentId, utils]);

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const refresh = () =>
    Promise.all([
      utils.papers.status.invalidate({ assignmentId }),
      utils.assignments.byId.invalidate({ id: assignmentId }),
      utils.assignments.list.invalidate(),
    ]);

  /**
   * Posts the password to the print route in a form aimed at a new tab, so it
   * travels in the request body and the PDF opens in the browser's viewer.
   * Runs inside the click (nothing is awaited before `submit`), or a phone
   * would block the tab as a pop-up.
   */
  const print = async (password: string) => {
    const form = printForm.current;
    const field = printPassword.current;
    if (!form || !field) {
      throw new Error("The paper could not be unlocked. Reload the page.");
    }
    field.value = password;
    try {
      form.submit();
    } finally {
      field.value = "";
    }
    setAsking(null);
    toast.success(
      "The paper is opening in a new tab. If the password was wrong, that tab says so.",
    );
    // A wrong password counts towards the lockout; show it if it happened.
    timers.current.push(
      window.setTimeout(
        () => void utils.papers.status.invalidate({ assignmentId }),
        PRINT_RECHECK_MS,
      ),
    );
  };

  // Calls that carry the password go through the client itself rather than a
  // React Query mutation, whose cache would keep a copy of it; the client's
  // logger leaves out any call with a password.
  const release = async (password: string) => {
    try {
      await utils.client.papers.release.mutate({ assignmentId, password });
    } catch (e) {
      await utils.papers.status.invalidate({ assignmentId });
      throw e;
    }
    await refresh();
    setAsking(null);
    toast.success("The paper is open to students.");
  };

  const changePassword = async (password: string, newPassword?: string) => {
    if (!newPassword) throw new Error("Type the new password twice.");
    try {
      await utils.client.papers.changePassword.mutate({
        assignmentId,
        password,
        newPassword,
      });
    } catch (e) {
      await utils.papers.status.invalidate({ assignmentId });
      throw e;
    }
    await refresh();
    setAsking(null);
    toast.success("The paper's password is changed.");
  };

  const releaseBadge = !answeredInApp ? null : paper.closedAt ? (
    <Badge tone="neutral">Answers closed</Badge>
  ) : released ? (
    <Badge tone="green" dot>
      Open to students
    </Badge>
  ) : (
    <Badge tone="neutral">Not open to students</Badge>
  );

  const canRelease = answeredInApp && !released && hasSitting;

  return (
    <Card title="Question paper" action={releaseBadge}>
      <div className="flex flex-col gap-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Item label="Source">
            {authored ? "Written in Plannr" : "Uploaded PDF"}
          </Item>
          {!authored && paper.fileName && (
            <Item label="File">
              <span className="break-all">{paper.fileName}</span>
            </Item>
          )}
          <Item label="Pages">
            <span className="font-mono tabular-nums">{paper.pageCount}</span>
          </Item>
          <Item label="Total marks">
            <span className="font-mono tabular-nums">
              {fmtMarks(paper.totalMarks)}
            </span>
          </Item>
          {paper.releasedAt && (
            <Item label="Opened to students">
              <When at={paper.releasedAt} />
            </Item>
          )}
          {paper.closedAt && (
            <Item label="Answers closed">
              <When at={paper.closedAt} />
            </Item>
          )}
        </dl>

        {lockedUntil && (
          <Callout tone="warn" title="Locked after too many wrong passwords">
            Nobody can open this paper until{" "}
            <span className="font-mono tabular-nums">
              {formatHourLabel(lockedUntil, TZ)}
            </span>
            . Try again then.
          </Callout>
        )}

        {!isOwner && (
          <Callout tone="neutral">
            {setBy ? `This test was set by ${setBy}. ` : ""}Only the teacher who
            saved this paper can open it, to print it, change it or open it to
            students.
          </Callout>
        )}

        {isOwner && answeredInApp && !released && !hasSitting && (
          <p className="text-muted text-sm">
            Add a class for this test before opening the paper to students.
          </p>
        )}

        {(isOwner || open || !released) && (
          <div className="flex flex-wrap items-center gap-2">
            {/* What the password unlocks is for the paper's owner alone. */}
            {isOwner && canRelease && (
              <Button
                variant="primary"
                icon="users"
                disabled={locked}
                onClick={() => setAsking("release")}
              >
                Open to students
              </Button>
            )}
            {isOwner && (
              <Button
                variant={canRelease ? "secondary" : "primary"}
                icon="key"
                disabled={locked}
                onClick={() => setAsking("print")}
              >
                Unlock to print
              </Button>
            )}
            {isOwner && authored && !released && (
              <Link
                href={`/assignments/${assignmentId}/paper`}
                className={buttonClass("secondary", "md")}
              >
                <Icon name="pencil" size={15} stroke={2} />
                Edit the paper
              </Link>
            )}
            {isOwner && !authored && !released && (
              <Button
                variant="secondary"
                icon="upload"
                disabled={locked}
                onClick={() => setUploading(true)}
              >
                Upload a new PDF
              </Button>
            )}
            {/* Closing answers and removing the paper follow the test: any
                manager may, with no password. */}
            {open && (
              <Button
                variant="danger-quiet"
                icon="x"
                onClick={() => setClosing(true)}
              >
                Close answers
              </Button>
            )}
            {isOwner && (
              <Button
                variant="ghost"
                disabled={locked}
                onClick={() => setAsking("change")}
              >
                Change password
              </Button>
            )}
            {!released && (
              <Button
                variant="danger-quiet"
                icon="trash"
                onClick={() => setRemoving(true)}
              >
                Remove paper
              </Button>
            )}
          </div>
        )}

        {released && (
          <p className="text-muted text-sm">
            <a
              href={`/api/papers/${assignmentId}/paper.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate font-semibold underline underline-offset-[3px]"
            >
              See the paper as students see it
            </a>
            . Once open, a paper cannot be changed or removed.
          </p>
        )}
      </div>

      {/* The print route reads a form, so the password is in the body of a
          POST and never in a URL. Its value is set only for the moment of
          submitting. */}
      <form
        ref={printForm}
        method="POST"
        action="/api/papers/print"
        target="_blank"
        hidden
      >
        <input
          type="hidden"
          name="assignmentId"
          value={assignmentId}
          readOnly
        />
        <input ref={printPassword} type="hidden" name="password" />
      </form>

      <PasswordDialog
        open={asking === "print"}
        onClose={() => setAsking(null)}
        mode="enter"
        title="Unlock to print"
        description="The paper opens in a new tab, ready to print. If the password is wrong, that tab says so."
        confirmLabel="Unlock to print"
        onSubmit={print}
      />
      <PasswordDialog
        open={asking === "release"}
        onClose={() => setAsking(null)}
        mode="enter"
        title="Open to students"
        description={
          <>
            Students in the group are told the paper is open and can read and
            answer it in Plannr straight away.{" "}
            <span className="font-semibold">
              After this the paper cannot be changed or removed.
            </span>
          </>
        }
        confirmLabel="Open to students"
        pendingLabel="Opening..."
        onSubmit={release}
      />
      <PasswordDialog
        open={asking === "change"}
        onClose={() => setAsking(null)}
        mode="change"
        title="Change password"
        description="The paper is sealed again with the new password. The old one stops working."
        confirmLabel="Change password"
        pendingLabel="Changing..."
        onSubmit={changePassword}
      />
      <UploadPaperDialog
        open={uploading}
        onClose={() => setUploading(false)}
        assignmentId={assignmentId}
        type={type}
        replacing
      />
      {closing && (
        <CloseAnswersDialog
          assignmentId={assignmentId}
          onDone={refresh}
          onClose={() => setClosing(false)}
        />
      )}
      {removing && (
        <RemovePaperDialog
          assignmentId={assignmentId}
          onDone={refresh}
          onClose={() => setRemoving(false)}
        />
      )}
    </Card>
  );
}

function Item({
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

function CloseAnswersDialog({
  assignmentId,
  onDone,
  onClose,
}: {
  assignmentId: string;
  onDone: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const close = api.papers.close.useMutation({
    onSuccess: async () => {
      await onDone();
      toast.success("Answers are closed.");
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Close answers"
      icon="clock"
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it open
          </Button>
          <Button
            variant="danger"
            disabled={close.isPending}
            onClick={() => close.mutate({ assignmentId })}
          >
            {close.isPending ? "Closing..." : "Close answers"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ink text-sm">
          Students can no longer answer. Answers already begun count as handed
          in. The paper cannot be opened again.
        </p>
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}

function RemovePaperDialog({
  assignmentId,
  onDone,
  onClose,
}: {
  assignmentId: string;
  onDone: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const remove = api.papers.remove.useMutation({
    onSuccess: async () => {
      await onDone();
      toast.success("The paper is removed.");
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Remove question paper"
      icon="trash"
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ assignmentId })}
          >
            {remove.isPending ? "Removing..." : "Remove paper"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ink text-sm">
          The paper and everything written in it are deleted for good. Nobody
          can get it back, with or without the password.
        </p>
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
