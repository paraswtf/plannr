/**
 * Replaces the demo data with the real SICSR timetable.
 *
 * The source is the college's MRBS install (http://time-table.sicsr.ac.in),
 * which exposes `report.php` as a CSV export and `day.php` as a rendered grid.
 * Only three things in it are structured — the cohort a class belongs to, the
 * room, and the times — so everything else here is *inferred* from hand-typed
 * text, and the original line is kept on every event as `notes`.
 *
 * What it builds, in order: the building and its rooms (capacities read off the
 * day grid), the programmes, the intakes those cohorts belong to, the cohorts
 * themselves as groups, the teachers named in the class lines, and finally the
 * classes — collapsed into weekly series wherever the same class repeats, with
 * the weeks it skips recorded as exceptions.
 *
 * Run with `npm run db:import`. It needs an IP the college firewall accepts.
 */

import Papa from "papaparse";

import {
  batchName,
  canonicalFacultyKeys,
  facultyKey,
  floorOf,
  intakeYear,
  parseClassText,
  parseCohortLabel,
  parseExportInstant,
  parseRoomHeader,
  programmeOf,
  PROGRAMME_YEARS,
  type Cohort,
} from "../src/lib/sicsr";
import { fromWallTime } from "../src/lib/dates";
import { buildRRule } from "../src/lib/recurrence";
import { regenerateOccurrences } from "../src/server/services/occurrences";
import {
  EventKind,
  ExceptionType,
  GroupKind,
  PrismaClient,
  RoomType,
} from "../generated/prisma";

const db = new PrismaClient();

const SOURCE = "http://time-table.sicsr.ac.in";
const ORG_SLUG = "default";
const TZ = "Asia/Kolkata";

/** The semester on the timetable, and the academic year it belongs to. */
const TERM = {
  name: "Autumn 2026",
  academicYear: 2026,
  from: { year: 2026, month: 7, day: 1 },
  to: { year: 2026, month: 11, day: 30 },
};

/**
 * The timetable names its teachers but never gives an address, so one is made
 * up from the name and parked on this domain until the college supplies the
 * real ones. Nobody can sign in as one: they are created inactive, and the
 * sign-in domain is the college's own.
 */
const IMPORT_DOMAIN = "placeholder.com";

const WEEK = 7 * 86_400_000;

interface ExportRow {
  "Brief description": string;
  Area: string;
  Room: string;
  "Start time": string;
  "End time": string;
  Duration: string;
  "Full Description": string;
  Type: string;
}

async function get(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.text();
}

/** The colour key: one letter per cohort, and what it stands for. */
async function fetchCohorts(): Promise<Cohort[]> {
  const html = await get(
    `${SOURCE}/day.php?area=1&year=${TERM.from.year}&month=8&day=13`,
  );
  const key = /id="colour_key"[\s\S]*?<\/table>/.exec(html)?.[0] ?? "";
  const cells = [...key.matchAll(/<td[^>]*class="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)];

  const cohorts: Cohort[] = [];
  for (const [, code, inner] of cells) {
    const label = (inner ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    // The legend pads itself with blank cells; a code is a single character.
    if (!code || code.length !== 1 || !label) continue;
    cohorts.push(parseCohortLabel(code, label));
  }
  return cohorts;
}

/** The rooms, with the capacities only the rendered grid carries. */
async function fetchRooms(): Promise<Array<{ name: string; capacity: number | null }>> {
  const html = await get(
    `${SOURCE}/day.php?area=1&year=${TERM.from.year}&month=8&day=13`,
  );
  const headers = [...html.matchAll(/<th[^>]*data-room="(\d+)"[^>]*>([\s\S]*?)<\/th>/g)];

  // Room labels are rendered down both edges of the grid, so the same rooms
  // appear twice; the first run of unique ids is the real list.
  const seen = new Set<string>();
  const rooms: Array<{ name: string; capacity: number | null }> = [];
  for (const [, id, inner] of headers) {
    if (!id || seen.has(id)) break;
    seen.add(id);
    const text = (inner ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text) rooms.push(parseRoomHeader(text));
  }
  return rooms;
}

/** The term's classes, a month at a time so the old server is not hammered. */
async function fetchClasses(): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  let cursor = new Date(
    Date.UTC(TERM.from.year, TERM.from.month - 1, TERM.from.day),
  );
  const end = new Date(Date.UTC(TERM.to.year, TERM.to.month - 1, TERM.to.day));

  while (cursor <= end) {
    const chunkEnd = new Date(
      Math.min(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
        end.getTime(),
      ),
    );
    const params = new URLSearchParams({
      phase: "2",
      from_day: String(cursor.getUTCDate()),
      from_month: String(cursor.getUTCMonth() + 1),
      from_year: String(cursor.getUTCFullYear()),
      to_day: String(chunkEnd.getUTCDate()),
      to_month: String(chunkEnd.getUTCMonth() + 1),
      to_year: String(chunkEnd.getUTCFullYear()),
      output: "0",
      output_format: "1",
      sortby: "s",
    });
    const csv = await get(`${SOURCE}/report.php?${params}`);
    const parsed = Papa.parse<ExportRow>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    rows.push(...parsed.data.filter((row) => row["Start time"]));
    console.log(
      `  fetched ${cursor.toISOString().slice(0, 10)} → ${chunkEnd.toISOString().slice(0, 10)}: ${parsed.data.length} rows`,
    );

    cursor = new Date(chunkEnd.getTime() + 86_400_000);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return rows;
}

/** An instant from the export's "HH:MM:SS - DayName DD Month YYYY". */
function instantOf(value: string): Date | null {
  const wall = parseExportInstant(value);
  if (!wall) return null;
  return fromWallTime({ ...wall, second: 0 }, TZ);
}

async function main() {
  console.log(`Reading ${SOURCE} …`);
  const [cohorts, rooms, rows] = await Promise.all([
    fetchCohorts(),
    fetchRooms(),
    fetchClasses(),
  ]);
  console.log(
    `\n${cohorts.length} cohorts, ${rooms.length} rooms, ${rows.length} class rows`,
  );

  const org = await db.organization.findUniqueOrThrow({
    where: { slug: ORG_SLUG },
  });

  // ─── out with the demo data ───────────────────────────────────────────────
  // Roles, settings and anybody who signs in are left alone; everything that
  // describes the institution is replaced by what the timetable says.
  console.log("\nClearing the demo data …");
  await db.event.deleteMany({ where: { orgId: org.id } });
  await db.group.deleteMany({ where: { orgId: org.id } });
  await db.batch.deleteMany({ where: { orgId: org.id } });
  await db.programme.deleteMany({ where: { orgId: org.id } });
  await db.room.deleteMany({ where: { orgId: org.id } });
  await db.building.deleteMany({ where: { orgId: org.id } });
  await db.semester.deleteMany({ where: { orgId: org.id } });
  // The seeded people exist only to populate the demo, so they go with it —
  // but never anybody who has signed in. Once real students are imported the
  // person running this is one of them, and taking their account out from
  // under them takes their roles and their sign-in with it.
  const demoUsers = await db.user.findMany({
    where: {
      orgId: org.id,
      accounts: { none: {} },
      OR: [{ studentProfile: { isNot: null } }, { facultyProfile: { isNot: null } }],
    },
    select: { id: true },
  });
  await db.user.deleteMany({ where: { id: { in: demoUsers.map((u) => u.id) } } });
  console.log(`  removed ${demoUsers.length} demo people`);

  // ─── the building and its rooms ───────────────────────────────────────────
  const building = await db.building.create({
    data: { orgId: org.id, name: "SICSR" },
  });
  const roomIds = new Map<string, string>();
  for (const room of rooms) {
    const created = await db.room.create({
      data: {
        orgId: org.id,
        buildingId: building.id,
        code: room.name,
        floor: floorOf(room.name),
        // The grid gives no capacity for a couple of spaces; a room that has to
        // hold a division is the safer guess than one that holds nobody.
        capacity: room.capacity ?? 40,
        type: /^\d/.test(room.name) ? RoomType.LECTURE : RoomType.OTHER,
        notes: room.capacity === null ? "Capacity not published" : null,
      },
    });
    roomIds.set(room.name, created.id);
  }
  console.log(`✓ ${rooms.length} rooms in ${building.name}`);

  // ─── the term ─────────────────────────────────────────────────────────────
  const term = await db.semester.create({
    data: {
      orgId: org.id,
      name: TERM.name,
      startDate: new Date(
        Date.UTC(TERM.from.year, TERM.from.month - 1, TERM.from.day),
      ),
      endDate: new Date(Date.UTC(TERM.to.year, TERM.to.month - 1, TERM.to.day)),
    },
  });
  await db.orgSettings.update({
    where: { orgId: org.id },
    data: { activeSemesterId: term.id },
  });

  // ─── programmes, intakes, cohorts ─────────────────────────────────────────
  const courseIds = new Map<string, string>();
  for (const cohort of cohorts) {
    if (!cohort.programme || courseIds.has(cohort.programme)) continue;
    const named = programmeOf(cohort.label);
    const course = await db.programme.create({
      data: {
        orgId: org.id,
        code: cohort.programme,
        name: named?.name ?? cohort.programme,
      },
    });
    courseIds.set(cohort.programme, course.id);
  }
  // Exams, meetups and the common batch belong to no programme, but a group
  // needs one, so they are filed under the institution itself.
  const campus = await db.programme.create({
    data: { orgId: org.id, code: "SICSR", name: "Campus-wide" },
  });
  console.log(`✓ ${courseIds.size} programmes`);

  const batchIds = new Map<string, string>();
  for (const cohort of cohorts) {
    if (!cohort.programme || !cohort.semester) continue;
    const start = intakeYear(cohort.semester, TERM.academicYear);
    const name = batchName(cohort.programme, start);
    if (batchIds.has(name)) continue;
    const batch = await db.batch.create({
      data: {
        orgId: org.id,
        programmeId: courseIds.get(cohort.programme)!,
        name,
        startYear: start,
        endYear: start + (PROGRAMME_YEARS[cohort.programme] ?? 3),
      },
    });
    batchIds.set(name, batch.id);
  }
  console.log(`✓ ${batchIds.size} intakes`);

  const KINDS: Record<string, GroupKind> = {
    DIVISION: GroupKind.DIVISION,
    MAJOR: GroupKind.MAJOR,
    MINOR: GroupKind.MINOR,
    SUBJECT: GroupKind.SUBJECT,
    OTHER: GroupKind.OTHER,
  };

  /**
   * The legend files one cohort under two letters more than once — `j` and `o`
   * are both "MBA-DT (I)", and `f` and `s` are the same M.Sc cohort spelt with
   * different capitals. They are one cohort with two codes, so they become one
   * group that both codes point at.
   */
  const normalise = (label: string) => label.toLowerCase().replace(/\s+/g, " ");
  const groupIds = new Map<string, string>();
  const byLabel = new Map<string, string>();

  for (const cohort of cohorts) {
    const existing = byLabel.get(normalise(cohort.label));
    if (existing) {
      groupIds.set(cohort.code, existing);
      continue;
    }

    const programmeId = cohort.programme
      ? courseIds.get(cohort.programme)!
      : campus.id;
    const batch =
      cohort.programme && cohort.semester
        ? batchIds.get(
            batchName(
              cohort.programme,
              intakeYear(cohort.semester, TERM.academicYear),
            ),
          )
        : undefined;

    const group = await db.group.create({
      data: {
        orgId: org.id,
        programmeId,
        semesterId: term.id,
        batchId: batch ?? null,
        // The label is the timetable's own name for the cohort, which is what
        // everyone there calls it.
        name: cohort.label,
        label: cohort.label,
        kind: KINDS[cohort.kind] ?? GroupKind.OTHER,
      },
    });
    groupIds.set(cohort.code, group.id);
    byLabel.set(normalise(cohort.label), group.id);
  }
  console.log(
    `✓ ${byLabel.size} cohorts as groups (${groupIds.size} codes point at them)`,
  );

  // ─── the classes ──────────────────────────────────────────────────────────
  const roomNames = rooms.map((room) => room.name);
  const eventCohorts = new Set(
    cohorts.filter((c) => c.isEvent).map((c) => normalise(c.label)),
  );

  /**
   * A class repeated week after week is one event, not twenty. Rows are keyed
   * on everything that makes them the same class, and the dates they land on
   * come out as the series.
   */
  interface Series {
    label: string;
    roomName: string;
    subject: string;
    faculty: string | null;
    stream: string | null;
    raw: string;
    starts: Date[];
    ends: Date[];
  }
  const series = new Map<string, Series>();
  let unreadable = 0;

  for (const row of rows) {
    const start = instantOf(row["Start time"]);
    const end = instantOf(row["End time"]);
    if (!start || !end || !roomIds.has(row.Room)) {
      unreadable++;
      continue;
    }
    // The brief is truncated by MRBS at 60-odd characters; the full description
    // holds the same line untruncated when anybody filled it in.
    const text = (row["Full Description"] || row["Brief description"] || "").trim();
    const parsed = parseClassText(text, roomNames);
    const weekday = start.getUTCDay();
    const key = [
      row.Type,
      text,
      row.Room,
      weekday,
      row["Start time"].split(" - ")[0],
      row["End time"].split(" - ")[0],
    ].join("§");

    const existing = series.get(key);
    if (existing) {
      existing.starts.push(start);
      existing.ends.push(end);
      continue;
    }
    series.set(key, {
      label: row.Type,
      roomName: row.Room,
      subject: parsed.subject,
      faculty: parsed.faculty,
      stream: parsed.stream,
      raw: text,
      starts: [start],
      ends: [end],
    });
  }
  console.log(
    `✓ ${series.size} distinct classes from ${rows.length} rows (${unreadable} unreadable)`,
  );

  // ─── the teachers named in them ───────────────────────────────────────────
  // The export's short column is cut off mid-name, so the same teacher arrives
  // spelt several lengths. Every spelling is collected first, the clipped ones
  // folded into the whole, and the fullest spelling is the one kept.
  const spellings = new Map<string, Set<string>>();
  for (const entry of series.values()) {
    if (!entry.faculty) continue;
    const key = facultyKey(entry.faculty);
    if (!key) continue;
    (spellings.get(key) ?? spellings.set(key, new Set()).get(key)!).add(entry.faculty);
  }
  const canonical = canonicalFacultyKeys(spellings.keys());
  const nameOf = (key: string) =>
    [...spellings.get(key)!].sort((a, b) => b.length - a.length)[0]!;

  const facultyIds = new Map<string, string>();
  for (const key of new Set(canonical.values())) {
    const name = nameOf(key);
    const email = `${key.replace(/\|/g, ".")}@${IMPORT_DOMAIN}`;
    const user = await db.user.create({
      data: {
        orgId: org.id,
        name,
        email,
        // Nobody signs in as an imported record: the address is not real and
        // the person will be linked to their own account when they first sign
        // in with the college's Google Workspace.
        isActive: false,
      },
    });
    const profile = await db.facultyProfile.create({
      data: { userId: user.id, orgId: org.id, shortName: name },
    });
    facultyIds.set(key, profile.id);
  }
  console.log(`✓ ${facultyIds.size} teachers named in the timetable`);

  // ─── and finally the events ───────────────────────────────────────────────
  let weekly = 0;
  let oneOff = 0;
  let skippedWeeks = 0;
  const teaches = new Set<string>();

  for (const entry of series.values()) {
    const groupId = byLabel.get(normalise(entry.label)) ?? null;
    const facultyId = entry.faculty
      ? (facultyIds.get(canonical.get(facultyKey(entry.faculty)) ?? "") ?? null)
      : null;
    const roomId = roomIds.get(entry.roomName)!;
    const isEvent = eventCohorts.has(normalise(entry.label));

    const dates = entry.starts
      .map((start, i) => ({ start, end: entry.ends[i]! }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const first = dates[0]!;
    const last = dates[dates.length - 1]!;

    // Two or more sittings a whole number of weeks apart is a weekly class;
    // anything else is entered as the one-off it appears to be.
    const isWeekly =
      dates.length > 1 &&
      (last.start.getTime() - first.start.getTime()) % WEEK === 0;

    const title = entry.subject.slice(0, 160);
    const base = {
      orgId: org.id,
      // An exam or a meetup occupies a room but is not a class being taught.
      kind: isEvent ? EventKind.BOOKING : EventKind.CLASS,
      title,
      roomId,
      groupId,
      facultyId,
      semesterId: term.id,
      startTime: first.start,
      endTime: first.end,
      timezone: TZ,
      // The line as the college typed it, kept because the split above is a
      // reading of it rather than the truth.
      notes: entry.raw.slice(0, 1000),
    };

    if (!isWeekly) {
      for (const date of dates) {
        await db.event.create({
          data: {
            ...base,
            startTime: date.start,
            endTime: date.end,
            ...(groupId ? { groups: { create: { groupId } } } : {}),
          },
        });
        oneOff++;
      }
    } else {
      const event = await db.event.create({
        data: {
          ...base,
          rrule: buildRRule({ freq: "WEEKLY", until: last.start, timeZone: TZ }),
          ...(groupId ? { groups: { create: { groupId } } } : {}),
        },
      });

      // Terms have holidays: any week the rule produces but the timetable does
      // not is recorded as a cancelled occurrence rather than invented.
      const held = new Set(dates.map((date) => date.start.getTime()));
      const missing: Date[] = [];
      for (
        let at = first.start.getTime();
        at <= last.start.getTime();
        at += WEEK
      ) {
        if (!held.has(at)) missing.push(new Date(at));
      }
      if (missing.length > 0) {
        await db.eventException.createMany({
          data: missing.map((originalStart) => ({
            eventId: event.id,
            originalStart,
            type: ExceptionType.CANCELLED,
            reason: "Not on the published timetable that week",
          })),
        });
        skippedWeeks += missing.length;
      }
      await regenerateOccurrences(db, event.id);
      weekly++;
    }

    if (groupId && facultyId) teaches.add(`${facultyId}§${groupId}`);
  }

  // Occurrences for the one-off events, which were created without them.
  const pending = await db.event.findMany({
    where: { orgId: org.id, rrule: null, occurrences: { none: {} } },
    select: { id: true },
  });
  for (const event of pending) await regenerateOccurrences(db, event.id);

  console.log(
    `✓ ${weekly} weekly classes (${skippedWeeks} weeks skipped) and ${oneOff} one-offs`,
  );

  // Who teaches whom, taken from what they are timetabled for.
  await db.facultyGroupAssignment.createMany({
    data: [...teaches].map((pair) => {
      const [facultyId, groupId] = pair.split("§");
      return { facultyId: facultyId!, groupId: groupId! };
    }),
    skipDuplicates: true,
  });

  const occurrences = await db.eventOccurrence.count({ where: { orgId: org.id } });
  console.log(`✓ ${teaches.size} teaching assignments`);
  console.log(`✓ ${occurrences} sittings materialised`);
  console.log(
    "\nNote: MRBS holds no student rosters, so the groups are empty. " +
      "Attendance and room-capacity checks will have nobody to count until " +
      "students are imported from the registry.",
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
