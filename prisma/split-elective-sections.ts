/**
 * Gives a sectioned elective's sittings a group each, and puts its students in
 * them — against a database that may not be rebuilt.
 *
 * An elective too big for one room is taught twice over, and the college splits
 * its takers into a Group 1 and a Group 2 that meet at different hours. Until
 * those sittings were groups, `db:import` filed all their classes under the one
 * bucket MRBS gives a cohort — "BBA-IT (V) - Minor Courses" — which nobody is a
 * member of, so every one of those lectures was invisible to every student who
 * should have been at it.
 *
 * `db:students` now builds those groups and moves the classes onto them, and on
 * this laptop that is the whole story. Production is not rebuilt: students have
 * signed in, registers have been taken, and `db:students` would delete every
 * account not on the roster. So the same change is made here class by class.
 *
 *   npm run db:split-sections -- --cohort "BBA-IT (V)" --dry
 *   TARGET_DATABASE_URL="postgresql://…" npm run db:split-sections -- --cohort "BBA-IT (V)"
 *
 * It reads the roster for who belongs where, and the class titles — "G1 - Services
 * Marketing" — for which sitting each class is. It only ever adds memberships,
 * never removes one, and it leaves the emptied bucket in place: `db:sync-schedule`
 * still needs a group of that name to hang a newly imported class off.
 *
 * `--dry` prints the whole plan and writes nothing. Re-running it is safe: a
 * class already on the right group is left alone rather than regenerated.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  electiveForTitle,
  fromCsv,
  schemeFor,
  sectionFromTitle,
  shortSection,
  titleWithoutSection,
  type ElectiveScheme,
} from "../src/lib/roster";
import { regenerateOccurrences } from "../src/server/services/occurrences";
import { GroupKind, PrismaClient } from "../generated/prisma";

const ROSTER = path.join(process.cwd(), "data", "students.csv");

const flag = (name: string) => {
  const joined = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (joined) return joined.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return undefined;
  const rest = process.argv.slice(at + 1);
  const until = rest.findIndex((arg) => arg.startsWith("--"));
  const words = until === -1 ? rest : rest.slice(0, until);
  return words.length > 0 ? words.join(" ") : undefined;
};

/** "BBA-IT (V)" — the cohort whose electives are to be opened out. */
const cohort = flag("cohort") ?? "BBA-IT (V)";
const dryRun = process.argv.includes("--dry");
/** Say so twice before rebuilding a sitting somebody has a register at. */
const force = process.argv.includes("--force");

const parsed = /^(.+)\s+\(([IVX]+)\)$/.exec(cohort);
if (!parsed) {
  throw new Error(`--cohort should read like "BBA-IT (V)", not "${cohort}"`);
}
const [, programme, semester] = parsed as unknown as [string, string, string];

/** Whichever database was asked for: this one unless another was named. */
const db = new PrismaClient({
  datasources: {
    db: { url: process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL },
  },
});

const say = (line = "") => console.log(line);
const would = (done: string, todo: string) => (dryRun ? todo : done);

/** Who the roster puts in which elective and which sitting of it. */
function readRoster(scheme: ElectiveScheme) {
  const rows = fromCsv(readFileSync(ROSTER, "utf8")).filter(
    (row) => row.programme === programme && row.semester === semester,
  );
  return rows.map((row) => ({
    prn: row.prn ?? "",
    minorGroup: Number(row.minor_group ?? "") || 0,
    section: (row.section ?? "").trim(),
  }));
}

async function main() {
  const scheme = schemeFor(programme, semester);
  if (!scheme) throw new Error(`no elective scheme for ${cohort}`);
  if (!scheme.sectioned) throw new Error(`${cohort}'s electives are not taught in sections`);

  const bucketName = `${cohort} - Minor Courses`;
  const bucket = await db.group.findFirst({
    where: { name: bucketName },
    select: { id: true, orgId: true, programmeId: true, semesterId: true, batchId: true },
  });
  if (!bucket) throw new Error(`this database has no "${bucketName}" to open out`);

  const roster = readRoster(scheme);
  if (roster.length === 0) throw new Error(`the roster names no ${cohort} students`);
  say(`${cohort}: ${roster.length} students on the roster, bucket "${bucketName}" found`);

  // ── What each class is, before anything is written ────────────────────────
  //
  // Read the electives' own groups too, not just the bucket, so a re-run is a
  // re-derivation rather than a one-way drain.
  const existing = await db.group.findMany({
    where: { orgId: bucket.orgId, name: { startsWith: `${cohort} - ` } },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((g) => [g.name, g.id]));

  const events = await db.event.findMany({
    where: {
      orgId: bucket.orgId,
      groupId: { in: [bucket.id, ...existing.map((g) => g.id)] },
    },
    select: {
      id: true,
      title: true,
      groupId: true,
      courseId: true,
      groups: { select: { groupId: true } },
    },
  });

  /** Where each class ought to sit: an elective, or one sitting of it. */
  const wanted = new Map<string, string>();
  const unmatched: string[] = [];
  for (const event of events) {
    const elective = electiveForTitle(titleWithoutSection(event.title), scheme);
    if (!elective) {
      if (event.groupId === bucket.id) unmatched.push(event.title);
      continue;
    }
    const section = sectionFromTitle(event.title);
    const base = `${cohort} - ${elective.name}`;
    wanted.set(event.id, section ? `${base} ${shortSection(section)}` : base);
  }

  // A group that does not exist yet has no id to be sitting on, so a class
  // bound for one is always on the move.
  const isSettled = (event: { id: string; groupId: string | null }) => {
    const name = wanted.get(event.id);
    return name !== undefined && event.groupId === byName.get(name);
  };
  const moving = events.filter((e) => wanted.has(e.id) && !isSettled(e));
  const settled = events.filter((e) => isSettled(e));

  // ── Refuse rather than guess ──────────────────────────────────────────────
  if (unmatched.length > 0) {
    say();
    for (const title of [...new Set(unmatched)]) say(`  ! matches no elective: ${title}`);
    throw new Error(
      `${new Set(unmatched).size} classes on the bucket match no elective of ${cohort};` +
        " check the scheme in src/lib/roster.ts before moving anything",
    );
  }

  // A class combined with a second cohort would lose it when the join is
  // rewritten. None are today; refuse if that ever changes.
  const combined = moving.filter(
    (e) => e.groups.length > 1 || (e.groups.length === 1 && e.groups[0]!.groupId !== e.groupId),
  );
  if (combined.length > 0) {
    for (const e of combined) say(`  ! attended by more than its own cohort: ${e.title}`);
    throw new Error("refusing to rewrite the attendance of a combined lecture");
  }

  // Moving a class rebuilds its sittings, and a register hangs off the sitting
  // it was taken at.
  const registers = await db.attendanceSession.count({
    where: { occurrence: { eventId: { in: moving.map((e) => e.id) } } },
  });
  if (registers > 0 && !force) {
    throw new Error(
      `${registers} registers have been taken at these classes, and moving them now would` +
        " delete those registers. Pass --force if that is really what you want.",
    );
  }

  // ── The sittings become groups ────────────────────────────────────────────
  const needed = new Map<string, { label: string; kind: keyof typeof GroupKind }>();
  for (const elective of scheme.electives) {
    const base = `${cohort} - ${elective.name}`;
    const codes = elective.subjects.map((s) => s.code).filter(Boolean).join(", ");
    const label = codes ? `Group ${elective.group} · ${codes}` : `Group ${elective.group}`;
    const sections = new Set(
      roster
        .filter((student) => student.minorGroup === elective.group && student.section)
        .map((student) => student.section),
    );
    for (const section of [...sections].sort()) {
      const short = shortSection(section);
      needed.set(`${base} ${short}`, { label: `${label} · ${short}`, kind: elective.kind });
    }
  }

  say();
  for (const [name, { label, kind }] of needed) {
    const already = byName.has(name);
    say(`  ${already ? "have  " : would("create", "would create")}  ${name.padEnd(42)} ${label}`);
    if (already) continue;
    if (dryRun) {
      // A stand-in id, so everything downstream can be counted as it would
      // really fall out. Nothing is written, so it never reaches the database.
      byName.set(name, `would-create:${name}`);
      continue;
    }
    const group = await db.group.create({
      data: {
        orgId: bucket.orgId,
        programmeId: bucket.programmeId,
        semesterId: bucket.semesterId,
        batchId: bucket.batchId,
        name,
        label,
        kind: GroupKind[kind],
      },
    });
    byName.set(name, group.id);
  }

  const idOf = (name: string) => {
    const id = byName.get(name);
    if (!id) throw new Error(`no group "${name}" — it should have just been created`);
    return id;
  };
  const real = (id: string) => !id.startsWith("would-create:");

  // ── The students join their sitting ───────────────────────────────────────
  //
  // Added, never removed: this database holds memberships nobody's roster
  // knows about — somebody moved by hand in the app — and a sweep would take
  // them with it.
  const profiles = await db.studentProfile.findMany({
    where: { prn: { in: roster.map((s) => s.prn) } },
    select: { id: true, prn: true, memberships: { select: { groupId: true } } },
  });
  const byPrn = new Map(profiles.map((p) => [p.prn, p]));

  const joining: Array<{ studentId: string; groupId: string }> = [];
  const strangers: string[] = [];
  const tally = new Map<string, number>();
  for (const student of roster) {
    if (!student.minorGroup) continue;
    const elective = scheme.electives.find((e) => e.group === student.minorGroup);
    if (!elective) continue;
    const base = `${cohort} - ${elective.name}`;
    const name = student.section ? `${base} ${shortSection(student.section)}` : base;
    if (!byName.has(name) && !needed.has(name)) {
      strangers.push(`${student.prn} is in "${student.section}", which is no sitting of ${elective.name}`);
      continue;
    }
    tally.set(name, (tally.get(name) ?? 0) + 1);

    const profile = byPrn.get(student.prn);
    if (!profile) continue;
    // Both the elective and the sitting: what they chose, and where they sit.
    for (const target of new Set([base, name])) {
      const groupId = idOf(target);
      if (profile.memberships.some((m) => m.groupId === groupId)) continue;
      joining.push({ studentId: profile.id, groupId });
    }
  }

  say();
  for (const [name, n] of [...tally].sort()) say(`  ${String(n).padStart(3)} students  ${name}`);
  for (const line of strangers) say(`  ! ${line}`);
  const absent = roster.filter((s) => s.minorGroup && !byPrn.has(s.prn));
  if (absent.length > 0) {
    say(`  ! ${absent.length} on the roster have no record in this database: ${absent.map((s) => s.prn).join(", ")}`);
  }
  say(`  ${would("added", "would add")} ${joining.length} memberships`);
  if (!dryRun && joining.length > 0) {
    await db.studentGroupMembership.createMany({ data: joining, skipDuplicates: true });
  }

  // ── The classes move onto them ────────────────────────────────────────────
  say();
  if (settled.length > 0) say(`  ${settled.length} classes are already where they belong`);
  for (const event of moving) {
    const name = wanted.get(event.id)!;
    say(`  ${would("moved ", "would move")}  ${event.title.slice(0, 44).padEnd(46)} → ${name}`);
    if (dryRun) continue;
    const target = idOf(name)!;
    // The order matters: the occurrences are re-derived from the event, so the
    // event has to be pointed at its new group before they are rebuilt.
    await db.$transaction(
      async (tx) => {
        await tx.event.update({ where: { id: event.id }, data: { groupId: target } });
        // Rewritten rather than added to: a leftover row pointing at the
        // bucket would put a second, empty register on the marking screen.
        await tx.eventGroup.deleteMany({ where: { eventId: event.id } });
        await tx.eventGroup.create({ data: { eventId: event.id, groupId: target } });
        await regenerateOccurrences(tx, event.id);
      },
      { timeout: 60_000, maxWait: 20_000 },
    );
  }

  // ── The courses follow their classes ──────────────────────────────────────
  //
  // `db:courses` derives this from the lectures, but it rebuilds the whole
  // semester and must never be run here, so the same rows are worked out from
  // the classes that just moved.
  const attends = new Set<string>();
  for (const event of events) {
    const name = wanted.get(event.id);
    if (!name || !event.courseId) continue;
    attends.add(`${idOf(name)}§${event.courseId}`);
  }
  const links = [...attends].map((key) => {
    const [groupId, courseId] = key.split("§") as [string, string];
    return { groupId, courseId };
  });
  const held = await db.groupCourse.findMany({
    where: { groupId: { in: [bucket.id, ...links.map((l) => l.groupId).filter(real)] } },
    select: { groupId: true, courseId: true },
  });
  const already = new Set(held.map((row) => `${row.groupId}§${row.courseId}`));
  const fresh = links.filter((l) => !already.has(`${l.groupId}§${l.courseId}`));
  const stale = held.filter((row) => row.groupId === bucket.id);
  say();
  say(`  ${would("put", "would put")} ${fresh.length} course links on the sittings, ${would("took", "would take")} ${stale.length} off the bucket`);
  if (!dryRun) {
    await db.groupCourse.createMany({ data: links, skipDuplicates: true });
    await db.groupCourse.deleteMany({ where: { groupId: bucket.id } });
  }

  // ── Whoever teaches them ──────────────────────────────────────────────────
  const touched = [bucket.id, ...new Set([...wanted.values()].map(idOf))].filter(real);
  let added = 0;
  let dropped = 0;
  for (const groupId of touched) {
    const teaching = await db.event.findMany({
      where: { groupId, facultyId: { not: null } },
      select: { facultyId: true },
      distinct: ["facultyId"],
    });
    const shouldBe = new Set(teaching.map((e) => e.facultyId!));
    const assigned = new Set(
      (await db.facultyGroupAssignment.findMany({ where: { groupId }, select: { facultyId: true } }))
        .map((row) => row.facultyId),
    );
    const missing = [...shouldBe].filter((id) => !assigned.has(id));
    const gone = [...assigned].filter((id) => !shouldBe.has(id));
    added += missing.length;
    dropped += gone.length;
    if (dryRun) continue;
    if (missing.length > 0) {
      await db.facultyGroupAssignment.createMany({
        data: missing.map((facultyId) => ({ facultyId, groupId })),
        skipDuplicates: true,
      });
    }
    if (gone.length > 0) {
      await db.facultyGroupAssignment.deleteMany({ where: { groupId, facultyId: { in: gone } } });
    }
  }
  say(`  ${would("put", "would put")} ${added} teachers on their groups, ${dropped} off the ones they left`);

  // ── What it looks like afterwards ─────────────────────────────────────────
  //
  // `db:verify-schedule` compares rooms, times and class text, so it passes
  // whether or not this worked. This is the check that does not.
  say();
  say(dryRun ? "  how the cohort stands now, before any of that:" : "  how the cohort stands now:");
  const after = await db.group.findMany({
    where: { orgId: bucket.orgId, name: { startsWith: `${cohort} - ` } },
    select: { name: true, _count: { select: { students: true, events: true, courses: true } } },
    orderBy: { name: "asc" },
  });
  const orphans: string[] = [];
  for (const group of after) {
    const { students, events: classes, courses } = group._count;
    say(
      `  ${group.name.padEnd(44)} ${String(students).padStart(3)} students` +
        `  ${String(classes).padStart(3)} classes  ${String(courses).padStart(2)} courses`,
    );
    if (classes > 0 && students === 0) orphans.push(group.name);
  }
  if (orphans.length > 0 && !dryRun) {
    say();
    for (const name of orphans) {
      say(`  ! ${name} still holds classes nobody is a member of`);
    }
  }

  say();
  say(
    dryRun
      ? `— dry run: ${needed.size} groups, ${joining.length} memberships and ${moving.length} classes would change —`
      : `✓ ${cohort}: ${moving.length} classes moved onto the sitting that takes them,` +
        ` ${joining.length} memberships added`,
  );
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(String(error).split("\n")[0]);
  await db.$disconnect();
  process.exit(1);
});
