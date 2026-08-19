/**
 * Brings another database's timetable in line with this one — and nothing else.
 *
 * `db:import` is a replacement: it clears the institution and rebuilds it from
 * the college's export, which is right for a machine whose data is disposable
 * and quite wrong for one people are using. Everything hanging off a student —
 * their account, their groups, a register somebody took — would go with it.
 *
 * So this reconciles instead. It compares the classes here against the classes
 * there, adds the ones that have appeared, removes the ones the college has
 * dropped, brings across the weeks it has called off since, and leaves
 * everything else untouched. Students, attendance, plans, rooms and groups are
 * never written to.
 *
 * The source of truth is this database, which `db:import` has already made
 * equal to the college's own timetable.
 *
 *   TARGET_DATABASE_URL="postgresql://…" npm run db:sync-schedule -- --dry
 *   TARGET_DATABASE_URL="postgresql://…" npm run db:sync-schedule
 *
 * It refuses to run against itself, and stops rather than delete most of a
 * timetable, which would mean the two databases were never the same one.
 */

import { PrismaClient } from "../generated/prisma";
import { regenerateOccurrences } from "../src/server/services/occurrences";

const ORG_SLUG = "default";
/** A diff this large means the comparison is wrong, not the timetable. */
const RUNAWAY = 0.4;

/**
 * The reason `db:import` writes on a week the college's grid does not hold.
 *
 * Both the college and the app cancel classes, and they must not overwrite each
 * other: a coordinator calling off tomorrow's lecture leaves an exception that
 * looks exactly like a week the college never published. This is how the two
 * are told apart, so reconciling one never silently undoes the other.
 */
const FROM_TIMETABLE = "Not on the published timetable that week";

const dryRun = process.argv.includes("--dry");

const target = process.env.TARGET_DATABASE_URL;
if (!target) throw new Error("set TARGET_DATABASE_URL to the database to sync");

const here = new PrismaClient();
const there = new PrismaClient({ datasources: { db: { url: target } } });

/** Everything about a class that says which class it is. */
const selectEvent = {
  id: true,
  title: true,
  notes: true,
  kind: true,
  status: true,
  startTime: true,
  endTime: true,
  timezone: true,
  rrule: true,
  room: { select: { code: true } },
  group: { select: { name: true } },
  faculty: { select: { user: { select: { name: true } } }, },
  semester: { select: { name: true } },
  groups: { select: { group: { select: { name: true } } } },
  exceptions: {
    select: {
      originalStart: true,
      type: true,
      newStartTime: true,
      newEndTime: true,
      newTitle: true,
      newRoomId: true,
      reason: true,
    },
  },
} as const;

type Class = Awaited<ReturnType<typeof load>>[number];

async function load(db: PrismaClient, orgId: string) {
  return db.event.findMany({ where: { orgId }, select: selectEvent });
}

/**
 * What makes two rows the same class in two databases.
 *
 * Ids are no use across databases and the title is a reading of the booking
 * rather than the booking itself — it changes whenever the parser improves. The
 * room, the times and the line the college typed do not.
 */
const signatureOf = (event: Class) =>
  [
    event.room.code,
    event.startTime.toISOString(),
    event.endTime.toISOString(),
    event.rrule ?? "",
    (event.notes ?? event.title).replace(/\s+/g, " ").trim(),
  ].join("§");

async function main() {
  const [mine, theirs] = await Promise.all([
    here.organization.findUniqueOrThrow({ where: { slug: ORG_SLUG } }),
    there.organization.findUniqueOrThrow({ where: { slug: ORG_SLUG } }),
  ]);

  const [source, existing] = await Promise.all([
    load(here, mine.id),
    load(there, theirs.id),
  ]);

  // Ids are cuids, so an id cannot exist in two databases by chance. Sharing
  // one means both handles found the same database — which sourcing a file of
  // production values into the shell will quietly do, and which would read as
  // "no differences" rather than as the mistake it is.
  const sourceIds = new Set(source.map((event) => event.id));
  if (existing.some((event) => sourceIds.has(event.id))) {
    throw new Error(
      "source and target are the same database — check DATABASE_URL is not also pointing at the target",
    );
  }

  const wanted = new Map(source.map((event) => [signatureOf(event), event]));
  const present = new Map(existing.map((event) => [signatureOf(event), event]));

  const toAdd = [...wanted].filter(([key]) => !present.has(key)).map(([, e]) => e);
  const toDrop = [...present].filter(([key]) => !wanted.has(key)).map(([, e]) => e);
  const toRetitle = [...wanted]
    .filter(([key, event]) => {
      const already = present.get(key);
      return already && already.title !== event.title;
    })
    .map(([key, event]) => ({ event, id: present.get(key)!.id }));

  console.log(
    `here ${source.length} classes · there ${existing.length}\n` +
      `  ${toAdd.length} to add, ${toDrop.length} to remove, ${toRetitle.length} whose title has been read better`,
  );

  if (existing.length > 0 && toDrop.length / existing.length > RUNAWAY) {
    throw new Error(
      `refusing to remove ${toDrop.length} of ${existing.length} classes — that is not a timetable moving on, it is the wrong database`,
    );
  }

  // Everything a class hangs off already exists there; this only ever reads it.
  const [rooms, groups, faculty, semesters] = await Promise.all([
    there.room.findMany({ where: { orgId: theirs.id }, select: { id: true, code: true } }),
    there.group.findMany({ where: { orgId: theirs.id }, select: { id: true, name: true } }),
    there.facultyProfile.findMany({
      where: { orgId: theirs.id },
      select: { id: true, user: { select: { name: true } } },
    }),
    there.semester.findMany({ where: { orgId: theirs.id }, select: { id: true, name: true } }),
  ]);
  const roomId = new Map(rooms.map((r) => [r.code, r.id]));
  const groupId = new Map(groups.map((g) => [g.name, g.id]));
  const facultyId = new Map(faculty.map((f) => [f.user.name ?? "", f.id]));
  const semesterId = new Map(semesters.map((s) => [s.name, s.id]));

  const sourceRoomCode = new Map(
    (
      await here.room.findMany({
        where: { orgId: mine.id },
        select: { id: true, code: true },
      })
    ).map((room) => [room.id, room.code]),
  );

  const targetRoomCode = new Map(rooms.map((room) => [room.id, room.code]));

  // A series is matched on its rule and its times, neither of which changes
  // when the college calls off a single week of it — that arrives as an
  // exception hanging off a class both databases already agree about. Matched
  // is therefore not the same as identical, and the weeks have to be compared
  // in their own right or a cancelled lecture would stay on the timetable.
  const matched = [...wanted]
    .filter(([key]) => present.has(key))
    .map(([key, event]) => ({ mine: event, theirs: present.get(key)! }));

  type Exception = Class["exceptions"][number];
  const fromTimetable = (exception: Exception) => exception.reason === FROM_TIMETABLE;
  const skipKey = (exception: Exception, code: string | null) =>
    [
      exception.originalStart.toISOString(),
      exception.type,
      exception.newStartTime?.toISOString() ?? "",
      exception.newEndTime?.toISOString() ?? "",
      exception.newTitle ?? "",
      code ?? "",
    ].join("§");

  const skipsOf = (event: Class, codeOf: Map<string, string>) =>
    new Set(
      event.exceptions
        .filter(fromTimetable)
        .map((e) => skipKey(e, e.newRoomId ? (codeOf.get(e.newRoomId) ?? null) : null)),
    );

  // An earlier copy of this script wrote the weeks across without their reason,
  // which leaves a skip that reads as somebody here calling the lecture off and
  // so would never be reconciled again. Where the college's own list skips that
  // exact week of that exact class, the row is the college's and is stamped as
  // such; anything else is left alone, because it might really be a cancellation.
  const toStamp: { id: string; at: Date }[] = [];
  for (const { mine, theirs } of matched) {
    const skipped = new Set(
      mine.exceptions.filter(fromTimetable).map((e) => e.originalStart.toISOString()),
    );
    for (const exception of theirs.exceptions) {
      if (exception.reason !== null) continue;
      if (!skipped.has(exception.originalStart.toISOString())) continue;
      toStamp.push({ id: theirs.id, at: exception.originalStart });
      exception.reason = FROM_TIMETABLE;
    }
  }
  if (toStamp.length > 0) {
    console.log(`  ${toStamp.length} skipped weeks an older sync copied without saying they were the college's`);
  }

  const toReskip = matched.filter(({ mine, theirs }) => {
    const ours = skipsOf(mine, sourceRoomCode);
    const yours = skipsOf(theirs, targetRoomCode);
    return ours.size !== yours.size || [...ours].some((week) => !yours.has(week));
  });
  if (toReskip.length > 0) {
    console.log(`  ${toReskip.length} classes the college has called off, or put back on, since`);
  }

  const unplaceable: string[] = [];
  for (const event of toAdd) {
    if (!roomId.has(event.room.code)) unplaceable.push(`room ${event.room.code}`);
    if (event.group && !groupId.has(event.group.name)) {
      unplaceable.push(`group ${event.group.name}`);
    }
  }
  if (unplaceable.length > 0) {
    console.log(
      `  ! ${new Set(unplaceable).size} things the other database does not have: ${[...new Set(unplaceable)].slice(0, 6).join(", ")}`,
    );
  }

  if (dryRun) {
    console.log("\n— dry run, nothing written —");
    for (const event of toAdd.slice(0, 8)) {
      console.log(`  + ${event.startTime.toISOString().slice(0, 16)} ${event.room.code.padEnd(6)} ${event.title.slice(0, 60)}`);
    }
    for (const event of toDrop.slice(0, 8)) {
      console.log(`  - ${event.startTime.toISOString().slice(0, 16)} ${event.room.code.padEnd(6)} ${event.title.slice(0, 60)}`);
    }
    for (const { mine, theirs } of toReskip.slice(0, 8)) {
      const ours = skipsOf(mine, sourceRoomCode).size;
      const yours = skipsOf(theirs, targetRoomCode).size;
      console.log(`  ~ ${mine.room.code.padEnd(6)} ${mine.title.slice(0, 46).padEnd(46)} ${yours} → ${ours} weeks off`);
    }
    await Promise.all([here.$disconnect(), there.$disconnect()]);
    return;
  }

  let added = 0;
  let skipped = 0;
  for (const event of toAdd) {
    const room = roomId.get(event.room.code);
    const semester = semesterId.get(event.semester?.name ?? "");
    if (!room) {
      skipped++;
      continue;
    }
    const primary = event.group ? groupId.get(event.group.name) : undefined;
    const attending = event.groups
      .map((g) => groupId.get(g.group.name))
      .filter((id): id is string => Boolean(id));

    const created = await there.event.create({
      data: {
        orgId: theirs.id,
        kind: event.kind,
        status: event.status,
        title: event.title,
        notes: event.notes,
        roomId: room,
        groupId: primary ?? null,
        facultyId: facultyId.get(event.faculty?.user.name ?? "") ?? null,
        semesterId: semester ?? null,
        startTime: event.startTime,
        endTime: event.endTime,
        timezone: event.timezone,
        rrule: event.rrule,
        ...(attending.length > 0
          ? { groups: { create: [...new Set(attending)].map((id) => ({ groupId: id })) } }
          : {}),
      },
    });

    // The weeks the college skips are part of the class, not a detail: without
    // them the rule would put a lecture on a holiday. The reason comes with
    // them, because it is what says the college skipped the week rather than
    // somebody here calling the lecture off — and a copy that forgot would be
    // treated as the second and left in place for ever.
    for (const exception of event.exceptions) {
      await there.eventException.create({
        data: {
          eventId: created.id,
          originalStart: exception.originalStart,
          type: exception.type,
          newStartTime: exception.newStartTime,
          newEndTime: exception.newEndTime,
          newTitle: exception.newTitle,
          reason: exception.reason,
          // Room ids differ between databases, so an override is translated
          // through the code, which does not.
          newRoomId: exception.newRoomId
            ? (roomId.get(sourceRoomCode.get(exception.newRoomId) ?? "") ?? null)
            : null,
        },
      });
    }
    await regenerateOccurrences(there, created.id);
    added++;
  }

  // A register is a record of something that happened. The college dropping a
  // class from next month's grid does not unhappen the lecture somebody took
  // attendance at, so those are left where they are and named instead.
  const registered = new Set(
    (
      await there.attendanceSession.findMany({
        where: { occurrence: { eventId: { in: toDrop.map((e) => e.id) } } },
        select: { occurrence: { select: { eventId: true } } },
      })
    ).map((session) => session.occurrence.eventId),
  );

  let removed = 0;
  for (const event of toDrop) {
    if (registered.has(event.id)) continue;
    await there.event.delete({ where: { id: event.id } });
    removed++;
  }
  if (registered.size > 0) {
    console.log(
      `  · ${registered.size} classes kept though the college has dropped them: a register was taken at them`,
    );
  }

  for (const { id, event } of toRetitle) {
    await there.event.update({ where: { id }, data: { title: event.title } });
  }

  // Rebuilding a series' sittings deletes and rewrites them, and a register
  // hangs off the sitting it was taken at, so a class somebody has marked
  // attendance for is left exactly as it is and named instead.
  const marked = new Set(
    (
      await there.attendanceSession.findMany({
        where: { occurrence: { eventId: { in: toReskip.map((pair) => pair.theirs.id) } } },
        select: { occurrence: { select: { eventId: true } } },
      })
    ).map((session) => session.occurrence.eventId),
  );

  for (const { id, at } of toStamp) {
    await there.eventException.updateMany({
      where: { eventId: id, originalStart: at, reason: null },
      data: { reason: FROM_TIMETABLE },
    });
  }

  let reskipped = 0;
  let held = 0;
  for (const { mine, theirs } of toReskip) {
    if (marked.has(theirs.id)) {
      held++;
      continue;
    }
    // Only the college's own weeks are replaced. An exception somebody made in
    // the app stays, and keeps its date to itself: the pair is unique per
    // event, and the week is already off either way.
    const ours = new Set(
      theirs.exceptions
        .filter((exception) => !fromTimetable(exception))
        .map((exception) => exception.originalStart.toISOString()),
    );
    await there.eventException.deleteMany({
      where: { eventId: theirs.id, reason: FROM_TIMETABLE },
    });
    await there.eventException.createMany({
      data: mine.exceptions
        .filter(fromTimetable)
        .filter((exception) => !ours.has(exception.originalStart.toISOString()))
        .map((exception) => ({
          eventId: theirs.id,
          originalStart: exception.originalStart,
          type: exception.type,
          newStartTime: exception.newStartTime,
          newEndTime: exception.newEndTime,
          newTitle: exception.newTitle,
          newRoomId: exception.newRoomId
            ? (roomId.get(sourceRoomCode.get(exception.newRoomId) ?? "") ?? null)
            : null,
          reason: FROM_TIMETABLE,
        })),
      skipDuplicates: true,
    });
    await regenerateOccurrences(there, theirs.id);
    reskipped++;
  }
  if (held > 0) {
    console.log(
      `  · ${held} classes left as they were though their weeks have changed: a register was taken at them`,
    );
  }

  console.log(
    `\n✓ ${added} classes added, ${removed} removed, ${toRetitle.length} retitled` +
      (reskipped > 0 ? `, ${reskipped} re-skipped` : "") +
      (skipped > 0 ? `, ${skipped} skipped for want of a room` : ""),
  );

  const after = await there.eventOccurrence.count({ where: { orgId: theirs.id } });
  const mineNow = await here.eventOccurrence.count({ where: { orgId: mine.id } });
  console.log(`  sittings: here ${mineNow}, there ${after}`);

  await Promise.all([here.$disconnect(), there.$disconnect()]);
}

main().catch(async (error) => {
  console.error(String(error).split("\n")[0]);
  await Promise.all([here.$disconnect(), there.$disconnect()]);
  process.exit(1);
});
