# Plannr

Timetables and room booking for a college campus. Students see their day,
faculty see their teaching, and admins schedule rooms without double-booking
anyone.

Built with Next.js (App Router), tRPC, Prisma, PostgreSQL, Auth.js and Tailwind.

## Getting started

```bash
npm install
cp .env.example .env          # then fill in the Google OAuth values
npm run db:start              # Postgres in Docker, on host port 5433
npx prisma migrate dev        # create the schema
npm run db:seed               # demo rooms, people and a 12-week timetable
npm run dev
```

Set `SEED_ADMIN_EMAILS` to your own college address before seeding. That creates
an admin account up front, and your first Google sign-in links to it — otherwise
nobody can reach the admin console.

### Google sign-in

Create an OAuth client in the Google Cloud console (APIs & Services →
Credentials) and add these redirect URIs:

- `http://localhost:3000/api/auth/callback/google`
- `https://<your-domain>/api/auth/callback/google`

If you can create the consent screen as **Internal** within the college's
Workspace organisation, do — Google then blocks outside accounts itself. Either
way the app verifies the `hd` domain claim server-side.

## How authorisation works

Three layers, each with a different job:

- `src/middleware.ts` — checks for a session cookie and redirects. It runs on
  the Edge where Prisma cannot, so it verifies nothing. This is for feel only.
- `src/app/(app)/layout.tsx` — calls `auth()` in Node, sees the real session,
  and gates the page.
- tRPC procedures (`src/server/api/trpc.ts`) — the actual enforcement. Every
  procedure is `protectedProcedure` or `permissionProcedure(flags)`.

Permissions are a bitfield (`src/lib/permissions.ts`). Role defaults are
computed at check time rather than copied onto rows, so changing what "faculty"
can do applies to everyone at once; the `permissions` column only stores extra
grants for an individual.

## The public API

Everything the web client can do is also reachable over HTTP, at `/api/v1`. It is
not a second implementation of anything: an endpoint is declared as data
(`src/server/rest/routes/*.ts`) naming a tRPC procedure, and the handler calls
that procedure through the ordinary server-side caller. So the API cannot drift
from the app, and the layer above adds no authorisation of its own — the rule
about who may cancel a lecture is the one in `events.cancel`, and both doorways
get it.

Callers send an API key as `Authorization: Bearer plk_live_<prefix>.<secret>`. A
key is a **service principal**: it acts as itself rather than as the
administrator who minted it. It carries its own bits in `ApiKey.scopes` — the
same bitfield as above, minus `Administrator`, which may never be granted to a
key — and it owns a hidden `User` row, so `Event.createdById` and the NOT NULL
`EventChangeRequest.requestedById` have a truthful answer that is not a person.
Bearer auth exchanges the token for an ordinary next-auth `Session`, which is why
every procedure and every permission check written for the browser works
unchanged.

Keys are minted by people, never by keys: one that could mint keys would be a
leaked token that had learned to reproduce. **Settings → API keys** is where an
administrator does it — the route is gated on `ManageSettings` and everything on
the screen on `ManageRoles`, since minting a key is the same act as writing a
role. The secret is shown once, when the key is created, and never again; a lost
key is rolled, not recovered.

`GET /api/v1/openapi.json` is the OpenAPI 3.1 document, generated from the routes
and the procedures' own zod schemas, so it cannot go stale; feed it to a client
generator. `GET /api/v1/health` needs no credential, and `GET /api/v1/me` says
what a key is and what it may do.

Every list answers in one envelope, `{ rows, total, page, pageSize, pageCount }`,
and takes `page` and `pageSize`. That envelope belongs to the procedures rather
than to the REST layer (`src/server/api/pagination.ts`), which is why both
doorways get it, and each endpoint's default page is sized to hold that whole
list at a realistic institution: a screen or a script that has never heard of
paging must keep receiving everything rather than a short answer that looks
complete.

[docs/api.md](docs/api.md) is the reference an integrator reads: the scope table
and how implication widens it, the error envelope, the rate limits, how lists
page, the endpoints that refuse a key and what to call instead, and every path
grouped by subject.

## How scheduling works

Recurring classes are stored once, as a start instant plus an RFC 5545 `RRULE`,
and then **materialised** into `EventOccurrence` rows whenever the event or one
of its exceptions is written. Everything that reads the schedule — the grid,
conflict detection, room availability — queries that one indexed table and never
expands a rule.

Two consequences worth knowing:

- Recurring events must be bounded (`UNTIL` or `COUNT`, capped at 500
  occurrences). There is no background job extending a rolling horizon, and this
  is why one is not needed.
- Any write to an `Event` must call `regenerateOccurrences` in the _same_
  transaction. That invariant is what lets every reader stay simple.

Occurrences are expanded in **local wall time**, not UTC: "Tuesdays at 09:00"
means 09:00 in the institution's timezone. The `rrule` library does its
arithmetic in UTC, so `src/lib/recurrence.ts` feeds it "fake UTC" dates and
converts back. Those fake dates must never escape that module — there is a test
asserting exactly that.

## Which day the schedule opens on

`/schedule` is one day wide, and the day it starts on is **not** always today.
Somebody opening their schedule is asking "where do I have to be next", and on a
Friday evening the honest answer is Monday. So `timetable.mySchedule` called with
no `date` picks the day itself and returns it as `from`:

- A class **in progress** is the next class. Anchoring on the start instead of
  the end would send somebody sitting in a Tuesday lecture to Wednesday.
- A class that **ended less than 30 minutes ago** still counts. Attendance is
  taken on the way out and the room for the next one is asked about in the
  corridor, so the last sitting of the day holds the screen for half an hour
  rather than skipping to tomorrow the moment the lecturer stops talking.
- Otherwise it is the day of the **next class still to come**, however far off.
- With nothing left on the timetable — or for somebody who neither attends nor
  teaches — it is today.

The grace is elapsed time, not calendar days: a class ending at 23:50 holds its
own day until 00:20, which is the day the reader was actually in class.

Two rules keep this from being a screen that moves under you. **An explicit
`date` is never second-guessed** — every arrow, tab, date picker and the `Today`
button pass one, so `Today` always lands on today. And the choice is made
**once, on the server**, during the page render; the client sends a date from
then on, so the day never jumps after the page has settled. When the opening day
is not today the header says so ("Opened on the next class"), and that caption
disappears as soon as the day is moved by hand.

Covered by `describe("the day the schedule opens on")` in
`src/server/api/routers/timetable.integration.test.ts`, which places its classes
relative to the real clock rather than a fixed date.

## Google Calendar sync

Off unless `GOOGLE_CALENDAR_SYNC_ENABLED=true`. On, anyone can connect their own
Google account from Settings → Google Calendar (`/settings/calendar`), and the
section is listed there only while the flag is on. The classes they attend or teach
are mirrored into a calendar Plannr creates — cancellations and reschedules
follow on the next drain, which is hourly on Vercel's Hobby plan and can be
per-minute on Pro.

**Opt-in, per person, and separate from signing in.** Sign-in keeps the narrow
scopes it always had; calendar access is a second consent that most people will
never grant, and revoking it does not affect their login. The scope asked for is
`calendar.app.created`, which can only touch calendars this app itself made — we
are not able to read or write anyone's personal calendar, which is both a
smaller thing to ask for and a smaller thing to get wrong.

### How it flows

1. Any write to an event funnels through `regenerateOccurrences`, which enqueues
   one `CalendarSyncTask` per affected person **in the same transaction**. The
   edit and the obligation to sync commit together or not at all.
2. `/api/cron/calendar` drains the queue. It is the only place in the app that
   talks to Google.
3. Each task **reconciles** rather than replays: it re-derives what that
   person's calendar should hold and sends only the difference. So a task that
   runs twice is harmless, one that runs late still converges, and one lost
   entirely is repaired by the next sweep.

Three details carry most of the weight:

- **Tasks are per (person, event), not per occurrence.** One edit to a
  semester-long class with sixty students is sixty rows, not 2,400.
- **Mirrors are keyed on `(eventId, originalStart)`, never the occurrence id** —
  regeneration reissues those ids on every write. `originalStart` survives, which
  is what makes a reschedule a _patch_ to the same Google event, preserving the
  reminder someone set on it.
- **A digest of the rendered body decides whether to call Google at all.** An
  unchanged class costs one database read and no API call, which is what makes
  the nightly full resync affordable.

Cancelled classes are retitled `Cancelled — <class>` and marked free rather than
deleted. A class that silently vanishes is indistinguishable from a sync that
broke, and the person who never opens Plannr is exactly the one who would turn
up to an empty room.

### Setup

1. Google Cloud console → **APIs & Services → Library → Google Calendar API →
   Enable**, on the same project as the sign-in OAuth client.
2. **Credentials → your OAuth 2.0 Client ID → Authorised redirect URIs**, add
   `https://<your-domain>/api/calendar/callback` (and the localhost one).
3. Set `GOOGLE_CALENDAR_SYNC_ENABLED=true`, `CALENDAR_TOKEN_KEY`
   (`openssl rand -base64 32`) and `CRON_SECRET`.
4. Deploy. `vercel.json` registers `/api/cron/calendar` **twenty-four times**,
   once per hour of the day (`0 0 * * *` through `0 23 * * *`).

   That shape is dictated by the Hobby plan, which rejects at deploy time any
   cron expression running more than once a day — it does not quietly downgrade
   one. What it does allow is 100 separate jobs per project, and multiple jobs
   on the same path, so twenty-four once-daily entries add up to an hourly
   drain. Each fires somewhere inside its hour (Hobby is accurate to ±59
   minutes), so a change lands within about two hours worst case, one on
   average.

   Overlap is harmless if two happen to fire close together: `claim` leases its
   batch inside a transaction, and reconciling is idempotent.

   On Pro, delete the twenty-four and put back a single `* * * * *`. Nothing in
   the code depends on the cadence.

Refresh tokens are sealed with AES-256-GCM before storage
(`calendar/crypto.ts`): unlike the rest of the schema, that column is a standing
permission on someone's calendar, redeemable by anyone holding it.

### Known bounds

- **Only ±the horizon is mirrored** — 7 days back, 120 days forward. The window
  slides, so `sweepStaleConnections` re-queues each connection roughly daily to
  pull newly-in-range classes in. That sweep is not an optimisation; without it
  calendars would quietly stop a few months out.
- **Group membership changes are not hooked**, so a student added to or removed
  from a section gets the corresponding classes on the next daily sweep rather
  than immediately. Timetable edits — the ones this feature is about — are
  immediate.
- **"Cancel this and following"** truncates the recurrence rule, so those
  sittings stop existing rather than becoming cancelled rows. They are therefore
  _removed_ from calendars rather than retitled, unlike a single or whole-series
  cancellation.
- Entitlement deliberately matches `/schedule` exactly — an occurrence is yours
  if its group is one of yours or its faculty is you. For a combined lecture
  that is the primary section only; if that is ever widened, widen
  `audienceFor` in step or the two screens will disagree.

## Keeping the timetable in step

The college's timetable is not a feed. It is an MRBS install at
`time-table.sicsr.ac.in`, edited by hand all term — a room changes, a lecture is
moved, a week is dropped for an exam — and nothing announces any of it. So the
app's copy goes stale quietly, and the only way to know is to go and ask.

There are two databases to keep level with it, and they want opposite
treatment. This laptop's is disposable: `db:import` clears the institution and
rebuilds it from the export, which is the honest way to re-read a source that
has no version and no diff. Production is not disposable — students have signed
in, coordinators have taken registers, people have made plans against it — so
nothing there is ever rebuilt. `db:sync-schedule` reconciles instead: it works
out which classes have appeared, which the college has dropped, and which weeks
it has called off since, and changes only those.

Run `/sync-timetable` and Claude will walk the whole sequence. By hand it is:

```bash
npm run db:import          # re-read the college's term, rebuilding this database
npm run db:students        # put the roster back (needs data/students.csv)
npm run db:courses         # re-derive the subjects and who teaches them
npm run db:faculty         # give the teachers their real addresses again
npm run db:verify-schedule # ask the college whether we got it right
```

Then, and only once that last command is happy, push it:

```bash
PROD=$(grep '^DIRECT_URL=' .env.prod | cut -d'"' -f2)
TARGET_DATABASE_URL="$PROD" npm run db:sync-schedule -- --dry
TARGET_DATABASE_URL="$PROD" npm run db:sync-schedule
TARGET_DATABASE_URL="$PROD" npm run db:verify-schedule
```

The details that carry the weight:

- **`db:import` reads a hardcoded term.** `TERM` in `prisma/import-sicsr.ts`
  names the semester and its first and last day, and two URLs beside it read the
  cohort key and room capacities off a hardcoded 13 August. A new semester means
  editing both, creating the semester in production by hand, and pointing the
  organisation's active semester at it — the sync creates neither.
- **The first four steps are one unit.** `db:import` clears the groups and
  events everything else hangs off, so the three after it have to run again
  every time. It spares anybody who has ever signed in; the rest of the
  institution — classes, groups, intakes, programmes, rooms, buildings, the
  semester and its courses — is replaced. None of it is transactional, so an
  interrupted import leaves a plausible-looking partial timetable that must
  never be synced from.
- **Never run `db:import` against production.** It would delete every class,
  group and room, take every register hanging off them, and gut every schedule
  plan — whose requirements and placements hang off those groups, leaving the
  plan behind with nothing in it. The reconciling path exists precisely so that
  is never necessary.
- **Never source `.env.prod` into the shell before syncing.** It sets
  `DATABASE_URL` as well, so both ends of the sync open production and it
  would compare the database with itself. The script refuses outright — cuids
  cannot collide across databases, so a shared id proves both handles found the
  same one — but the point is to pass `TARGET_DATABASE_URL` alone rather than to
  rely on the guard.
- **A sync matches classes on room, times, recurrence and the college's own
  line.** It therefore cannot see a lecturer or a section being reassigned on a
  class that is otherwise unchanged — those have to be corrected in production
  by hand, since `db:import` is never an option there. It also refuses to delete
  more than 40% of the target's classes, which is what a mispointed sync looks
  like. Anything made in the app — a room somebody booked — is left alone
  entirely, on the strength of having a creator, which the importer never sets.
- **Registers win.** A class somebody has marked attendance for is never
  deleted and never rebuilt, so its skipped weeks stop converging. The real run
  says so; the dry run lists those classes as removals. The class then keeps
  every future sitting, so call them off with `db:cancel-classes` or the message
  returns on every sync.
- **Cancellations belong to the app, not the college.** A class called off with
  `db:cancel-classes` is stamped with a reason the importer never uses, which is
  how a sync tells "the college never published this week" from "somebody called
  this lecture off" and leaves the second alone. Production keeps them; this
  laptop's copy is wiped by the next `db:import`, which is fine — it is a
  rehearsal, not the record. Production keeps them only as long as the class
  itself survives: one the college drops, or whose room or time it changes, is
  replaced outright and its cancellations go with it.

`db:verify-schedule` is the one that tells the truth about all of it. It fetches
the college's export for three days, compares them class by class including the
text of each, and exits non-zero if they disagree. Classes called off here are
reported separately rather than counted as errors, bookings made in the app are
left out, and a day the college published nothing on counts as no check at all
rather than as a pass. What it compares is rooms, clock times and class text, so
a class attached to the wrong cohort, to no course or to no semester still
passes — a ✓ means the timetable is right, not everything hanging off it.

Two things the sync cannot carry, which is why they are worth saying twice: a
class it adds arrives with no course, and attendance only counts classes that
have one; and `EventGroup` is written only for classes being added, so who
attends an existing class never changes through this pipeline — that goes
through the app's people and group screens.

## Commands

| Command                                             | What it does                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                       | Development server                                                                                         |
| `npm test`                                          | Unit tests (no database needed)                                                                            |
| `npm run typecheck`                                 | TypeScript                                                                                                 |
| `npm run lint`                                      | ESLint                                                                                                     |
| `npm run test:integration`                          | Router and Google-Calendar-sync tests against the local container only                                     |
| `npm run db:start` / `db:stop`                      | Local Postgres container                                                                                   |
| `npm run db:migrate`                                | Apply migrations to whatever `DIRECT_URL` points at                                                        |
| `npm run db:seed`                                   | Reset demo data                                                                                            |
| `npm run db:studio`                                 | Browse the database                                                                                        |
| `npm run db:import`                                 | Re-read the college's timetable into this database — destructive                                           |
| `npm run roster`                                    | Rebuild `data/students.csv` from the documents under `data/` — no database                                 |
| `npm run db:students` / `db:courses` / `db:faculty` | Put the roster, subjects and teachers back after an import (need `data/students.csv` and a `faculty*.csv`) |
| `npm run db:verify-schedule`                        | Compare a database against the live college timetable                                                      |
| `npm run db:sync-schedule`                          | Carry this timetable to the database in `TARGET_DATABASE_URL`, class by class (`-- --dry` first)           |
| `npm run db:cancel-classes`                         | Call off one day's sittings of a named class — a cancellation the college's timetable never carries        |

## Deployment

Vercel for the app, Supabase (`ap-south-1`) for the database.

### The two connection strings

Supabase offers three ways in and the app needs two of them, because a
serverless runtime and a migration want opposite things from a connection.

| Variable       | Port   | Why that one                                                                                                                                                                                                                                                                                                          |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | `6543` | Transaction pooler. A query borrows a connection and returns it at once, which is how a few hundred lambdas share the ~60 connections Postgres will hand out. It cannot hold a session, so the URL carries `?pgbouncer=true&connection_limit=1` and Prisma stops naming prepared statements it would never see again. |
| `DIRECT_URL`   | `5432` | Session pooler. One connection held for a whole run — what DDL and Prisma's migration advisory lock need. `prisma migrate` uses it, and so do the timetable scripts, which write in long sequential batches the transaction pooler handles badly.                                                                     |

Both go through `aws-0-ap-south-1.pooler.supabase.com`, not the direct
`db.<ref>.supabase.co` host: that one resolves to IPv6 only, and Vercel's
functions cannot dial it without the IPv4 add-on. (`.env.prod` deliberately
points `DIRECT_URL` at the direct host anyway, because the laptop running the
timetable scripts has IPv6 and Vercel never reads that file. On a network
without it, use the session pooler there instead.)

`vercel.json` pins functions to `bom1` for the same reason the region is worth
naming — the database is in Mumbai, sessions are stored in it, and every page
load costs several round trips. Left on the default US region each of those
crosses the planet.

### Migrations

The build runs `prisma generate && next build` and deliberately stops there.
`generate` is not optional: the client is generated to `generated/`, which is
gitignored, and Vercel's build cache can skip `postinstall` on a redeploy —
`generate` in the build command is what makes that failure impossible.

`prisma migrate deploy` is left out on purpose. Preview deployments build too,
and with one Supabase project behind every environment, a migration on a branch
would land on production the moment somebody opened a pull request. Run it
yourself when the schema changes:

```bash
npm run db:migrate
```

### Environment variables

Set these in Vercel → Settings → Environment Variables. `next.config.js` imports
`src/env.js`, so the build fails with a named error rather than a broken deploy
if one is missing.

| Variable                                          | Notes                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                    | Pooler, port 6543, with `?pgbouncer=true&connection_limit=1`                                                             |
| `DIRECT_URL`                                      | Session pooler, port 5432 — or, in `.env.prod`, the IPv6-only direct host, which the timetable scripts use from a laptop |
| `AUTH_SECRET`                                     | `npx auth secret`; must be ≥32 chars in production                                                                       |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`           | From the Google Cloud console                                                                                            |
| `GOOGLE_WORKSPACE_DOMAIN`                         | `sicsr.ac.in` — nobody outside it can sign in                                                                            |
| `SEED_ADMIN_EMAILS`                               | Optional; the admin already exists in the database                                                                       |
| `NEXT_PUBLIC_APP_URL`                             | The deployed origin. Defaults to `localhost:3000`, which would put localhost links in outgoing email                     |
| `EMAIL_PROVIDER` / `EMAIL_ENABLED` / `EMAIL_FROM` | `console` and `false` are safe defaults                                                                                  |

`AUTH_URL` is not needed: NextAuth trusts the host automatically when `VERCEL`
is set. On any other host, set `AUTH_TRUST_HOST=true`.

### Google sign-in

Add the deployed callback to the OAuth client's authorised redirect URIs, or
sign-in fails with `redirect_uri_mismatch`:

```
https://<your-domain>/api/auth/callback/google
```

### What is not in the deploy

`data/` — the college's spreadsheets and PDFs, ~122 MB of real student records —
is gitignored, and nothing under `src/` reads from disk at runtime. The import
scripts in `prisma/` are run by hand from a laptop, never by the app.
