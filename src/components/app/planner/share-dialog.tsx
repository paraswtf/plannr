"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import {
  EntityPicker,
  initialsOf,
  useDebounced,
} from "~/components/ui/entity-picker";
import { Field, Textarea } from "~/components/ui/field";
import { api } from "~/trpc/react";

/**
 * Sharing a draft for sign-off — the moment it stops being private.
 *
 * Only people who actually hold the approval permission are offered, because a
 * reviewer who cannot answer would leave the plan stuck at "in review" forever
 * with no way to tell why.
 */
export function ShareDialog({
  planId,
  existingReviewerIds,
  onClose,
  onShared,
}: {
  planId: string;
  existingReviewerIds: string[];
  onClose: () => void;
  onShared: () => void | Promise<unknown>;
}) {
  const [selected, setSelected] = useState<string[]>(existingReviewerIds);
  /**
   * Who those ids are, remembered as they are chosen.
   *
   * The picker builds its next value from the selection it was handed, so if
   * that were the chosen ids intersected with the current search results,
   * searching for a second reviewer would quietly drop the first — and the
   * plan would go out for approval to fewer people than were asked for.
   */
  const [names, setNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const candidates = api.plans.reviewerCandidates.useQuery({
    query: useDebounced(query) || undefined,
  });

  const share = api.plans.share.useMutation({
    onSuccess: async () => {
      await onShared();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const rows = candidates.data?.rows ?? [];
  const ready = selected.length > 0 && !share.isPending;

  return (
    <Dialog
      open
      width={560}
      icon="users"
      title="Share for approval"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() =>
              share.mutate({
                id: planId,
                reviewerIds: selected,
                message: message.trim() || undefined,
              })
            }
          >
            {/* Says what is missing while nobody is chosen, rather than
                "Share with …", which asked the reader to guess. */}
            {share.isPending
              ? "Sharing…"
              : selected.length > 0
                ? `Share with ${selected.length}`
                : "Choose reviewers"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        <p className="text-muted m-0 text-sm">
          Everyone chosen has to approve before the plan can go on the live
          timetable. Once shared, anyone with planner access can read it, not
          just the reviewers.
        </p>

        <div className="flex flex-col gap-2">
          <Field label="Reviewers">
            {(id) => (
              <EntityPicker
                id={id}
                selected={selected.map((id) => ({
                  id,
                  label:
                    names[id] ??
                    rows.find((r) => r.id === id)?.name ??
                    "Reviewer",
                }))}
                onChange={(ids) => {
                  setSelected(ids);
                  setNames((known) => {
                    const next = { ...known };
                    for (const row of rows) {
                      if (ids.includes(row.id)) next[row.id] = row.name;
                    }
                    return next;
                  });
                }}
                page={{
                  rows: rows.map((r) => ({
                    id: r.id,
                    label: r.name,
                    card: {
                      label: r.name,
                      avatar: {
                        kind: "initials" as const,
                        text: initialsOf(r.name),
                      },
                      title: r.name,
                      subtitle: r.email,
                      badges: r.roleNames.slice(0, 2).map((name) => ({
                        text: name,
                        tone: "slate" as const,
                      })),
                    },
                  })),
                  total: rows.length,
                  hasMore: false,
                }}
                loading={candidates.isLoading}
                query={query}
                onQueryChange={setQuery}
                placeholder="Search people who can approve…"
                emptyLabel="Nobody chosen yet"
                listId="share-reviewers"
              />
            )}
          </Field>
          {/* A dead end, so it is boxed as one and says the way out, where
              it used to be a line of small orange type under the picker. */}
          {rows.length === 0 && !candidates.isLoading && (
            <Callout tone="warn">
              Nobody in the institution can approve schedule plans yet. Grant
              someone the &ldquo;Approve schedule plans&rdquo; permission from
              People first.
            </Callout>
          )}
        </div>

        <Field
          label="A note for the reviewers"
          optional
          hint="Posted as the first comment on this draft."
        >
          {(id) => (
            <Textarea
              id={id}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="What you would like them to look at"
              className="plr-scroll"
            />
          )}
        </Field>

        {existingReviewerIds.length > 0 && (
          <Callout tone="warn">
            Re-sharing clears every answer given so far. An approval has to be
            about the timetable people are actually looking at.
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
