import { type RouteDef } from "../types";

/**
 * The academic structure: who sits together, when they were admitted, and what
 * they are reading for.
 *
 * One tRPC router — `groups.*` — owns four different things, because the screens
 * that edit a group need the intake, the programme and the term in the same
 * breath. A REST surface cannot inherit that convenience: a path is a claim
 * about what a resource is, so this file splits the router four ways, into
 * `/groups`, `/batches`, `/programmes` and `/terms`, and each id means exactly
 * one kind of row.
 *
 * ## The word "course" means two different things, and only one of them is here
 *
 * `groups.createCourse`, `groups.updateCourse` and `groups.deleteCourse` do not
 * touch the `Course` model. They create, edit and delete **programmes** — BCA,
 * MBA-IT — and the procedures are named for what the admin screens call them,
 * which is what the college calls them. The `Course` model in
 * `routers/courses.ts` is something else entirely: a subject taught in one
 * semester, with its own faculty and its own groups, published at `/courses` by
 * that router's routes.
 *
 * Both cannot be `/courses`, and if they were, `GET /courses/{id}` would take
 * two incompatible ids and answer for whichever model happened to hold that
 * cuid. So the programme procedures are published at `/programmes` — what the
 * database calls them, and what the permission bit is called. An integrator who
 * reads `ManageProgrammes` in the scope column lands on the right path, and the
 * only cost is that four procedure names disagree with the URLs they serve.
 * That disagreement is on this side of the wall, where it belongs.
 *
 * ## `/terms` is not a second `/semesters`
 *
 * `groups.termList` is the term picker: paged, searchable, and computing
 * `isCurrent` on the server because the dates are `@db.Date` and a browser
 * would read them in its own timezone and be wrong at the edges. The semester
 * resource proper — counts, and the rollover that opens the next one — is
 * `semesters.*` at `/semesters`. Two procedures cannot share a path, so the
 * picker keeps its own name; the description on it says which one an app
 * probably wants.
 *
 * ## Faculty are not users
 *
 * `/faculty` is the teaching-staff directory that the group and course editors
 * pick from, and a `FacultyProfile` id is not the id of the user who owns it —
 * they are not interchangeable and nothing accepts both. So this is its own
 * collection rather than a filter on `/users`. It is tagged Groups because the
 * only question it exists to answer is who stands in front of one.
 *
 * ## Shapes worth knowing before wiring anything up
 *
 * Membership is a sub-collection: `POST` and `DELETE` on `/groups/{id}/students`
 * add and remove people without touching the group. Faculty assignment is a
 * `PUT`, because `setFaculty` replaces the set outright rather than adding to
 * it. And `201` is reserved for the three endpoints that genuinely create a row
 * and hand it back — adding students answers `200` with a report, since a
 * request full of identifiers the registry has never seen creates nothing at
 * all and still succeeded at what it was asked to do.
 */
export const groupRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/groups",
    procedure: "groups.list",
    summary: "List class groups",
    description:
      "Paged. Narrow with `programmeId`, `semesterId`, `batchId` or `kind`; `query` searches the group's name and label, its programme code and its batch name. `includeIds` pins specific groups into the page even when the search excludes them, which is how a picker keeps a chosen option visible.",
    tag: "Groups",
    scopes: ["ViewGroups"],
  },
  {
    method: "GET",
    path: "/groups/{id}",
    procedure: "groups.byId",
    summary: "Fetch one class group",
    description:
      "The group with its full membership and its assigned faculty. Students carry the `id` that `DELETE /groups/{id}/students` expects. An address of `null` is a student the college has sent no email for — not an error, and not something to retry.",
    tag: "Groups",
    scopes: ["ViewGroups"],
  },
  {
    method: "POST",
    path: "/groups",
    procedure: "groups.create",
    summary: "Create a class group",
    description:
      "`programmeId` is required; `semesterId` and `batchId` are not, and a group with neither is one that has not been filed yet rather than one that is broken. A programme cannot have two groups of the same name in the same term.",
    tag: "Groups",
    scopes: ["ManageGroups"],
    status: 201,
  },
  {
    method: "PATCH",
    path: "/groups/{id}",
    procedure: "groups.update",
    summary: "Update a class group",
    description:
      "Omitted fields are left alone. `label`, `semesterId` and `batchId` accept `null` explicitly, which clears them — sending `null` for a batch detaches the group from its intake rather than failing.",
    tag: "Groups",
    scopes: ["ManageGroups"],
  },
  {
    method: "GET",
    path: "/groups/{id}/lectures",
    procedure: "groups.lectures",
    summary: "List a group's scheduled lectures",
    description:
      "Occurrences rather than events, so a weekly class appears as the dates it actually sits — which is what a register is taken against. Combined lectures the group has been joined into are included alongside its own. Earliest sitting first, so paging walks forward through the group's timetable; `from` and `to` narrow it to the term you mean, which is nearly always what you want instead.",
    tag: "Groups",
    scopes: ["ViewGroups"],
    params: { id: "groupId" },
  },
  {
    method: "POST",
    path: "/groups/{id}/students",
    procedure: "groups.addMembers",
    summary: "Add students to a group by email or PRN",
    description:
      "`identifiers` is a column pasted out of a spreadsheet: emails, PRNs, or a mix of both. The response says what happened to every one of them — added, already a member, or matched nobody — because a paste that half-lands is the normal case and an app needs to show which lines to fix. Answers `200`, not `201`: a request whose identifiers are all unknown creates nothing and has still done what it was asked.",
    tag: "Groups",
    scopes: ["ManageGroups"],
    params: { id: "groupId" },
  },
  {
    method: "DELETE",
    path: "/groups/{id}/students",
    procedure: "groups.removeMembers",
    summary: "Remove students from a group",
    description:
      "`studentIds` travels in the query, repeated or comma-separated: `?studentIds=abc,def`. They are the student ids from `GET /groups/{id}`, not user ids. At least one is required, so there is no spelling of this request that empties a group by omission — and it removes the membership only, never the student.",
    tag: "Groups",
    scopes: ["ManageGroups"],
    params: { id: "groupId" },
  },
  {
    method: "PUT",
    path: "/groups/{id}/faculty",
    procedure: "groups.setFaculty",
    summary: "Replace the faculty assigned to a group",
    description:
      "A replacement, not an addition: whoever is not in `facultyIds` stops being assigned, and an empty array unassigns everybody. Read the current set from `GET /groups/{id}` and send it back with your change applied. The ids are faculty ids from `GET /faculty`.",
    tag: "Groups",
    scopes: ["ManageGroups"],
    params: { id: "groupId" },
    dangerous: true,
  },
  {
    method: "GET",
    path: "/groups/{id}/delete-impact",
    procedure: "groups.deleteImpact",
    summary: "Preview what deleting a group would take with it",
    description:
      "Students, scheduled classes, assigned faculty, and how many sittings are still to come. Read this before the delete below — it is the only way to find out that a group is carrying a term's worth of timetable.",
    tag: "Groups",
    scopes: ["ManageGroups"],
  },
  {
    method: "DELETE",
    path: "/groups/{id}",
    procedure: "groups.delete",
    summary: "Delete a class group",
    description:
      "A group owns its place on the timetable, so this takes its events and every occurrence of them with it, and the people who were coming are told their classes are off. While the group still has classes scheduled the request is refused with `400` unless you also send `confirmCascade=true`, which is the whole safety mechanism — there is no undo behind it.",
    tag: "Groups",
    scopes: ["ManageGroups"],
    dangerous: true,
  },
  {
    method: "GET",
    path: "/faculty",
    procedure: "groups.facultyList",
    summary: "List teaching staff",
    description:
      "The people who can be put in front of a class, paged and searchable by name, short name or department. Service principals never appear here — a machine identity cannot hold a faculty profile, and this is the query that would otherwise put one in a teaches dropdown. No permission bit is checked: the procedure gates on nothing beyond being authenticated, so any key reaches it.",
    tag: "Groups",
    scopes: [],
  },
  {
    method: "GET",
    path: "/faculty/me",
    procedure: "groups.me",
    summary: "Fetch the calling person's faculty profile",
    description:
      "Answers whether the caller teaches, and under what short name. Defined relative to whoever is asking, and an API key is nobody's colleague — a key has no faculty profile and never will, so this refuses one rather than answering `null` and letting an app conclude the person it is acting for does not teach. An app after a particular member of staff should search the directory at `GET /faculty`.",
    tag: "Groups",
    scopes: [],
    actor: "session",
    input: "none",
  },

  {
    method: "GET",
    path: "/batches",
    procedure: "groups.batchList",
    summary: "List intakes and the groups under each",
    description:
      "Newest intake first. Paged like everything else here, though an institution has tens of these rather than thousands, so a request that names no page gets the lot. Filter by `programmeId`, or search names and programme codes with `query`. Each batch's `studentCount` sums its divisions only: majors, minors and electives draw on the same people again, and adding them would count a student several times.",
    tag: "Batches",
    scopes: ["ViewGroups"],
  },
  {
    method: "POST",
    path: "/batches",
    procedure: "groups.createBatch",
    summary: "Create an intake",
    description:
      "The years are calendar years the intake runs between, and `endYear` may not precede `startYear`. Batch names are unique across the institution, not merely within a programme.",
    tag: "Batches",
    scopes: ["ManageGroups"],
    status: 201,
  },
  {
    method: "PATCH",
    path: "/batches/{id}",
    procedure: "groups.updateBatch",
    summary: "Update an intake",
    tag: "Batches",
    scopes: ["ManageGroups"],
  },
  {
    method: "DELETE",
    path: "/batches/{id}",
    procedure: "groups.deleteBatch",
    summary: "Delete an intake",
    description:
      "Removes the intake and nothing else. Its groups survive — they hold the membership and the timetable, which is far too much to lose with a label — and simply stop belonging to a batch. The response counts how many were orphaned so they can be refiled.",
    tag: "Batches",
    scopes: ["ManageGroups"],
  },

  {
    method: "GET",
    path: "/programmes",
    procedure: "groups.programmeList",
    summary: "List programmes",
    description:
      "Paged, searchable by code or name, with the number of groups and batches hanging off each. No permission bit is checked — any authenticated caller may read the catalogue, though changing it needs `ManageProgrammes`.",
    tag: "Programmes",
    scopes: [],
  },
  {
    method: "POST",
    path: "/programmes",
    procedure: "groups.createCourse",
    summary: "Create a programme",
    description:
      "The broadest way the institution divides its students — a degree like BCA, which the admin screens call a course. Codes are unique regardless of case, so `bca` collides with `BCA`.",
    tag: "Programmes",
    scopes: ["ManageProgrammes"],
    status: 201,
  },
  {
    method: "PATCH",
    path: "/programmes/{id}",
    procedure: "groups.updateCourse",
    summary: "Update a programme",
    description:
      "Renaming is free; recoding is checked against every other programme case-insensitively and refused with `409` on a clash.",
    tag: "Programmes",
    scopes: ["ManageProgrammes"],
  },
  {
    method: "GET",
    path: "/programmes/{id}/delete-impact",
    procedure: "groups.programmeDeleteImpact",
    summary: "Count what still points at a programme",
    description:
      "Groups and batches, which are exactly the two things that block the delete below. Read it to say why a programme is stuck rather than to decide whether to force it — nothing here can be forced.",
    tag: "Programmes",
    scopes: ["ManageProgrammes"],
  },
  {
    method: "DELETE",
    path: "/programmes/{id}",
    procedure: "groups.deleteCourse",
    summary: "Delete an empty programme",
    description:
      "Only ever deletes a programme nothing refers to; while any group or batch still points at it the request is refused with `400` naming what is in the way. There is deliberately no cascade and no confirmation flag: cascading would take the groups, and a group owns its student membership and its place on the timetable. Move or delete those first.",
    tag: "Programmes",
    scopes: ["ManageProgrammes"],
  },
  {
    method: "GET",
    path: "/terms",
    procedure: "groups.termList",
    summary: "List terms",
    description:
      "The term picker: paged, searchable by name, and flagging which term is running today — decided on the server because the dates carry no time and a client would read them in its own timezone and be wrong at the edges. This is a narrow view for filling in a `semesterId`; the semester resource itself, with what each term contains, is at `GET /semesters`. No permission bit is checked.",
    tag: "Programmes",
    scopes: [],
  },
];
