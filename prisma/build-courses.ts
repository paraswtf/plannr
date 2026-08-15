/**
 * Turns the timetable's subjects into courses, and hangs the semester off them.
 *
 * The college's timetable names a subject only in the text of each booking, so
 * after `db:import` the app has 1,100 lectures and no idea what any of them
 * teaches. This reads them back, gathers the distinct subjects each cohort is
 * taught, and writes them down as Courses — then links every lecture to its
 * course, records which teachers take it, and which groups sit for it.
 *
 * It also writes the semester numbers: a batch is not *in* a semester, it passes
 * through each one at a different number, so "BCA 23-27 is in its seventh" is a
 * fact about this semester and belongs beside it.
 *
 * Run with `npm run db:courses`, after `db:import` and `db:students`. Safe to
 * re-run: everything it writes is an upsert, and a re-run after the timetable
 * changes simply re-derives.
 */

import { PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

const ORG_SLUG = "default";
/** The academic year the current semester belongs to. */
const ACADEMIC_YEAR = 2026;

/**
 * Cohorts that are not a programme's year at all — the campus-wide buckets the
 * timetable keeps for exams, meetups and whole-college sessions. Nothing in
 * them is a course anybody is enrolled in.
 */
const NOT_A_COHORT = /^(EXAM|BREAK|Meetups|Guest Lecture|Common Batch)$/i;

/**
 * Titles that are a note to the office rather than a subject.
 *
 * The timetable is also the room-booking system, so a staff meeting and a
 * mentor session sit in it beside the lectures. Nobody is enrolled in those.
 */
const NOT_A_SUBJECT =
  /\bmeeting\b|^booked$|\bstaff\b|\bholiday\b|\binduction\b|\bwelcome\b|\bopen house\b|\bsession\b|\bquiz\b|\bassessment\b|\bphoto\b|^\W*$/i;

/** A subject that still carries its cohort has not been parsed, and is not one. */
const STILL_A_COHORT = /\bSem\.?\s*[IVX]+\b|\bDIV\b|\bB\.?B\.?A\.?\b|\bB\.?C\.?A\.?\b/i;

/** Prefixes the office types in front of a class when it has been moved. */
const NOISE = /^(extra\s+lecture|lecture\s+schedule[d]?|reschedul\w*|revised)\s*:?\s*/i;

/**
 * The subject a lecture's title names.
 *
 * A rescheduled class carries a preamble and sometimes the cohort again, so the
 * title alone would spawn a second course for the same subject; stripping the
 * preamble puts it back with its own.
 */
function subjectOf(title: string): string {
  let text = title.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3 && NOISE.test(text); i++) text = text.replace(NOISE, "").trim();
  // "BCA Sem VII (AIML) - Deep Learning" → "Deep Learning"
  text = text.replace(/^[A-Za-z.()\s]*Sem\.?\s*[IVX]+\s*(\([^)]*\))?\s*[-:]\s*/i, "").trim();
  return text;
}

/** Which semester number a batch sits in, counted from the year it was admitted. */
function semesterNumber(startYear: number): string {
  return ["I", "III", "V", "VII", "IX"][ACADEMIC_YEAR - startYear] ?? "";
}

/**
 * Folds a subject that arrived with its teacher stuck to it into the real one.
 *
 * A few of the college's lines run the teacher straight on with no separator —
 * "Business Accounting Gopal Phadke" — so the timetable importer could not split
 * them and they became a course of their own. They are recognisable: the title
 * extends a real course's title word for word, and because the teacher was never
 * separated out, no lecture of theirs names one.
 */
async function mergeMangled(semesterId: string): Promise<number> {
  const courses = await db.course.findMany({
    where: { semesterId },
    select: {
      id: true,
      title: true,
      programmeId: true,
      _count: { select: { faculty: true } },
    },
  });

  let merged = 0;
  for (const course of courses) {
    if (course._count.faculty > 0) continue;
    const real = courses.find(
      (other) =>
        other.id !== course.id &&
        other.programmeId === course.programmeId &&
        other._count.faculty > 0 &&
        course.title.toLowerCase().startsWith(other.title.toLowerCase() + " "),
    );
    if (!real) continue;

    await db.event.updateMany({ where: { courseId: course.id }, data: { courseId: real.id } });
    const groups = await db.groupCourse.findMany({ where: { courseId: course.id } });
    await db.groupCourse.createMany({
      data: groups.map((g) => ({ groupId: g.groupId, courseId: real.id })),
      skipDuplicates: true,
    });
    await db.course.delete({ where: { id: course.id } });
    console.log(`  · "${course.title}" folded into "${real.title}"`);
    merged++;
  }
  return merged;
}

async function main() {
  const org = await db.organization.findUniqueOrThrow({ where: { slug: ORG_SLUG } });
  const semester = await db.semester.findFirstOrThrow({
    where: { orgId: org.id },
    orderBy: { startDate: "desc" },
  });
  console.log(
    `Semester ${semester.name}: ${semester.startDate.toISOString().slice(0, 10)} → ` +
      `${semester.endDate.toISOString().slice(0, 10)}`,
  );

  // ─── which semester each batch is in ──────────────────────────────────────
  const batches = await db.batch.findMany({ where: { orgId: org.id } });
  for (const batch of batches) {
    const number = semesterNumber(batch.startYear);
    if (!number) continue;
    await db.batchSemester.upsert({
      where: { batchId_semesterId: { batchId: batch.id, semesterId: semester.id } },
      update: { number },
      create: { batchId: batch.id, semesterId: semester.id, number },
    });
  }
  console.log(`✓ ${batches.length} batches placed in their semester`);

  // ─── the subjects those lectures teach ────────────────────────────────────
  const events = await db.event.findMany({
    where: { orgId: org.id, kind: "CLASS", groupId: { not: null } },
    select: {
      id: true,
      title: true,
      facultyId: true,
      groupId: true,
      group: { select: { id: true, name: true, programmeId: true, programme: { select: { code: true } } } },
    },
  });

  // Re-derived from scratch each run: a title that stops reading as a subject
  // has to be able to let go of its lectures, or the course it wrongly spawned
  // would keep them for ever.
  await db.event.updateMany({
    where: { orgId: org.id, kind: "CLASS" },
    data: { courseId: null },
  });
  await db.groupCourse.deleteMany({ where: { course: { semesterId: semester.id } } });
  await db.courseFaculty.deleteMany({ where: { course: { semesterId: semester.id } } });

  // A handful of the college's lines run the teacher straight on with no
  // separator, so the subject arrives with a name stuck to the end of it. The
  // app already knows its teachers, so the name can be taken off and used as
  // what it was telling us — who takes the course — instead of being lost.
  const teachers = (
    await db.facultyProfile.findMany({
      where: { orgId: org.id },
      select: { id: true, user: { select: { name: true } } },
    })
  )
    .map((f) => ({ id: f.id, name: (f.user.name ?? "").replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s*/i, "").trim() }))
    .filter((f) => f.name.length > 3)
    .sort((a, b) => b.name.length - a.name.length);

  const detach = (title: string): { title: string; facultyId?: string } => {
    for (const teacher of teachers) {
      const tail = new RegExp(`[\\s-]+${teacher.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
      if (tail.test(title)) return { title: title.replace(tail, "").trim(), facultyId: teacher.id };
    }
    return { title };
  };

  const courses = new Map<string, string>();
  const teaches = new Set<string>();
  const attends = new Set<string>();
  let linked = 0;
  const skipped = new Map<string, number>();

  for (const event of events) {
    const group = event.group!;
    if (NOT_A_COHORT.test(group.name) || group.programme?.code === "SICSR") {
      skipped.set("campus-wide bucket", (skipped.get("campus-wide bucket") ?? 0) + 1);
      continue;
    }
    const title = subjectOf(event.title);
    if (!title || NOT_A_SUBJECT.test(title) || STILL_A_COHORT.test(title)) {
      const why = !title
        ? "no subject in the title"
        : STILL_A_COHORT.test(title)
          ? "the title is still a cohort line, never split into a subject"
          : "the booking is a meeting or a note, not a class";
      skipped.set(why, (skipped.get(why) ?? 0) + 1);
      continue;
    }

    const stripped = detach(title);
    const subject = stripped.title;
    const key = `${group.programmeId}§${subject.toLowerCase()}`;
    let courseId = courses.get(key);
    if (!courseId) {
      const course = await db.course.upsert({
        where: {
          semesterId_programmeId_title: {
            semesterId: semester.id,
            programmeId: group.programmeId,
            title: subject,
          },
        },
        update: {},
        create: {
          orgId: org.id,
          semesterId: semester.id,
          programmeId: group.programmeId,
          title: subject,
        },
        select: { id: true },
      });
      courseId = course.id;
      courses.set(key, courseId);
    }

    await db.event.update({ where: { id: event.id }, data: { courseId, semesterId: semester.id } });
    linked++;
    const teacher = event.facultyId ?? stripped.facultyId;
    if (teacher) teaches.add(`${courseId}§${teacher}`);
    attends.add(`${courseId}§${group.id}`);
  }

  await db.courseFaculty.createMany({
    data: [...teaches].map((pair) => {
      const [courseId, facultyId] = pair.split("§");
      return { courseId: courseId!, facultyId: facultyId! };
    }),
    skipDuplicates: true,
  });
  await db.groupCourse.createMany({
    data: [...attends].map((pair) => {
      const [courseId, groupId] = pair.split("§");
      return { courseId: courseId!, groupId: groupId! };
    }),
    skipDuplicates: true,
  });

  const merged = await mergeMangled(semester.id);

  // Courses no lecture teaches any more — left behind when a title stops being
  // read as a subject, or when the timetable drops a class. Safe to remove
  // while this script is the only thing that creates courses; once a
  // coordinator can add one by hand, that needs distinguishing.
  const { count: dropped } = await db.course.deleteMany({
    where: { semesterId: semester.id, events: { none: {} }, groups: { none: {} } },
  });
  if (dropped > 0) console.log(`  · ${dropped} courses removed, no lecture teaching them`);
  console.log(`✓ ${courses.size - merged} courses, from ${linked} lectures`);
  console.log(`✓ ${teaches.size} teaching assignments, ${attends.size} group enrolments`);
  for (const [reason, n] of skipped) console.log(`  · ${n} lectures left without a course: ${reason}`);

  // ─── what it looks like ───────────────────────────────────────────────────
  const byCohort = await db.course.findMany({
    where: { semesterId: semester.id },
    select: {
      title: true,
      programme: { select: { code: true } },
      _count: { select: { events: true, faculty: true, groups: true } },
    },
    orderBy: [{ programmeId: "asc" }, { title: "asc" }],
  });
  const tally = new Map<string, number>();
  for (const course of byCohort) {
    const code = course.programme?.code ?? "—";
    tally.set(code, (tally.get(code) ?? 0) + 1);
  }
  console.log("\n  courses per programme:");
  for (const [code, n] of [...tally].sort()) console.log(`    ${code.padEnd(8)} ${n}`);

  const orphans = byCohort.filter((c) => c._count.faculty === 0);
  if (orphans.length > 0) {
    console.log(`\n  ${orphans.length} courses have no teacher named on any of their lectures:`);
    for (const course of orphans.slice(0, 8)) console.log(`    ${course.title}`);
  }
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
