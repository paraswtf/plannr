/**
 * The drain: the only place in the app that talks to Google Calendar.
 *
 * Vercel calls this on a schedule (see `vercel.json`), where it is registered
 * 24 times over — one entry per hour of the day, all pointing here. That is a
 * Hobby-plan workaround, not a design: Hobby rejects any expression running
 * more than once a day, but grants 100 separate jobs, so twenty-four daily
 * ones bought an hourly drain. Sharing a path is explicitly supported, and the
 * schedule that fired is echoed back in the report to keep the logs readable.
 *
 * It does a bounded amount of work and returns a tally, so a run that hits the
 * function's time limit has still committed everything it finished — each task
 * is marked as it completes, not at the end.
 *
 * It always answers 200 with a report, even when individual tasks failed.
 * Failing the response would make Vercel retry the whole batch, re-doing work
 * that succeeded, when the per-task backoff already handles retries properly.
 */

import { NextResponse, type NextRequest } from "next/server";

import { env } from "~/env";
import { db } from "~/server/db";
import { drain, sweepStaleConnections, syncEnabled } from "~/server/services/calendar/sync";

/** Long enough for a full batch of API calls; Vercel caps this by plan. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return run(request);
}

/** Vercel's scheduler issues a GET. */
export async function GET(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!syncEnabled()) {
    return NextResponse.json({ skipped: "Calendar sync is switched off." });
  }

  // Sweep first. It only enqueues, so anything it finds is drained by the same
  // invocation rather than waiting for the next one.
  const swept = await sweepStaleConnections(db);
  const report = await drain(db);

  return NextResponse.json({
    // Which of the 24 daily entries this was, so a gap in coverage is legible
    // in the logs rather than guesswork.
    schedule: request.headers.get("x-vercel-cron-schedule"),
    swept,
    ...report,
  });
}

/**
 * Vercel signs its cron requests with `CRON_SECRET`. Without one configured
 * the endpoint stays shut rather than falling open — it can write to every
 * connected calendar in the organisation, which is not something to leave
 * reachable by anyone who guesses the path.
 */
function authorised(request: NextRequest): boolean {
  if (!env.CRON_SECRET) return false;
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}
