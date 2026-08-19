/**
 * Asks the college whether we still have its timetable right.
 *
 * `db:import` reads the whole term in one go and `db:sync-schedule` carries the
 * result to another database, and both report only on their own work: how many
 * classes they wrote, not whether those classes are the ones the college is
 * actually holding. A parser that quietly stopped reading one room, a series
 * whose skipped weeks never arrived, a sync pointed at yesterday's data — all
 * of them finish with a cheerful summary. This is the check that would notice.
 *
 * It takes a few days, fetches the college's own export for each, and compares
 * them class by class: every class the college is holding should be here, every
 * class here should be one the college is holding, and the line they typed
 * should still be the line we stored.
 *
 * Two differences are ours and are not errors. A class called off in the app is
 * deliberately not on the college's grid, because the college's grid never knew
 * about it; and a room booked in the app is ours alone, so anything a person
 * made here is left out of the comparison entirely.
 *
 *   npm run db:verify-schedule
 *   npm run db:verify-schedule -- --on 2026-08-18,2026-08-20
 *   TARGET_DATABASE_URL="postgresql://…" npm run db:verify-schedule
 *
 * It exits non-zero when the two disagree, so it can stand between a sync and
 * calling the sync done. What it cannot see is worth knowing: it compares
 * rooms, clock times and the class text, so a class attached to the wrong
 * cohort, to no course or to no semester passes it. A ✓ means the timetable is
 * right, not that everything hanging off it is.
 *
 * Like `db:import`, it needs an IP the college firewall accepts.
 */

import Papa from "papaparse";

import { PrismaClient } from "../generated/prisma";
import { compareDay, disagrees, type Sitting } from "../src/lib/timetable-diff";

const SOURCE = "http://time-table.sicsr.ac.in";
const ORG_SLUG = "default";
const TZ = "Asia/Kolkata";

/** The reason `db:import` stamps on a week the college's grid does not hold. */
const FROM_TIMETABLE = "Not on the published timetable that week";

/**
 * The days checked when none are named: today, next week, next month.
 *
 * A spread rather than a run — a fortnight of consecutive days all break the
 * same way, whereas these three between them exercise a class that has already
 * happened, one inside the horizon people are actually looking at, and one far
 * enough out that a series must have been expanded correctly to be there at
 * all. Sundays are checked like any other day: the college holds the occasional
 * guest lecture on one, and skipping them would leave those unguarded.
 */
const SAMPLE_DAYS = [0, 8, 29];

const db = new PrismaClient({
  datasources: {
    db: { url: process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL },
  },
});

interface ExportRow {
  Room: string;
  "Start time": string;
  "End time": string;
  "Brief description": string;
  "Full Description": string;
}

const slotOf = (room: string, start: string, end: string) =>
  `${room} ${start}–${end}`;

const clock = (at: Date) =>
  at.toLocaleString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });

const tidy = (text: string | null | undefined) =>
  (text ?? "").replace(/\s+/g, " ").trim();

const label = (day: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(day);

/**
 * `--on 2026-08-18` and `--on=2026-08-18` both work: npm passes arguments on
 * through a shell, which eats the quotes. A flag with nothing after it is an
 * error rather than a shrug — somebody gating a sync on one particular day must
 * not be handed a pass for three other days instead.
 */
function flag(name: string): string | undefined {
  const joined = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (joined) {
    const value = joined.slice(name.length + 3);
    if (!value) throw new Error(`--${name} needs a value`);
    return value;
  }
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return undefined;
  const next = process.argv[at + 1];
  if (!next || next.startsWith("--"))
    throw new Error(`--${name} needs a value`);
  return next;
}

/** The days to check, in the college's zone rather than this machine's. */
function daysToCheck(): Date[] {
  const asked = flag("on");
  if (asked) {
    return asked
      .split(",")
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => {
        // `new Date` rolls a 30th of February forward into March without
        // complaint, which would quietly check a day nobody asked about.
        const day = new Date(`${text}T12:00:00+05:30`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(day.getTime())) {
          throw new Error(`not a date: ${text}`);
        }
        if (label(day) !== text) throw new Error(`no such day: ${text}`);
        return day;
      });
  }
  const today = new Date();
  return SAMPLE_DAYS.map(
    (ahead) => new Date(today.getTime() + ahead * 86_400_000),
  );
}

/** The college's own export for one day. */
async function liveDay(day: Date): Promise<Sitting[]> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(day);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const params = new URLSearchParams({
    phase: "2",
    from_day: part("day"),
    from_month: part("month"),
    from_year: part("year"),
    to_day: part("day"),
    to_month: part("month"),
    to_year: part("year"),
    output: "0",
    output_format: "1",
    sortby: "s",
  });

  const response = await fetch(`${SOURCE}/report.php?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${SOURCE} answered ${response.status} for ${label(day)}`);
  }
  const parsed = Papa.parse<ExportRow>(await response.text(), {
    header: true,
    skipEmptyLines: true,
  });

  // A captive portal answers 200 with an HTML page, which parses as a CSV of
  // nonsense and yields no rows — indistinguishable, without this, from a day
  // the college is genuinely holding nothing on.
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes("Start time") || !fields.includes("Room")) {
    throw new Error(
      `${SOURCE} did not answer with the timetable export — a portal or an error page?`,
    );
  }

  return parsed.data
    .filter((row) => row["Start time"])
    .map((row) => ({
      slot: slotOf(
        row.Room,
        row["Start time"].slice(0, 5),
        row["End time"].slice(0, 5),
      ),
      text: tidy(row["Full Description"] || row["Brief description"]),
    }));
}

async function main() {
  const org = await db.organization.findUniqueOrThrow({
    where: { slug: ORG_SLUG },
  });
  const days = daysToCheck();
  const where = process.env.TARGET_DATABASE_URL
    ? "the other database"
    : "this database";
  console.log(`Comparing ${where} with ${SOURCE}, ${days.length} days\n`);

  let wrong = 0;
  let excused = 0;
  let checked = 0;

  for (const day of days) {
    const live = await liveDay(day);

    // Midnight in the college's zone, which is not midnight here.
    const from = new Date(`${label(day)}T00:00:00+05:30`);
    const sittings = await db.eventOccurrence.findMany({
      where: {
        orgId: org.id,
        start: { gte: from, lt: new Date(from.getTime() + 86_400_000) },
        // Only what the college published. A room somebody booked in the app is
        // ours alone and could never appear in the export, so counting it as a
        // difference would fail every database anybody actually uses.
        event: { createdById: null },
      },
      select: {
        start: true,
        end: true,
        status: true,
        event: { select: { notes: true, title: true } },
        room: { select: { code: true } },
        exception: { select: { reason: true, newTitle: true } },
      },
    });

    const asSitting = (row: (typeof sittings)[number]): Sitting => ({
      slot: slotOf(row.room.code, clock(row.start), clock(row.end)),
      text: tidy(row.exception?.newTitle ?? row.event.notes ?? row.event.title),
    });

    const standing = sittings
      .filter((row) => row.status !== "CANCELLED")
      .map(asSitting);

    // A sitting called off here is a difference we made on purpose — but only
    // if we made it. A cancellation with no exception is a whole series called
    // off in the app; one whose reason is the importer's, or has no reason at
    // all, is a week the college itself never published (an older sync copied
    // those across without their reason, so null belongs to the college too).
    const ourCancellations = sittings
      .filter(
        (row) =>
          row.status === "CANCELLED" &&
          (row.exception === null ||
            (row.exception.reason !== null &&
              row.exception.reason !== FROM_TIMETABLE)),
      )
      .map(asSitting);

    if (live.length === 0) {
      console.log(
        `${label(day)}  the college published nothing — outside the term, or a holiday. Not a check.`,
      );
      continue;
    }
    checked++;

    const diff = compareDay(live, standing, ourCancellations);
    const missing = diff.missing.map(
      (s) => `      ${s.slot}  ${s.text.slice(0, 60)}`,
    );
    const unexpected = diff.unexpected.map(
      (s) => `      ${s.slot}  ${s.text.slice(0, 60)}`,
    );
    const differs = diff.differs.map(
      (d) =>
        `      ${d.slot}\n        college: ${d.college.slice(0, 64)}\n        here:    ${d.here.slice(0, 64)}`,
    );
    const same = diff.matched;
    excused += diff.excused;

    const off = disagrees(diff);
    console.log(
      `${label(day)}  college ${live.length}, here ${standing.length}, same class text on ${same}  ` +
        (off === 0
          ? "✓"
          : `· ${missing.length} missing, ${unexpected.length} unexpected, ${differs.length} read differently`),
    );
    for (const line of [...missing, ...unexpected].slice(0, 8))
      console.log(line);
    for (const line of differs.slice(0, 3)) console.log(line);
    wrong += off;
  }

  if (checked === 0) {
    console.log(
      "\n✗ nothing was checked — the college published nothing on any of those days",
    );
    await db.$disconnect();
    process.exit(1);
  }

  console.log(
    wrong === 0
      ? `\n✓ the timetable matches on ${checked} ${checked === 1 ? "day" : "days"}` +
          (excused > 0 ? `, ${excused} classes called off here aside` : "")
      : `\n✗ ${wrong} disagreements — the database is not what the college is holding`,
  );

  await db.$disconnect();
  process.exit(wrong > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(String(error).split("\n")[0]);
  await db.$disconnect();
  process.exit(1);
});
