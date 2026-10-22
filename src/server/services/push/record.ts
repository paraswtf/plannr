import type { Db } from "../occurrences";
import { diffSittings, messagesFor, type Sitting } from "./diff";
import { pushEnabled } from "./config";

/** Everything about an event that the sentences need, and nothing more. */
interface EventFacts {
  id: string;
  kind: string;
  title: string;
  timezone: string;
  groupId: string | null;
  facultyId: string | null;
}

/**
 * Writes down what a class edit changed, for whoever is affected.
 *
 * Called by `regenerateOccurrences` with the sittings as they were just before
 * it rebuilt them and as they are now, inside the same transaction as the edit.
 * That placement is the point: the edit commits or no notice exists, and no
 * route that changes a class can forget to call it.
 *
 * It queues rows and talks to nobody. Sending happens after the response, in
 * `dispatchPending`, so a push service having a bad minute can never fail a
 * coordinator's drag-and-drop.
 *
 * Only classes are announced. A room booking changing is the requester's own
 * business and already has its own email; a class is something other people
 * were counting on.
 */
export async function recordClassChanges(
  db: Db,
  event: EventFacts,
  before: Sitting[],
  after: Sitting[],
): Promise<number> {
  if (!pushEnabled() || event.kind !== "CLASS") return 0;

  const changes = diffSittings(before, after, new Date());
  if (changes.length === 0) return 0;

  const roomIds = [...new Set([...before, ...after].map((s) => s.roomId))];
  const rooms = await db.room.findMany({
    where: { id: { in: roomIds } },
    select: { id: true, code: true },
  });
  const names = new Map(rooms.map((r) => [r.id, r.code]));

  const messages = messagesFor(changes, {
    title: event.title,
    timezone: event.timezone,
    roomName: (id) => names.get(id) ?? "TBA",
  });

  // Who it concerns is taken now, from both sides of the edit: a lecture moved
  // from one section to another has to reach the section that lost it as well
  // as the one that gained it.
  const joined = await db.eventGroup.findMany({
    where: { eventId: event.id },
    select: { groupId: true },
  });
  const groupIds = [
    ...new Set(
      [event.groupId, ...joined.map((j) => j.groupId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const facultyIds = [
    ...new Set(
      [
        event.facultyId,
        ...[...before, ...after].map((s) => s.facultyId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  if (groupIds.length === 0 && facultyIds.length === 0) return 0;

  await db.classChangeNotice.createMany({
    data: messages.map((m) => ({
      eventId: event.id,
      kind: m.kind,
      title: m.title,
      body: m.body,
      url: "/schedule",
      groupIds,
      facultyIds,
    })),
  });
  return messages.length;
}
