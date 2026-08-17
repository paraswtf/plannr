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
- Any write to an `Event` must call `regenerateOccurrences` in the *same*
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

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Unit tests (no database needed) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run test:integration` | Router tests against the local container only |
| `npm run db:start` / `db:stop` | Local Postgres container |
| `npm run db:migrate` | Apply migrations to whatever `DIRECT_URL` points at |
| `npm run db:seed` | Reset demo data |
| `npm run db:studio` | Browse the database |

## Deployment

Vercel for the app, Supabase (`ap-south-1`) for the database.

### The two connection strings

Supabase offers three ways in and the app needs two of them, because a
serverless runtime and a migration want opposite things from a connection.

| Variable | Port | Why that one |
| --- | --- | --- |
| `DATABASE_URL` | `6543` | Transaction pooler. A query borrows a connection and returns it at once, which is how a few hundred lambdas share the ~60 connections Postgres will hand out. It cannot hold a session, so the URL carries `?pgbouncer=true&connection_limit=1` and Prisma stops naming prepared statements it would never see again. |
| `DIRECT_URL` | `5432` | Session pooler. One connection held for a whole run — what DDL and Prisma's migration advisory lock need. Only `prisma migrate` uses it. |

Both go through `aws-0-ap-south-1.pooler.supabase.com`, not the direct
`db.<ref>.supabase.co` host: that one resolves to IPv6 only, and Vercel's
functions cannot dial it without the IPv4 add-on.

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

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Pooler, port 6543, with `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Pooler, port 5432 |
| `AUTH_SECRET` | `npx auth secret`; must be ≥32 chars in production |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | From the Google Cloud console |
| `GOOGLE_WORKSPACE_DOMAIN` | `sicsr.ac.in` — nobody outside it can sign in |
| `SEED_ADMIN_EMAILS` | Optional; the admin already exists in the database |
| `NEXT_PUBLIC_APP_URL` | The deployed origin. Defaults to `localhost:3000`, which would put localhost links in outgoing email |
| `EMAIL_PROVIDER` / `EMAIL_ENABLED` / `EMAIL_FROM` | `console` and `false` are safe defaults |

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
