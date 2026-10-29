"use client";

import { TRPCClientError } from "@trpc/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { type z } from "zod";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Button, IconButton, buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Field, Input, Textarea } from "~/components/ui/field";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  ASSIGNMENT_TYPE_META,
  paperContentSchema,
  splitMath,
  type AssignmentType,
  type PaperContent,
} from "~/lib/assignments";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { api } from "~/trpc/react";

import { PasswordDialog } from "./password-dialog";

/**
 * The question paper editor: a test's paper written in Plannr, with the
 * typeset PDF beside it on wide screens.
 *
 * The paper's password is typed by its teacher and held in a ref for as long
 * as this editor is open, so later saves in the same visit do not ask again.
 * It goes out only in the body of the request that needs it, through the tRPC
 * client itself rather than a React Query mutation, whose cache would keep a
 * copy after the editor closes; the client's logger leaves out any call that
 * carries a password. The ref is cleared once the paper is opened
 * to students, removed, or no longer this teacher's.
 */

const TZ = DEFAULT_TIMEZONE;
/** The `lg` breakpoint: the preview sits beside the form from here up. */
const WIDE = "(min-width: 1024px)";
const PREVIEW_DELAY_MS = 800;

const MAX_SECTIONS = 20;
const MAX_QUESTIONS = 100;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

/** Options are lettered the way the typesetter and the answer sheet letter them. */
const letterOf = (index: number) => String.fromCharCode(97 + index);

// ─── The draft ──────────────────────────────────────────────────────────────

/**
 * What the form edits. Close to `PaperContent`, with the differences a form
 * needs: marks as typed (so "1." and an empty field survive), options and the
 * answer kept while a question is written rather than choice (so switching
 * back restores them), and an id on each section for React.
 */
interface DraftQuestion {
  /** Made once, when the question is made, and never changed: answers and marks are keyed on it. */
  key: string;
  text: string;
  marks: string;
  kind: "text" | "choice";
  options: string[];
  answer: number | null;
  hasCode: boolean;
  code: string;
}

interface DraftSection {
  /** For React only; never sent. */
  id: string;
  title: string;
  questions: DraftQuestion[];
}

interface Draft {
  instructions: string;
  sections: DraftSection[];
}

/** A random id, from the browser's crypto, which works on plain http too. */
function randomId(prefix: string) {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return (
    prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

const blankQuestion = (): DraftQuestion => ({
  key: randomId("q"),
  text: "",
  marks: "1",
  kind: "text",
  options: ["", ""],
  answer: null,
  hasCode: false,
  code: "",
});

const blankSection = (): DraftSection => ({
  id: randomId("s"),
  title: "",
  questions: [blankQuestion()],
});

const blankDraft = (): Draft => ({
  instructions: "",
  sections: [blankSection()],
});

function draftOf(content: PaperContent): Draft {
  return {
    instructions: content.instructions ?? "",
    sections: content.sections.map((section) => ({
      id: randomId("s"),
      title: section.title ?? "",
      questions: section.questions.map((q) => ({
        key: q.key,
        text: q.text,
        marks: String(q.marks),
        kind: q.kind,
        options:
          q.options && q.options.length >= MIN_OPTIONS ? q.options : ["", ""],
        answer: q.answer ?? null,
        hasCode: Boolean(q.code),
        code: q.code ?? "",
      })),
    })),
  };
}

/** Marks as typed, as a number; NaN when they are not one. */
function marksValue(typed: string): number {
  const t = typed.trim();
  return /^(\d+(\.\d*)?|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

/** The draft in the shape the schema checks. Indices match the draft's. */
function contentOf(draft: Draft) {
  return {
    instructions: draft.instructions,
    sections: draft.sections.map((section) => ({
      ...(section.title.trim() ? { title: section.title } : {}),
      questions: section.questions.map((q) => ({
        key: q.key,
        text: q.text,
        marks: marksValue(q.marks),
        kind: q.kind,
        ...(q.kind === "choice"
          ? {
              options: q.options,
              ...(q.answer !== null ? { answer: q.answer } : {}),
            }
          : {}),
        ...(q.hasCode && q.code.trim() ? { code: q.code } : {}),
      })),
    })),
  };
}

const formatMarks = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

// ─── Checking it ────────────────────────────────────────────────────────────

interface QuestionErrors {
  text?: string;
  marks?: string;
  options?: string;
  option: Record<number, string>;
  answer?: string;
  code?: string;
  key?: string;
}

interface Errors {
  instructions?: string;
  /** About the paper as a whole: no questions at all, say. */
  paper?: string;
  titles: Record<string, string>;
  questions: Record<string, QuestionErrors>;
  count: number;
}

const TOO_LONG: Record<string, string> = {
  instructions: "Keep the instructions under 4,000 characters.",
  title: "Keep a section title under 200 characters.",
  text: "Keep a question under 4,000 characters.",
  option: "Keep an option under 500 characters.",
  code: "Keep the code under 4,000 characters.",
};

/** A schema message in the words the rest of the editor uses. */
function plainMessage(issue: z.ZodIssue, field: string): string {
  if (issue.code === "custom") return issue.message;
  if (issue.code === "too_big") {
    if (field === "marks") return "A question carries at most 100 marks.";
    return TOO_LONG[field] ?? issue.message;
  }
  if (issue.code === "too_small") {
    if (field === "option") return "Write this option or remove it.";
    if (field === "marks") return "Marks cannot be below 0.";
    return issue.message;
  }
  return issue.message;
}

function check(draft: Draft): {
  errors: Errors;
  content: PaperContent | null;
} {
  const errors: Errors = { titles: {}, questions: {}, count: 0 };
  const forQuestion = (key: string) =>
    (errors.questions[key] ??= { option: {} });

  // What the schema cannot say well: marks that are not a number yet, and
  // maths the typesetter would refuse.
  for (const section of draft.sections) {
    for (const q of section.questions) {
      const typed = q.marks.trim();
      if (!typed) {
        forQuestion(q.key).marks = "Give the marks for this question.";
      } else if (Number.isNaN(marksValue(typed))) {
        forQuestion(q.key).marks =
          "Write the marks as a number, such as 2 or 1.5.";
      }
      const text = splitMath(q.text);
      if (!text.ok) forQuestion(q.key).text = text.error;
      if (q.kind === "choice") {
        q.options.forEach((option, i) => {
          const parsed = splitMath(option);
          if (!parsed.ok) forQuestion(q.key).option[i] = parsed.error;
        });
      }
    }
  }

  const result = paperContentSchema.safeParse(contentOf(draft));
  if (!result.success) {
    for (const issue of result.error.issues) {
      const [head, s, middle, i, field, index] = issue.path;
      if (head === "instructions") {
        errors.instructions ??= plainMessage(issue, "instructions");
        continue;
      }
      const section = typeof s === "number" ? draft.sections[s] : undefined;
      if (!section) {
        errors.paper ??= issue.message;
        continue;
      }
      if (middle === "title") {
        errors.titles[section.id] ??= plainMessage(issue, "title");
        continue;
      }
      const question =
        middle === "questions" && typeof i === "number"
          ? section.questions[i]
          : undefined;
      if (!question) {
        errors.paper ??=
          issue.code === "too_big"
            ? "A section holds at most 100 questions."
            : issue.message;
        continue;
      }
      const own = forQuestion(question.key);
      if (field === "options" && typeof index === "number") {
        own.option[index] ??= plainMessage(issue, "option");
      } else if (
        field === "text" ||
        field === "marks" ||
        field === "options" ||
        field === "answer" ||
        field === "code" ||
        field === "key"
      ) {
        own[field] ??= plainMessage(issue, field);
      } else {
        own.text ??= issue.message;
      }
    }
  }

  let count = 0;
  if (errors.instructions) count += 1;
  if (errors.paper) count += 1;
  count += Object.keys(errors.titles).length;
  for (const q of Object.values(errors.questions)) {
    count += Object.keys(q.option).length;
    for (const k of ["text", "marks", "options", "answer", "code", "key"]) {
      if (q[k as keyof Omit<QuestionErrors, "option">]) count += 1;
    }
  }
  errors.count = count;

  return {
    errors,
    content: result.success && count === 0 ? result.data : null,
  };
}

// ─── Small helpers ──────────────────────────────────────────────────────────

const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** Whether the preview sits beside the form. False on the server. */
function useWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

const codeOf = (error: unknown): string | undefined =>
  error instanceof TRPCClientError
    ? (error.data as { code?: string } | undefined)?.code
    : undefined;

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function pdfUrl(base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

/** "Tue 4 Nov, 10am" in the institution's time. */
const at = (d: Date) => `${formatDayLabel(d, TZ)}, ${formatHourLabel(d, TZ)}`;

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
};

// ─── The screen ─────────────────────────────────────────────────────────────

type DialogKind = "set" | "unlock" | "again" | null;

export function PaperEditor({
  assignmentId,
  type,
  title,
}: {
  assignmentId: string;
  type: AssignmentType;
  title: string;
}) {
  const utils = api.useUtils();
  const router = useRouter();
  const status = api.papers.status.useQuery(
    { assignmentId },
    // While wrong passwords have locked the paper, look again now and then,
    // so "Unlock to edit" comes back when the lock ends.
    { refetchInterval: (q) => (q.state.data?.paper?.locked ? 30_000 : false) },
  );
  const meta = ASSIGNMENT_TYPE_META[type];

  const [draft, setDraft] = useState<Draft>(blankDraft);
  const draftKey = useMemo(() => JSON.stringify(draft), [draft]);
  const [savedKey, setSavedKey] = useState(draftKey);
  const dirty = draftKey !== savedKey;

  // Unlocked means the content is loaded and the password is held: either
  // this visit saved the paper first, or its owner typed the password.
  const [unlocked, setUnlocked] = useState(false);
  const password = useRef<string | null>(null);
  useEffect(
    () => () => {
      password.current = null;
    },
    [],
  );

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const { errors, content } = useMemo(() => check(draft), [draft]);
  const contentKey = useMemo(
    () => (content ? JSON.stringify(content) : null),
    [content],
  );
  const totalMarks = draft.sections.reduce(
    (sum, s) =>
      sum +
      s.questions.reduce((n, q) => {
        const m = marksValue(q.marks);
        return Number.isNaN(m) ? n : n + m;
      }, 0),
    0,
  );
  const questionCount = draft.sections.reduce(
    (n, s) => n + s.questions.length,
    0,
  );

  useEffect(() => {
    if (errors.count === 0) setFormError(null);
  }, [errors.count]);

  const paper = status.data?.paper ?? null;

  /** Lets the password go: the next save asks for one again. */
  const forget = useCallback(() => {
    password.current = null;
    setUnlocked(false);
    setDialog(null);
  }, []);

  // The password is held only while there is a paper of this teacher's to
  // edit. Opened to students or handed to someone else, it has nothing left
  // to open; removed (seen as a paper that then went away), a new save must
  // set a new password through the "set" dialog and its warning.
  const hadPaper = useRef(false);
  useEffect(() => {
    if (!status.data) return;
    if (!paper) {
      if (hadPaper.current && unlocked) forget();
      hadPaper.current = false;
      return;
    }
    hadPaper.current = true;
    if ((paper.releasedAt || !paper.isOwner) && unlocked) forget();
  }, [status.data, paper, unlocked, forget]);

  const editable =
    status.data?.enabled === true &&
    !paper?.releasedAt &&
    (unlocked || paper === null);

  // ─── Leaving with unsaved changes ─────────────────────────────────────────

  const leaving = useRef(false);
  const guard = editable && dirty;

  useEffect(() => {
    if (!guard) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      // Older browsers ask only when this is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [guard]);

  // Every in-app link, the header's back link and the sidebar included, asks
  // first. Caught on the way down, before Next's own handler sees the click.
  useEffect(() => {
    if (!guard) return;
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [guard]);

  // ─── Preview ──────────────────────────────────────────────────────────────

  const wide = useWide();
  const [preview, setPreview] = useState<{ url: string; key: string } | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const sequence = useRef(0);
  const requestedKey = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A preview is a blob this page made; let it go when it is replaced.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const typeset = useCallback(
    async (paperContent: PaperContent, key: string) => {
      const mine = ++sequence.current;
      requestedKey.current = key;
      setPreviewing(true);
      try {
        const { pdfBase64 } = await utils.client.papers.preview.mutate({
          assignmentId,
          content: paperContent,
        });
        // A reply to an older request, or to a screen that has gone.
        if (mine !== sequence.current || !mounted.current) return;
        setPreview({ url: pdfUrl(pdfBase64), key });
        setPreviewError(null);
      } catch (error) {
        if (mine !== sequence.current || !mounted.current) return;
        setPreviewError(messageOf(error, "The preview could not be made."));
      } finally {
        if (mine === sequence.current && mounted.current) setPreviewing(false);
      }
    },
    [assignmentId, utils],
  );

  const latestContent = useRef(content);
  latestContent.current = content;

  // On a wide screen the preview follows the form, once typing pauses.
  useEffect(() => {
    if (!wide || !editable || !contentKey) return;
    if (requestedKey.current === contentKey) return;
    const timer = setTimeout(() => {
      const current = latestContent.current;
      if (current) void typeset(current, contentKey);
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wide, editable, contentKey, typeset]);

  // ─── Saving ───────────────────────────────────────────────────────────────

  const afterSave = async (key: string) => {
    setSavedKey(key);
    setShowAll(false);
    setFormError(null);
    await Promise.all([
      utils.papers.status.invalidate({ assignmentId }),
      utils.assignments.byId.invalidate({ id: assignmentId }),
      utils.assignments.list.invalidate(),
    ]);
  };

  /** Sends the paper with this password. Throws what the server said. */
  const send = async (withPassword: string) => {
    const current = content;
    if (!current) throw new Error("Fix the fields marked in red, then save.");
    const key = draftKey;
    await utils.client.papers.saveAuthored.mutate({
      assignmentId,
      password: withPassword,
      content: current,
    });
    password.current = withPassword;
    setUnlocked(true);
    await afterSave(key);
    toast.success("Paper saved.");
  };

  /**
   * The paper was opened to students, or made by someone else at the same
   * moment: the screen turns read only, and the password has nothing left to
   * open.
   */
  const onConflict = async (message: string) => {
    forget();
    await utils.papers.status.invalidate({ assignmentId });
    toast.error(message);
  };

  /** Saves from a password dialog; a CONFLICT closes it, anything else shows in it. */
  const sendFromDialog = async (typed: string) => {
    try {
      await send(typed);
    } catch (error) {
      if (codeOf(error) === "CONFLICT") {
        await onConflict(messageOf(error, "The paper could not be saved."));
        return;
      }
      throw error;
    }
    setDialog(null);
  };

  /** Marks every field that needs attention and takes the person to the first. */
  const revealErrors = (then: string) => {
    setShowAll(true);
    setFormError(
      `Some fields need attention. They are marked in red; fix them, then ${then}.`,
    );
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      first?.scrollIntoView({ block: "center", behavior: "smooth" });
      first?.focus({ preventScroll: true });
    });
  };

  const save = async () => {
    if (!content) {
      revealErrors("save");
      return;
    }
    if (!unlocked || !password.current) {
      setDialog(unlocked ? "again" : "set");
      return;
    }
    setSaving(true);
    try {
      await send(password.current);
    } catch (error) {
      const code = codeOf(error);
      const message = messageOf(error, "The paper could not be saved.");
      if (code === "CONFLICT") {
        await onConflict(message);
      } else if (code === "BAD_REQUEST" && /password/i.test(message)) {
        // The password changed somewhere else; ask for it again.
        password.current = null;
        toast.error(message);
        setDialog("again");
      } else {
        // A lock set from another tab, or the typesetter refusing a question:
        // said where the form is, so a long message stays readable.
        setFormError(message);
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const unlock = async (typed: string) => {
    try {
      const opened = await utils.client.papers.unlockForEditing.mutate({
        assignmentId,
        password: typed,
      });
      const loaded = draftOf(opened.content);
      password.current = typed;
      setDraft(loaded);
      setSavedKey(JSON.stringify(loaded));
      setTouched(new Set());
      setShowAll(false);
      setUnlocked(true);
    } catch (error) {
      if (codeOf(error) === "TOO_MANY_REQUESTS") {
        void utils.papers.status.invalidate({ assignmentId });
      }
      throw error;
    }
  };

  // ─── Editing the draft ────────────────────────────────────────────────────

  const touch = (id: string) =>
    setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  const shown = (id: string, message: string | undefined) =>
    message && (showAll || touched.has(id)) ? message : undefined;

  const setSection = (
    sectionId: string,
    change: (s: DraftSection) => DraftSection,
  ) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === sectionId ? change(s) : s)),
    }));

  const setQuestion = (
    sectionId: string,
    key: string,
    change: (q: DraftQuestion) => DraftQuestion,
  ) =>
    setSection(sectionId, (s) => ({
      ...s,
      questions: s.questions.map((q) => (q.key === key ? change(q) : q)),
    }));

  const [removingSection, setRemovingSection] = useState<string | null>(null);
  const removeSection = (sectionId: string) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.filter((s) => s.id !== sectionId),
    }));

  // ─── Rendering ────────────────────────────────────────────────────────────

  const header = (actions?: React.ReactNode) => (
    <PageHeader
      title="Question paper"
      back={{ href: `/assignments/${assignmentId}`, label: "Test" }}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone="slate">{meta.label}</Badge>
          <span>{title}</span>
        </span>
      }
      actions={actions}
    />
  );

  const backToTest = (
    <Link
      href={`/assignments/${assignmentId}`}
      className={buttonClass("secondary", "md")}
    >
      Back to the test
    </Link>
  );

  if (status.isLoading) {
    return (
      <>
        {header()}
        <PageBody width="wide">
          <div
            role="status"
            aria-label="Loading the question paper"
            className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]"
          >
            <div className="flex flex-col gap-4">
              <Skeleton className="h-28 rounded-[14px]" />
              <Skeleton className="h-72 rounded-[14px]" />
            </div>
            <Skeleton className="hidden h-[70vh] rounded-[14px] lg:block" />
          </div>
        </PageBody>
      </>
    );
  }

  if (status.error || !status.data) {
    return (
      <>
        {header()}
        <PageBody width="narrow">
          <Card pad={0}>
            <EmptyState
              icon="alert"
              title="The question paper could not be loaded."
              action={
                <Button
                  variant="secondary"
                  onClick={() => void status.refetch()}
                >
                  Try again
                </Button>
              }
            >
              {status.error?.message ?? "Try again in a moment."}
            </EmptyState>
          </Card>
        </PageBody>
      </>
    );
  }

  if (!status.data.enabled) {
    return (
      <>
        {header()}
        <PageBody width="narrow">
          <Callout tone="warn" title="Question papers are not set up here">
            This server has no question paper key, so papers cannot be written
            or saved. Ask whoever runs Plannr to set one.
          </Callout>
        </PageBody>
      </>
    );
  }

  if (paper?.releasedAt) {
    return (
      <>
        {header()}
        <PageBody width="narrow">
          <Card pad={0}>
            <EmptyState
              icon="key"
              title="This paper is open to students."
              action={backToTest}
            >
              It was opened on{" "}
              <span className="font-mono tabular-nums">
                {at(new Date(paper.releasedAt))}
              </span>
              , so it can no longer be changed.
            </EmptyState>
          </Card>
        </PageBody>
      </>
    );
  }

  if (paper && !unlocked) {
    let body: React.ReactNode;
    if (paper.source === "UPLOAD") {
      body = (
        <EmptyState
          icon="upload"
          title="This paper was uploaded as a PDF."
          action={backToTest}
        >
          There is nothing to edit here. To change it, upload a new file from
          the test&apos;s page.
        </EmptyState>
      );
    } else if (!paper.isOwner) {
      body = (
        <EmptyState
          icon="key"
          title="This paper is sealed."
          action={backToTest}
        >
          Only the teacher who set this paper can open it.
        </EmptyState>
      );
    } else {
      body = (
        <EmptyState
          icon="key"
          title="This paper is locked."
          action={
            <Button
              variant="primary"
              icon="key"
              disabled={paper.locked}
              onClick={() => setDialog("unlock")}
            >
              Unlock to edit
            </Button>
          }
        >
          Its questions are sealed with the password you chose when you saved
          it. Type it to edit the paper.
        </EmptyState>
      );
    }
    return (
      <>
        {header()}
        <PageBody width="narrow" className="flex flex-col gap-4">
          {paper.isOwner && paper.locked && paper.lockedUntil && (
            <Callout tone="warn" title="Too many wrong passwords">
              The paper is locked. Try again at{" "}
              <span className="font-mono tabular-nums">
                {formatHourLabel(new Date(paper.lockedUntil), TZ)}
              </span>
              .
            </Callout>
          )}
          <Card pad={0}>{body}</Card>
        </PageBody>
        <PasswordDialog
          open={dialog === "unlock"}
          onClose={() => setDialog(null)}
          mode="enter"
          title="Unlock the paper"
          description="Type the password you chose when you saved this paper."
          confirmLabel="Unlock to edit"
          pendingLabel="Unlocking…"
          onSubmit={async (typed) => {
            await unlock(typed);
            setDialog(null);
          }}
        />
      </>
    );
  }

  // The editor itself: a new paper, or one its owner has unlocked.
  let number = 0;
  const previewReady = preview !== null && preview.key === contentKey;

  return (
    <>
      {header(
        <>
          <span className="text-muted text-sm">
            <span className="text-title font-mono tabular-nums">
              {formatMarks(totalMarks)}
            </span>{" "}
            {totalMarks === 1 ? "mark" : "marks"},{" "}
            <span className="text-title font-mono tabular-nums">
              {questionCount}
            </span>{" "}
            {questionCount === 1 ? "question" : "questions"}
          </span>
          <Button
            variant="secondary"
            className="lg:hidden"
            disabled={previewing}
            onClick={() => {
              if (content && contentKey) void typeset(content, contentKey);
              else revealErrors("preview");
            }}
          >
            {previewing ? "Typesetting…" : "Preview"}
          </Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save paper"}
          </Button>
        </>,
      )}
      <PageBody width="wide">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]">
          <div ref={formRef} className="flex min-w-0 flex-col gap-5">
            {formError && (
              <Callout tone="bad" role="alert">
                {formError}
              </Callout>
            )}
            {!unlocked && (
              <Callout tone="info">
                When you save, you choose a password. The paper is sealed with
                it: you will need it to edit, print or open the paper.
              </Callout>
            )}

            {/* On a phone the preview opens in a tab of its own, from a link
                the person taps: a tab opened once the typesetting came back
                would be blocked as a pop-up. */}
            {!wide && previewError && !previewing && (
              <Callout tone="bad" role="alert" className="lg:hidden">
                {previewError}
              </Callout>
            )}
            {!wide && previewReady && (
              <Callout tone="good" className="lg:hidden">
                The preview is ready.{" "}
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline underline-offset-[3px]"
                >
                  Open the preview
                </a>
              </Callout>
            )}

            <Card>
              <Field
                label="Instructions"
                optional
                hint="Printed under the title. Leave a blank line between paragraphs."
                error={shown("instructions", errors.instructions)}
              >
                {(id) => (
                  <Textarea
                    id={id}
                    rows={3}
                    maxLength={4000}
                    value={draft.instructions}
                    invalid={Boolean(
                      shown("instructions", errors.instructions),
                    )}
                    onBlur={() => touch("instructions")}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, instructions: e.target.value }))
                    }
                    placeholder="Answer all questions."
                  />
                )}
              </Field>
            </Card>

            {draft.sections.map((section, s) => {
              const many = draft.sections.length > 1;
              const titleError = shown(
                `${section.id}:title`,
                errors.titles[section.id],
              );
              return (
                <Card key={section.id} className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-end gap-2">
                    <Field
                      label={many ? `Section ${s + 1} title` : "Section title"}
                      optional
                      hint="Printed above its questions, such as Part A."
                      error={titleError}
                      className="min-w-[12rem] flex-1"
                    >
                      {(id) => (
                        <Input
                          id={id}
                          maxLength={200}
                          value={section.title}
                          invalid={Boolean(titleError)}
                          onBlur={() => touch(`${section.id}:title`)}
                          onChange={(e) =>
                            setSection(section.id, (x) => ({
                              ...x,
                              title: e.target.value,
                            }))
                          }
                        />
                      )}
                    </Field>
                    {many && (
                      <div className="mb-6 flex items-center gap-1">
                        <IconButton
                          icon="chevronDown"
                          className="rotate-180"
                          label={`Move section ${s + 1} up`}
                          disabled={s === 0}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              sections: move(d.sections, s, s - 1),
                            }))
                          }
                        />
                        <IconButton
                          icon="chevronDown"
                          label={`Move section ${s + 1} down`}
                          disabled={s === draft.sections.length - 1}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              sections: move(d.sections, s, s + 1),
                            }))
                          }
                        />
                        <IconButton
                          icon="trash"
                          variant="danger"
                          label={`Remove section ${s + 1}`}
                          onClick={() => {
                            const filled = section.questions.some(
                              (q) => q.text.trim() || q.code.trim(),
                            );
                            if (filled) setRemovingSection(section.id);
                            else removeSection(section.id);
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {section.questions.length === 0 && (
                    <p className="text-muted text-sm">
                      No questions in this section yet.
                    </p>
                  )}

                  {section.questions.map((q, i) => {
                    number += 1;
                    return (
                      <QuestionEditor
                        key={q.key}
                        number={number}
                        question={q}
                        errors={errors.questions[q.key]}
                        shown={shown}
                        touch={touch}
                        showAnswer={meta.answeredInApp}
                        first={i === 0}
                        last={i === section.questions.length - 1}
                        onChange={(change) =>
                          setQuestion(section.id, q.key, change)
                        }
                        onMove={(by) =>
                          setSection(section.id, (x) => ({
                            ...x,
                            questions: move(x.questions, i, i + by),
                          }))
                        }
                        onRemove={() =>
                          setSection(section.id, (x) => ({
                            ...x,
                            questions: x.questions.filter(
                              (y) => y.key !== q.key,
                            ),
                          }))
                        }
                      />
                    );
                  })}

                  <div>
                    <Button
                      variant="secondary"
                      icon="plus"
                      disabled={section.questions.length >= MAX_QUESTIONS}
                      onClick={() =>
                        setSection(section.id, (x) => ({
                          ...x,
                          questions: [...x.questions, blankQuestion()],
                        }))
                      }
                    >
                      Add a question
                    </Button>
                  </div>
                </Card>
              );
            })}

            {errors.paper && (showAll || questionCount === 0) && (
              <Callout tone="bad">{errors.paper}</Callout>
            )}

            <div>
              <Button
                variant="quiet"
                icon="plus"
                disabled={draft.sections.length >= MAX_SECTIONS}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    sections: [...d.sections, blankSection()],
                  }))
                }
              >
                Add a section
              </Button>
            </div>
          </div>

          <PreviewPane
            preview={preview}
            current={previewReady}
            error={previewError}
            pending={previewing}
            valid={content !== null}
            onRetry={() => {
              const current = latestContent.current;
              if (current && contentKey) void typeset(current, contentKey);
            }}
          />
        </div>
      </PageBody>

      <PasswordDialog
        open={dialog === "set"}
        onClose={() => setDialog(null)}
        mode="set"
        title="Choose a password for this paper"
        description="The paper is sealed with it. You will need it to edit, print or open the paper to students."
        confirmLabel="Save paper"
        pendingLabel="Saving…"
        onSubmit={sendFromDialog}
      />
      <PasswordDialog
        open={dialog === "again"}
        onClose={() => setDialog(null)}
        mode="enter"
        title="Type the paper's password"
        description="The password this editor held no longer opens the paper. Type the current one to save your changes."
        confirmLabel="Save paper"
        pendingLabel="Saving…"
        onSubmit={sendFromDialog}
      />

      <Dialog
        open={removingSection !== null}
        onClose={() => setRemovingSection(null)}
        title="Remove this section?"
        icon="trash"
        iconTone="var(--bad-ink)"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRemovingSection(null)}
            >
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (removingSection) removeSection(removingSection);
                setRemovingSection(null);
              }}
            >
              Remove section
            </Button>
          </>
        }
      >
        <p className="text-ink text-sm">
          The section and every question in it will be taken out of the paper.
          Nothing is saved until you save the paper.
        </p>
      </Dialog>

      <Dialog
        open={leaveTo !== null}
        onClose={() => setLeaveTo(null)}
        title="Leave without saving?"
        icon="alert"
        iconTone="var(--warn-ink)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveTo(null)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const to = leaveTo;
                leaving.current = true;
                setLeaveTo(null);
                if (to) router.push(to);
              }}
            >
              Leave without saving
            </Button>
          </>
        }
      >
        <p className="text-ink text-sm">
          Your changes to this paper have not been saved. If you leave now, they
          are lost.
        </p>
      </Dialog>
    </>
  );
}

// ─── One question ───────────────────────────────────────────────────────────

function QuestionEditor({
  number,
  question: q,
  errors,
  shown,
  touch,
  showAnswer,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  number: number;
  question: DraftQuestion;
  errors: QuestionErrors | undefined;
  shown: (id: string, message: string | undefined) => string | undefined;
  touch: (id: string) => void;
  /** Tests answered in Plannr mark choice answers against the key. */
  showAnswer: boolean;
  first: boolean;
  last: boolean;
  onChange: (change: (q: DraftQuestion) => DraftQuestion) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const textError = shown(`${q.key}:text`, errors?.text);
  const marksError = shown(`${q.key}:marks`, errors?.marks);
  const optionsError = shown(`${q.key}:options`, errors?.options);
  const answerError = shown(`${q.key}:options`, errors?.answer);
  const codeError = shown(`${q.key}:code`, errors?.code);
  const keyError = errors?.key;

  const removeOption = (index: number) =>
    onChange((x) => ({
      ...x,
      options: x.options.filter((_, i) => i !== index),
      answer:
        x.answer === null || x.answer === index
          ? null
          : x.answer > index
            ? x.answer - 1
            : x.answer,
    }));

  return (
    <section
      aria-label={`Question ${number}`}
      className="flex flex-col gap-4 pt-5 shadow-[0_-1px_0_var(--hair-soft)] first-of-type:pt-0 first-of-type:shadow-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-title text-base font-semibold">
          Question <span className="font-mono tabular-nums">{number}</span>
        </h3>
        <div className="flex flex-wrap items-center gap-1">
          <Segmented<"text" | "choice">
            size="sm"
            ariaLabel={`How question ${number} is answered`}
            value={q.kind}
            onChange={(kind) => onChange((x) => ({ ...x, kind }))}
            items={[
              { value: "text", label: "Written" },
              { value: "choice", label: "Choice" },
            ]}
          />
          <IconButton
            icon="chevronDown"
            className="rotate-180"
            size="sm"
            label={`Move question ${number} up`}
            disabled={first}
            onClick={() => onMove(-1)}
          />
          <IconButton
            icon="chevronDown"
            size="sm"
            label={`Move question ${number} down`}
            disabled={last}
            onClick={() => onMove(1)}
          />
          <IconButton
            icon="trash"
            variant="danger"
            size="sm"
            label={`Remove question ${number}`}
            onClick={onRemove}
          />
        </div>
      </div>

      {keyError && <Callout tone="bad">{keyError}</Callout>}

      <Field
        label="Question"
        hint="$x^2$ is typeset as maths"
        error={textError}
      >
        {(id) => (
          <Textarea
            id={id}
            rows={3}
            maxLength={4000}
            value={q.text}
            invalid={Boolean(textError)}
            onBlur={() => touch(`${q.key}:text`)}
            onChange={(e) => onChange((x) => ({ ...x, text: e.target.value }))}
          />
        )}
      </Field>

      <Field
        label="Marks"
        hint="In steps of a half, such as 2 or 1.5."
        error={marksError}
        className="max-w-[12rem]"
      >
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            className="font-mono tabular-nums"
            value={q.marks}
            invalid={Boolean(marksError)}
            onBlur={() => touch(`${q.key}:marks`)}
            onChange={(e) => onChange((x) => ({ ...x, marks: e.target.value }))}
          />
        )}
      </Field>

      {q.kind === "choice" && (
        <div className="flex flex-col gap-2">
          <span className="text-title text-xs font-semibold">Options</span>
          {q.options.map((option, i) => {
            const id = `${q.key}:option:${i}`;
            const optionError = shown(id, errors?.option[i]);
            const letter = letterOf(i);
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="text-muted w-7 shrink-0 font-mono text-sm"
                  >
                    ({letter})
                  </span>
                  <Input
                    aria-label={`Option (${letter}) of question ${number}`}
                    maxLength={500}
                    value={option}
                    invalid={Boolean(optionError)}
                    onBlur={() => touch(id)}
                    onChange={(e) =>
                      onChange((x) => ({
                        ...x,
                        options: x.options.map((o, j) =>
                          j === i ? e.target.value : o,
                        ),
                      }))
                    }
                  />
                  <IconButton
                    icon="x"
                    variant="danger"
                    size="sm"
                    label={`Remove option (${letter}) of question ${number}`}
                    disabled={q.options.length <= MIN_OPTIONS}
                    onClick={() => removeOption(i)}
                  />
                </div>
                {optionError && (
                  <p className="text-bad pl-9 text-xs font-medium">
                    {optionError}
                  </p>
                )}
              </div>
            );
          })}
          {optionsError && (
            <p className="text-bad text-xs font-medium">{optionsError}</p>
          )}
          <div>
            <Button
              variant="ghost"
              size="sm"
              icon="plus"
              disabled={q.options.length >= MAX_OPTIONS}
              onClick={() =>
                onChange((x) => ({ ...x, options: [...x.options, ""] }))
              }
            >
              Add an option
            </Button>
          </div>

          {showAnswer && (
            <Field
              label="Correct option"
              hint="Answers given in Plannr are marked against it. Leave it unset to mark by hand."
              error={answerError}
              className="mt-2 max-w-[20rem]"
            >
              {(id) => (
                <Select<number>
                  id={id}
                  value={q.answer ?? -1}
                  onChange={(value) =>
                    onChange((x) => ({
                      ...x,
                      answer: value < 0 ? null : value,
                    }))
                  }
                  options={[
                    { value: -1, label: "Not set, mark by hand" },
                    ...q.options.map((o, i) => ({
                      value: i,
                      label: `(${letterOf(i)}) ${o.trim() || "Empty option"}`,
                    })),
                  ]}
                />
              )}
            </Field>
          )}
        </div>
      )}

      {q.hasCode ? (
        <div className="flex flex-col gap-2">
          <Field
            label="Code"
            hint="Printed as written, in a monospaced box under the question."
            error={codeError}
          >
            {(id) => (
              <Textarea
                id={id}
                rows={5}
                maxLength={4000}
                spellCheck={false}
                className="font-mono"
                value={q.code}
                invalid={Boolean(codeError)}
                onBlur={() => touch(`${q.key}:code`)}
                onChange={(e) =>
                  onChange((x) => ({ ...x, code: e.target.value }))
                }
              />
            )}
          </Field>
          <div>
            <Button
              variant="danger-quiet"
              size="sm"
              onClick={() =>
                onChange((x) => ({ ...x, hasCode: false, code: "" }))
              }
            >
              Remove the code
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            onClick={() => onChange((x) => ({ ...x, hasCode: true }))}
          >
            Add a block of code
          </Button>
        </div>
      )}
    </section>
  );
}

// ─── The preview beside the form ────────────────────────────────────────────

function PreviewPane({
  preview,
  current,
  error,
  pending,
  valid,
  onRetry,
}: {
  preview: { url: string; key: string } | null;
  /** Whether the preview shows the form as it is now. */
  current: boolean;
  error: string | null;
  pending: boolean;
  valid: boolean;
  onRetry: () => void;
}) {
  const note = pending
    ? "Typesetting…"
    : !valid
      ? "Waiting for the form"
      : current
        ? "Up to date"
        : null;

  return (
    <div className="hidden min-w-0 lg:sticky lg:top-[calc(var(--topbar-h)+8rem)] lg:block">
      <Card pad={0} className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 shadow-[0_1px_0_var(--hair-soft)]">
          <h2 className="font-display text-title text-md font-semibold tracking-[-0.01em]">
            Preview
          </h2>
          <div className="flex items-center gap-3">
            {note && (
              <span className="text-faint text-xs" role="status">
                {note}
              </span>
            )}
            {preview && (
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("ghost", "sm")}
              >
                Open in a new tab
              </a>
            )}
          </div>
        </div>
        {error && !pending && (
          <Callout
            tone="bad"
            className="m-3"
            role="alert"
            action={
              valid ? (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  Try again
                </Button>
              ) : undefined
            }
          >
            {error}
          </Callout>
        )}
        {!valid && !preview && (
          <Callout tone="neutral" className="m-3">
            The preview appears once every question is complete.
          </Callout>
        )}
        {preview ? (
          <iframe
            src={preview.url}
            title="The question paper as it will be printed"
            className={`h-[calc(100vh-var(--topbar-h)-14rem)] min-h-[28rem] w-full transition-opacity duration-150 ${
              current ? "" : "opacity-60"
            }`}
          />
        ) : valid && (pending || !error) ? (
          <div
            role="status"
            aria-label="Typesetting the preview"
            className="p-4"
          >
            <Skeleton className="h-[calc(100vh-var(--topbar-h)-16rem)] min-h-[26rem] rounded-[10px]" />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
