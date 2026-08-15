/**
 * Gives the teachers their real addresses, where a document states one.
 *
 * The timetable names its teachers but never says how to reach them, so the
 * import that reads it parks each on a `@placeholder.com` address. This reads
 * `faculty.csv` — the file compiled from the mail sweep — and replaces that
 * placeholder wherever a real address has been found, matching on the name.
 *
 * It changes nothing else. A teacher the file has no address for keeps their
 * placeholder rather than a guess: the pattern is obvious enough to generate,
 * and a generated address is a person who cannot sign in.
 *
 * Run with `npm run db:faculty`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { facultyKey } from "../src/lib/sicsr";
import { fromCsv, readSourceName } from "../src/lib/roster";
import { PrismaClient } from "../generated/prisma";

const db = new PrismaClient();

const DATA = path.join(process.cwd(), "data");
const ORG_SLUG = "default";
const WORKSPACE = "sicsr.ac.in";

/** Every faculty.csv under data/, newest first. */
function facultyFiles(dir: string): Array<{ path: string; date: string }> {
  const found: Array<{ path: string; date: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...facultyFiles(full));
      continue;
    }
    if (!/^faculty.*\.csv$/i.test(readSourceName(entry).name)) continue;
    found.push({ path: full, date: readSourceName(entry).date });
  }
  return found.sort((a, b) => b.date.localeCompare(a.date));
}

async function main() {
  const files = facultyFiles(DATA);
  if (files.length === 0) throw new Error(`no faculty.csv under ${DATA}`);
  const rows = fromCsv(readFileSync(files[0]!.path, "utf8"));
  console.log(`Read ${path.relative(process.cwd(), files[0]!.path)} — ${rows.length} people`);

  const org = await db.organization.findUniqueOrThrow({ where: { slug: ORG_SLUG } });
  const faculty = await db.facultyProfile.findMany({
    where: { orgId: org.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const byName = new Map(faculty.map((f) => [facultyKey(f.user.name ?? ""), f]));

  let updated = 0;
  const unmatched: string[] = [];
  const noAddress: string[] = [];

  for (const row of rows) {
    const name = (row.name ?? "").trim();
    const email = (row.college_email ?? "").trim().toLowerCase();

    // A shared office alias is a department, not a person, and giving it to
    // somebody would let one account sign in as another.
    if (!email.endsWith(`@${WORKSPACE}`) || !/^[a-z]+\.[a-z]+@/.test(email)) {
      if (email) noAddress.push(`${name} <${email}> — not a personal address`);
      continue;
    }

    const match = byName.get(facultyKey(name));
    if (!match) {
      unmatched.push(`${name} <${email}>`);
      continue;
    }
    if (match.user.email === email) continue;

    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== match.user.id) {
      unmatched.push(`${name} <${email}> — that address already belongs to somebody else`);
      continue;
    }

    await db.user.update({
      where: { id: match.user.id },
      data: { email, isActive: true },
    });
    console.log(`  ${match.user.name}: ${match.user.email} → ${email}`);
    updated++;
  }

  console.log(`\n✓ ${updated} teachers now have the address the college uses`);
  for (const person of noAddress) console.log(`  · skipped ${person}`);
  if (unmatched.length > 0) {
    console.log(`  · ${unmatched.length} named in the file but not teaching anything here:`);
    for (const person of unmatched) console.log(`      ${person}`);
  }

  const remaining = await db.user.count({
    where: { orgId: org.id, facultyProfile: { isNot: null }, email: { endsWith: "@placeholder.com" } },
  });
  console.log(
    `\n  ${remaining} teachers are still on a placeholder address, the documents naming none for them.`,
  );
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
