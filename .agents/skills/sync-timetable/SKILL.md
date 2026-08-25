---
name: sync-timetable
description: Re-read the college's live MRBS timetable into the local database and reconcile production with it. Use when the timetable has changed, when classes look wrong or stale, when a new term starts, or when the user asks to sync, refresh, re-import or push the timetable.
---

# Syncing the timetable

The college's timetable lives at `http://time-table.sicsr.ac.in` — an MRBS
install, edited by hand all term, which announces nothing. This is how the app's
copy is brought back level with it.

Two databases, treated oppositely. **This laptop's is disposable**: it is
cleared and rebuilt from the export, because a source with no version and no
diff can only be honestly re-read whole. **Production is not**: students have
signed in, registers have been taken, people have made plans against it, so
nothing there is ever rebuilt — it is reconciled class by class.

## Arguments

- no argument — the whole sequence: refresh this database, verify, push to
  production, verify production
- `local` — refresh and verify this database only, no production write
- `verify` — check only, write nothing anywhere
- `prod` — push an already-verified local database to production

Take the safest reading when it is ambiguous, and say which you took.

## Before anything

1. **Never start a dev server** (`npm run dev`) and never run `npm run build` —
   the user runs their own dev server and a build corrupts its `.next`.
2. **Check the college is reachable**: `curl -sS --max-time 20
   "http://time-table.sicsr.ac.in/report.php?phase=2&output=0&output_format=1" |
   head -3`. It is HTTP-only and firewalled. If it hangs, refuses, or answers
   with an HTML page instead of CSV, the user is off an IP it accepts — say so
   and stop, because everything below reads from it.
3. **Check the term window.** `TERM` in `prisma/import-sicsr.ts` is hardcoded:
   the semester's name, its academic year, and its first and last day. Two more
   URLs at lines 92 and 110 read the cohort colour key and the room capacities
   off a hardcoded `month=8&day=13`. If today is outside `TERM`, or 13 August is
   not an ordinary teaching day of this term, both need editing — ask the user
   for the term dates rather than guessing them.
4. **Check what the later steps need, before the first one destroys anything.**
   `db:import` clears the local institution whether or not the rest can run:
   - `data/students.csv` must exist (`db:students` reads it with `readFileSync`)
   - a `faculty*.csv` must exist somewhere under `data/` (`db:faculty` throws
     without one)
   - `data/` is gitignored and ~122 MB of real records; a fresh clone does not
     have it and cannot complete this at all
5. **First time on this machine**: `npm run db:start`, `npm run db:migrate`,
   then `npm run db:seed`. The import needs the organisation and settings rows
   that only the seed creates, and it will not find that out until after it has
   spent five minutes reading the term. These scripts also load and validate the
   whole of `.env`, so `AUTH_SECRET`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`
   must hold real values even though reading a timetable uses none of them.

## Refreshing this database

Four commands, in this order, as one unit. `db:import` clears the groups and
events that everything else hangs off, so the three after it always have to run
again.

```bash
npm run db:import     # 3–5 minutes; reads the whole term a month at a time
npm run db:students   # needs data/students.csv
npm run db:courses
npm run db:faculty
```

`npm run roster` rebuilds `data/students.csv` from the college's spreadsheets
and PDFs, and touches no database. Run it **only** when new documents have
arrived in `data/`.

What good looks like (observed 20 August 2026 — a magnitude, not a target):

| Step | Expect |
| --- | --- |
| `db:import` | ~50 cohorts, then `✓ 1190 distinct classes from 10663 rows (0 unreadable)`, ~11,100 sittings |
| `db:students` | ~643 students, 1 already had an account (that is the user) |
| `db:courses` | courses per programme, then any course with no teacher named |
| `db:faculty` | real addresses attached; ~61 still on `@placeholder.com` |

**`(0 unreadable)` is the line that matters.** Above zero means a row's start or
end time would not parse, or it named a room the day grid never listed — those
classes are missing from the app entirely. The importer prints only the count,
never the rows, so finding out which ones means re-reading the export by hand.

**If `db:import` does not reach its final "sittings materialised" line, stop.**
Nothing here is transactional: it deletes the institution first and then writes
for several minutes, so an interrupted run leaves a plausible-looking partial
timetable. Re-run all four from the top. Never sync production from a partial
import — a two-thirds-complete one passes the sync's runaway guard and takes a
third of production's classes with it.

`db:import` deletes every class, group, intake, programme, room, building and
semester — and, by cascade, every course. It spares anybody who has ever signed
in, and anybody who is neither a student nor a teacher.

## Verifying

```bash
npm run db:verify-schedule
```

It fetches the college's own export for three days — today, next week, next
month — and compares them class by class, including the text of each, and exits
non-zero if they disagree. `--on 2026-08-18,2026-08-20` checks named days
instead; prefer that late in the term, when "next month" can fall outside it.

- A day the college published nothing on is reported as **not a check**, and a
  run where nothing was checked fails rather than passing on emptiness.
- Classes called off in the app are reported separately as "called off here on
  purpose" — the one expected difference.
- Room bookings made in the app are excluded entirely; they could never be in
  the college's export.

**It compares rooms, clock times and the class text, and nothing else.** A class
attached to the wrong cohort, to no course, or to no semester passes it. A ✓
means the timetable is right, not that everything hanging off it is.

**Do not push a database that does not verify.**

## Pushing to production

```bash
PROD=$(grep '^DIRECT_URL=' .env.prod | cut -d'"' -f2)
TARGET_DATABASE_URL="$PROD" npm run db:sync-schedule -- --dry
TARGET_DATABASE_URL="$PROD" npm run db:sync-schedule
TARGET_DATABASE_URL="$PROD" npm run db:verify-schedule
```

Do not read the rest of `.env.prod`. Its header tells you to source it and its
footer holds a paste-ready full rebuild — both are wrong for this job.

**Never `set -a; . ./.env.prod`.** It sets `DATABASE_URL` too, so both ends of
the sync open production. The script refuses this outright — cuids cannot
collide across databases, so a shared id proves both handles found the same one
— but the point is to pass `TARGET_DATABASE_URL` alone, not to rely on the
guard.

**Never run `db:import`, `db:students`, `db:courses` or `db:faculty` against
production.** They clear and rebuild.

**If the schema has moved since production was last migrated, migrate first**:
`DATABASE_URL="$PROD" DIRECT_URL="$PROD" npm run db:migrate`. A sync against a
target missing a column fails partway through.

Read the dry run before applying it — but know that it lists only the first 8
additions, 8 removals and 8 changed series, with no "and N more". The counts are
complete; the listings are not. If the counts are larger than that, say so
rather than implying you inspected the whole diff. Two lines in it need acting
on before you apply:

- **`! N things the other database does not have`** — a cohort or room missing
  in production. The sync creates neither: a class whose group is missing is
  created attached to *no group*, which makes it invisible to every student, and
  nothing afterwards reports it. Create those groups in production first.
- **A large removal count.** Ordinary drift after a week is single or double
  digits. The sync refuses above 40% of the target's classes, but far below that
  is still worth stopping for.

## What the sync does and does not do

- It matches a class on **room, start, end, recurrence rule, and the line the
  college typed**. Nothing else is used to *match* — though on a class that does
  match, the title and the college's skipped weeks are both brought across. A
  lecturer or section reassigned on an otherwise unchanged class is invisible to
  it, and has to be corrected in production by hand; `db:import` is never an
  option there.
- It writes `Event`, `EventGroup`, `EventException` and `EventOccurrence` in the
  target, plus `CalendarSyncTask` if `GOOGLE_CALENDAR_SYNC_ENABLED` is on.
  Students, accounts, memberships, rooms, groups, attendance and plans are never
  touched.
- **It leaves anything made in the app alone.** Room bookings and lectures
  people created there have a creator; the importer's classes never do, and only
  the latter are reconciled.
- **`EventGroup` is written only on classes being added.** Nothing in this
  pipeline changes who attends a class that already exists in production —
  roster, division and elective corrections go through the app's people and
  group screens, or through `db:split-sections` below.
- **A class the sync adds has no course**, and attendance only counts classes
  that have one. After a sync that added anything, the new lectures need
  attaching to their course in the app. `db:courses` must never be run against
  production.
- **Registers win.** A class somebody has taken attendance at is never deleted
  and never rebuilt. Pass that message on — and then act on it, because the
  class keeps every future sitting and students go on seeing a lecture the
  college has dropped. Call those sittings off with `db:cancel-classes`, or the
  same message returns on every sync.

## A new term

More than editing `TERM`. Before the first sync of a term, the Semester row has
to exist in production with the same name as `TERM.name`, and the organisation's
active semester pointed at it. The sync creates no semester and never touches
settings, so without that every class it adds has no semester and the course and
coordinator screens go blank.

## Electives taught twice over

An elective too big for one room is taught to a Group 1 and a Group 2, and MRBS
gives the whole cohort one colour — so `db:import` files every one of those
classes under `<COHORT> - Minor Courses`, a group nobody is a member of. Left
there, the lectures are invisible to every student who should be at them.

`db:students` now opens that bucket out: it builds a group per sitting from the
roster's `section` column, puts the students in it, and moves each class onto
the sitting its title names ("G1 - Services Marketing"). Nothing extra to run
here — it happens in the ordinary refresh.

Production is not rebuilt, so the same change is made class by class:

```bash
PROD=$(grep '^DIRECT_URL=' .env.prod | cut -d'"' -f2)
TARGET_DATABASE_URL="$PROD" npm run db:split-sections -- --cohort "BBA-IT (V)" --dry
TARGET_DATABASE_URL="$PROD" npm run db:split-sections -- --cohort "BBA-IT (V)"
```

It only ever adds memberships, leaves the emptied bucket in place (the sync
still needs a group of that name to hang a newly imported class off), and is
safe to re-run — a class already on the right group is left alone. It refuses
outright if a class matches no elective, if a lecture is shared with a second
cohort, or if a register has been taken at one of the classes it would move.

Run it after any sync that added classes to a sectioned cohort. **`npm run
db:verify-schedule` cannot confirm this worked** — it compares rooms, times and
class text, never group attachment. The script's own closing table is the check:
no group should hold classes with nobody in it.

## Cancellations

A class called off by a department is a fact the app holds on its own — the
college's export never knew about it, so an import would put it straight back.

```bash
PROD=$(grep '^DIRECT_URL=' .env.prod | cut -d'"' -f2)
npm run db:cancel-classes -- --on 2026-08-18 --titled "Deep Learning" --dry
TARGET_DATABASE_URL="$PROD" npm run db:cancel-classes -- --on 2026-08-18 --titled "Deep Learning" --dry
TARGET_DATABASE_URL="$PROD" npm run db:cancel-classes -- --on 2026-08-18 --titled "Deep Learning"
```

Both `--on` and `--titled` are required. `--group` narrows it when two cohorts
share a subject; `--reason` sets the note. A class with a register already taken
is left alone unless `--force`, because calling it off would delete the register.

Production keeps cancellations across syncs — as long as the class survives. A
class the college drops, or whose room or time it changes, is replaced outright
and its cancellations go with it. **This laptop's copy never keeps them**;
`db:import` wipes them. Apply a cancellation to both, and say that the local one
will not survive the next import.

## When something goes wrong

| Symptom | What it means |
| --- | --- |
| hangs, refuses, or "did not answer with the timetable export" | Off a permitted IP, or a captive portal answering for the college. Nothing to fix here. |
| `answered 500` / `answered 404` | The college's own server. Retry later. |
| `(N unreadable)` above zero | A row's times would not parse, or it named an unknown room. Those classes are missing; the importer names none of them. |
| `db:import` stopped partway | Partial timetable. Re-run all four commands; never sync from it. |
| verify: "missing" | The college holds a class the database does not — an import or sync that did not finish, or ran before an edit. |
| verify: "unexpected" | The database holds a class the college dropped. A sync removes it — unless a register was taken there, in which case it is kept deliberately and will report as unexpected for ever. |
| verify: a `college:` / `here:` pair | Both hold a class there and read it differently. Compare the two lines before assuming which side is wrong. |
| verify: "nothing was checked" | Every sampled day was outside the term or a holiday. Pass `--on` with real teaching days. |
| sync: "source and target are the same database" | `.env.prod` was sourced. Start a clean shell and pass `TARGET_DATABASE_URL` alone. |
| sync: "refusing to remove N of M" | Wrong database, or a local import that did not finish. Verify locally first. |
| sync stopped partway | Adds and re-skips are transactional, so re-running the same sync recomputes and repairs. Then verify production. |
| cannot connect to production / ENOTFOUND / ETIMEDOUT | `.env.prod`'s `DIRECT_URL` is the IPv6-only direct host. On a network without IPv6 use `aws-0-ap-south-1.pooler.supabase.com:5432` with the same user and password. |

## Finishing

Report, in this order: what the import read and whether anything was unreadable,
what verification said for this database, what the dry run proposed, what the
sync actually did, and what verification said for production. Quote the numbers
rather than summarising them as "fine".
