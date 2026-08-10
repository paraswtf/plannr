/**
 * Idempotent seed: safe to re-run against an existing database.
 *
 * Creates the organisation, its settings, buildings and rooms, a demo term with
 * courses/groups/people, and a weekly class timetable. Admins listed in
 * SEED_ADMIN_EMAILS are created up front so the first real sign-in links to an
 * account that can already reach the console.
 */

import {
  EventKind,
  PrismaClient,
  Role,
  RoomFeature,
  RoomType,
} from "../generated/prisma";
import { fromWallTime } from "../src/lib/dates";
import { buildRRule } from "../src/lib/recurrence";
import { regenerateOccurrences } from "../src/server/services/occurrences";

const db = new PrismaClient();

const ORG_SLUG = "default";
const TZ = "Asia/Kolkata";

/** Demo term: a 12-week block starting Monday 5 Jan 2026. */
const TERM_START = { year: 2026, month: 1, day: 5 };
const TERM_WEEKS = 12;

const ROOMS: Array<{
  code: string;
  building: string;
  floor: number;
  capacity: number;
  type: RoomType;
  features: RoomFeature[];
}> = [
  { code: "A-101", building: "Ashby Hall", floor: 1, capacity: 60, type: RoomType.LECTURE, features: [RoomFeature.PROJECTOR, RoomFeature.AC, RoomFeature.WHITEBOARD] },
  { code: "A-102", building: "Ashby Hall", floor: 1, capacity: 45, type: RoomType.LECTURE, features: [RoomFeature.PROJECTOR, RoomFeature.WHITEBOARD] },
  { code: "A-201", building: "Ashby Hall", floor: 2, capacity: 80, type: RoomType.LECTURE_HALL, features: [RoomFeature.PROJECTOR, RoomFeature.AC, RoomFeature.MIC] },
  { code: "A-Lab1", building: "Ashby Hall", floor: 2, capacity: 30, type: RoomType.LAB, features: [RoomFeature.COMPUTERS, RoomFeature.PROJECTOR, RoomFeature.AC] },
  { code: "K-301", building: "Kepler Building", floor: 3, capacity: 50, type: RoomType.LECTURE, features: [RoomFeature.PROJECTOR, RoomFeature.WHITEBOARD, RoomFeature.AC] },
  { code: "K-302", building: "Kepler Building", floor: 3, capacity: 40, type: RoomType.SEMINAR, features: [RoomFeature.PROJECTOR, RoomFeature.WHITEBOARD] },
  { code: "K-Lab2", building: "Kepler Building", floor: 2, capacity: 28, type: RoomType.LAB, features: [RoomFeature.COMPUTERS, RoomFeature.AC] },
  { code: "K-Aud", building: "Kepler Building", floor: 1, capacity: 220, type: RoomType.AUDITORIUM, features: [RoomFeature.STAGE, RoomFeature.MIC, RoomFeature.PROJECTOR, RoomFeature.AC] },
  { code: "T-105", building: "Turing Annexe", floor: 1, capacity: 35, type: RoomType.SEMINAR, features: [RoomFeature.WHITEBOARD, RoomFeature.TV] },
  { code: "T-Studio", building: "Turing Annexe", floor: 2, capacity: 24, type: RoomType.STUDIO, features: [RoomFeature.WHITEBOARD, RoomFeature.TV, RoomFeature.AC] },
];

const COURSES = [
  { code: "BCA", name: "Bachelor of Computer Applications" },
  { code: "B.Com", name: "Bachelor of Commerce" },
  { code: "BBA-IT", name: "BBA (Information Technology)" },
  { code: "M.Sc CS", name: "M.Sc Computer Science" },
];

const GROUPS = [
  { name: "BCA-A", label: "BCA-A · Sem III", course: "BCA" },
  { name: "BCA-B", label: "BCA-B · Sem III", course: "BCA" },
  { name: "BCom-I", label: "B.Com · Sem I", course: "B.Com" },
  { name: "BBAIT-IV", label: "BBA-IT · Sem IV", course: "BBA-IT" },
  { name: "MSc-II", label: "M.Sc CS · Sem II", course: "M.Sc CS" },
];

const FACULTY = [
  { name: "Dr. Meera Rao", short: "Dr. Rao", dept: "Computer Science", groups: ["BCA-A"] },
  { name: "Dr. S. Deshpande", short: "Dr. Deshpande", dept: "Computer Science", groups: ["BCA-A"] },
  { name: "Ms. P. Joshi", short: "Ms. Joshi", dept: "Mathematics", groups: ["BCA-A", "BCom-I"] },
  { name: "Ms. R. Walhekar", short: "Ms. Walhekar", dept: "Computer Science", groups: ["BCA-A"] },
  { name: "Mr. N. Bose", short: "Mr. Bose", dept: "Computer Science", groups: ["BCA-B", "MSc-II"] },
  { name: "Dr. L. Fernandes", short: "Dr. Fernandes", dept: "Commerce", groups: ["BCom-I", "BBAIT-IV"] },
  { name: "Prof. A. Kulkarni", short: "Prof. Kulkarni", dept: "Management", groups: ["BBAIT-IV"] },
  { name: "Dr. V. Iyer", short: "Dr. Iyer", dept: "Computer Science", groups: ["MSc-II"] },
];

const STUDENTS = [
  { name: "Aanya Sharma", prn: "22030122001", groups: ["BCA-A"] },
  { name: "Rohan Verma", prn: "22030122014", groups: ["BCA-A"] },
  { name: "Zoya Khan", prn: "22030122032", groups: ["BCA-A"] },
  { name: "Sara D'Souza", prn: "22030122045", groups: ["BCA-A"] },
  { name: "Meher Gill", prn: "22030122060", groups: ["BCA-A"] },
  { name: "Kabir Singh", prn: "22030121088", groups: ["BCA-B"] },
  { name: "Dev Mehta", prn: "23040231007", groups: ["BBAIT-IV"] },
  { name: "Ananya Rao", prn: "24050155002", groups: ["MSc-II"] },
  { name: "Ishaan Patel", prn: "24010144019", groups: ["BCom-I"] },
  { name: "Vivaan Nair", prn: "24010144022", groups: ["BCom-I"] },
];

/** weekday: 0 = Monday … 4 = Friday, matching rrule's BYDAY ordering. */
const TIMETABLE: Array<{
  title: string;
  room: string;
  group: string;
  faculty: string;
  weekday: number;
  startHour: number;
  endHour: number;
}> = [
  { title: "Operating Systems", room: "A-201", group: "BCA-A", faculty: "Dr. Deshpande", weekday: 0, startHour: 10, endHour: 11.5 },
  { title: "Database Systems", room: "K-301", group: "BCA-A", faculty: "Dr. Rao", weekday: 0, startHour: 11.5, endHour: 12.5 },
  { title: "Accounting I", room: "A-101", group: "BCom-I", faculty: "Dr. Fernandes", weekday: 0, startHour: 9, endHour: 10 },
  { title: "Programming Lab", room: "K-Lab2", group: "BCA-B", faculty: "Mr. Bose", weekday: 0, startHour: 9, endHour: 11 },
  { title: "Discrete Maths", room: "A-102", group: "BCA-A", faculty: "Ms. Joshi", weekday: 1, startHour: 10.5, endHour: 11.5 },
  { title: "Marketing", room: "A-201", group: "BBAIT-IV", faculty: "Prof. Kulkarni", weekday: 1, startHour: 11.5, endHour: 13 },
  { title: "OS Lab · Batch 2", room: "A-Lab1", group: "BCA-A", faculty: "Dr. Deshpande", weekday: 1, startHour: 14, endHour: 16 },
  { title: "Web Technologies", room: "K-302", group: "BCA-A", faculty: "Ms. Walhekar", weekday: 1, startHour: 9, endHour: 10 },
  { title: "Design Studio", room: "T-Studio", group: "MSc-II", faculty: "Dr. Iyer", weekday: 1, startHour: 16, endHour: 17.5 },
  { title: "Database Systems", room: "K-301", group: "BCA-A", faculty: "Dr. Rao", weekday: 2, startHour: 10, endHour: 11 },
  { title: "Statistics", room: "A-201", group: "BCom-I", faculty: "Ms. Joshi", weekday: 2, startHour: 15, endHour: 16 },
  { title: "Departmental Seminar", room: "K-Aud", group: "MSc-II", faculty: "Dr. Iyer", weekday: 2, startHour: 13, endHour: 15 },
  { title: "Networks Lab", room: "K-Lab2", group: "MSc-II", faculty: "Mr. Bose", weekday: 3, startHour: 13, endHour: 15 },
  { title: "Soft Skills", room: "T-105", group: "BCom-I", faculty: "Dr. Fernandes", weekday: 3, startHour: 10, endHour: 11 },
  { title: "Web Technologies", room: "K-302", group: "BCA-A", faculty: "Ms. Walhekar", weekday: 3, startHour: 11, endHour: 12 },
  { title: "Operating Systems", room: "A-201", group: "BCA-A", faculty: "Dr. Deshpande", weekday: 4, startHour: 9, endHour: 10.5 },
  { title: "Project Studio", room: "A-Lab1", group: "MSc-II", faculty: "Dr. Iyer", weekday: 4, startHour: 14, endHour: 16 },
  { title: "Weekly Assembly", room: "K-Aud", group: "BCA-A", faculty: "Dr. Iyer", weekday: 4, startHour: 12, endHour: 13 },
];

/** Turns a decimal hour (9.5) into an instant on the term's first week. */
function slotStart(weekday: number, hour: number): Date {
  return fromWallTime(
    {
      year: TERM_START.year,
      month: TERM_START.month,
      day: TERM_START.day + weekday,
      hour: Math.floor(hour),
      minute: Math.round((hour % 1) * 60),
      second: 0,
    },
    TZ,
  );
}

const emailFor = (name: string, domain: string) =>
  `${name
    .toLowerCase()
    .replace(/^(dr|prof|ms|mr)\.?\s*/, "")
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.|\.$/g, "")}@${domain}`;

async function main() {
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN ?? "example.edu";

  const org = await db.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: { slug: ORG_SLUG, name: "Plannr", timezone: TZ },
  });
  await db.orgSettings.upsert({
    where: { orgId: org.id },
    update: {},
    create: { orgId: org.id },
  });
  console.log(`✓ organisation ${org.name}`);

  // --- admins -------------------------------------------------------------
  const adminEmails = (process.env.SEED_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  for (const email of adminEmails) {
    await db.user.upsert({
      where: { email },
      update: { role: Role.ADMIN },
      create: { email, orgId: org.id, role: Role.ADMIN, name: email.split("@")[0] },
    });
  }
  console.log(
    adminEmails.length
      ? `✓ ${adminEmails.length} admin(s) from SEED_ADMIN_EMAILS`
      : "• no SEED_ADMIN_EMAILS set — no admin seeded",
  );

  // --- spaces -------------------------------------------------------------
  const buildingIds = new Map<string, string>();
  for (const name of new Set(ROOMS.map((r) => r.building))) {
    const building = await db.building.upsert({
      where: { orgId_name: { orgId: org.id, name } },
      update: {},
      create: { orgId: org.id, name },
    });
    buildingIds.set(name, building.id);
  }

  const roomIds = new Map<string, string>();
  for (const room of ROOMS) {
    const row = await db.room.upsert({
      where: { orgId_code: { orgId: org.id, code: room.code } },
      update: {
        floor: room.floor,
        capacity: room.capacity,
        type: room.type,
        features: room.features,
      },
      create: {
        orgId: org.id,
        code: room.code,
        buildingId: buildingIds.get(room.building)!,
        floor: room.floor,
        capacity: room.capacity,
        type: room.type,
        features: room.features,
      },
    });
    roomIds.set(room.code, row.id);
  }
  console.log(`✓ ${buildingIds.size} buildings, ${roomIds.size} rooms`);

  // --- term, courses, groups ---------------------------------------------
  const termStart = fromWallTime(
    { ...TERM_START, hour: 0, minute: 0, second: 0 },
    TZ,
  );
  const termEnd = fromWallTime(
    { ...TERM_START, day: TERM_START.day + TERM_WEEKS * 7, hour: 0, minute: 0, second: 0 },
    TZ,
  );
  const term = await db.term.upsert({
    where: { orgId_name: { orgId: org.id, name: "Semester 2026-I" } },
    update: { startDate: termStart, endDate: termEnd },
    create: {
      orgId: org.id,
      name: "Semester 2026-I",
      startDate: termStart,
      endDate: termEnd,
    },
  });
  await db.orgSettings.update({
    where: { orgId: org.id },
    data: { activeTermId: term.id },
  });

  const courseIds = new Map<string, string>();
  for (const course of COURSES) {
    const row = await db.course.upsert({
      where: { orgId_code: { orgId: org.id, code: course.code } },
      update: { name: course.name },
      create: { orgId: org.id, code: course.code, name: course.name },
    });
    courseIds.set(course.code, row.id);
  }

  const groupIds = new Map<string, string>();
  for (const group of GROUPS) {
    const courseId = courseIds.get(group.course)!;
    const existing = await db.group.findFirst({
      where: { courseId, termId: term.id, name: group.name },
    });
    const row =
      existing ??
      (await db.group.create({
        data: {
          orgId: org.id,
          courseId,
          termId: term.id,
          name: group.name,
          label: group.label,
        },
      }));
    groupIds.set(group.name, row.id);
  }
  console.log(`✓ term ${term.name}, ${courseIds.size} courses, ${groupIds.size} groups`);

  // --- people -------------------------------------------------------------
  const facultyIds = new Map<string, string>();
  for (const person of FACULTY) {
    const email = emailFor(person.name, domain);
    const user = await db.user.upsert({
      where: { email },
      update: { name: person.name },
      create: { email, name: person.name, orgId: org.id, role: Role.FACULTY },
    });
    const profile = await db.facultyProfile.upsert({
      where: { userId: user.id },
      update: { shortName: person.short, department: person.dept },
      create: {
        userId: user.id,
        orgId: org.id,
        shortName: person.short,
        department: person.dept,
      },
    });
    facultyIds.set(person.short, profile.id);

    for (const groupName of person.groups) {
      await db.facultyGroupAssignment.upsert({
        where: {
          facultyId_groupId: {
            facultyId: profile.id,
            groupId: groupIds.get(groupName)!,
          },
        },
        update: {},
        create: { facultyId: profile.id, groupId: groupIds.get(groupName)! },
      });
    }
  }

  for (const person of STUDENTS) {
    const email = emailFor(person.name, domain);
    const user = await db.user.upsert({
      where: { email },
      update: { name: person.name },
      create: { email, name: person.name, orgId: org.id, role: Role.STUDENT },
    });
    const profile = await db.studentProfile.upsert({
      where: { userId: user.id },
      update: { prn: person.prn },
      create: { userId: user.id, orgId: org.id, prn: person.prn },
    });
    for (const groupName of person.groups) {
      await db.studentGroupMembership.upsert({
        where: {
          studentId_groupId: {
            studentId: profile.id,
            groupId: groupIds.get(groupName)!,
          },
        },
        update: {},
        create: { studentId: profile.id, groupId: groupIds.get(groupName)! },
      });
    }
  }
  console.log(`✓ ${FACULTY.length} faculty, ${STUDENTS.length} students`);

  // --- weekly timetable ---------------------------------------------------
  // Re-seeding replaces the demo classes rather than duplicating them.
  await db.event.deleteMany({ where: { orgId: org.id, termId: term.id } });

  const rrule = buildRRule({
    freq: "WEEKLY",
    count: TERM_WEEKS,
    timeZone: TZ,
  });

  for (const entry of TIMETABLE) {
    const start = slotStart(entry.weekday, entry.startHour);
    const end = slotStart(entry.weekday, entry.endHour);

    const event = await db.event.create({
      data: {
        orgId: org.id,
        kind: EventKind.CLASS,
        title: entry.title,
        roomId: roomIds.get(entry.room)!,
        groupId: groupIds.get(entry.group)!,
        facultyId: facultyIds.get(entry.faculty)!,
        termId: term.id,
        startTime: start,
        endTime: end,
        timezone: TZ,
        rrule,
      },
    });
    await regenerateOccurrences(db, event.id);
  }

  const occurrenceCount = await db.eventOccurrence.count({ where: { orgId: org.id } });
  console.log(
    `✓ ${TIMETABLE.length} weekly classes → ${occurrenceCount} occurrences over ${TERM_WEEKS} weeks`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
