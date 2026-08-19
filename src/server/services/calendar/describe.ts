/**
 * What one class looks like once it is in somebody's Google Calendar.
 *
 * Pure, and deliberately the only place that decides it. Everything about the
 * sync that is worth arguing over — how a cancellation reads, what goes in the
 * description, when a change is worth an API call — is settled here against
 * plain objects, so it can be tested without a Google account or a database.
 *
 * One Google event per occurrence, never a recurring one. The timetable has
 * already materialised every sitting, exceptions and all; handing Google an
 * RRULE would mean also maintaining its override events and keeping two
 * expansions agreeing about what "the third Tuesday" means. A reschedule is a
 * patch to a single event, which is both simpler and what makes the reminder
 * somebody set on Thursday's lecture survive that lecture moving.
 */

import { createHash } from "node:crypto";

/** What the mirror needs to know about one sitting. */
export interface MirrorableOccurrence {
  /** The recurrence slot this came from — stable across regeneration. */
  originalStart: Date;
  start: Date;
  end: Date;
  title: string;
  roomCode: string | null;
  /** Empty for a class nobody is named on, e.g. a plain room booking. */
  facultyName: string | null;
  groupNames: string[];
  notes: string | null;
  /** `CANCELLED` is the one that changes how this reads. */
  status: string;
  /** Set when this sitting was moved or altered away from the series. */
  changed: boolean;
}

/** The subset of Google's event resource we ever write. */
export interface GoogleEventBody {
  summary: string;
  location?: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  transparency: "opaque" | "transparent";
  status: "confirmed";
  extendedProperties: {
    private: { plannrEventId: string; plannrOriginalStart: string };
  };
}

/**
 * How a cancelled class is written.
 *
 * It stays on the calendar rather than disappearing, because a class that
 * silently vanishes is indistinguishable from a sync that broke — and the
 * person who never opens Plannr is exactly the person who would turn up to an
 * empty room. Marked free rather than busy, so it stops holding the slot
 * against them while still saying what that slot was for.
 */
const CANCELLED_PREFIX = "Cancelled — ";

/** Everything we write goes in a calendar of our own; this names it. */
export function calendarSummary(orgName: string): string {
  return `${orgName} — Classes`;
}

export function calendarDescription(appUrl: string): string {
  return (
    "Your classes, kept up to date by Plannr. Changes made here are " +
    `overwritten on the next sync — edit the timetable at ${appUrl} instead. ` +
    "Deleting this calendar removes every event Plannr added, and nothing else."
  );
}

/**
 * The body to send to Google for one sitting.
 *
 * `timeZone` is the institution's, and the instants are absolute, so the two
 * cannot disagree: Google reads the offset in `dateTime` for when it happens
 * and the zone for how to render it if the reader is elsewhere.
 */
export function toGoogleEvent(
  occurrence: MirrorableOccurrence,
  eventId: string,
  timeZone: string,
): GoogleEventBody {
  const cancelled = occurrence.status === "CANCELLED";

  return {
    summary: cancelled
      ? `${CANCELLED_PREFIX}${occurrence.title}`
      : occurrence.title,
    ...(occurrence.roomCode ? { location: occurrence.roomCode } : {}),
    description: describeBody(occurrence, cancelled),
    start: { dateTime: occurrence.start.toISOString(), timeZone },
    end: { dateTime: occurrence.end.toISOString(), timeZone },
    // A cancelled class must not go on blocking the hour it was going to take.
    transparency: cancelled ? "transparent" : "opaque",
    // Google's own `status: "cancelled"` hides the event outright, which is the
    // silent disappearance this whole branch exists to avoid.
    status: "confirmed",
    extendedProperties: {
      private: {
        plannrEventId: eventId,
        plannrOriginalStart: occurrence.originalStart.toISOString(),
      },
    },
  };
}

/**
 * The notes under the title: who is teaching, who is in the room, and — when
 * it applies — that this particular sitting is not where the series put it.
 */
function describeBody(
  occurrence: MirrorableOccurrence,
  cancelled: boolean,
): string {
  const lines: string[] = [];

  if (cancelled) lines.push("This class has been cancelled.");
  else if (occurrence.changed) lines.push("Rescheduled from the usual slot.");

  if (occurrence.facultyName) lines.push(occurrence.facultyName);
  if (occurrence.groupNames.length > 0) {
    lines.push(occurrence.groupNames.join(", "));
  }
  if (occurrence.notes) lines.push(occurrence.notes);

  return lines.join("\n");
}

/**
 * A fingerprint of what we last pushed for one sitting.
 *
 * The reconcile compares this against the stored digest and skips the API call
 * when they match, which is what makes resyncing an untouched timetable cost
 * nothing but a single database read. So it must cover *everything* that ends
 * up in the body — a field left out here is a field that silently stops
 * updating — and nothing that does not, or every pass would rewrite every
 * event.
 *
 * Derived from the rendered body rather than from the occurrence, so it cannot
 * drift out of step with `toGoogleEvent`: adding a field to the body changes
 * the digest by construction.
 */
export function digestOf(body: GoogleEventBody): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        body.summary,
        body.location ?? "",
        body.description ?? "",
        body.start.dateTime,
        body.start.timeZone,
        body.end.dateTime,
        body.end.timeZone,
        body.transparency,
      ]),
    )
    .digest("base64url")
    .slice(0, 22);
}
