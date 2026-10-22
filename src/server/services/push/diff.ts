/**
 * What changed about a class, worked out from its sittings before and after an
 * edit, and what to say about it.
 *
 * Pure on purpose: no database, no clock of its own, no network. The caller
 * hands over both lists and the moment to measure from, and gets back the
 * handful of changes a person would want a notification for. Everything about
 * *how* a notification is sent lives elsewhere; this file only decides whether
 * there is anything to say.
 */

export interface Sitting {
  start: Date;
  end: Date;
  roomId: string;
  facultyId: string | null;
  /** `CANCELLED` sittings are kept as ghosts; every other status is on. */
  status: string;
}

export type Change =
  | { kind: "MOVED"; from: Sitting; to: Sitting }
  | { kind: "CANCELLED"; was: Sitting }
  | { kind: "ADDED"; now: Sitting }
  | { kind: "RESTORED"; now: Sitting };

/** A fortnight ahead is news; a change to a class in March is not. */
export const HORIZON_DAYS = 14;

/** Past this many separate changes, one summary reads better than a barrage. */
export const MAX_SEPARATE = 3;

const DAY_MS = 86_400_000;
const isOn = (s: Sitting) => s.status !== "CANCELLED";
const slot = (s: Sitting) => `${s.start.getTime()}|${s.end.getTime()}`;
const full = (s: Sitting) => `${slot(s)}|${s.roomId}|${s.facultyId ?? ""}`;

/**
 * Compares two renderings of the same event's upcoming sittings.
 *
 * A sitting that is cancelled in the new list and on in the old at the same
 * time is a cancellation; the reverse is a restoration. Whatever on-sittings
 * are left over on each side are paired off in time order as moves, and the
 * surplus on either side is an addition or a removal. Pairing by order is a
 * guess, but a right one for the only way a series changes: every sitting
 * shifts together, so the first old one becomes the first new one.
 */
export function diffSittings(
  before: Sitting[],
  after: Sitting[],
  now: Date,
): Change[] {
  const until = now.getTime() + HORIZON_DAYS * DAY_MS;
  const upcoming = (s: Sitting) =>
    s.start.getTime() >= now.getTime() && s.start.getTime() <= until;
  const b = before.filter(upcoming);
  const a = after.filter(upcoming);

  const changes: Change[] = [];

  const beforeOnBySlot = new Map(b.filter(isOn).map((s) => [slot(s), s]));
  const beforeOffBySlot = new Map(
    b.filter((s) => !isOn(s)).map((s) => [slot(s), s]),
  );
  const cancelledSlots = new Set<string>();
  const restoredSlots = new Set<string>();

  for (const s of a) {
    if (!isOn(s) && beforeOnBySlot.has(slot(s))) {
      changes.push({ kind: "CANCELLED", was: beforeOnBySlot.get(slot(s))! });
      cancelledSlots.add(slot(s));
    }
    if (isOn(s) && beforeOffBySlot.has(slot(s))) {
      changes.push({ kind: "RESTORED", now: s });
      restoredSlots.add(slot(s));
    }
  }

  const keptAfter = new Set(a.filter(isOn).map(full));
  const keptBefore = new Set(b.filter(isOn).map(full));
  const gone = b
    .filter(isOn)
    .filter((s) => !keptAfter.has(full(s)) && !cancelledSlots.has(slot(s)));
  const arrived = a
    .filter(isOn)
    .filter((s) => !keptBefore.has(full(s)) && !restoredSlots.has(slot(s)));

  const byStart = (x: Sitting, y: Sitting) =>
    x.start.getTime() - y.start.getTime();
  gone.sort(byStart);
  arrived.sort(byStart);

  const pairs = Math.min(gone.length, arrived.length);
  for (let i = 0; i < pairs; i++) {
    changes.push({ kind: "MOVED", from: gone[i]!, to: arrived[i]! });
  }
  for (const s of gone.slice(pairs))
    changes.push({ kind: "CANCELLED", was: s });
  for (const s of arrived.slice(pairs)) changes.push({ kind: "ADDED", now: s });

  return changes.sort((x, y) => whenOf(x).getTime() - whenOf(y).getTime());
}

const whenOf = (c: Change): Date =>
  c.kind === "MOVED"
    ? c.to.start
    : c.kind === "CANCELLED"
      ? c.was.start
      : c.now.start;

// ─── Words ──────────────────────────────────────────────────────────────────

export interface Voice {
  /** The class's name as people know it. */
  title: string;
  timezone: string;
  /** Room names by id, for "room 403" rather than an id. */
  roomName: (id: string) => string;
}

export interface Message {
  kind: "MOVED" | "CANCELLED" | "ADDED" | "RESTORED";
  title: string;
  body: string;
}

function parts(date: Date, timezone: string) {
  const f = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, ...opts }).format(
      date,
    );
  return {
    day: f({ weekday: "short", day: "numeric", month: "short" }),
    time: f({ hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

const when = (s: Sitting, tz: string) => {
  const p = parts(s.start, tz);
  const end = parts(s.end, tz).time;
  return `${p.day}, ${p.time}-${end}`;
};

/** One change in a sentence. */
function sentence(change: Change, voice: Voice): Message {
  const { title, timezone: tz } = voice;
  switch (change.kind) {
    case "CANCELLED":
      return {
        kind: "CANCELLED",
        title: `${title} is cancelled`,
        body: `The class on ${when(change.was, tz)} will not take place.`,
      };
    case "RESTORED":
      return {
        kind: "RESTORED",
        title: `${title} is back on`,
        body: `${when(change.now, tz)}, room ${voice.roomName(change.now.roomId)}.`,
      };
    case "ADDED":
      return {
        kind: "ADDED",
        title: `New class: ${title}`,
        body: `${when(change.now, tz)}, room ${voice.roomName(change.now.roomId)}.`,
      };
    case "MOVED": {
      const { from, to } = change;
      const sameSlot = slot(from) === slot(to);
      const sameRoom = from.roomId === to.roomId;
      if (sameSlot && sameRoom) {
        return {
          kind: "MOVED",
          title: `${title}: teacher changed`,
          body: `${when(to, tz)}, room ${voice.roomName(to.roomId)}.`,
        };
      }
      const was = sameSlot
        ? `room ${voice.roomName(from.roomId)}`
        : sameRoom
          ? when(from, tz)
          : `${when(from, tz)}, room ${voice.roomName(from.roomId)}`;
      return {
        kind: "MOVED",
        title: `${title} has moved`,
        body: `Now ${when(to, tz)}, room ${voice.roomName(to.roomId)} (was ${was}).`,
      };
    }
  }
}

/**
 * The notifications to send for a set of changes: one each when there are few,
 * a single summary when a whole series moved at once.
 */
export function messagesFor(changes: Change[], voice: Voice): Message[] {
  if (changes.length === 0) return [];
  if (changes.length <= MAX_SEPARATE) {
    return changes.map((c) => sentence(c, voice));
  }
  return [
    {
      kind: "MOVED",
      title: `${voice.title}: ${changes.length} classes changed`,
      body: "Open your schedule for the new times and rooms.",
    },
  ];
}
