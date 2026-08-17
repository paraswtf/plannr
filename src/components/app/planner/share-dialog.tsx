"use client";

import { useState } from "react";

import { Dialog } from "~/components/ui/dialog";
import {
  EntityPicker,
  initialsOf,
  useDebounced,
} from "~/components/ui/entity-picker";
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

  const rows = candidates.data ?? [];
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
          <button
            type="button"
            onClick={onClose}
            className="text-muted flex min-h-10 cursor-pointer items-center rounded-lg px-3.5 text-[13px] font-semibold lg:min-h-0 lg:py-2"
            style={{ boxShadow: "var(--ring)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() =>
              share.mutate({
                id: planId,
                reviewerIds: selected,
                message: message.trim() || undefined,
              })
            }
            className="flex min-h-10 items-center rounded-lg px-3.5 text-[13px] font-semibold text-white lg:min-h-0 lg:py-2"
            style={{
              background: "var(--grad-brand)",
              opacity: ready ? 1 : 0.5,
              cursor: ready ? "pointer" : "not-allowed",
            }}
          >
            {share.isPending
              ? "Sharing…"
              : `Share with ${selected.length || "…"}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {error && (
          <div
            className="rounded-xl p-3 text-[13px] font-medium text-[#b02636]"
            style={{
              background: "rgba(220,56,72,0.07)",
              boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
            }}
          >
            {error}
          </div>
        )}

        <p className="text-muted m-0 text-[13px]">
          Everyone chosen has to approve before the plan can go on the live
          timetable. Once shared, anyone with planner access can read it — not
          just the reviewers.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">Reviewers</span>
          <EntityPicker
            selected={selected.map((id) => ({
              id,
              label:
                names[id] ?? rows.find((r) => r.id === id)?.name ?? "Reviewer",
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
                  badges: r.roleNames
                    .slice(0, 2)
                    .map((name) => ({ text: name, tone: "slate" as const })),
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
          {rows.length === 0 && !candidates.isLoading && (
            <span className="text-[11.5px] text-[#a2660f]">
              Nobody in the institution can approve schedule plans yet. Grant
              someone the &ldquo;Approve schedule plans&rdquo; permission from
              People first.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">
            A note for the reviewers
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="What you would like them to look at"
            className="bg-surface plr-scroll w-full resize-y rounded-[10px] px-3 py-2 text-[13px] outline-none"
            style={{ boxShadow: "var(--ring)" }}
          />
          <span className="text-faint text-[11.5px]">
            Posted as the first comment on this draft.
          </span>
        </label>

        {existingReviewerIds.length > 0 && (
          <p className="m-0 text-[12.5px] text-[#a2660f]">
            Re-sharing clears every answer given so far — an approval has to be
            about the timetable people are actually looking at.
          </p>
        )}
      </div>
    </Dialog>
  );
}
