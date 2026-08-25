# The Plannr API

Plannr's HTTP API is a second doorway onto the application, not a service
sitting beside it. Every endpoint under `/api/v1` calls the same tRPC procedure
the web client calls, with the same validation and the same permission checks —
which means the API cannot drift from the product. A rule about who may cancel a
lecture is written once, in `events.cancel`, and both doorways get it. When the
app gains a behaviour, this API has it the same day; when the app fixes a bug,
this API is fixed too, because there was never a second copy to forget.

The consequence worth internalising early: nothing in the REST layer decides
whether you are allowed to do something. It authenticates you, turns a URL and a
JSON body into one input object, and calls the procedure. The two refusals that
look like authorisation — `requires_user` and `insufficient_scope` — are
courtesies that turn an obscure failure into a legible one a few milliseconds
sooner. Delete them and the API would be exactly as safe.

- [Base URL](#base-url)
- [Authentication](#authentication)
- [A key is a service principal](#a-key-is-a-service-principal)
- [Scopes](#scopes)
- [Requests and responses](#requests-and-responses)
- [Errors](#errors)
- [Rate limiting](#rate-limiting)
- [Pagination and filtering](#pagination-and-filtering)
- [A worked example](#a-worked-example)
- [Endpoint reference](#endpoint-reference)

## Base URL

```
https://<your-plannr-host>/api/v1
```

Trailing slashes are ignored: `/rooms` and `/rooms/` are the same endpoint.

There is one version and it lives in the path. Nothing is negotiated by header,
and there is no date-pinning scheme to opt into.

Three endpoints are answered by the API itself rather than by a procedure.

| Endpoint            | Credential | What it is                                                                                                                                                                                                                                                                                        |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`       | none       | `{ "ok": true, "version": "<commit>" }`. Answered before authentication on purpose — an uptime monitor should not need a credential, and issuing one to a status page is how credentials end up living in third-party dashboards. `version` is the deployed commit, not a hand-maintained string. |
| `GET /me`           | any        | Who the caller is, what they may do, and how much rate-limit headroom is left. The first call to make when wiring anything up.                                                                                                                                                                    |
| `GET /openapi.json` | any        | The OpenAPI 3.1 document for this deployment, generated from the routes and the procedures' own zod schemas. `servers` names the origin that served it, so a document fetched from a preview describes that preview.                                                                              |

`GET /openapi.json` is the machine-readable half of this page and it is generated
rather than maintained, so it cannot go stale. Feed it to a client generator and
you get a typed SDK for whatever language you are in. Every operation carries
`x-plannr-procedure` (the tRPC procedure behind it), `x-plannr-scopes`,
`x-plannr-session-only` and `x-plannr-dangerous`.

`HEAD` works on every `GET`: it runs the same request and drops the body.
`OPTIONS` is answered as a CORS preflight without touching the API at all.

### CORS

Responses carry `Access-Control-Allow-Origin: *` and expose the rate-limit
headers, so a browser on any origin can read them. Credentials are deliberately
_not_ allowed: a wildcard origin and `Access-Control-Allow-Credentials` are
mutually exclusive by specification, so no page anywhere can spend a visitor's
Plannr session against this API. Bearer tokens are unaffected — nothing attaches
them automatically, so there is no deputy to confuse. Only `Authorization` and
`Content-Type` are allowed through the preflight.

## Authentication

Every endpoint except `GET /health` needs a credential. The credential is an API
key, sent as a bearer token.

### The token

```
plk_live_9f3c1a7b.Xk2p8vQ...64 more characters
└───┬───┘ └───┬──┘ └──────────────┬─────────────┘
  scheme   prefix               secret
```

- **Scheme** — `plk_live`. Carries no meaning beyond making a leaked token
  greppable: `plk_live_` in a paste is unambiguously one of ours, which is what
  secret scanners key off.
- **Prefix** — eight hex characters, unique per key, and public. It identifies
  the key in a log line, it is what a list shows you next to a name, and it is
  useless on its own.
- **Secret** — 256 bits of CSPRNG output, stored only as a SHA-256 digest. It is
  displayed exactly once, in the response that minted the key. A lost key is
  **rolled**, not recovered.

Treat a whole token as you would a password.

### Sending it

```bash
curl -s https://plannr.example.edu/api/v1/me \
  -H "Authorization: Bearer plk_live_9f3c1a7b.Xk2p8vQ..."
```

```json
{
  "kind": "service",
  "key": {
    "id": "cm4k1r0aa0001qz8f7d3h2b1a",
    "name": "Study room kiosk",
    "prefix": "9f3c1a7b"
  },
  "scopes": ["ViewOwnEvents", "ViewAllEvents", "BookRoom", "ViewRooms"],
  "principalId": "cm4k1r0aa0000qz8fc4e5f6g7",
  "rateLimit": { "limit": 120, "remaining": 119, "resetSeconds": 60 }
}
```

`GET /me` answers every question you are about to ask: whether the token works,
what it is allowed to do, what the audit trail will record you as, and how much
headroom is left this minute. The `scopes` list is the _effective_ one, with
implications applied — see [Scopes](#scopes).

### When it does not work

A 401 carries `WWW-Authenticate: Bearer realm="Plannr API", error="<code>"`, and
the body's `code` says which of these it was:

| `code`            | Status | Meaning                                                                                                                                                                                                                          |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unauthenticated` | 401    | No `Authorization` header at all, and no session cookie.                                                                                                                                                                         |
| `invalid_token`   | 401    | The header is not shaped like a Plannr key, or the key does not exist, or the secret is wrong. These are deliberately indistinguishable — a different answer for "no such prefix" would let somebody enumerate which keys exist. |
| `key_revoked`     | 401    | Switched off by an administrator. Permanent; ask for a new key.                                                                                                                                                                  |
| `key_expired`     | 401    | Past its `expiresAt`. Ask an administrator to roll it.                                                                                                                                                                           |
| `key_suspended`   | 403    | The key's principal has been deactivated — the emergency stop that does not destroy the audit trail. No 401, and no `WWW-Authenticate`: the credential was understood, and presenting another one will not help.                 |

### The cookie fallback, and why you must not build on it

If no bearer token is present, the API falls back to an ordinary Plannr session
cookie. This exists so a person learning the API can paste a URL into a browser
tab they are already signed in to and read the answer. It is same-origin only —
the CORS policy above makes a cross-origin cookie request impossible, and the
session cookie is `SameSite=Lax` besides — so no integration can be built on it
even by accident.

One thing genuinely does depend on it today: minting a key. See below.

### Minting a key

Keys are minted by **people**, never by keys. `POST /api/v1/api-keys` — and
every other endpoint under `/api-keys` — refuses a service principal outright,
in the procedure and again at the doorway. The reasoning is worth a sentence,
because the permission bits alone would let one through: a key scoped
`ManageRoles` could mint a second key holding everything it holds. In bitfield
terms that is not an escalation, and in every sense that matters it is — revoke
the leaked token and its offspring carries on working under a name nobody in the
building recognises. So the estate of credentials is administered by people, who
can be asked afterwards what they were thinking.

Ask an administrator. In Plannr that is **Settings → API keys**, which is where
keys are minted, re-scoped, rolled and revoked, and where each one's usage is
shown. Reaching the screen needs `ManageSettings`; doing anything on it needs
`ManageRoles`.

The same call over HTTP is `POST /api-keys`, which a person may make from a
browser already signed in to Plannr on the Plannr origin, where the session
cookie is attached:

```json
{
  "name": "Study room kiosk",
  "description": "Books the library's group-study rooms from the panel by the door.",
  "scopes": ["ViewAllEvents", "BookRoom", "ViewRooms"],
  "expiresInDays": 365,
  "rateLimitPerMinute": 120
}
```

The response carries `token`. It is the only copy that will ever exist.

Two rules are enforced when scopes are granted: you cannot grant a scope you do
not hold yourself, and `Administrator` cannot be granted to a key at all.

## A key is a service principal

Your key does not act as the administrator who created it. It acts as **itself**.

Behind every key is a hidden `User` row — its _principal_ — flagged
`isServiceAccount`, holding no roles, with a `permissions` column of zero that
stays zero. The key's entire authority is the `scopes` column on the key itself.
That is what makes "what can this key do?" answerable by reading one row, and
narrowing it a single write that takes effect on the next request.

Four consequences, in the order you will meet them.

**It holds its own scopes.** Not the creator's. An administrator holds
`Administrator` and can therefore grant almost anything, but the key they mint
gets an enumerated list and no more. Widening it later is somebody's deliberate
act, recorded as such.

**It appears in the audit trail under its own name.** When a key schedules an
event, `Event.createdById` is the principal's id, and the display name is the
key's name with `(API key)` after it. `EventChangeRequest.requestedById` — which
is `NOT NULL` — has a truthful answer that is not a person who once clicked a
button. Revoking the key does not orphan the history it created; that is exactly
why revoking keeps the record and deleting is refused until a key has been
revoked.

**It is hidden from the people directory.** A principal is not a colleague. It
never appears in `GET /users`, `GET /users/{id}` answers `null` for one,
`GET /faculty` excludes it, the "view as" pickers exclude it, `roles.list`
does not count it in `userCount`, and it can never be named as a plan reviewer
or given a faculty profile. Its record lives on `/api-keys`, where its powers can
be changed honestly.

**It has no personal context, and this is the one that will bite you.** A key
teaches nothing, attends nothing, books nothing for itself, belongs to no group,
and has no linked Google Calendar. Endpoints whose answer is defined relative to
whoever is asking therefore have no truthful answer to give it. Rather than
return a confidently empty one — a correct answer to a question nobody asked, and
a very slow bug to find — they refuse with `403 requires_user`.

### The endpoints that refuse a key, and what to call instead

| Refuses a key                                          | Call this instead                                                                                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /timetable/my-day`                                | `GET /timetable/week?facultyId=…` (or `groupId`, `roomId`) with an explicit `from`/`to`                                                                              |
| `GET /timetable/my-week`                               | `GET /timetable/week?…` — the same question with its subject named                                                                                                   |
| `GET /timetable/my-schedule`                           | `GET /timetable/week?groupId=…` or `?facultyId=…`                                                                                                                    |
| `GET /events/mine`                                     | `GET /approvals` for what is undecided; `GET /timetable/week` for what was granted. A key that created a booking already holds its id from the `201`.                |
| `GET /change-requests/mine`                            | `GET /approvals` lists every pending request with its requester named. A key that filed one holds its id from the `201`.                                             |
| `GET /attendance/mine`                                 | `GET /courses/{courseId}/attendance` — the same figures for everybody taking a named course                                                                          |
| `GET /attendance/my-courses`                           | `GET /timetable/week?facultyId=…`                                                                                                                                    |
| `GET /occurrences/{occurrenceId}/attendance/can-mark`  | Nothing. The answer is a fact about somebody's account, not about the lecture.                                                                                       |
| `GET /users/me`                                        | `GET /users/{id}` — say who you mean                                                                                                                                 |
| `GET /faculty/me`                                      | `GET /faculty` — search the directory                                                                                                                                |
| `GET /calendar/connection` and the rest of `/calendar` | Nothing, and no scope can change this. A calendar connection is a person's own grant on their own Google account, and no permission in Plannr opens somebody else's. |
| everything under `/api-keys`                           | Nothing. Keys are administered by people.                                                                                                                            |

There is one more wall a key hits, and it is inside a procedure rather than at
the doorway: `PUT /occurrences/{occurrenceId}/attendance/groups/{groupId}`.
`MarkAttendance` gets a key past this layer, and then the procedure insists the
caller _is_ the faculty member the sitting is timetabled to — a register is a
statement that a named teacher saw these people in a room. A key holds no faculty
profile and never will, so it is refused with a `403` however it is scoped. The
endpoint is documented in full because a lecturer's own client — a phone, a room
kiosk, signed in as them — is a perfectly good reason to call it over HTTP.
Similarly, `POST /plans/{id}/review` needs a reviewer _seat_ on that particular
plan, and seats are only ever offered to people.

## Scopes

A scope is not a second permission system layered over the app. It **is** the
permission it looks like: `ManageRooms` on a key means exactly what `ManageRooms`
means on a member of staff, spelled the same way and checked by the same code. A
key simply carries its bits directly instead of inheriting them from roles.

Every permission Plannr has can be granted to a key except `Administrator`.
`Administrator` means "and everything added in future releases too", which is not
a promise anybody can make on behalf of an application they no longer control.

### The catalogue

**Events**

| Scope             | What it grants                                      | Also grants                                         |
| ----------------- | --------------------------------------------------- | --------------------------------------------------- |
| `ViewOwnEvents`   | See the classes you teach and the rooms you booked. | —                                                   |
| `ViewAllEvents`   | See the whole institution's timetable.              | `ViewOwnEvents`                                     |
| `ManageOwnEvents` | Edit and cancel your own classes and bookings.      | `ViewOwnEvents`                                     |
| `ManageAllEvents` | Schedule, move and cancel anyone's events.          | `ViewAllEvents`, `ViewOwnEvents`, `ManageOwnEvents` |
| `BookRoom`        | Request a room for a class or study session.        | —                                                   |
| `ApproveBookings` | Approve or reject other people's room requests.     | `ViewAllEvents`, `ViewOwnEvents`                    |
| `MarkAttendance`  | Take the register for a lecture.                    | `ViewAttendance`, `ViewOwnEvents`, `ViewGroups`     |
| `ViewAttendance`  | See who was present, without taking the register.   | —                                                   |

**Spaces**

| Scope         | What it grants                             | Also grants |
| ------------- | ------------------------------------------ | ----------- |
| `ViewRooms`   | Browse the room directory.                 | —           |
| `ManageRooms` | Add, edit and archive rooms and buildings. | `ViewRooms` |

**People**

| Scope         | What it grants                            | Also grants                |
| ------------- | ----------------------------------------- | -------------------------- |
| `ViewUsers`   | See the staff and student directory.      | —                          |
| `ManageUsers` | Add, edit and remove people.              | `ViewUsers`                |
| `ImportUsers` | Bulk-import people from a CSV file.       | `ManageUsers`, `ViewUsers` |
| `ManageRoles` | Create roles and change what they can do. | `ViewUsers`                |

**Academic**

| Scope              | What it grants                             | Also grants  |
| ------------------ | ------------------------------------------ | ------------ |
| `ViewGroups`       | See class groups and their members.        | —            |
| `ManageGroups`     | Create groups and change their membership. | `ViewGroups` |
| `ManageProgrammes` | Create and edit programmes and semesters.  | `ViewGroups` |

**Planning**

| Scope                  | What it grants                                                     | Also grants                                                                      |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `ViewSchedulePlans`    | Open the timetable drafts that have been shared for review.        | `ViewGroups`, `ViewRooms`, `ViewAllEvents`, `ViewOwnEvents`                      |
| `ManageSchedulePlans`  | Create timetable drafts, generate them, and apply an approved one. | `ViewSchedulePlans`, `ViewGroups`, `ViewRooms`, `ViewAllEvents`, `ViewOwnEvents` |
| `ApproveSchedulePlans` | Sign off a shared draft, or send it back for changes.              | `ViewSchedulePlans`, `ViewGroups`, `ViewRooms`, `ViewAllEvents`, `ViewOwnEvents` |

**Organisation**

| Scope            | What it grants                                    | Also grants |
| ---------------- | ------------------------------------------------- | ----------- |
| `ManageSettings` | Change scheduling rules and institution settings. | —           |

### Implication, and why it decides your blast radius

The third column above is the part people get wrong. Some permissions imply
others, because the app's permissions do, and the closure is applied everywhere —
including to a key.

Scoping a key `ManageAllEvents` also grants `ViewAllEvents`, and through it
`ViewOwnEvents` and `ManageOwnEvents`. Managing every event necessarily means
being able to see them, so a key that can move a lecture can read the whole
institution's timetable whether or not anybody ticked that box. Likewise
`MarkAttendance` reaches `ViewAttendance` and `ViewGroups` — you cannot take a
register for a lecture you cannot see or a group you do not know about — and
`ImportUsers` reaches `ManageUsers` and so `ViewUsers`.

So when you are reasoning about what a leaked token could reach, read the
expanded list and not the boxes that were ticked. `GET /me` and `GET /api-keys`
both report the expanded list for exactly this reason: a console that showed you
the literal grant would understate the credential.

Two smaller notes that follow from scopes being permissions:

**Holding a scope is necessary, not always sufficient.** Procedures narrow their
results by what the caller can see. A key scoped `ViewAllEvents` reads the whole
timetable; a key scoped only `ViewOwnEvents` reads nothing at all, because a
machine teaches no classes and has booked nothing.

**An endpoint listing no scopes is not open to anyone.** Many procedures decide
for themselves which bit they need, because it depends on what you are touching —
`POST /events` needs `ManageAllEvents` for a class and `BookRoom` for a booking,
and naming either in the reference would refuse half the legitimate callers. This
layer may only ever be _stricter_ than the app, never looser, so those endpoints
name nothing and their descriptions say what the procedure really wants. Several
others — most of `/plans` — have ownership rather than permission as their real
rule, which a scope list cannot express.

## Requests and responses

**Plain JSON, both ways.** tRPC's own transport is superjson, which is right for
the browser and unusable as a public API — a `curl | jq` in a cron job should not
have to learn a bespoke envelope. So this API emits ordinary JSON and pays the
one price that entails: a date is an ISO 8601 string and you parse it.

| Value                            | On the wire                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                             | ISO 8601 in UTC, e.g. `"2026-10-13T09:00:00.000Z"`                                                                                                      |
| BigInt                           | a decimal **string** — a permission bitfield is `"8388608"`, not a number, because JSON has no BigInt and a JavaScript client would lose the low digits |
| Decimal                          | a string, for the same reason                                                                                                                           |
| `NaN`, `±Infinity`               | `null`                                                                                                                                                  |
| a field the endpoint did not set | omitted; `null` means "this row has no room", which is a different fact                                                                                 |

**Sending input.** `GET` and `DELETE` read their input from the query string;
`POST`, `PATCH` and `PUT` read it from a JSON body. Path parameters are merged in
last and win outright — `PATCH /rooms/abc` carrying `{"id":"def"}` edits `abc`.
A body must be a JSON object, and an empty body is fine for a procedure that
takes no input. Bodies are capped at 1 MB; over that is `413`.

**Query strings are coerced towards the procedure's own schema**, which is how
`?minCapacity=60` becomes a number and `?includeInactive=true` a boolean without
the routers being loosened for the browser's benefit too. Arrays may be repeated
or comma-separated, and both spellings mean the same thing:

```
?features=PROJECTOR&features=AC
?features=PROJECTOR,AC
```

Enum values are sent exactly as the schema spells them (`LECTURE_HALL`,
`PROJECTOR`) so that a mistake reads as "expected one of LECTURE | LAB | …"
rather than a type error.

The same conversion runs over path parameters and JSON bodies, which is what
lets a date go as an ISO 8601 string everywhere — `{"startTime":
"2026-10-13T09:00:00.000Z"}` reaches a procedure that declared `z.date()`,
because the browser is handed a real `Date` by superjson and a JSON body has no
way to be one. It is best effort and never the judge: anything it cannot convert
is passed through untouched so that zod reports the field by name.

**Status codes.** `200` for a read or an edit, `201` where a row is created and
handed back, `204` where the procedure returns nothing at all. A handful of
`GET`s answer `200` with a body of `null` rather than `404` — `GET /rooms/{id}`,
`GET /events/{id}`, `GET /users/{id}`, `GET /roles/{id}`,
`GET /occurrences/{occurrenceId}/attendance`. That is what the procedure the web client
calls does, and this layer reports the app rather than improving on it. Check for
`null`.

**Identifiers are opaque.** Do not parse them and do not assume a length. Note
that several ids that look interchangeable are not: a `FacultyProfile` id is not
the id of the user who owns it, and a student id from `GET /groups/{id}` is not a
user id either.

## Errors

Every non-2xx response has the same body, whatever produced it:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "That room is already booked for this slot."
  }
}
```

`details` is a third field, present only when there is more to say. It is
omitted, not `null`, when there is not.

**Branch on `code`.** It is stable. `message` is written for a person reading a
log — show it, but do not match on it, because the wording changes between
releases.

There are two families of code, and the family tells you where the failure came
from:

- **`SCREAMING_SNAKE`** — the procedure refused. `BAD_REQUEST`, `FORBIDDEN`,
  `NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, `UNPROCESSABLE_CONTENT`.
- **`lower_snake`** — the API layer refused before the procedure ran.
  `unauthenticated`, `invalid_token`, `key_revoked`, `key_expired`,
  `key_suspended`, `rate_limited`, `requires_user`, `insufficient_scope`,
  `not_found`, `method_not_allowed`, `invalid_json`, `invalid_body`,
  `payload_too_large`, `route_misconfigured`.

### Statuses

| Status | When                                                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Validation failed, or the procedure rejected the request on its merits. `details` carries the field-by-field breakdown.                                                                        |
| `401`  | The credential is missing, malformed, unknown, revoked or expired. Carries `WWW-Authenticate`.                                                                                                 |
| `403`  | Understood and refused: a missing scope, an endpoint that needs a person, a suspended key, or an ownership rule inside the procedure.                                                          |
| `404`  | No endpoint at that path — or a procedure that genuinely raised `NOT_FOUND`. The message names `/api/v1/openapi.json` so you can see what does exist.                                          |
| `405`  | Right path, wrong verb. Carries `Allow` with the methods that path does accept. A `404` and a `405` are deliberately distinguished; guessing between them is what costs somebody an afternoon. |
| `409`  | A conflict — a double-booked room, a duplicate code, a name already taken.                                                                                                                     |
| `412`  | A precondition failed, e.g. deleting something that still has dependants.                                                                                                                      |
| `413`  | The body exceeded 1 MB. Split the work across several calls.                                                                                                                                   |
| `422`  | The request was understood and could not be carried out.                                                                                                                                       |
| `429`  | Rate limited. Carries `Retry-After`.                                                                                                                                                           |
| `500`  | Our fault. `details` is `{ "incident": "…" }`.                                                                                                                                                 |

### `details` on a validation failure

A `400` raised by a schema carries the flattened zod error, which is usually
enough to fix the request without reading anything else:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "The request did not match what this endpoint accepts. See details for the fields that failed.",
    "details": {
      "formErrors": [],
      "fieldErrors": {
        "capacity": ["Expected number, received string"],
        "code": ["String must contain at least 1 character(s)"]
      }
    }
  }
}
```

### `details` on a 500

Every other message in this API was written for a person to read and is passed
through untouched. A `500` is the exception: an unhandled exception's message is
a stack-adjacent accident that may name a column, a query or a file path, so it
is swallowed, logged with an incident id, and the id is returned to you.

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Something went wrong on our side. Quote the incident id if you report this.",
    "details": { "incident": "3f9a2c17bd" }
  }
}
```

Quote it. A support conversation then starts with a `grep` instead of a guess.

### `insufficient_scope` tells you what is missing

```json
{
  "error": {
    "code": "insufficient_scope",
    "message": "This key does not hold ManageRooms. Ask an administrator to add that scope to it, or call with a key that already has it.",
    "details": {
      "required": ["ManageRooms"],
      "missing": ["ManageRooms"],
      "granted": ["ViewOwnEvents", "ViewAllEvents", "BookRoom", "ViewRooms"]
    }
  }
}
```

## Rate limiting

Each key has its own limit, counted in a **fixed 60-second window** on the key's
own row — there is no shared process on serverless to hold a counter in, and
since stamping `lastUsedAt` was going to cost a write anyway, the throttle rides
along for free. The default is **120 requests per minute**; an administrator can
set anything from 1 to 10,000 per key.

Every response to a request that authenticated with a key carries three headers
— including the errors, and including a `204`:

| Header                  | Meaning                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `X-RateLimit-Limit`     | The key's ceiling for the window.                                                                     |
| `X-RateLimit-Remaining` | How many requests are left in it, floored at 0.                                                       |
| `X-RateLimit-Reset`     | **Seconds** until the window rolls over — a delay, not a timestamp, so you need no clock of your own. |

Over the ceiling is `429` with code `rate_limited` and a `Retry-After` in
seconds. Wait that long and retry, rather than backing off blindly.

Three details worth knowing:

- **A refused request still counts.** The counter is incremented before the
  verdict, which is what stops a client that ignores `429` from escaping the
  window by hammering it.
- **The headers describe the request that was spent**, which is why they are on
  the `4xx` a procedure threw as well as on the `200`s. A client that reads them
  only on success has no idea how close to the ceiling its failures are. A `401`
  for a credential that never resolved to a key carries none, because no key's
  window was touched.
- **A session-cookie request has no limit and no headers.** The throttle belongs
  to the key.

Fixed windows have the boundary behaviour fixed windows always have: a client can
land its full allowance just before a rollover and again just after. If you are
issuing a burst, pace it against `X-RateLimit-Remaining` rather than assuming a
smooth rate.

## Pagination and filtering

Every list this API returns comes back in the same envelope, and every list can
be paged:

```json
{
  "rows": [{ "id": "cm3q7rooma001qz8f1a2b3c4d", "code": "L-204" }],
  "total": 412,
  "page": 1,
  "pageSize": 500,
  "pageCount": 1
}
```

There is one convention, not three. No list endpoint hands back a bare array, no
list has a `take` or a `limit` of its own, and no response length is decided by
how large the institution happens to be. One piece of client code reads every
list in the API.

| Field       | What it is                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `rows`      | This page of results, in that endpoint's own row shape.                                                                          |
| `total`     | Everything matching the filter — **not** the length of `rows`.                                                                   |
| `page`      | One-based, echoing the page you asked for.                                                                                       |
| `pageSize`  | Rows in a full page: what you asked for, or the endpoint's own default where you asked for nothing.                              |
| `pageCount` | How many pages `total` divides into. Never below 1, so an empty list is page 1 of 1 rather than a page 1 of 0 no pager can draw. |

A few endpoints carry a field of their own beside the envelope — `GET /courses`
returns `semester`, the term it read the catalogue for — so these five are what a
list response always has rather than all it can have.

### `page` and `pageSize`

Two query parameters, on every list endpoint, and both optional.

- **`page`** is one-based. `?page=1` and no `page` at all are the same request.
- **`pageSize`** sizes the page. Every endpoint has its own default and its own
  maximum; both are in the table below, and both are in
  `GET /openapi.json`, read off the procedure's own schema rather than typed out
  by hand.

Asking for more than the maximum is refused with a `400` naming `pageSize`,
rather than quietly served a smaller page. A cap you cannot see is how a caller
comes to believe it has everything.

There is no cursor, and that is a decision rather than something still to come.
Offsets let you ask for page 7, render "of 12" and jump to the end, which is what
the app's own screens do; what a cursor buys — a stable walk over a list being
edited underneath you — is not a problem at these sizes. See
[Walking every page](#walking-every-page) for the one case where it bites.

### The default page is meant to be the whole answer

The defaults are not one house number applied twenty times. Each endpoint states
its own, and states it large enough to cover that list at a realistic
institution — 500 rooms, 200 buildings, 1000 courses in a semester. So a caller
who has never read this section, sends no query string and reads `rows` still
gets everything, which is exactly what it got before any of this existed.

That sizing is the point rather than an accident of it. Turning an unbounded list
into page 1 of a paginated one silently truncates every caller that was reading
the whole thing, and a faculty picker that quietly loses everybody after the
fiftieth name is worse than the unbounded response it replaced: it is wrong, it
looks entirely right, and the person it hurts cannot tell. Treat a default as a
ceiling on us, not a hint about how many rows to expect.

Three endpoints are deliberately smaller, because they were paged long before
this convention existed and their callers already send a page: `GET /users`
defaults to 25, `GET /plans` to 20 and `GET /timetable/people` to 30 — a
directory screen and two pickers. Compare `total` with `rows.length` if you need
to know whether you are looking at all of it.

### Walking every page

Increment `page` until it reaches `pageCount`:

```bash
page=1
while :; do
  body=$(curl -s -G "$PLANNR/users" \
    -H "Authorization: Bearer $KEY" \
    --data-urlencode "pageSize=200" \
    --data-urlencode "page=$page")
  echo "$body" | jq -c '.rows[]'
  [ "$page" -lt "$(echo "$body" | jq -r '.pageCount')" ] || break
  page=$((page + 1))
done
```

`page < pageCount` is the condition to loop on. Do not loop until `rows` comes
back empty: on a list whose length divides exactly by `pageSize` that is one
wasted request every time.

Nothing is snapshotted between calls. A row inserted while you are on page 3
shifts everything after it down one, so a walk of a list somebody is editing can
miss a row or repeat one. That is immaterial to a nightly export and it matters
to a reconciliation — where it matters, ask for a page big enough to take the
list in a single request, which for most of these endpoints is the default.

### Every list endpoint

| Endpoint                          | `pageSize`           | Filters                                                                                                                             |
| --------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /rooms`                      | 1–2000, default 500  | `query`, `buildingId`, `type`, `minCapacity`, `features` (matches rooms having **every** feature named, not any), `includeInactive` |
| `GET /rooms/available`            | 1–2000, default 500  | `from`, `to` (both required), plus every filter `/rooms` takes apart from `includeInactive`                                         |
| `GET /buildings`                  | 1–1000, default 200  | none                                                                                                                                |
| `GET /timetable/people`           | 1–200, default 30    | `query` — name or PRN                                                                                                               |
| `GET /timetable/people/directory` | 1–2000, default 500  | `query` — name, PRN or contact address                                                                                              |
| `GET /events/mine`                | 1–2000, default 500  | none                                                                                                                                |
| `GET /change-requests/mine`       | 1–500, default 100   | none                                                                                                                                |
| `GET /approvals/bookings`         | 1–500, default 200   | none                                                                                                                                |
| `GET /courses`                    | 1–2000, default 1000 | `semesterId`, `programmeId`, `search`                                                                                               |
| `GET /semesters`                  | 1–500, default 200   | none                                                                                                                                |
| `GET /groups`                     | 1–1000, default 500  | `query`, `programmeId`, `semesterId`, `batchId`, `kind`, `includeIds`                                                               |
| `GET /groups/{id}/lectures`       | 1–1000, default 200  | `from`, `to` — earliest sitting first, so paging walks forward                                                                      |
| `GET /faculty`                    | 1–1000, default 500  | `query`, `includeIds`                                                                                                               |
| `GET /batches`                    | 1–500, default 200   | `query`, `programmeId`                                                                                                              |
| `GET /programmes`                 | 1–500, default 200   | `query`, `includeIds`                                                                                                               |
| `GET /terms`                      | 1–500, default 200   | `query`, `includeIds`                                                                                                               |
| `GET /plans`                      | 1–100, default 20    | `query`, `scope` (`all`/`mine`/`shared`/`review`)                                                                                   |
| `GET /plans/{id}/history`         | 1–500, default 200   | none                                                                                                                                |
| `GET /users`                      | 1–200, default 25    | `query`, `roleId`, `status` (`all`/`active`/`inactive`/`never-signed-in`)                                                           |
| `GET /roles`                      | 1–500, default 200   | none                                                                                                                                |
| `GET /api-keys`                   | 1–500, default 200   | none                                                                                                                                |

`includeIds` pins particular rows into the page even when the search excludes
them — it is how a picker keeps a chosen option visible, and not a way to fetch
by id. Pinned rows are appended, so `rows` can come back longer than `pageSize`,
and `total` still counts what matched the filter rather than what you were handed.

### The two lists that answer whole

`GET /approvals` and `GET /plans/reviewer-candidates` answer in the same
envelope and take neither parameter. Both always return everything, on page 1 of
1, and both used to carry a cap that has been removed rather than converted.

Neither is an oversight. The approvals queue is two tables — booking requests and
change requests — read separately, merged and re-sorted by age, so page two of it
is not an offset into either; and trimming that list is precisely how two
requests for the same room at the same hour stop being visible together, which is
the one thing the person deciding them needs. The reviewer list is narrowed by
expanding permission bits after the rows are read, which no `WHERE` clause can
express, so paging the query underneath would answer with short pages, empty
pages and a `total` counting people you are never shown. Both lists are small by
nature: what is undecided today, and the handful of people who can sign a
timetable off.

### What is not a list

The envelope is for lists of records. Everything else answers as whatever it is,
and takes no `page`:

| Endpoint                                            | What it answers with                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /timetable/grid`                               | one day across every active room. `date` (required), `buildingId`, `includeCancelled`                   |
| `GET /timetable/week`                               | every occurrence in a window. `from`, `to` (both required), and one of `roomId`, `groupId`, `facultyId` |
| `GET /timetable/my-day`, `/my-week`, `/my-schedule` | the caller's own classes for a day or a window. Person only                                             |
| `GET /groups/{groupId}/attendance`                  | a group's taken registers. `from`, `to`                                                                 |
| `GET /users/count`                                  | a number — the count `GET /users` would report, without the rows. `query`, `roleId`, `status`           |
| `GET /events/conflicts`                             | what a proposed slot would collide with                                                                 |
| `GET /roles/permissions`, `GET /api-keys/scopes`    | fixed catalogues of the permission bits — flat for roles, grouped by category for keys                  |

**The one to watch is `GET /timetable/week`.** It is the endpoint an integration
should be built on, and with no `roomId`, `groupId` or `facultyId` it returns the
entire institution's occurrences for the window — over a term-length window, a
great many rows. It is bounded by time rather than by a page, which is the right
bound for a timetable: window it a week at a time, which is what it is named for,
and name a lane whenever you can.

If you are mirroring the timetable, poll `GET /timetable/week` per week per lane
rather than asking for a term in one request. There is no change feed and no
`updatedSince` filter.

## A worked example

A panel by the library door lets a student book a group-study room for the next
hour. Five calls, end to end.

Set the host and the key once:

```bash
PLANNR=https://plannr.example.edu/api/v1
KEY=plk_live_9f3c1a7b.Xk2p8vQ...
```

### 1. Mint the key

Done once, by a person, in **Settings → API keys** or by calling
`POST /api-keys` with a browser session (see [Minting a key](#minting-a-key)):

```json
{
  "name": "Study room kiosk",
  "description": "Books the library's group-study rooms from the panel by the door.",
  "scopes": ["ViewAllEvents", "BookRoom", "ViewRooms"],
  "expiresInDays": 365,
  "rateLimitPerMinute": 120
}
```

`201 Created`:

```json
{
  "id": "cm4k1r0aa0001qz8f7d3h2b1a",
  "name": "Study room kiosk",
  "description": "Books the library's group-study rooms from the panel by the door.",
  "prefix": "9f3c1a7b",
  "last4": "l7f2",
  "scopes": ["ViewOwnEvents", "ViewAllEvents", "BookRoom", "ViewRooms"],
  "status": "active",
  "createdBy": { "id": "cm3z0adm0000qz8f0a0b0c0d", "name": "Paras Wadehra" },
  "createdAt": "2026-08-25T09:14:02.113Z",
  "expiresAt": "2027-08-25T09:14:02.113Z",
  "revokedAt": null,
  "lastUsedAt": null,
  "requestCount": 0,
  "rateLimitPerMinute": 120,
  "token": "plk_live_9f3c1a7b.Xk2p8vQ...",
  "shownOnce": true
}
```

Note `scopes`: `ViewOwnEvents` is there although nobody ticked it, because
`ViewAllEvents` implies it. And note `token` — this response is the only place it
will ever appear. Put it in the kiosk's secret store now.

### 2. Find the rooms that could work

```bash
curl -s "$PLANNR/rooms?type=SEMINAR&minCapacity=6&features=WHITEBOARD" \
  -H "Authorization: Bearer $KEY"
```

```json
{
  "rows": [
    {
      "id": "cm3q7rooma001qz8f1a2b3c4d",
      "orgId": "cm3q0org00000qz8f9z8y7x6w",
      "code": "L-204",
      "buildingId": "cm3q0bldg0000qz8f5m4n3o2p",
      "floor": 2,
      "capacity": 8,
      "type": "SEMINAR",
      "features": ["WHITEBOARD", "TV"],
      "isActive": true,
      "notes": "Group study, bookable by students.",
      "building": { "id": "cm3q0bldg0000qz8f5m4n3o2p", "name": "Library" }
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 500,
  "pageCount": 1
}
```

`features` matches rooms that have **every** feature you name. Archived rooms are
left out unless you pass `includeInactive=true`.

### 3. Ask which of them are actually free

`/rooms` says what exists; `/rooms/available` says what is free in a window. Both
`from` and `to` are required, and the same filters apply.

```bash
curl -s -G "$PLANNR/rooms/available" \
  -H "Authorization: Bearer $KEY" \
  --data-urlencode "from=2026-10-13T10:00:00.000Z" \
  --data-urlencode "to=2026-10-13T11:00:00.000Z" \
  --data-urlencode "type=SEMINAR" \
  --data-urlencode "minCapacity=6"
```

A room is free when nothing occupying it overlaps the window. A cancelled sitting
does not hold a room, so it does not count against one, and archived rooms are
never offered.

If the panel wants to offer "the next free hour" instead, that is a different
endpoint: `GET /rooms/{id}/next-free-slot?after=…&durationMinutes=60`.

### 4. Book it

```bash
curl -s -X POST "$PLANNR/events" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "kind": "BOOKING",
        "title": "Group study — Nikhil D.",
        "roomId": "cm3q7rooma001qz8f1a2b3c4d",
        "startTime": "2026-10-13T10:00:00.000Z",
        "endTime": "2026-10-13T11:00:00.000Z",
        "notes": "Booked at the library kiosk."
      }'
```

`201 Created`:

```json
{
  "event": {
    "id": "cm4p2evt00001qz8fa1b2c3d4",
    "orgId": "cm3q0org00000qz8f9z8y7x6w",
    "kind": "BOOKING",
    "status": "CONFIRMED",
    "title": "Group study — Nikhil D.",
    "roomId": "cm3q7rooma001qz8f1a2b3c4d",
    "groupId": null,
    "facultyId": null,
    "semesterId": null,
    "courseId": null,
    "createdById": "cm4k1r0aa0000qz8fc4e5f6g7",
    "decidedById": null,
    "decidedAt": null,
    "decisionNote": null,
    "startTime": "2026-10-13T10:00:00.000Z",
    "endTime": "2026-10-13T11:00:00.000Z",
    "timezone": "Asia/Kolkata",
    "rrule": null,
    "notes": "Booked at the library kiosk.",
    "createdAt": "2026-08-25T09:31:44.902Z",
    "updatedAt": "2026-08-25T09:31:44.902Z"
  },
  "skipped": 0,
  "warnings": []
}
```

Four things to read rather than assume.

- **`status`.** A booking lands as `CONFIRMED` or as `PENDING`, depending on
  whether the institution requires sign-off for self-service bookings. Do not
  tell the student the room is theirs until you have looked.
- **`createdById`** is the key's principal, not the administrator who minted the
  key. This booking is attributed to "Study room kiosk (API key)" for as long as
  it exists.
- **`warnings`** lists the soft conflicts the booking went ahead despite — an
  over-capacity room, say. Hard conflicts are refused with `409` when the
  institution blocks them, and the slot is re-checked inside the transaction, so
  a clean `GET /events/conflicts` beforehand is a courtesy rather than a
  reservation.
- **`skipped`** counts the dates left out of a recurring series via `skipDates`.
  Zero here, because this booking does not repeat.

`POST /events` is also how a class is scheduled: send `kind: "CLASS"` with
`groupIds` and an `rrule`. That needs `ManageAllEvents` rather than `BookRoom`,
which is why the endpoint lists no scope of its own.

### 5. Read it back

```bash
curl -s "$PLANNR/events/cm4p2evt00001qz8fa1b2c3d4" \
  -H "Authorization: Bearer $KEY" -D -
```

```
HTTP/2 200
content-type: application/json; charset=utf-8
x-ratelimit-limit: 120
x-ratelimit-remaining: 116
x-ratelimit-reset: 41
```

Trimmed here for readability: the response carries every column the `POST`
returned, plus the relations below.

```json
{
  "id": "cm4p2evt00001qz8fa1b2c3d4",
  "kind": "BOOKING",
  "status": "CONFIRMED",
  "title": "Group study — Nikhil D.",
  "startTime": "2026-10-13T10:00:00.000Z",
  "endTime": "2026-10-13T11:00:00.000Z",
  "timezone": "Asia/Kolkata",
  "rrule": null,
  "room": {
    "id": "cm3q7rooma001qz8f1a2b3c4d",
    "code": "L-204",
    "capacity": 8,
    "building": { "id": "cm3q0bldg0000qz8f5m4n3o2p", "name": "Library" }
  },
  "group": null,
  "faculty": null,
  "exceptions": [],
  "recurrenceText": null
}
```

`recurrenceText` is the recurrence rule written out in English — `"Every Tuesday
until 15 December"` — and is `null` for a one-off. Remember that an id belonging
to nothing, or to another institution, answers `200` with a body of `null` rather
than `404`.

### Undoing it

Cancelling is `POST /events/{id}/cancel`, **not** `DELETE`. Nothing is deleted:
the event survives as `CANCELLED` and its occurrences are regenerated, so
registers and calendars follow. The request carries a `scope`, and the default is
the widest one — with no `scope`, a weekly lecture is cancelled in its entirety,
for everybody who has it in their week. For a single sitting send
`{"scope": "occurrence", "originalStart": "…"}`, where `originalStart` is the
date the recurrence rule produced, not the date the sitting was moved to.

## Endpoint reference

139 endpoints in 16 groups. This is the map; `GET /api/v1/openapi.json` is the
territory — it carries every parameter, every schema and every field, generated
from the procedures themselves, along with the long-form description of each
endpoint. Where a summary below reads as though it is hiding something, that
description is where the something is.

How to read the columns:

- **Scopes** — the bits a key must hold. An em dash means the endpoint declares
  none, which is _not_ the same as "open to anyone" — see
  [Scopes](#scopes). Where a scope is listed, it is listed because the procedure
  checks that exact bit.
- **person only** — refuses an API key with `403 requires_user`. See
  [the endpoints that refuse a key](#the-endpoints-that-refuse-a-key-and-what-to-call-instead)
  for what to call instead.
- **read twice** — changes state in a way the method does not advertise, or has
  no undo. Read the OpenAPI description before wiring an app to one of these.

### Rooms

Reads here carry no scope, and that is the app's own line rather than a
relaxation: `rooms.list`, `rooms.byId`, `rooms.availability` and
`rooms.nextFreeSlot` ask only that you are signed in, because the room directory
is not a secret from anybody who is. A room has three endings and they are not
interchangeable — archiving takes it out of service while leaving every
timetable it appears in readable, deleting removes it (and with `force=true`
takes its events down too), and `delete-impact` is the question the confirmation
dialog asks.

| Endpoint                         | What it does                                  | Scopes        | Notes      |
| -------------------------------- | --------------------------------------------- | ------------- | ---------- |
| `GET /rooms`                     | List rooms                                    | —             | —          |
| `GET /rooms/available`           | List the rooms free for a window              | —             | —          |
| `POST /rooms`                    | Add a room                                    | `ManageRooms` | —          |
| `POST /rooms/batch`              | Add up to 200 rooms at once                   | `ManageRooms` | —          |
| `GET /rooms/{id}`                | Fetch one room                                | —             | —          |
| `PATCH /rooms/{id}`              | Edit a room                                   | `ManageRooms` | —          |
| `DELETE /rooms/{id}`             | Delete a room                                 | `ManageRooms` | read twice |
| `GET /rooms/{id}/delete-impact`  | Count what deleting a room would take with it | `ManageRooms` | —          |
| `POST /rooms/{id}/archive`       | Take a room out of service                    | `ManageRooms` | —          |
| `POST /rooms/{id}/restore`       | Put an archived room back into service        | `ManageRooms` | —          |
| `GET /rooms/{id}/next-free-slot` | Find the next window this room is free        | —             | —          |

### Buildings

`PUT` rather than `PATCH` on the update, because the name is the only thing
anybody edits about a building and the procedure requires it. Deleting is
refused while any room still names the building.

| Endpoint                 | What it does             | Scopes        | Notes |
| ------------------------ | ------------------------ | ------------- | ----- |
| `GET /buildings`         | List buildings           | —             | —     |
| `POST /buildings`        | Add a building           | `ManageRooms` | —     |
| `PUT /buildings/{id}`    | Rename a building        | `ManageRooms` | —     |
| `DELETE /buildings/{id}` | Delete an empty building | `ManageRooms` | —     |

### Timetable

Everything here is a read. Nothing under `/timetable` writes a lecture —
scheduling, moving and cancelling live under `/events`, because the sitting is
the thing that changes and a timetable is only the shape those sittings make
when you stand back from them. Each of these is one indexed range scan over the
occurrences table: recurrence is resolved when an event is saved, so asking for
a week never asks the server to expand a rule. **`GET /timetable/week` is the
endpoint to build an integration on** — it names its subject explicitly, so it
answers the same for an app as for a person.

| Endpoint                          | What it does                                                    | Scopes                         | Notes       |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------ | ----------- |
| `GET /timetable/grid`             | Read one day across every room                                  | —                              | —           |
| `GET /timetable/week`             | Read a week down one lane                                       | —                              | —           |
| `GET /timetable/my-day`           | Read the caller's own day                                       | —                              | person only |
| `GET /timetable/my-week`          | Read the caller's own week                                      | —                              | person only |
| `GET /timetable/my-schedule`      | Read the caller's schedule for a day, from a chosen perspective | —                              | person only |
| `GET /timetable/people`           | Search the people whose day can be looked at                    | —                              | —           |
| `GET /timetable/people/directory` | Search the same people, with their contact addresses            | `ViewAllEvents`<br>`ViewUsers` | —           |

### Calendar

A person's own Google Calendar connection. Every route refuses a key, and that
is not a scope anybody could add: the connection is a grant somebody made on
their own account, and an administrator's power to rearrange the timetable has
never included reaching into the calendars it lands in.

| Endpoint                           | What it does                               | Scopes | Notes                   |
| ---------------------------------- | ------------------------------------------ | ------ | ----------------------- |
| `GET /calendar/connection`         | Read the caller's own calendar connection  | —      | person only             |
| `POST /calendar/connection/resync` | Bring the caller's calendar up to date now | —      | person only             |
| `DELETE /calendar/connection`      | Disconnect the caller's calendar           | —      | person only, read twice |

### Events

The half of the API that changes somebody's week. Three things explain most of
the shapes below. **`scope`** is `occurrence`, `following` or `series`, and
`series` is the default everywhere — so an omitted `scope` is the _widest_ one,
and a client that forgets the field retimes or cancels every sitting of a weekly
lecture. **Asking is not doing**: a caller who may not write directly does not
get a refusal, they get a change request, and the answer is `applied: false`
with a `requestId` — branch on `applied`, not on the status code. And **an empty
Scopes cell is not "open to anyone"**: most writes here are procedures that
decide for themselves which bit they need, because it depends on what you are
touching.

| Endpoint                    | What it does                                | Scopes | Notes       |
| --------------------------- | ------------------------------------------- | ------ | ----------- |
| `GET /events/{id}`          | Fetch one event                             | —      | —           |
| `GET /events/conflicts`     | Check what a proposed slot would clash with | —      | —           |
| `GET /events/mine`          | List the room bookings you made             | —      | person only |
| `POST /events`              | Schedule a class or book a room             | —      | —           |
| `PATCH /events/{id}`        | Move, retime or re-title an event           | —      | read twice  |
| `POST /events/{id}/cancel`  | Cancel an event or one of its sittings      | —      | read twice  |
| `POST /events/{id}/restore` | Restore a single cancelled sitting          | —      | —           |

### Approvals

Booking requests and change requests are stored differently and compete for the
same rooms, so `GET /approvals` returns them interleaved, each with a
server-computed verdict and the other undecided requests contesting the same
slot. Change requests get their own collection, `/change-requests/{id}`, because
that is the id every decision is made against — but they are created under the
event they are about, where a stranger will look for them.

| Endpoint                              | What it does                                 | Scopes            | Notes       |
| ------------------------------------- | -------------------------------------------- | ----------------- | ----------- |
| `GET /approvals`                      | List everything waiting for a decision       | `ApproveBookings` | —           |
| `GET /approvals/bookings`             | List booking requests waiting for a decision | `ApproveBookings` | —           |
| `POST /events/{id}/approve`           | Approve a booking request                    | `ApproveBookings` | —           |
| `POST /events/{id}/reject`            | Refuse a booking request                     | `ApproveBookings` | —           |
| `POST /events/{id}/change-requests`   | Ask for an event to be changed               | —                 | —           |
| `GET /change-requests/mine`           | List the change requests you filed           | —                 | person only |
| `POST /change-requests/{id}/approve`  | Approve a change request, and apply it       | `ApproveBookings` | read twice  |
| `POST /change-requests/{id}/reject`   | Refuse a change request                      | `ApproveBookings` | —           |
| `POST /change-requests/{id}/withdraw` | Withdraw a change request you filed          | —                 | —           |

### Attendance

A register hangs off a sitting and a group, never off an event: a lecture given
to two divisions is one sitting and two registers. That is why the write is a
`PUT` addressed to the pair rather than a `POST` to a collection — it replaces
the register outright, so a student left out of the list loses the mark they
had, and sending it twice leaves exactly what sending it once left.

| Endpoint                                                      | What it does                                       | Scopes           | Notes       |
| ------------------------------------------------------------- | -------------------------------------------------- | ---------------- | ----------- |
| `GET /occurrences/{occurrenceId}/attendance`                  | Read the registers for one sitting                 | `ViewAttendance` | —           |
| `PUT /occurrences/{occurrenceId}/attendance/groups/{groupId}` | Replace one group's register for one sitting       | `MarkAttendance` | read twice  |
| `GET /occurrences/{occurrenceId}/attendance/can-mark`         | Check whether the caller may take this register    | —                | person only |
| `GET /groups/{groupId}/attendance`                            | List a group's taken registers                     | `ViewAttendance` | —           |
| `GET /courses/{courseId}/attendance`                          | Read a course's attendance for everyone taking it  | `ViewAttendance` | —           |
| `GET /attendance/mine`                                        | Read the caller's own attendance, course by course | —                | person only |
| `GET /attendance/my-courses`                                  | List the courses the caller has registers for      | —                | person only |

### Courses

A course belongs to a semester rather than to the college in perpetuity, so
`/courses` answers for one semester at a time and the response names which.
Every update here is a `PUT` because none of these procedures merges: send the
whole set. **Enrolment has no endpoint of its own** — a student sits for a
course because a group they belong to takes it, which makes `PUT
/courses/{id}/groups` and the group-membership endpoints the two halves of the
answer.

| Endpoint                    | What it does                           | Scopes         | Notes      |
| --------------------------- | -------------------------------------- | -------------- | ---------- |
| `GET /courses`              | List a semester's courses              | `ViewGroups`   | —          |
| `GET /courses/{id}`         | Fetch one course                       | `ViewGroups`   | —          |
| `PUT /courses/{id}/faculty` | Set who may teach a course             | `ManageGroups` | —          |
| `PUT /courses/{id}/groups`  | Set which groups take a course         | `ManageGroups` | read twice |
| `GET /academics/structure`  | Read the shape of the current semester | `ViewGroups`   | —          |

### Semesters

`POST /semesters` does considerably more than create a row: `carryFrom` moves
every batch in the previous semester a number further along, and a batch already
in its final semester is left behind, which is how a cohort graduates.

| Endpoint                                        | What it does                            | Scopes             | Notes      |
| ----------------------------------------------- | --------------------------------------- | ------------------ | ---------- |
| `GET /semesters`                                | List semesters                          | `ViewGroups`       | —          |
| `POST /semesters`                               | Open a semester                         | `ManageProgrammes` | read twice |
| `PUT /semesters/{id}`                           | Rename a semester or move its dates     | `ManageProgrammes` | —          |
| `DELETE /semesters/{id}`                        | Delete an empty semester                | `ManageProgrammes` | —          |
| `PUT /semesters/{semesterId}/batches/{batchId}` | Set which semester number a batch is in | `ManageProgrammes` | —          |

### Groups

One tRPC router owns four different things, and a path is a claim about what a
resource is, so it is split four ways here — `/groups`, `/batches`,
`/programmes` and `/terms`. Two traps: a `FacultyProfile` id from `GET /faculty`
is **not** the id of the user who owns it, and the student ids `DELETE
/groups/{id}/students` wants come from `GET /groups/{id}`, not from `/users`.

| Endpoint                         | What it does                                     | Scopes         | Notes       |
| -------------------------------- | ------------------------------------------------ | -------------- | ----------- |
| `GET /groups`                    | List class groups                                | `ViewGroups`   | —           |
| `GET /groups/{id}`               | Fetch one class group                            | `ViewGroups`   | —           |
| `POST /groups`                   | Create a class group                             | `ManageGroups` | —           |
| `PATCH /groups/{id}`             | Update a class group                             | `ManageGroups` | —           |
| `GET /groups/{id}/lectures`      | List a group's scheduled lectures                | `ViewGroups`   | —           |
| `POST /groups/{id}/students`     | Add students to a group by email or PRN          | `ManageGroups` | —           |
| `DELETE /groups/{id}/students`   | Remove students from a group                     | `ManageGroups` | —           |
| `PUT /groups/{id}/faculty`       | Replace the faculty assigned to a group          | `ManageGroups` | read twice  |
| `GET /groups/{id}/delete-impact` | Preview what deleting a group would take with it | `ManageGroups` | —           |
| `DELETE /groups/{id}`            | Delete a class group                             | `ManageGroups` | read twice  |
| `GET /faculty`                   | List teaching staff                              | —              | —           |
| `GET /faculty/me`                | Fetch the calling person's faculty profile       | —              | person only |

### Batches

Intakes. Deleting one removes the intake and nothing else — its groups hold the
membership and the timetable, which is far too much to lose with a label, so
they survive and simply stop belonging to a batch.

| Endpoint               | What it does                           | Scopes         | Notes |
| ---------------------- | -------------------------------------- | -------------- | ----- |
| `GET /batches`         | List intakes and the groups under each | `ViewGroups`   | —     |
| `POST /batches`        | Create an intake                       | `ManageGroups` | —     |
| `PATCH /batches/{id}`  | Update an intake                       | `ManageGroups` | —     |
| `DELETE /batches/{id}` | Delete an intake                       | `ManageGroups` | —     |

### Programmes

The broadest way the institution divides its students: a degree like BCA. The
procedures behind these are named `createCourse`, `updateCourse` and
`deleteCourse` because that is what the admin screens call them, but they do not
touch the `Course` model — that is a subject taught in one semester, published
at `/courses`. The paths say `programme` so that an integrator reading
`ManageProgrammes` in the scope column lands on the right one.

| Endpoint                             | What it does                           | Scopes             | Notes |
| ------------------------------------ | -------------------------------------- | ------------------ | ----- |
| `GET /programmes`                    | List programmes                        | —                  | —     |
| `POST /programmes`                   | Create a programme                     | `ManageProgrammes` | —     |
| `PATCH /programmes/{id}`             | Update a programme                     | `ManageProgrammes` | —     |
| `GET /programmes/{id}/delete-impact` | Count what still points at a programme | `ManageProgrammes` | —     |
| `DELETE /programmes/{id}`            | Delete an empty programme              | `ManageProgrammes` | —     |
| `GET /terms`                         | List terms                             | —                  | —     |

### Schedule plans

A plan is a private sketch of a week that becomes real only at the very end:
draft it, fill it with demand, let the solver lay it out, share it for sign-off,
and — once every reviewer has said yes — write it onto the live timetable.
Sub-resources nest under the plan that owns them. Scopes here are unusually
mixed, and honestly so: the endpoints declaring nothing are the ones whose real
rule is _ownership_, which a scope list cannot express — you may read, delete,
archive, withdraw and comment on your own plan holding no planner bits at all,
and no permission in the system lets you do any of it to somebody else's.

| Endpoint                                              | What it does                                                     | Scopes                                     | Notes      |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ | ---------- |
| `GET /plans`                                          | List schedule plans                                              | `ViewSchedulePlans`                        | —          |
| `GET /plans/workspace`                                | Fetch the reference data a plan is built against                 | `ViewSchedulePlans`                        | —          |
| `GET /plans/reviewer-candidates`                      | List the people who can sign a plan off                          | `ManageSchedulePlans`                      | —          |
| `POST /plans`                                         | Start a schedule plan                                            | `ManageSchedulePlans`                      | —          |
| `GET /plans/{id}`                                     | Fetch one plan with its demand, sessions, reviewers and comments | —                                          | —          |
| `PATCH /plans/{id}`                                   | Edit a plan's name, term and scheduling settings                 | `ManageSchedulePlans`                      | —          |
| `DELETE /plans/{id}`                                  | Delete a plan                                                    | —                                          | read twice |
| `GET /plans/{id}/history`                             | List the revisions in a plan's chain                             | —                                          | —          |
| `POST /plans/{id}/archive`                            | Archive a plan                                                   | —                                          | —          |
| `POST /plans/{planId}/requirements`                   | Add a teaching requirement to a plan                             | `ManageSchedulePlans`                      | —          |
| `POST /plans/{planId}/requirements/import`            | Import a plan's demand from a CSV                                | `ManageSchedulePlans`                      | read twice |
| `POST /plans/{planId}/requirements/import/preview`    | Check a demand CSV without importing it                          | `ManageSchedulePlans`                      | —          |
| `PATCH /plans/{planId}/requirements/{requirementId}`  | Edit a teaching requirement                                      | `ManageSchedulePlans`                      | —          |
| `DELETE /plans/{planId}/requirements/{requirementId}` | Remove a teaching requirement                                    | `ManageSchedulePlans`                      | read twice |
| `POST /plans/{id}/generate`                           | Lay the plan's demand out across the week                        | `ManageSchedulePlans`                      | read twice |
| `POST /plans/{planId}/sessions/{sessionId}/move`      | Place a proposed session by hand                                 | `ManageSchedulePlans`                      | —          |
| `POST /plans/{planId}/sessions/{sessionId}/pin`       | Pin a proposed session so regenerating leaves it alone           | `ManageSchedulePlans`                      | —          |
| `POST /plans/{planId}/sessions/{sessionId}/unpin`     | Unpin a proposed session                                         | `ManageSchedulePlans`                      | —          |
| `POST /plans/{planId}/sessions/{sessionId}/clear`     | Take a proposed session off the grid                             | `ManageSchedulePlans`                      | —          |
| `POST /plans/{id}/share`                              | Share a plan for sign-off                                        | `ManageSchedulePlans`                      | read twice |
| `POST /plans/{id}/withdraw`                           | Pull a plan back out of review                                   | —                                          | read twice |
| `POST /plans/{id}/review`                             | Approve a shared plan, or send it back for changes               | `ApproveSchedulePlans`                     | —          |
| `POST /plans/{planId}/comments`                       | Comment on a plan                                                | —                                          | —          |
| `PATCH /plans/{planId}/comments/{commentId}`          | Mark a comment resolved or reopen it                             | —                                          | —          |
| `DELETE /plans/{planId}/comments/{commentId}`         | Delete your own comment                                          | —                                          | —          |
| `POST /plans/{id}/revise`                             | Copy a plan into a fresh draft                                   | `ManageSchedulePlans`                      | —          |
| `GET /plans/{id}/apply/preview`                       | See what applying a plan would do to the timetable               | —                                          | —          |
| `POST /plans/{id}/apply`                              | Write an approved plan onto the live timetable                   | `ManageSchedulePlans`<br>`ManageAllEvents` | read twice |

### People

Replacements are `PUT` and they mean it: `setGroups`, `setRoles` and
`setExtraPermissions` each take a whole set and make it so. Two reads are `POST`
— `/users/resolve` takes two thousand identifiers and `/users/import/preview`
takes a CSV, and neither survives a query string; both write nothing. And some
scopes are not the ones you would guess: editing somebody's group membership
wants `ManageGroups`, and granting an individual permission bit wants
`ManageRoles`, because it is an act of granting authority.

| Endpoint                      | What it does                                        | Scopes         | Notes       |
| ----------------------------- | --------------------------------------------------- | -------------- | ----------- |
| `GET /users`                  | List people in the directory                        | `ViewUsers`    | —           |
| `GET /users/count`            | Count the people a filter would match               | `ViewUsers`    | —           |
| `GET /users/me`               | Fetch the calling user's own profile                | —              | person only |
| `POST /users`                 | Add a person to the directory                       | `ManageUsers`  | —           |
| `POST /users/bulk-delete`     | Delete up to 500 people at once                     | `ManageUsers`  | read twice  |
| `POST /users/resolve`         | Resolve pasted emails and PRNs to people            | `ViewUsers`    | —           |
| `POST /users/import/preview`  | Preview what importing a CSV would do               | `ImportUsers`  | —           |
| `POST /users/import`          | Import a CSV of people                              | `ImportUsers`  | read twice  |
| `GET /users/{id}`             | Fetch one person                                    | `ViewUsers`    | —           |
| `PATCH /users/{id}`           | Edit a person's details                             | `ManageUsers`  | —           |
| `DELETE /users/{id}`          | Delete a person                                     | `ManageUsers`  | read twice  |
| `GET /users/{id}/groups`      | List the groups a person belongs to                 | `ViewUsers`    | —           |
| `PUT /users/{id}/groups`      | Replace the groups a person belongs to              | `ManageGroups` | read twice  |
| `PUT /users/{id}/roles`       | Replace the roles a person holds                    | `ManageUsers`  | read twice  |
| `PUT /users/{id}/permissions` | Set the permission bits a person holds individually | `ManageRoles`  | read twice  |

### Roles

Permissions travel as **decimal bitfield strings** — `"8388608"`, not a number,
because JSON has no BigInt. `GET /roles/permissions` is the vocabulary itself,
with each permission's bit and the mask it implies; build a permission editor
from that rather than hard-coding bit positions.

| Endpoint                        | What it does                           | Scopes        | Notes      |
| ------------------------------- | -------------------------------------- | ------------- | ---------- |
| `GET /roles`                    | List the organisation's roles          | `ViewUsers`   | —          |
| `POST /roles`                   | Create a custom role                   | `ManageRoles` | —          |
| `GET /roles/permissions`        | List every permission a role can grant | —             | —          |
| `GET /roles/{id}`               | Fetch one role                         | `ViewUsers`   | —          |
| `PATCH /roles/{id}`             | Edit a custom role                     | `ManageRoles` | read twice |
| `DELETE /roles/{id}`            | Delete a custom role                   | `ManageRoles` | read twice |
| `GET /roles/{id}/delete-impact` | Check what deleting a role would do    | `ManageRoles` | —          |

### API keys

Every route here is person-only, in the procedure and again at the doorway. The
writes are escalation with extra steps — a key that can mint keys is a leaked
token that has learned to reproduce. The reads are quieter but not harmless: a
list of the institution's integrations, what each may touch and which expire on
Friday is a reconnaissance document, and no legitimate integration has ever
needed one.

| Endpoint                     | What it does                         | Scopes        | Notes                   |
| ---------------------------- | ------------------------------------ | ------------- | ----------------------- |
| `GET /api-keys`              | List the organisation's API keys     | `ManageRoles` | person only             |
| `POST /api-keys`             | Mint an API key                      | `ManageRoles` | person only, read twice |
| `GET /api-keys/scopes`       | List the scopes a key can be granted | `ViewUsers`   | person only             |
| `GET /api-keys/{id}`         | Fetch one API key                    | `ManageRoles` | person only             |
| `PATCH /api-keys/{id}`       | Edit an API key                      | `ManageRoles` | person only, read twice |
| `POST /api-keys/{id}/roll`   | Roll an API key's secret             | `ManageRoles` | person only, read twice |
| `POST /api-keys/{id}/revoke` | Revoke an API key                    | `ManageRoles` | person only, read twice |
| `DELETE /api-keys/{id}`      | Delete a revoked API key             | `ManageRoles` | person only, read twice |
| `GET /api-keys/{id}/usage`   | Read an API key's usage              | `ManageRoles` | person only             |

## How this is put together

Four files, if you ever need to reason about behaviour this page does not
describe:

| File                          | What it holds                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/rest/routes/*.ts` | Every endpoint, declared as data — method, path, procedure, scopes, and a doc comment per module explaining the shape decisions. |
| `src/server/rest/handler.ts`  | Authentication, routing, input assembly. No authorisation logic, deliberately.                                                   |
| `src/server/rest/errors.ts`   | The status mapping and the error envelope.                                                                                       |
| `src/lib/api-scopes.ts`       | The scope vocabulary, derived from `src/lib/permissions.ts`.                                                                     |

The one property worth defending when any of them changes: a rule added in the
REST layer is a rule the app itself does not have, and the first time the two
disagree it will be because somebody fixed the procedure and never thought to
look in here.
