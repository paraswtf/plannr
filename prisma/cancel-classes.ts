/**
 * Calls off classes on a given day, the way the app does.
 *
 * The college's timetable says when a class is *scheduled*; it is not told when
 * a department calls one off the morning of, and `db:import` would only put it
 * back. So a cancellation is a fact the app holds on its own: an exception on
 * that one sitting, with a reason, which `db:sync-schedule` recognises as ours
 * and leaves alone.
 *
 * This is the same write the cancel button makes — it exists so a cancellation
 * can be recorded against a database nobody is signed in to, which is what
 * production is from here.
 *
 *   npm run db:cancel-classes -- --on 2026-08-18 --titled "Deep Learning"
 *   TARGET_DATABASE_URL="postgresql://…" npm run db:cancel-classes -- --on … --titled …
 *
 * `--group` narrows it further when two cohorts share a subject, `--reason`
 * replaces the note students see, and `--dry` shows what would be called off
 * without touching anything.
 */

import { ExceptionType, PrismaClient } from "../generated/prisma";
import { regenerateOccurrences } from "../src/server/services/occurrences";

/** The college's own zone: "the 18th" means their day, not the server's. */
const ZONE = "+05:30";

/**
 * `--titled Deep Learning` and `--titled="Deep Learning"` both work: npm hands
 * the arguments on through a shell, which eats the quotes, so a value of more
 * than one word arrives as several and has to be gathered back up.
 */
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

const on = flag("on");
const titled = flag("titled");
const group = flag("group");
const reason = flag("reason") ?? "Cancelled by the department";
const dryRun = process.argv.includes("--dry");

if (!on || !titled) {
  throw new Error(
    'usage: npm run db:cancel-classes -- --on 2026-08-18 --titled "Deep Learning" [--group "BCA (VII) …"] [--reason "…"] [--dry]',
  );
}

/** Whichever database was asked for: this one unless another was named. */
const db = new PrismaClient({
  datasources: {
    db: { url: process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL },
  },
});

async function main() {
  const from = new Date(`${on}T00:00:00${ZONE}`);
  if (Number.isNaN(from.getTime())) throw new Error(`not a date: ${on}`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  const sittings = await db.eventOccurrence.findMany({
    where: {
      start: { gte: from, lt: to },
      event: { title: { contains: titled!, mode: "insensitive" } },
      ...(group ? { group: { name: { contains: group, mode: "insensitive" } } } : {}),
    },
    select: {
      start: true,
      eventId: true,
      status: true,
      room: { select: { code: true } },
      group: { select: { name: true } },
      event: { select: { title: true } },
      // A register taken at a class is not undone by calling it off, but it is
      // worth saying out loud that one exists.
      attendance: { select: { id: true } },
    },
    orderBy: { start: "asc" },
  });

  if (sittings.length === 0) {
    console.log(`Nothing on ${on} whose title holds "${titled}"${group ? ` for ${group}` : ""}.`);
    await db.$disconnect();
    return;
  }

  for (const sitting of sittings) {
    const at = sitting.start.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });
    console.log(
      `  ${dryRun ? "would call off" : "called off"}  ${at}  ${sitting.room.code.padEnd(5)} ` +
        `${(sitting.group?.name ?? "—").padEnd(34)} ${sitting.event.title.slice(0, 44)}` +
        (sitting.status === "CANCELLED" ? "  (already off)" : "") +
        (sitting.attendance.length > 0 ? "  (a register was taken)" : ""),
    );
    if (dryRun) continue;

    // Occurrence scope: the series carries on, this one sitting does not.
    await db.$transaction(async (tx) => {
      await tx.eventException.upsert({
        where: {
          eventId_originalStart: {
            eventId: sitting.eventId,
            originalStart: sitting.start,
          },
        },
        update: { type: ExceptionType.CANCELLED, reason },
        create: {
          eventId: sitting.eventId,
          originalStart: sitting.start,
          type: ExceptionType.CANCELLED,
          reason,
        },
      });
      await regenerateOccurrences(tx, sitting.eventId);
    });
  }

  console.log(
    dryRun
      ? `\n— dry run: ${sittings.length} classes would be called off —`
      : `\n✓ ${sittings.length} classes called off: ${reason}`,
  );
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(String(error).split("\n")[0]);
  await db.$disconnect();
  process.exit(1);
});
