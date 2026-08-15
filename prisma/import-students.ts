/**
 * Puts the students into the app, with the electives they carry.
 *
 * It reads one file — `data/students.csv`, the consolidated roster that
 * `npm run roster` builds out of everything the college has sent. Reconciling
 * the documents happens there; this script only writes what that file says, so
 * anything wrong here can be seen in the CSV first.
 *
 * What it writes: the elective groups a year splits into, the students as users
 * with a student profile, and their memberships — one division (or the research
 * cohort), and the electives they chose. The elective groups are attached to the
 * classes that teach them, so a student's timetable is their own and not the
 * whole cohort's.
 *
 * Every other student in the org is removed, as are the memberships and
 * attendance that hung off them. One account is spared: ADMIN_EMAIL, which is
 * how this instance is administered.
 *
 * Where it sits in the chain: `npm run roster` builds the CSV, `db:import`
 * rebuilds the timetable and the cohorts these students join, this script puts
 * the students in them, then `db:courses` works out what is being taught and
 * `db:faculty` gives the teachers their real addresses. Re-running db:import
 * clears the groups and events, so everything after it has to run again. Each
 * is safe to re-run on its own: they write upserts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  electiveForTitle,
  fromCsv,
  schemeFor,
  type ElectiveScheme,
} from "../src/lib/roster";
import { electiveForClass, isJointResearchClass } from "../src/lib/student-lists";
import { regenerateOccurrences } from "../src/server/services/occurrences";
import { GroupKind, PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

const ORG_SLUG = "default";

/** The one account that survives the clear-out, and stays an admin. */
const ADMIN_EMAIL = "pad2324026@sicsr.ac.in";

const ROSTER = path.join(process.cwd(), "data", "students.csv");

/**
 * Where a student with no address of their own is parked.
 *
 * They are on the roll and belong in the app — counted for a room, listed on a
 * register, a member of their groups — but they cannot sign in, and the address
 * says so rather than pretending. `.invalid` is reserved precisely for this and
 * can never resolve, so nothing can be sent to it by accident. When the college
 * finally supplies a real one the import replaces it, matching on the PRN.
 */
const NO_ADDRESS_DOMAIN = "unknown.invalid";

const placeholderAddress = (prn: string) => `${prn}@${NO_ADDRESS_DOMAIN}`;

/** Whether an address is one somebody could actually sign in with. */
const isReal = (email: string) => !email.endsWith(`@${NO_ADDRESS_DOMAIN}`);

/** A student as the consolidated roster records them. */
interface Row {
  prn: string;
  name: string;
  email: string;
  programme: string;
  semester: string;
  division: string;
  track: string;
  majorGroup: number;
  minorGroup: number;
}

async function main() {
  const roster = fromCsv(readFileSync(ROSTER, "utf8"));
  console.log(`Read ${path.relative(process.cwd(), ROSTER)} — ${roster.length} students`);

  const students: Row[] = roster.map((row) => ({
    prn: row.prn ?? "",
    name: row.name ?? "",
    email: (row.college_email ?? "").trim().toLowerCase(),
    programme: row.programme ?? "",
    semester: row.semester ?? "",
    division: row.division ?? "",
    track: row.track ?? "",
    majorGroup: Number(row.major_group ?? "") || 0,
    minorGroup: Number(row.minor_group ?? "") || 0,
  }));

  const org = await db.organization.findUniqueOrThrow({ where: { slug: ORG_SLUG } });
  await replaceStudents(org.id, students);
  await db.$disconnect();
}

interface Cohort {
  programmeId: string;
  batchId: string;
  semesterId: string;
}

/** "BCA (VII)" — how every group of a cohort is named, whatever divides it. */
const cohortPrefix = (programme: string, semester: string) => `${programme} (${semester})`;

/**
 * The groups a year splits into for its electives, one per choice.
 *
 * The timetable files them all under a bucket or two — "Major Courses",
 * "Minor Courses" — because MRBS gives a cohort one colour and no more. That is
 * fine for a wall chart and useless for a student, who wants their own classes
 * and not the whole year's, so the buckets are opened out here.
 */
async function electiveGroups(orgId: string, scheme: ElectiveScheme, cohort: Cohort) {
  const ids = new Map<number, string>();
  for (const elective of scheme.electives) {
    const name = `${cohortPrefix(scheme.programme, scheme.semester)} - ${elective.name}`;
    const codes = elective.subjects.map((s) => s.code).filter(Boolean).join(", ");
    const group = await db.group.upsert({
      where: {
        programmeId_semesterId_name: { programmeId: cohort.programmeId, semesterId: cohort.semesterId, name },
      },
      update: { kind: GroupKind[elective.kind], batchId: cohort.batchId },
      create: {
        orgId,
        programmeId: cohort.programmeId,
        semesterId: cohort.semesterId,
        batchId: cohort.batchId,
        name,
        label: codes ? `Group ${elective.group} · ${codes}` : `Group ${elective.group}`,
        kind: GroupKind[elective.kind],
      },
    });
    ids.set(elective.group, group.id);
  }
  return ids;
}

/**
 * Moves each elective class off the coarse bucket and onto its own elective.
 *
 * A student's timetable is the intersection of their groups and the group
 * stamped on each occurrence, so a class reaches the right people only if it
 * *belongs* to the elective — a second group riding along on the join table is
 * invisible there. The join row is moved as well so that conflict checks and
 * the attendance register agree with what the students see.
 */
async function repointElectiveClasses(
  orgId: string,
  scheme: ElectiveScheme,
  electives: Map<number, string>,
) {
  const prefix = cohortPrefix(scheme.programme, scheme.semester);
  const buckets = await db.group.findMany({
    where: {
      orgId,
      name: { in: [`${prefix} - Major Courses`, `${prefix} - Minor Courses`] },
    },
    select: { id: true, name: true },
  });
  if (buckets.length === 0) return { moved: 0, unmatched: [] as string[] };

  // The BCA lists carry the college's own stream code on every class line,
  // which is a surer signal than a title; nothing else does, so elsewhere the
  // subject is matched against the scheme this cohort follows.
  const match = (event: { title: string; notes: string | null }) =>
    scheme.programme === "BCA"
      ? electiveForClass(event)
      : { elective: electiveForTitle(event.title, scheme), disagreed: false };

  const events = await db.event.findMany({
    where: { orgId, groupId: { in: buckets.map((b) => b.id) } },
    select: { id: true, title: true, notes: true, groupId: true },
  });

  let moved = 0;
  const unmatched: string[] = [];
  for (const event of events) {
    const { elective, disagreed } = match(event);
    const target = elective ? electives.get(elective.group) : undefined;
    if (!target) {
      unmatched.push(
        disagreed ? `${event.title} (its stream and its subject disagree)` : event.title,
      );
      continue;
    }

    await db.$transaction(async (tx) => {
      await tx.event.update({ where: { id: event.id }, data: { groupId: target } });
      // The join is rewritten rather than added to: a leftover row pointing at
      // the bucket would put a second, empty register on the marking screen.
      await tx.eventGroup.deleteMany({ where: { eventId: event.id } });
      await tx.eventGroup.create({ data: { eventId: event.id, groupId: target } });
      await regenerateOccurrences(tx, event.id);
    });
    moved++;
  }

  console.log(`✓ ${moved} ${prefix} elective classes moved onto the group that takes them`);
  for (const title of [...new Set(unmatched)]) {
    console.log(`  ! left on the bucket, matching no elective: ${title}`);
  }

  await alignTeaching([...electives.values(), ...buckets.map((b) => b.id)]);
  return { moved, unmatched };
}

/**
 * Puts each group's teachers back in step with the classes it now owns.
 *
 * Who teaches a group is a stored fact rather than a derived one, so moving a
 * class from one group to another leaves the teacher behind on the old group
 * and missing from the new one — a group that shows no staff at all, and two
 * empty cohorts still claiming ten.
 */
async function alignTeaching(groupIds: string[]) {
  let added = 0;
  let dropped = 0;

  for (const groupId of groupIds) {
    const teaching = await db.event.findMany({
      where: { groupId, facultyId: { not: null } },
      select: { facultyId: true },
      distinct: ["facultyId"],
    });
    const shouldBe = new Set(teaching.map((event) => event.facultyId!));
    const assigned = new Set(
      (
        await db.facultyGroupAssignment.findMany({ where: { groupId }, select: { facultyId: true } })
      ).map((row) => row.facultyId),
    );

    const missing = [...shouldBe].filter((id) => !assigned.has(id));
    const stale = [...assigned].filter((id) => !shouldBe.has(id));

    if (missing.length > 0) {
      await db.facultyGroupAssignment.createMany({
        data: missing.map((facultyId) => ({ facultyId, groupId })),
        skipDuplicates: true,
      });
      added += missing.length;
    }
    if (stale.length > 0) {
      await db.facultyGroupAssignment.deleteMany({
        where: { groupId, facultyId: { in: stale } },
      });
      dropped += stale.length;
    }
  }

  if (added || dropped) {
    console.log(`✓ teaching assignments: ${added} added, ${dropped} cleared off the empty buckets`);
  }
}

/**
 * Gives the research students the coursework they sit with the BBA-IT.
 *
 * Their four papers — Literature Review, Scientific Paper Writing, Ethics in
 * Research, R Programming — are taught to both programmes at once, so the
 * timetable files them under the campus-wide "Common Batch" rather than under
 * either cohort, and no student is a member of that. They become a combined
 * lecture instead: owned by the cohort whose students this app holds, with the
 * BBA-IT's research cohort recorded alongside as the other room-mate.
 */
async function claimJointResearchClasses(orgId: string, ownerId: string) {
  const bucket = await db.group.findFirst({
    where: { orgId, name: "Common Batch" },
    select: { id: true },
  });
  if (!bucket) return 0;

  const alongside = await db.group.findFirst({
    where: { orgId, name: "BBA-IT (VII) - Honours with Research" },
    select: { id: true },
  });

  const events = await db.event.findMany({
    where: { orgId, groupId: bucket.id },
    select: { id: true, title: true, notes: true },
  });

  let claimed = 0;
  for (const event of events) {
    if (!isJointResearchClass(event.notes ?? event.title)) continue;

    await db.$transaction(async (tx) => {
      await tx.event.update({ where: { id: event.id }, data: { groupId: ownerId } });
      await tx.eventGroup.deleteMany({ where: { eventId: event.id } });
      await tx.eventGroup.createMany({
        data: [ownerId, ...(alongside ? [alongside.id] : [])].map((groupId) => ({
          eventId: event.id,
          groupId,
        })),
      });
      await regenerateOccurrences(tx, event.id);
    });
    claimed++;
  }

  if (claimed > 0) {
    console.log(
      `✓ ${claimed} research classes taken off the campus-wide bucket and given to the research cohort` +
        (alongside ? ", with BBA-IT alongside" : ""),
    );
  }
  return claimed;
}

/** Everybody who is not on the new roster, and the rows that hang off them. */
async function clearOtherStudents(orgId: string, keepPrns: Set<string>) {
  const enrolled = await db.studentProfile.findMany({
    where: { orgId },
    select: {
      prn: true,
      userId: true,
      user: { select: { email: true, facultyProfile: { select: { id: true } } } },
    },
  });
  // Kept by PRN, which is what the roster is about; the one administering
  // account is spared by address, because that is how it is identified.
  const others = enrolled.filter(
    (row) =>
      !keepPrns.has(row.prn) &&
      row.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase(),
  );

  // Deleting the user takes the profile, the memberships and the attendance
  // records with it; anyone who is also staff keeps their account and loses
  // only the student side of it.
  const staff = others.filter((o) => o.user.facultyProfile);
  await db.studentProfile.deleteMany({ where: { userId: { in: staff.map((o) => o.userId) } } });
  await db.user.deleteMany({
    where: { id: { in: others.filter((o) => !o.user.facultyProfile).map((o) => o.userId) } },
  });

  console.log(
    `✓ removed ${others.length} students who are not on these lists` +
      (staff.length ? ` (${staff.length} kept as staff accounts)` : ""),
  );
  return others.length;
}

/**
 * Which group each cohort's students belong to, by the way that year is divided.
 *
 * A year is split by division letter, or by an honours track that stands apart
 * from the letters, or — for a first year that has not been divided yet — not at
 * all. Only the groups the timetable already created are used: a student whose
 * cohort is not on it has nowhere to sit, and is reported rather than invented.
 */
async function cohortGroups(orgId: string, programme: string, semester: string) {
  const prefix = cohortPrefix(programme, semester);
  const groups = await db.group.findMany({
    where: { orgId, name: { startsWith: prefix } },
    select: { id: true, name: true, programmeId: true, semesterId: true, batchId: true },
  });
  return { prefix, groups };
}

async function replaceStudents(orgId: string, students: Row[]) {
  const role = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: "student" } },
    select: { id: true },
  });
  // Whoever administers this instance is on these lists as a student too, and
  // stays an administrator whatever else the import does to their account.
  const admin = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: "admin" } },
    select: { id: true },
  });

  /** Which groups each student joins, worked out a cohort at a time. */
  const placement = new Map<string, string[]>();
  const unplaced: Array<{ student: Row; reason: string }> = [];
  const cohorts = new Map<string, Row[]>();
  for (const student of students) {
    const key = `${student.programme}|${student.semester}`;
    (cohorts.get(key) ?? cohorts.set(key, []).get(key)!).push(student);
  }

  for (const [key, members] of cohorts) {
    const [programme, semester] = key.split("|") as [string, string];
    const { prefix, groups } = await cohortGroups(orgId, programme, semester);
    if (groups.length === 0) {
      for (const student of members) {
        unplaced.push({ student, reason: `the timetable has no ${prefix} cohort` });
      }
      continue;
    }

    const anchor = groups.find((g) => g.semesterId && g.batchId)!;
    const byName = new Map(groups.map((g) => [g.name, g.id]));
    const scheme = schemeFor(programme, semester);
    const electives = scheme
      ? await electiveGroups(orgId, scheme, {
          programmeId: anchor.programmeId,
          semesterId: anchor.semesterId!,
          batchId: anchor.batchId!,
        })
      : new Map<number, string>();

    if (scheme && !scheme.sectioned) {
      await repointElectiveClasses(orgId, scheme, electives);
    } else if (scheme?.sectioned) {
      console.log(
        `  · ${prefix} electives are taught in two sections, so their classes stay` +
          " on the timetable's own bucket until the sections are groups",
      );
    }
    const research = byName.get(`${prefix} - Honours with Research`);
    if (research && programme === "BCA") {
      await claimJointResearchClasses(orgId, research);
      await alignTeaching([research]);
    }

    for (const student of members) {
      // A division is where somebody sits, and the timetable names honours
      // divisions as such; a track only places a student when it stands apart
      // from the letters, as "Honours with Research" does.
      const home = student.division
        ? (byName.get(`${prefix} - Honours Div. ${student.division}`) ??
           byName.get(`${prefix} - Div. ${student.division}`))
        : student.track
          ? byName.get(`${prefix} - ${student.track}`)
          : undefined;

      if (!home) {
        // On the roll but nowhere to sit yet: recorded so the college can see
        // them, with no groups until a document says which division they are
        // in. Leaving them out entirely would make the app disagree with the
        // register about who is enrolled.
        unplaced.push({
          student,
          reason: student.division || student.track
            ? `no ${prefix} group for ${student.track || `division ${student.division}`}`
            : `${prefix} states no division for them`,
        });
        placement.set(student.prn, []);
        continue;
      }
      placement.set(
        student.prn,
        [home, electives.get(student.majorGroup), electives.get(student.minorGroup)].filter(
          (id): id is string => Boolean(id),
        ),
      );
    }
  }

  const placed = students.filter((s) => placement.has(s.prn));
  await clearOtherStudents(orgId, new Set(placed.map((s) => s.prn)));

  let created = 0;
  let updated = 0;
  let waiting = 0;
  for (const student of placed) {
    const groupIds = placement.get(student.prn)!;

    // A student *is* their PRN. The address is a credential that often arrives
    // months later, so looking somebody up by it would make a second record of
    // the same person the day the college finally sends it.
    const already = await db.studentProfile.findUnique({
      where: { orgId_prn: { orgId, prn: student.prn } },
      select: { id: true, userId: true, user: { select: { email: true } } },
    });

    const address = student.email || placeholderAddress(student.prn);
    const real = isReal(address);
    if (!real) waiting++;

    let userId: string;
    if (already) {
      // Never overwrite a real address with a placeholder: the roster losing a
      // column must not lock somebody out of an account they already use.
      const keepEmail = !real && isReal(already.user.email);
      await db.user.update({
        where: { id: already.userId },
        data: {
          name: student.name,
          ...(keepEmail ? {} : { email: address, isActive: real }),
        },
      });
      userId = already.userId;
      updated++;
    } else {
      const user = await db.user.create({
        data: {
          orgId,
          name: student.name,
          email: address,
          // Somebody with no address cannot sign in, and saying so here means
          // the door is shut by the account rather than only by the address.
          isActive: real,
        },
        select: { id: true },
      });
      userId = user.id;
      created++;
    }

    // The student role is added, never set: the one account that administers
    // this instance is also a student on these lists, and must stay an admin.
    const roles = [role.id, ...(address === ADMIN_EMAIL ? [admin.id] : [])];
    for (const roleId of roles) {
      await db.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: {},
        create: { userId, roleId },
      });
    }

    const profile = await db.studentProfile.upsert({
      where: { userId },
      update: { prn: student.prn },
      create: { userId, orgId, prn: student.prn },
      select: { id: true },
    });

    await db.$transaction([
      db.studentGroupMembership.deleteMany({ where: { studentId: profile.id } }),
      db.studentGroupMembership.createMany({
        data: groupIds.map((groupId) => ({ studentId: profile.id, groupId })),
      }),
    ]);
  }

  const byReason = new Map<string, number>();
  for (const { reason } of unplaced) byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`  · ${n} students are on the roll with no group: ${reason}`);
  }

  console.log(`✓ ${created} students added, ${updated} already had an account`);
  if (waiting > 0) {
    console.log(
      `  · ${waiting} of them have no college address yet: they are on the roll` +
        " and in their groups, but cannot sign in until the college sends one.",
    );
  }

  await db.importBatch.create({
    data: {
      orgId,
      fileName: path.relative(process.cwd(), ROSTER),
      created,
      updated,
      skipped: 0,
    },
  });
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
