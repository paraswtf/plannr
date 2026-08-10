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

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Unit tests (no database needed) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run db:start` / `db:stop` | Local Postgres container |
| `npm run db:seed` | Reset demo data |
| `npm run db:studio` | Browse the database |

## Deployment

Vercel plus a Neon Postgres works well. Point `DATABASE_URL` at the pooled
connection string and `DIRECT_URL` at the direct one, and set the build command
to `prisma generate && prisma migrate deploy && next build`.
