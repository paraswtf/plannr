import { type RouteDef } from "../types";

/**
 * Courses and semesters — the frame everything else in the app is dated
 * against.
 *
 * Two facts about the domain shape this file. A course belongs to a semester
 * rather than to the college in perpetuity, so `/courses` answers for one
 * semester at a time and the response says which; and a semester is opened by
 * copying the previous one forward, so `POST /semesters` does considerably more
 * than create a row.
 *
 * Every method here is PUT where you might expect PATCH, and that is deliberate
 * rather than sloppy: none of these procedures merges. A course's faculty and
 * its groups are set wholesale, so sending one id removes the rest, and
 * `semesters.update` wants the name and both dates together or not at all.
 * Calling that last one PATCH would invite a partial request that can only ever
 * be a 400.
 *
 * Enrolment has no endpoint of its own and should not grow one. A student sits
 * for a course because a group they belong to takes it, which makes
 * `PUT /courses/{id}/groups` and the group-membership endpoints the two halves
 * of the answer — and is why that route is flagged as dangerous when nothing
 * about "set the groups" sounds like it.
 *
 * `GET /academics/structure` is the one path here that is not named after a
 * resource, because what it returns is not one: it is the whole academic setup
 * seen at once — programmes, batches, this term's totals and its gaps. It is
 * tagged under Courses because that is where the procedure lives.
 */
export const academicsRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/courses",
    procedure: "courses.list",
    summary: "List a semester's courses",
    description:
      "Paged, and narrowable with `semesterId`, `programmeId` or `search`. It defaults to the semester running today, or the most recent one when the college is between terms, and names that semester alongside the page — `semester` sits beside `rows` — so a client never has to infer which term it was answered for. The default page holds a whole semester's catalogue, so a caller that ignores paging still gets the lot.",
    tag: "Courses",
    scopes: ["ViewGroups"],
  },
  {
    method: "GET",
    path: "/courses/{id}",
    procedure: "courses.byId",
    summary: "Fetch one course",
    description:
      "Who is cleared to teach it, which groups sit for it, every lecture scheduled for it, and the headcount those groups add up to.",
    tag: "Courses",
    scopes: ["ViewGroups"],
    params: { id: "courseId" },
  },
  {
    method: "PUT",
    path: "/courses/{id}/faculty",
    procedure: "courses.setFaculty",
    summary: "Set who may teach a course",
    description:
      "Replaces the list rather than adding to it, so send everybody who should be on it — anyone left out comes off. It is a list because the office clears several teachers and chooses between them as lectures are scheduled; taking somebody off it does not touch the lectures they have already given.",
    tag: "Courses",
    scopes: ["ManageGroups"],
    params: { id: "courseId" },
  },
  {
    method: "PUT",
    path: "/courses/{id}/groups",
    procedure: "courses.setGroups",
    summary: "Set which groups take a course",
    description:
      "This is enrolment. A student sits for a course because a group they belong to takes it, so a group missing from this list is removed along with every student in it — send the whole set, every time. Registers already taken survive; what changes is who is expected from here on.",
    tag: "Courses",
    scopes: ["ManageGroups"],
    dangerous: true,
    params: { id: "courseId" },
  },
  {
    method: "GET",
    path: "/academics/structure",
    procedure: "courses.structure",
    summary: "Read the shape of the current semester",
    description:
      "Programmes, the batches under them and the semester number each is sitting at, this term's totals, and the gaps worth fixing before somebody trips over them — courses with nobody cleared to teach them, lectures attached to no course. It takes no parameters: the semester it reports on is the one running now, or the most recent if the college is between terms.",
    tag: "Courses",
    scopes: ["ViewGroups"],
    input: "none",
  },

  {
    method: "GET",
    path: "/semesters",
    procedure: "semesters.list",
    summary: "List semesters",
    description:
      "Newest first, each with what it holds — courses, groups, lectures, batches — and a `current` flag for the one running today. There is at most one of those, and sometimes none. Paged, though a college would have to run for sixty years to fill the first page.",
    tag: "Semesters",
    scopes: ["ViewGroups"],
  },
  {
    method: "POST",
    path: "/semesters",
    procedure: "semesters.create",
    summary: "Open a semester",
    description:
      "`carryFrom` is the usual way to open one, and it does more than create a row: every batch sitting in that semester arrives in this one a number further along, and a batch already in its final semester is left behind, which is how a cohort graduates. Omit it and the semester opens empty. Names are unique within the college, so repeating the call is a 409 rather than a second Autumn 2026.",
    tag: "Semesters",
    scopes: ["ManageProgrammes"],
    status: 201,
    dangerous: true,
  },
  {
    method: "PUT",
    path: "/semesters/{id}",
    procedure: "semesters.update",
    summary: "Rename a semester or move its dates",
    description:
      "Name, start and end go together — the procedure writes all three, so a partial request is a validation error rather than a merge. Moving the dates changes which semester counts as the current one; nothing that belongs to it is re-dated.",
    tag: "Semesters",
    scopes: ["ManageProgrammes"],
  },
  {
    method: "DELETE",
    path: "/semesters/{id}",
    procedure: "semesters.remove",
    summary: "Delete an empty semester",
    description:
      "Refused while it still holds a course, a group or a lecture, and deliberately so: those cascade from it in the database and would take their registers with them. This is for undoing a semester opened by mistake, not for closing one — a term that has run stays.",
    tag: "Semesters",
    scopes: ["ManageProgrammes"],
  },
  {
    method: "PUT",
    path: "/semesters/{semesterId}/batches/{batchId}",
    procedure: "semesters.setBatchNumber",
    summary: "Set which semester number a batch is in",
    description:
      "`number` is a Roman numeral as the college writes them — I to VIII for a four-year degree — or `null`, which takes the batch out of this semester altogether. Needed where the rollover's arithmetic cannot help: an intake that started late, one repeating a semester, or a correction to what carrying forward assumed.",
    tag: "Semesters",
    scopes: ["ManageProgrammes"],
  },
];
