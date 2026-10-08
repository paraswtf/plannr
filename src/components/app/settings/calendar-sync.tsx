"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button, buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon, type IconName } from "~/components/ui/icon";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

/**
 * Connecting this timetable to a Google Calendar.
 *
 * It used to be a chip on the schedule, on the argument that that was the page
 * it was about and that `/settings` was an administrator's door. Both halves
 * have since stopped being true: the settings index is now two audiences behind
 * one door — Siri got there first, for the same reason — and a chip in the
 * schedule's toolbar was competing for a row with the span tabs, the day
 * navigator and the perspective picker, none of which it has anything to do
 * with. This is a thing you set up once and then never touch, which is what a
 * settings screen is for.
 *
 * A panel rather than a chip and a dialog, now that it has a page of its own to
 * stand on: there is nothing left for the dialog to protect the toolbar from.
 */
export function CalendarSync() {
  const router = useRouter();
  const params = useSearchParams();
  const utils = api.useUtils();

  const { data } = api.calendar.status.useQuery(undefined, {
    // A freshly connected calendar fills in behind this, whether from the
    // hourly cron or from somebody pressing "Sync now". Slow enough not to be a
    // poll for its own sake, quick enough that "catching up" turns into a time.
    refetchInterval: (query) =>
      query.state.data?.connected && query.state.data.pending > 0
        ? 15_000
        : false,
  });

  const disconnect = api.calendar.disconnect.useMutation({
    onSuccess: async () => {
      toast.success(
        "Disconnected. The calendar Plannr created has been removed.",
      );
      await utils.calendar.status.invalidate();
    },
    onError: () => toast.error("Could not disconnect. Try again in a moment."),
  });

  // A first sync is more work than one request can finish, so the button keeps
  // asking until the queue is empty. Bounded, because the alternative is a
  // button that quietly hammers Google for as long as the dialog stays open;
  // whatever is left over is still queued for the cron.
  const rounds = useRef(0);
  const changed = useRef(0);

  const resync = api.calendar.resync.useMutation({
    onSuccess: async (result) => {
      await utils.calendar.status.invalidate();
      changed.current += result.changed;

      // Nothing claimed with work still owed means the rest is leased or
      // backing off, and going round again would only burn a request.
      const worthRetrying = result.remaining > 0 && result.claimed > 0;
      if (worthRetrying && rounds.current < MAX_SYNC_ROUNDS) {
        rounds.current += 1;
        // `resume` so the continuation drains rather than queueing afresh —
        // queueing again would put the finished tasks back and never converge.
        resync.mutate({ resume: true });
        return;
      }

      toast.success(
        summarise({ changed: changed.current, remaining: result.remaining }),
      );
      rounds.current = 0;
      changed.current = 0;
    },
    onError: () => {
      rounds.current = 0;
      changed.current = 0;
      toast.error("Could not sync. Try again in a moment.");
    },
  });

  // The OAuth round trip comes back to this page with its outcome in the query
  // string, because a redirect from Google cannot carry anything else. Report
  // it once, then strip it so a refresh does not say "connected" again.
  const outcome = params.get("calendar");
  useEffect(() => {
    if (!outcome) return;
    const message = OUTCOMES[outcome];
    if (message) {
      if (outcome === "connected") toast.success(message);
      else toast.error(message);
    }
    void utils.calendar.status.invalidate();
    router.replace("/settings/calendar", { scroll: false });
  }, [outcome, router, utils]);

  /*
   * Three states before there is anything to draw, and they are not the same.
   *
   * Nothing yet is a wait and says so. Switched off for the institution is an
   * answer — reached from a settings index that only lists this section when it
   * is switched on, so the only way here is a bookmark or a guess, and either
   * deserves a sentence rather than a blank page.
   */
  if (!data) {
    // The connected panel's shape, so the card does not grow under the eye
    // when the answer lands: the commonest answer, for anybody who comes back.
    return (
      <Card>
        <div role="status" aria-label="Checking your calendar…">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-[12px]" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="mt-5 h-3 w-56" />
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-10 w-24 rounded-[var(--radius-btn)] lg:h-9" />
            <Skeleton className="h-10 w-28 rounded-[var(--radius-btn)] lg:h-9" />
          </div>
        </div>
      </Card>
    );
  }

  if (!data.available) {
    return (
      <Card>
        <EmptyState
          compact
          icon="calendar"
          title="Google Calendar sync is not switched on for this institution."
        >
          Nothing here needs your attention.
        </EmptyState>
      </Card>
    );
  }

  const connected = data.connected;
  const revoked = connected && data.revoked;

  // A plain link rather than a button or a client-side `Link`: connecting is a
  // full navigation to an OAuth route, which leaves for Google and comes back.
  const connect = (label: string) => (
    <a href="/api/calendar/connect" className={buttonClass("primary", "md")}>
      {label}
    </a>
  );

  /*
   * Disconnecting is set apart on the trailing edge and drawn as the quiet
   * red: it deletes the calendar Plannr made, so it is not the routine action
   * "Sync now" is, and the two used to be the same size, weight and place.
   */
  const disconnectButton = (
    <Button
      variant="danger-quiet"
      disabled={disconnect.isPending}
      onClick={() => disconnect.mutate({})}
      className="ml-auto"
    >
      {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
    </Button>
  );

  if (!connected) {
    return (
      <Card>
        <StatusHead icon="calendar" title="Not connected" />
        <p className="text-ink mt-4 max-w-[62ch] text-sm leading-relaxed">
          Your classes are copied into a calendar of their own (created by
          Plannr, kept beside your own), so they show up on your phone alongside
          everything else. When a class is cancelled or moved, the entry changes
          with it.
        </p>
        <ul className="text-muted marker:text-faint mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>
            Plannr can only see the calendar it creates. Your existing calendars
            stay private to you.
          </li>
          <li>
            Deleting that calendar in Google undoes everything, and nothing else
            goes with it.
          </li>
        </ul>
        <div className="mt-5">{connect("Connect Google Calendar")}</div>
      </Card>
    );
  }

  if (revoked) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          {/* Amber: the permission went at Google's end and nothing is lost,
              so this asks for a decision rather than reporting a failure in
              red. The way out sits under it, in the row the connected panel
              keeps its buttons in, rather than squeezed beside the sentence on
              a phone. */}
          <Callout tone="warn" title="Google has withdrawn the permission.">
            This happens if you removed Plannr from your account, or changed
            your password. Reconnect to start syncing again; nothing already in
            your calendar was lost.
          </Callout>
          <div className="flex flex-wrap gap-2.5">
            {connect("Reconnect")}
            {disconnectButton}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <StatusHead
        icon="checkCircle"
        tone="good"
        title="Connected"
        detail={
          <>
            Syncing to{" "}
            <span className="text-title font-medium">{data.email}</span>
          </>
        }
      />

      <p className="text-ink mt-4 flex items-center gap-2 text-sm">
        {data.pending > 0 ? (
          <>
            <Icon name="rotate" size={14} stroke={2} className="text-info" />
            <span className="tabular-nums">
              {`Catching up on ${data.pending} change${data.pending === 1 ? "" : "s"}.`}
            </span>
          </>
        ) : (
          <>
            <Icon name="clock" size={14} stroke={2} className="text-faint" />
            <span>
              {data.syncedAt
                ? `Last checked ${relative(new Date(data.syncedAt))}.`
                : "Waiting for the first pass."}
            </span>
          </>
        )}
      </p>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button
          disabled={resync.isPending}
          onClick={() => {
            rounds.current = 0;
            changed.current = 0;
            resync.mutate({});
          }}
        >
          {resync.isPending ? "Syncing…" : "Sync now"}
        </Button>
        {disconnectButton}
      </div>
    </Card>
  );
}

/**
 * The line that answers "is it working?" before anything else is read: a
 * glyph on a plate, the state in words, and whose calendar it is.
 */
function StatusHead({
  icon,
  tone = "neutral",
  title,
  detail,
}: {
  icon: IconName;
  /** `good` once it is connected; the plain wash before that. */
  tone?: "good" | "neutral";
  title: string;
  detail?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${
          tone === "good"
            ? "bg-good-wash text-good shadow-[inset_0_0_0_1px_var(--good-line)]"
            : "bg-tint text-slate shadow-[inset_0_0_0_1px_var(--hair-soft)]"
        }`}
      >
        <Icon name={icon} size={19} stroke={1.9} />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-title text-md font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {detail && <p className="text-muted text-sm break-words">{detail}</p>}
      </div>
    </div>
  );
}

/**
 * What each way the round trip can end is called.
 *
 * Every one of these is a sentence about what to do next rather than a code,
 * because the person reading it did not do anything wrong and cannot be
 * expected to know what a scope is.
 */
const OUTCOMES: Record<string, string> = {
  connected: "Connected. Your classes appear in Google Calendar shortly.",
  declined: "Not connected: you cancelled at Google's permission screen.",
  scope:
    "Not connected: the calendar permission was left unticked. Connecting again and allowing it is all that is needed.",
  norefresh:
    "Google did not grant lasting access. Try connecting once more, allowing the calendar permission.",
  mismatch:
    "That is a different Google account from the one you are signed in with. Connect the account you use for Plannr.",
  disabled: "Google Calendar sync is not switched on for this institution.",
  failed: "Could not connect to Google Calendar. Please try again.",
};

/**
 * How many times "Sync now" will go back for more before giving up.
 *
 * Each round is its own short request, and the loop stops the moment the queue
 * empties, so this only ever bites on a first sync — where a term of classes is
 * hundreds of Google inserts and six seconds a round does not cover it. Set
 * high enough that connecting a calendar usually finishes while the dialog is
 * open, rather than trailing off to an hourly cron.
 */
const MAX_SYNC_ROUNDS = 12;

/**
 * What to say once the chasing stops.
 *
 * "Already up to date" is the common case by far — the digest check means an
 * unchanged timetable reaches Google not at all — and saying so is more use
 * than a count of zero.
 */
function summarise(result: { changed: number; remaining: number }): string {
  if (result.remaining > 0) {
    return `Synced what it could. ${result.remaining} left, finishing on the next pass.`;
  }
  return result.changed > 0 ? "Calendar updated." : "Already up to date.";
}

/** "3 minutes ago", give or take — precision here would be false. */
function relative(at: Date): string {
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
