"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Card } from "~/components/ui/card";
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
    return (
      <Card>
        <p className="text-muted m-0 text-[14px]">Checking your calendar…</p>
      </Card>
    );
  }

  if (!data.available) {
    return (
      <Card>
        <p className="text-muted m-0 text-[14px]">
          Google Calendar sync is not switched on for this institution. Nothing
          here needs your attention.
        </p>
      </Card>
    );
  }

  const connected = data.connected;
  const revoked = connected && data.revoked;

  return (
    <Card>
      {!connected ? (
        <div className="text-[13px]">
          <p className="text-muted m-0">
            Your classes are copied into a calendar of their own — created by
            Plannr, kept beside your own — so they show up on your phone
            alongside everything else. When a class is cancelled or moved, the
            entry changes with it.
          </p>
          <ul className="text-faint mt-3 mb-4 list-disc space-y-1 pl-4">
            <li>
              Plannr can only see the calendar it creates. Your existing
              calendars stay private to you.
            </li>
            <li>
              Deleting that calendar in Google undoes everything, and nothing
              else goes with it.
            </li>
          </ul>
          <a
            href="/api/calendar/connect"
            className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-[12.5px] font-semibold"
            style={{ background: "var(--ink, #1f2937)", color: "white" }}
          >
            Connect Google Calendar
          </a>
        </div>
      ) : (
        <div className="text-[13px]">
          {revoked ? (
            <p className="m-0 mb-3" style={{ color: "var(--danger, #b3261e)" }}>
              Google has withdrawn the permission — this happens if you removed
              Plannr from your account, or changed your password. Reconnect to
              start syncing again; nothing already in your calendar was lost.
            </p>
          ) : (
            <p className="text-muted m-0 mb-3">
              Syncing to <strong>{data.email}</strong>.{" "}
              {data.pending > 0
                ? `Catching up on ${data.pending} change${data.pending === 1 ? "" : "s"}.`
                : data.syncedAt
                  ? `Last checked ${relative(new Date(data.syncedAt))}.`
                  : "Waiting for the first pass."}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {revoked ? (
              <a
                href="/api/calendar/connect"
                className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-[12.5px] font-semibold"
                style={{ background: "var(--ink, #1f2937)", color: "white" }}
              >
                Reconnect
              </a>
            ) : (
              <button
                type="button"
                disabled={resync.isPending}
                onClick={() => {
                  rounds.current = 0;
                  changed.current = 0;
                  resync.mutate({});
                }}
                className="min-h-10 cursor-pointer rounded-lg px-3 py-2 text-[12.5px] font-semibold"
                style={{
                  background: "rgba(68,88,121,0.07)",
                  color: "var(--slate)",
                }}
              >
                {resync.isPending ? "Syncing…" : "Sync now"}
              </button>
            )}
            <button
              type="button"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate({})}
              className="min-h-10 cursor-pointer rounded-lg px-3 py-2 text-[12.5px] font-semibold"
              style={{
                background: "rgba(200,60,60,0.08)",
                color: "var(--danger, #b3261e)",
              }}
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      )}
    </Card>
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
  declined: "Not connected — you cancelled at Google's permission screen.",
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
