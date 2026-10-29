"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Pager } from "~/components/app/groups/pager";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import { DEFAULT_TIMEZONE } from "~/lib/dates";
import { CATEGORY_META } from "~/lib/notifications";
import { api, type RouterOutputs } from "~/trpc/react";

import { dayHeading, dayKey, timeLabel } from "./when";

type Filter = "all" | "unread";
type Row = RouterOutputs["notifications"]["list"]["rows"][number];

const PAGE_SIZE = 30;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

/**
 * A link is followed only when it stays on this site. The server writes every
 * url itself, so this is a second lock rather than the only one: a row is
 * never a way off Plannr, whatever ends up in the column.
 */
function isLocalPath(url: string | null): url is string {
  return Boolean(
    url &&
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.startsWith("/\\"),
  );
}

/** Rows in order, cut into runs that share a local day. */
function byDay(rows: Row[]) {
  const days: { key: number; first: Date; rows: Row[] }[] = [];
  for (const row of rows) {
    const key = dayKey(row.createdAt, DEFAULT_TIMEZONE);
    const last = days[days.length - 1];
    if (last?.key === key) last.rows.push(row);
    else days.push({ key, first: row.createdAt, rows: [row] });
  }
  return days;
}

export function Inbox() {
  const utils = api.useUtils();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  // "5 min ago" has to move on while the screen is open, or it is wrong by
  // the time anybody reads it twice.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const list = api.notifications.list.useQuery(
    { filter, page, pageSize: PAGE_SIZE },
    { placeholderData: (previous) => previous },
  );
  const unread = api.notifications.unreadCount.useQuery();

  // Reading the last unread row on a later page of "Unread" empties that
  // page; step back to one that still has something on it.
  const pageCount = list.data?.pageCount;
  useEffect(() => {
    if (pageCount !== undefined && page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // The cache is cleared in the hook's own callbacks rather than in those
  // handed to `mutate`: a row is a link, the page is gone by the time the
  // request comes back, and only these still run once it has unmounted. The
  // badge in the sidebar outlives the page and has to hear about it.
  const markRead = api.notifications.markRead.useMutation({
    onSettled: () => utils.notifications.invalidate(),
  });
  const markAllRead = api.notifications.markAllRead.useMutation({
    onSettled: () => utils.notifications.invalidate(),
    onError: () => toast.error("Could not mark them as read. Try again."),
  });

  const open = (row: Row) => {
    if (!row.readAt) markRead.mutate({ ids: [row.id] });
  };

  const chooseFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  const nothingUnread = (unread.data?.count ?? 0) === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          items={FILTERS}
          value={filter}
          onChange={chooseFilter}
          size="sm"
          ariaLabel="Show"
        />
        <Button
          variant="secondary"
          size="sm"
          icon="check"
          disabled={nothingUnread || markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          {markAllRead.isPending ? "Marking…" : "Mark all as read"}
        </Button>
      </div>

      {list.isError && !list.data ? (
        <Callout tone="bad" title="Could not load your notifications">
          Check your connection, then reload the page.
        </Callout>
      ) : !list.data ? (
        <InboxSkeleton />
      ) : list.data.rows.length === 0 ? (
        <Card>
          {filter === "unread" ? (
            <EmptyState compact icon="checkCircle" title="Nothing unread">
              You have read everything. New notifications appear here as they
              arrive.
            </EmptyState>
          ) : (
            <EmptyState compact icon="bell" title="Nothing new">
              When a class of yours changes, or a request is answered or waits
              on you, it arrives here.
            </EmptyState>
          )}
        </Card>
      ) : (
        <>
          {byDay(list.data.rows).map((day) => (
            <section
              key={day.key}
              aria-label={dayHeading(day.first, now, DEFAULT_TIMEZONE)}
            >
              <h2 className="text-muted mb-2 px-1 text-xs font-semibold">
                {dayHeading(day.first, now, DEFAULT_TIMEZONE)}
              </h2>
              <Card pad={0} className="overflow-hidden">
                <ul>
                  {day.rows.map((row, index) => (
                    <li
                      key={row.id}
                      style={
                        index > 0
                          ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" }
                          : undefined
                      }
                    >
                      <NotificationRow
                        row={row}
                        now={now}
                        onOpen={() => open(row)}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
          <Pager
            page={list.data.page}
            lastPage={list.data.pageCount}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </>
      )}
    </div>
  );
}

function NotificationRow({
  row,
  now,
  onOpen,
}: {
  row: Row;
  now: Date;
  onOpen: () => void;
}) {
  const unread = !row.readAt;
  const meta = CATEGORY_META[row.category];
  const body = (
    <>
      <span className="bg-tint text-slate mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] shadow-[inset_0_0_0_1px_var(--hair-soft)]">
        <Icon name={meta.icon} size={16} stroke={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span
            className={`text-title min-w-0 flex-1 text-sm ${unread ? "font-semibold" : "font-medium"}`}
          >
            {unread && (
              <>
                <span
                  aria-hidden
                  className="bg-slate mr-2 mb-px inline-block h-2 w-2 rounded-full align-middle"
                />
                <span className="sr-only">Unread: </span>
              </>
            )}
            {row.title}
          </span>
          <span className="text-faint shrink-0 pt-px font-mono text-xs tabular-nums">
            {timeLabel(row.createdAt, now, DEFAULT_TIMEZONE)}
          </span>
        </span>
        {row.body && (
          <span className="text-muted mt-0.5 block text-sm leading-relaxed">
            {row.body}
          </span>
        )}
      </span>
    </>
  );

  const className =
    "hover:bg-tint-hover flex w-full items-start gap-3 px-4 py-3 text-left transition-[background-color] duration-150";

  // Somewhere to go: a link, so it opens in a new tab like any other. Nowhere
  // to go: a button that only marks it read, and is not drawn as pressable
  // once there is nothing left for it to do.
  if (isLocalPath(row.url)) {
    return (
      <Link href={row.url} onClick={onOpen} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!unread}
      className={`${className} cursor-pointer disabled:cursor-default disabled:hover:bg-transparent`}
    >
      {body}
    </button>
  );
}

function InboxSkeleton() {
  return (
    <div role="status" aria-label="Loading notifications…">
      <Skeleton className="mb-2 ml-1 h-3 w-16" />
      <Card pad={0}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-[10px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
