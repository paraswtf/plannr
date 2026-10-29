"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import { Field, Input } from "~/components/ui/field";
import { ASSIGNMENT_TYPE_META, type AssignmentType } from "~/lib/assignments";
import { api } from "~/trpc/react";

import {
  EMPTY_PASSWORDS,
  PasswordFields,
  passwordProblem,
  type PasswordValues,
} from "./password-dialog";

/**
 * The largest PDF the upload route takes: PAPER_MAX_BYTES in
 * src/server/api/routers/papers.ts, copied because that file is server code.
 */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_LABEL = "4 MB";
/** The most questions an uploaded paper may list, as papers.uploadPdf allows. */
const MAX_QUESTIONS = 100;
const MAX_QUESTION_MARKS = 100;
const MAX_TOTAL_MARKS = 1000;

interface Row {
  id: number;
  marks: string;
}

/** A number of marks from 0.5 to `max` in half steps, or null. */
function halfMarks(raw: string, max: number): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0.5 || n > max) return null;
  return Number.isInteger(n * 2) ? n : null;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Uploads a question paper as a PDF: the file, its marks (each question's for
 * a test answered in Plannr, the total for one sat on paper) and the password
 * it is sealed with. A first paper sets the password; replacing one asks for
 * the paper's current password, which the server opens the old one with.
 */
export function UploadPaperDialog({
  open,
  onClose,
  assignmentId,
  type,
  replacing = false,
}: {
  open: boolean;
  onClose: () => void;
  assignmentId: string;
  type: AssignmentType;
  /** True when the test already has a paper this upload replaces. */
  replacing?: boolean;
}) {
  const utils = api.useUtils();
  const meta = ASSIGNMENT_TYPE_META[type];
  const nextId = useRef(2);
  const fileInput = useRef<HTMLInputElement>(null);
  const formId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([{ id: 1, marks: "" }]);
  const [total, setTotal] = useState("");
  const [passwords, setPasswords] = useState<PasswordValues>(EMPTY_PASSWORDS);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const live = useRef(open);

  // Everything goes when the dialog closes: the file, the marks and above all
  // the password.
  useEffect(() => {
    live.current = open;
    if (!open) {
      setFile(null);
      setRows([{ id: 1, marks: "" }]);
      setTotal("");
      setPasswords(EMPTY_PASSWORDS);
      setError(null);
      setSending(false);
    }
  }, [open]);

  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  const mode = replacing ? "enter" : "set";

  const pick = (picked: File | undefined) => {
    if (!picked) return;
    const looksPdf =
      picked.type === "application/pdf" ||
      picked.name.toLowerCase().endsWith(".pdf");
    if (!looksPdf) {
      setFile(null);
      setError("This file is not a PDF. Choose the paper as a PDF.");
      return;
    }
    if (picked.size === 0) {
      setFile(null);
      setError("This file is empty. Choose the paper's PDF.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFile(null);
      setError(
        `This file is larger than ${MAX_LABEL}. Save a smaller copy and choose that.`,
      );
      return;
    }
    setError(null);
    setFile(picked);
  };

  const rowMarks = rows.map((r) => halfMarks(r.marks, MAX_QUESTION_MARKS));
  const sum = rowMarks.reduce<number>((a, m) => a + (m ?? 0), 0);

  const close = () => {
    if (sending) return;
    onClose();
  };

  const send = async () => {
    if (sending) return;
    if (!file) {
      setError("Choose the paper's PDF.");
      return;
    }
    let marksField: [string, string];
    if (meta.answeredInApp) {
      const bad = rowMarks.findIndex((m) => m === null);
      if (bad !== -1) {
        setError(
          `Give question ${bad + 1} its marks: from 0.5 to ${MAX_QUESTION_MARKS}, in steps of 0.5.`,
        );
        return;
      }
      marksField = ["questionMarks", JSON.stringify(rowMarks)];
    } else {
      const t = halfMarks(total, MAX_TOTAL_MARKS);
      if (t === null) {
        setError(
          `Give the paper's total marks: from 0.5 to ${MAX_TOTAL_MARKS}, in steps of 0.5.`,
        );
        return;
      }
      marksField = ["totalMarks", String(t)];
    }
    const problem = passwordProblem(mode, passwords);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSending(true);
    // Built here and handed to fetch, so the password is in the request body
    // and in no other place once this returns.
    const form = new FormData();
    form.append("assignmentId", assignmentId);
    form.append("password", passwords.password);
    form.append("file", file, file.name);
    form.append(marksField[0], marksField[1]);

    let message: string | null = null;
    try {
      const response = await fetch("/api/papers/upload", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      if (!response.ok) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        const said =
          body &&
          typeof body === "object" &&
          "error" in body &&
          body.error &&
          typeof body.error === "object" &&
          "message" in body.error &&
          typeof body.error.message === "string"
            ? body.error.message
            : null;
        message =
          said ??
          (response.status === 413
            ? `The file is larger than ${MAX_LABEL}. Save a smaller copy and upload that.`
            : "The paper could not be uploaded. Try again in a moment.");
      }
    } catch {
      message =
        "The paper could not be sent. Check your connection and try again.";
    }

    if (message) {
      // A wrong password changes the tries left, so the card should know.
      await utils.papers.status.invalidate({ assignmentId });
      if (!live.current) return;
      setSending(false);
      setError(message);
      return;
    }
    // All of it, even if the card swaps this dialog out as the status
    // arrives: the first paper replaces the empty card the dialog lives in.
    await Promise.all([
      utils.papers.status.invalidate({ assignmentId }),
      utils.assignments.byId.invalidate({ id: assignmentId }),
      utils.assignments.list.invalidate(),
    ]);
    toast.success(replacing ? "The new PDF is saved." : "The paper is saved.");
    if (!live.current) return;
    setSending(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={replacing ? "Upload a new PDF" : "Upload a PDF"}
      subtitle={meta.label}
      icon="upload"
      width={520}
      footer={
        <>
          <Button variant="secondary" disabled={sending} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={sending}
          >
            {sending ? "Uploading..." : "Upload paper"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {replacing && (
          <p className="text-ink text-sm">
            The new file takes the place of the paper saved now. It stays sealed
            with the same password.
          </p>
        )}

        <Field label="Question paper" hint={`A PDF of ${MAX_LABEL} or less.`}>
          {(id) => (
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <input
                ref={fileInput}
                id={id}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                // The button below is the one stop for the keyboard; this
                // input stays for the label and for the browser's picker.
                tabIndex={-1}
                disabled={sending}
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                icon="upload"
                disabled={sending}
                onClick={() => fileInput.current?.click()}
              >
                {file ? "Choose another file" : "Choose a PDF"}
              </Button>
              {file ? (
                <span className="text-ink min-w-0 truncate text-sm">
                  {file.name}{" "}
                  <span className="text-faint font-mono text-xs tabular-nums">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </span>
              ) : (
                <span className="text-muted text-sm">No file chosen.</span>
              )}
            </div>
          )}
        </Field>

        {meta.answeredInApp ? (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-title mb-1.5 text-xs font-semibold">
              Questions and their marks
            </legend>
            <p className="text-faint -mt-0.5 mb-1 text-xs">
              One row for each question on the paper, in its order. Students get
              an answer box for each.
            </p>
            <div
              aria-hidden="true"
              className="text-2xs text-muted flex items-center gap-3 font-semibold"
            >
              <span className="w-24 shrink-0" />
              <span className="w-28">Marks</span>
            </div>
            <ol className="flex flex-col gap-2">
              {rows.map((row, i) => {
                const bad = row.marks.trim() !== "" && rowMarks[i] === null;
                const inputId = `${formId}-question-${row.id}`;
                return (
                  <li key={row.id} className="flex items-center gap-3">
                    <label
                      htmlFor={inputId}
                      className="text-muted w-24 shrink-0 text-sm"
                    >
                      Question{" "}
                      <span className="font-mono tabular-nums">{i + 1}</span>
                      <span className="sr-only"> marks</span>
                    </label>
                    <Input
                      id={inputId}
                      type="number"
                      inputMode="decimal"
                      min={0.5}
                      max={MAX_QUESTION_MARKS}
                      step={0.5}
                      value={row.marks}
                      invalid={bad}
                      disabled={sending}
                      className="w-28"
                      onChange={(e) => {
                        const marks = e.target.value;
                        setRows((rs) =>
                          rs.map((r) =>
                            r.id === row.id ? { ...r, marks } : r,
                          ),
                        );
                      }}
                    />
                    <IconButton
                      icon="trash"
                      variant="danger"
                      size="sm"
                      label={`Remove question ${i + 1}`}
                      disabled={sending || rows.length === 1}
                      onClick={() =>
                        setRows((rs) => rs.filter((r) => r.id !== row.id))
                      }
                    />
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Button
                variant="quiet"
                size="sm"
                icon="plus"
                disabled={sending || rows.length >= MAX_QUESTIONS}
                onClick={() =>
                  setRows((rs) => [...rs, { id: nextId.current++, marks: "" }])
                }
              >
                Add a question
              </Button>
              <span className="text-muted text-sm">
                Total{" "}
                <span className="text-title font-mono font-semibold tabular-nums">
                  {fmt(sum)}
                </span>{" "}
                marks
              </span>
            </div>
          </fieldset>
        ) : (
          <Field
            label="Total marks"
            hint="What the paper is out of, for entering marks later. In steps of 0.5."
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                min={0.5}
                max={MAX_TOTAL_MARKS}
                step={0.5}
                value={total}
                invalid={
                  total.trim() !== "" &&
                  halfMarks(total, MAX_TOTAL_MARKS) === null
                }
                disabled={sending}
                className="w-32"
                onChange={(e) => setTotal(e.target.value)}
              />
            )}
          </Field>
        )}

        <div className="flex flex-col gap-3">
          {!replacing && (
            <p className="text-ink text-sm">
              The paper is sealed with a password you choose. Only you can open
              it, with this password, to print it or open it to students.
            </p>
          )}
          <PasswordFields
            mode={mode}
            values={passwords}
            onChange={(v) => {
              setPasswords(v);
              if (error) setError(null);
            }}
            disabled={sending}
          />
        </div>

        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}
