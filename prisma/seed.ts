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
  GroupKind,
  PrismaClient,
  RoomFeature,
  RoomType,
} from "../generated/prisma";
import { SYSTEM_ROLES } from "../src/lib/permissions";
import { fromWallTime, toWallTime } from "../src/lib/dates";
import { buildRRule } from "../src/lib/recurrence";
import { regenerateOccurrences } from "../src/server/services/occurrences";

const db = new PrismaClient();

const ORG_SLUG = "default";
const TZ = "Asia/Kolkata";
const TERM_WEEKS = 12;

/**
 * The demo term starts on the Monday of the current week, so seeded classes are
 * visible today rather than sitting in the past. A fixed date would go stale the
 * moment the calendar moved past it.
 */
function currentMonday() {
  const now = toWallTime(new Date(), TZ);
  const todayLocal = fromWallTime(
    { ...now, hour: 0, minute: 0, second: 0 },
    TZ,
  );
  // getDay() is 0 for Sunday; shift so Monday is 0.
  const offsetToMonday = (todayLocal.getDay() + 6) % 7;
  const monday = toWallTime(
    new Date(todayLocal.getTime() - offsetToMonday * 86_400_000),
    TZ,
  );
  return { year: monday.year, month: monday.month, day: monday.day };
}

const TERM_START = currentMonday();

const ROOMS: Array<{
  code: string;
  building: string;
  floor: number;
  capacity: number;
  type: RoomType;
  features: RoomFeature[];
}> = [
  {
    code: "A-101",
    building: "Ashby Hall",
    floor: 1,
    capacity: 60,
    type: RoomType.LECTURE,
    features: [RoomFeature.PROJECTOR, RoomFeature.AC, RoomFeature.WHITEBOARD],
  },
  {
    code: "A-102",
    building: "Ashby Hall",
    floor: 1,
    capacity: 45,
    type: RoomType.LECTURE,
    features: [RoomFeature.PROJECTOR, RoomFeature.WHITEBOARD],
  },
  {
    code: "A-201",
    building: "Ashby Hall",
    floor: 2,
    capacity: 80,
    type: RoomType.LECTURE_HALL,
    features: [RoomFeature.PROJECTOR, RoomFeature.AC, RoomFeature.MIC],
  },
  {
    code: "A-Lab1",
    building: "Ashby Hall",
    floor: 2,
    capacity: 30,
    type: RoomType.LAB,
    features: [RoomFeature.COMPUTERS, RoomFeature.PROJECTOR, RoomFeature.AC],
  },
  {
    code: "K-301",
    building: "Kepler Building",
    floor: 3,
    capacity: 50,
    type: RoomType.LECTURE,
    features: [RoomFeature.PROJECTOR, RoomFeature.WHITEBOARD, RoomFeature.AC],
  },
  {
    code: "K-302",
    building: "Kepler Building",
    floor: 3,
    capacity: 40,
    type: RoomType.SEMINAR,
    features: [RoomFeature.PROJECTOR, RoomFeature.WHITEBOARD],
  },
  {
    code: "K-Lab2",
    building: "Kepler Building",
    floor: 2,
    capacity: 28,
    type: RoomType.LAB,
    features: [RoomFeature.COMPUTERS, RoomFeature.AC],
  },
  {
    code: "K-Aud",
    building: "Kepler Building",
    floor: 1,
    capacity: 220,
    type: RoomType.AUDITORIUM,
    features: [
      RoomFeature.STAGE,
      RoomFeature.MIC,
      RoomFeature.PROJECTOR,
      RoomFeature.AC,
    ],
  },
  {
    code: "T-105",
    building: "Turing Annexe",
    floor: 1,
    capacity: 35,
    type: RoomType.SEMINAR,
    features: [RoomFeature.WHITEBOARD, RoomFeature.TV],
  },
  {
    code: "T-Studio",
    building: "Turing Annexe",
    floor: 2,
    capacity: 24,
    type: RoomType.STUDIO,
    features: [RoomFeature.WHITEBOARD, RoomFeature.TV, RoomFeature.AC],
  },
  // The rooms below exist to give the size and kit rules something to bite on:
  // two rooms too small for anything but a tutorial, a computer lab with no
  // projector, a smart classroom, and a hall that only the biggest class needs.
  {
    code: "T-01",
    building: "Turing Annexe",
    floor: 0,
    capacity: 12,
    type: RoomType.SEMINAR,
    features: [RoomFeature.WHITEBOARD],
  },
  {
    code: "T-02",
    building: "Turing Annexe",
    floor: 0,
    capacity: 18,
    type: RoomType.SEMINAR,
    features: [RoomFeature.WHITEBOARD, RoomFeature.TV],
  },
  {
    code: "K-Lab3",
    building: "Kepler Building",
    floor: 2,
    capacity: 26,
    type: RoomType.LAB,
    features: [RoomFeature.COMPUTERS, RoomFeature.WHITEBOARD],
  },
  {
    code: "A-Smart",
    building: "Ashby Hall",
    floor: 3,
    capacity: 42,
    type: RoomType.LECTURE,
    features: [
      RoomFeature.SMART_BOARD,
      RoomFeature.PROJECTOR,
      RoomFeature.AC,
      RoomFeature.MIC,
    ],
  },
  {
    code: "K-Hall",
    building: "Kepler Building",
    floor: 1,
    capacity: 130,
    type: RoomType.LECTURE_HALL,
    features: [RoomFeature.PROJECTOR, RoomFeature.MIC, RoomFeature.AC],
  },
];

const COURSES = [
  { code: "BCA", name: "Bachelor of Computer Applications" },
  { code: "B.Com", name: "Bachelor of Commerce" },
  { code: "BBA-IT", name: "BBA (Information Technology)" },
  { code: "M.Sc CS", name: "M.Sc Computer Science" },
];

/**
 * Intakes. A batch is the cohort admitted to a course in one year and stays put
 * for the whole programme; the groups below hang off it.
 */
const BATCHES: Array<{
  name: string;
  course: string;
  startYear: number;
  endYear: number;
}> = [
  { name: "24-27 BCA", course: "BCA", startYear: 2024, endYear: 2027 },
  { name: "23-27 BBA-IT", course: "BBA-IT", startYear: 2023, endYear: 2027 },
  { name: "25-28 B.Com", course: "B.Com", startYear: 2025, endYear: 2028 },
  { name: "25-27 M.Sc CS", course: "M.Sc CS", startYear: 2025, endYear: 2027 },
  // An older intake, to show that batches outlive the current term.
  { name: "22-25 BCA", course: "BCA", startYear: 2022, endYear: 2025 },
];

/**
 * How each intake is split. Divisions partition it — everyone is in exactly one
 * — while majors, minors and subject groups draw from the same people again,
 * which is why the sizes below overlap rather than add up.
 *
 * `size` is the roll each group is topped up to with placeholder students. Room
 * capacity is checked against it, so the sizes straddle the rooms above: a
 * tutorial group fits anywhere, a combined lecture fits only the auditorium, and
 * most sections rule out the labs and seminar rooms.
 */
const GROUPS: Array<{
  name: string;
  label: string;
  course: string;
  size: number;
  batch?: string;
  kind?: GroupKind;
}> = [
  {
    name: "BCA-A",
    label: "BCA-A · Sem III",
    course: "BCA",
    size: 52,
    batch: "24-27 BCA",
  },
  {
    name: "BCA-B",
    label: "BCA-B · Sem III",
    course: "BCA",
    size: 38,
    batch: "24-27 BCA",
  },
  {
    name: "BCA-ALL",
    label: "BCA (all sections) · Sem III",
    course: "BCA",
    size: 150,
    batch: "24-27 BCA",
    kind: GroupKind.OTHER,
  },
  {
    name: "BCA-DS",
    label: "BCA · Data Science (major)",
    course: "BCA",
    size: 34,
    batch: "24-27 BCA",
    kind: GroupKind.MAJOR,
  },
  {
    name: "BCA-STAT",
    label: "BCA · Statistics (minor)",
    course: "BCA",
    size: 21,
    batch: "24-27 BCA",
    kind: GroupKind.MINOR,
  },
  {
    name: "BCom-I",
    label: "B.Com · Sem I",
    course: "B.Com",
    size: 96,
    batch: "25-28 B.Com",
  },
  {
    name: "BBAIT-IV",
    label: "BBA-IT · Sem IV",
    course: "BBA-IT",
    size: 24,
    batch: "23-27 BBA-IT",
  },
  {
    name: "BBAIT-FIN",
    label: "BBA-IT · Finance (major)",
    course: "BBA-IT",
    size: 14,
    batch: "23-27 BBA-IT",
    kind: GroupKind.MAJOR,
  },
  {
    name: "MSc-II",
    label: "M.Sc CS · Sem II",
    course: "M.Sc CS",
    size: 11,
    batch: "25-27 M.Sc CS",
  },
  // An elective open to more than one intake, so it belongs to none of them.
  {
    name: "ELEC-AI",
    label: "Elective · Applied AI",
    course: "BCA",
    size: 28,
    kind: GroupKind.SUBJECT,
  },
];

const FACULTY: Array<{
  name: string;
  short: string;
  dept: string;
  groups: string[];
  extraRoles?: string[];
}> = [
  {
    name: "Dr. Meera Rao",
    short: "Dr. Rao",
    dept: "Computer Science",
    groups: ["BCA-A", "BCA-ALL", "BCA-DS"],
  },
  {
    name: "Dr. S. Deshpande",
    short: "Dr. Deshpande",
    dept: "Computer Science",
    groups: ["BCA-A"],
  },
  {
    name: "Ms. P. Joshi",
    short: "Ms. Joshi",
    dept: "Mathematics",
    groups: ["BCA-A", "BCom-I", "BCA-STAT"],
  },
  {
    name: "Ms. R. Walhekar",
    short: "Ms. Walhekar",
    dept: "Computer Science",
    groups: ["BCA-A"],
  },
  {
    name: "Mr. N. Bose",
    short: "Mr. Bose",
    dept: "Computer Science",
    groups: ["BCA-B", "MSc-II", "ELEC-AI"],
  },
  {
    name: "Dr. L. Fernandes",
    short: "Dr. Fernandes",
    dept: "Commerce",
    groups: ["BCom-I", "BBAIT-IV"],
  },
  {
    name: "Prof. A. Kulkarni",
    short: "Prof. Kulkarni",
    dept: "Management",
    groups: ["BBAIT-IV", "BBAIT-FIN"],
  },
  // Teaches and also runs the timetable — the multi-role case the permission
  // model exists for.
  {
    name: "Dr. V. Iyer",
    short: "Dr. Iyer",
    dept: "Computer Science",
    groups: ["MSc-II"],
    extraRoles: ["coordinator"],
  },
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
  /** Other groups sitting in on the same lecture. */
  alsoGroups?: string[];
  faculty: string;
  weekday: number;
  startHour: number;
  endHour: number;
}> = [
  {
    title: "Operating Systems",
    room: "A-201",
    group: "BCA-A",
    faculty: "Dr. Deshpande",
    weekday: 0,
    startHour: 10,
    endHour: 11.5,
  },
  {
    title: "Database Systems",
    room: "K-301",
    group: "BCA-A",
    faculty: "Dr. Rao",
    weekday: 0,
    startHour: 11.5,
    endHour: 12.5,
  },
  {
    title: "Accounting I",
    room: "A-101",
    group: "BCom-I",
    faculty: "Dr. Fernandes",
    weekday: 0,
    startHour: 9,
    endHour: 10,
  },
  {
    title: "Programming Lab",
    room: "K-Lab2",
    group: "BCA-B",
    faculty: "Mr. Bose",
    weekday: 0,
    startHour: 9,
    endHour: 11,
  },
  {
    title: "Discrete Maths",
    room: "A-102",
    group: "BCA-A",
    faculty: "Ms. Joshi",
    weekday: 1,
    startHour: 10.5,
    endHour: 11.5,
  },
  {
    title: "Marketing",
    room: "A-201",
    group: "BBAIT-IV",
    faculty: "Prof. Kulkarni",
    weekday: 1,
    startHour: 11.5,
    endHour: 13,
  },
  {
    title: "OS Lab · Batch 2",
    room: "A-Lab1",
    group: "BCA-A",
    faculty: "Dr. Deshpande",
    weekday: 1,
    startHour: 14,
    endHour: 16,
  },
  {
    title: "Web Technologies",
    room: "K-302",
    group: "BCA-A",
    faculty: "Ms. Walhekar",
    weekday: 1,
    startHour: 9,
    endHour: 10,
  },
  {
    title: "Design Studio",
    room: "T-Studio",
    group: "MSc-II",
    faculty: "Dr. Iyer",
    weekday: 1,
    startHour: 16,
    endHour: 17.5,
  },
  {
    title: "Database Systems",
    room: "K-301",
    group: "BCA-A",
    faculty: "Dr. Rao",
    weekday: 2,
    startHour: 10,
    endHour: 11,
  },
  {
    title: "Statistics",
    room: "A-201",
    group: "BCom-I",
    faculty: "Ms. Joshi",
    weekday: 2,
    startHour: 15,
    endHour: 16,
  },
  {
    title: "Departmental Seminar",
    room: "K-Aud",
    group: "MSc-II",
    faculty: "Dr. Iyer",
    weekday: 2,
    startHour: 13,
    endHour: 15,
  },
  {
    title: "Networks Lab",
    room: "K-Lab2",
    group: "MSc-II",
    faculty: "Mr. Bose",
    weekday: 3,
    startHour: 13,
    endHour: 15,
  },
  {
    title: "Soft Skills",
    room: "T-105",
    group: "BCom-I",
    faculty: "Dr. Fernandes",
    weekday: 3,
    startHour: 10,
    endHour: 11,
  },
  {
    title: "Web Technologies",
    room: "K-302",
    group: "BCA-A",
    faculty: "Ms. Walhekar",
    weekday: 3,
    startHour: 11,
    endHour: 12,
  },
  {
    title: "Operating Systems",
    room: "A-201",
    group: "BCA-A",
    faculty: "Dr. Deshpande",
    weekday: 4,
    startHour: 9,
    endHour: 10.5,
  },
  {
    title: "Project Studio",
    room: "A-Lab1",
    group: "MSc-II",
    faculty: "Dr. Iyer",
    weekday: 4,
    startHour: 14,
    endHour: 16,
  },
  {
    title: "Weekly Assembly",
    room: "K-Aud",
    group: "BCA-A",
    faculty: "Dr. Iyer",
    weekday: 4,
    startHour: 12,
    endHour: 13,
  },
  // 150 students: the auditorium is the only room in the building list that
  // can hold it, which is what makes the greyed-out columns worth having.
  {
    title: "Combined Lecture",
    room: "K-Aud",
    group: "BCA-ALL",
    faculty: "Dr. Rao",
    weekday: 2,
    startHour: 9,
    endHour: 10.5,
  },
  // One lecture, both divisions in the room: 52 + 38 seats, which only the
  // bigger halls can take, and two registers when attendance is called.
  {
    title: "Research Methods",
    room: "K-Hall",
    group: "BCA-A",
    alsoGroups: ["BCA-B"],
    faculty: "Dr. Rao",
    weekday: 3,
    startHour: 11,
    endHour: 12,
  },
  // Needs the computers, so the labs are the only candidates — and K-Lab3 has
  // no projector, which the requirement chips can be used to rule out.
  {
    title: "Data Structures Lab",
    room: "K-Lab3",
    group: "MSc-II",
    faculty: "Mr. Bose",
    weekday: 2,
    startHour: 14,
    endHour: 16,
  },
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
  // Demo people deliberately live on a reserved TLD that can never resolve, and
  // never on the real Workspace domain. Sign-in links accounts by email, so a
  // demo row at the real domain could be claimed by whoever actually owns that
  // address. Real admins come from SEED_ADMIN_EMAILS instead.
  const domain = "plannr-demo.invalid";

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

  // --- roles --------------------------------------------------------------
  // Re-upserted every run, so the locked roles stay in step with the
  // definitions in src/lib/permissions.ts.
  const roleIds = new Map<string, string>();
  for (const role of SYSTEM_ROLES) {
    const row = await db.role.upsert({
      where: { orgId_key: { orgId: org.id, key: role.key } },
      update: {
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      },
      create: {
        orgId: org.id,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      },
    });
    roleIds.set(role.key, row.id);
  }
  console.log(`✓ ${roleIds.size} locked roles`);

  /** Gives a user exactly the roles named, leaving others intact. */
  const assignRole = async (userId: string, key: string) => {
    await db.userRole.upsert({
      where: { userId_roleId: { userId, roleId: roleIds.get(key)! } },
      update: {},
      create: { userId, roleId: roleIds.get(key)! },
    });
  };

  // --- admins -------------------------------------------------------------
  const adminEmails = (process.env.SEED_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  for (const email of adminEmails) {
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: { email, orgId: org.id, name: email.split("@")[0] },
    });
    await assignRole(user.id, "admin");
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
    {
      ...TERM_START,
      day: TERM_START.day + TERM_WEEKS * 7,
      hour: 0,
      minute: 0,
      second: 0,
    },
    TZ,
  );
  // A stable name matters more than a descriptive one: groups are keyed to the
  // term, so a name that changed between runs would orphan them and quietly
  // duplicate every group.
  const termName = "Demo Semester";
  const term = await db.semester.upsert({
    where: { orgId_name: { orgId: org.id, name: termName } },
    update: { startDate: termStart, endDate: termEnd },
    create: {
      orgId: org.id,
      name: termName,
      startDate: termStart,
      endDate: termEnd,
    },
  });
  await db.orgSettings.update({
    where: { orgId: org.id },
    data: { activeSemesterId: term.id },
  });

  const courseIds = new Map<string, string>();
  for (const course of COURSES) {
    const row = await db.programme.upsert({
      where: { orgId_code: { orgId: org.id, code: course.code } },
      update: { name: course.name },
      create: { orgId: org.id, code: course.code, name: course.name },
    });
    courseIds.set(course.code, row.id);
  }

  const batchIds = new Map<string, string>();
  for (const batch of BATCHES) {
    const row = await db.batch.upsert({
      where: { orgId_name: { orgId: org.id, name: batch.name } },
      update: {
        programmeId: courseIds.get(batch.course)!,
        startYear: batch.startYear,
        endYear: batch.endYear,
      },
      create: {
        orgId: org.id,
        programmeId: courseIds.get(batch.course)!,
        name: batch.name,
        startYear: batch.startYear,
        endYear: batch.endYear,
      },
    });
    batchIds.set(batch.name, row.id);
  }

  const groupIds = new Map<string, string>();
  for (const group of GROUPS) {
    const programmeId = courseIds.get(group.course)!;
    const shape = {
      label: group.label,
      batchId: group.batch ? batchIds.get(group.batch)! : null,
      kind: group.kind ?? GroupKind.DIVISION,
    };
    const existing = await db.group.findFirst({
      where: { programmeId, semesterId: term.id, name: group.name },
    });
    // Re-seeding re-files existing groups under their batch rather than
    // leaving the ones created before batches existed unattached.
    const row = existing
      ? await db.group.update({ where: { id: existing.id }, data: shape })
      : await db.group.create({
          data: {
            orgId: org.id,
            programmeId,
            semesterId: term.id,
            name: group.name,
            ...shape,
          },
        });
    groupIds.set(group.name, row.id);
  }
  console.log(
    `✓ term ${term.name}, ${courseIds.size} courses, ${batchIds.size} batches, ${groupIds.size} groups`,
  );

  // --- people -------------------------------------------------------------
  const facultyIds = new Map<string, string>();
  for (const person of FACULTY) {
    const email = emailFor(person.name, domain);
    const user = await db.user.upsert({
      where: { email },
      update: { name: person.name },
      create: { email, name: person.name, orgId: org.id },
    });
    await assignRole(user.id, "faculty");
    for (const extra of person.extraRoles ?? []) {
      await assignRole(user.id, extra);
    }
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
      create: { email, name: person.name, orgId: org.id },
    });
    await assignRole(user.id, "student");
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
  // --- rosters ------------------------------------------------------------
  // Group size is what the room-capacity rule is checked against, so every
  // group is topped up to a realistic roll. These are ordinary student rows —
  // counts, membership pages and exports all see the same thing.
  let filled = 0;
  for (const group of GROUPS) {
    const groupId = groupIds.get(group.name)!;
    const have = await db.studentGroupMembership.count({ where: { groupId } });
    const slug = group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    for (let i = have; i < group.size; i++) {
      const seq = String(i + 1).padStart(3, "0");
      const email = `${slug}.${seq}@${domain}`;
      const user = await db.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          name: `${group.name} Student ${seq}`,
          orgId: org.id,
        },
      });
      await assignRole(user.id, "student");
      const profile = await db.studentProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          orgId: org.id,
          prn: `${slug.toUpperCase()}-${seq}`,
        },
      });
      await db.studentGroupMembership.upsert({
        where: { studentId_groupId: { studentId: profile.id, groupId } },
        update: {},
        create: { studentId: profile.id, groupId },
      });
      filled++;
    }
  }

  console.log(
    `✓ ${FACULTY.length} faculty, ${STUDENTS.length} named students, ${filled} added to fill rosters`,
  );
  for (const group of GROUPS) {
    console.log(`  · ${group.name}: ${group.size} students`);
  }

  // --- weekly timetable ---------------------------------------------------
  // Re-seeding replaces the demo classes rather than duplicating them. Scoped
  // to CLASS so real room bookings made through the app survive a re-seed.
  await db.event.deleteMany({
    where: { orgId: org.id, kind: EventKind.CLASS },
  });

  const rrule = buildRRule({
    freq: "WEEKLY",
    count: TERM_WEEKS,
    timeZone: TZ,
  });

  for (const entry of TIMETABLE) {
    const start = slotStart(entry.weekday, entry.startHour);
    const end = slotStart(entry.weekday, entry.endHour);

    const attending = [entry.group, ...(entry.alsoGroups ?? [])];
    const event = await db.event.create({
      data: {
        orgId: org.id,
        kind: EventKind.CLASS,
        title: entry.title,
        roomId: roomIds.get(entry.room)!,
        groupId: groupIds.get(entry.group)!,
        facultyId: facultyIds.get(entry.faculty)!,
        semesterId: term.id,
        startTime: start,
        endTime: end,
        timezone: TZ,
        rrule,
        // Every group in the room, primary included, so a combined lecture is
        // one event rather than one per division.
        groups: {
          create: attending.map((name) => ({
            groupId: groupIds.get(name)!,
          })),
        },
      },
    });
    await regenerateOccurrences(db, event.id);
  }

  const occurrenceCount = await db.eventOccurrence.count({
    where: { orgId: org.id },
  });
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
