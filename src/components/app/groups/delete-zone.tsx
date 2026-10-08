"use client";

import { useState, type ReactNode } from "react";

import { Button } from "~/components/ui/button";

/**
 * The foot of an edit dialog where the record itself can be removed: what
 * deleting would do, then a two-step delete.
 *
 * The batch and programme dialogs each drew this for themselves, with a red
 * outline hand-mixed from rgba and a red fill from the raw lamp colour. Both
 * now ask the same way: a quiet red button that only says the word, then the
 * question with a way back ("Keep") beside the real, filled delete. Nothing is
 * removed on the first press.
 */
export function DeleteZone({
  subject,
  pending,
  onDelete,
  locked = false,
  children,
}: {
  /** The record's own name, for the question: "Delete 23-27 BCA?" */
  subject: string;
  pending: boolean;
  onDelete: () => void;
  /**
   * The record still holds things the server would refuse to orphan. The box
   * then only says so: a button that can only ever produce an error is worse
   * than none.
   */
  locked?: boolean;
  /** What deleting it would and would not take with it. */
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    // A hairline box rather than a red one: until the question is asked this
    // is information, and a red panel at the foot of every edit dialog would
    // make each of them look as though something had already gone wrong.
    <div className="mt-1 flex flex-wrap items-center justify-between gap-3 rounded-[12px] px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--hair)]">
      {!confirming ? (
        <>
          <p className="text-muted min-w-0 flex-1 basis-56 text-sm">
            {children}
          </p>
          {!locked && (
            <Button
              variant="danger-quiet"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="text-title min-w-0 flex-1 basis-40 text-sm font-semibold">
            Delete {subject}?
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={onDelete}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
