import { type RouteDef } from "../types";

/**
 * Tests and presentations.
 *
 * Every route is `actor: "person"`: an assignment is set by a teacher and read
 * by their students, and what each may do is decided by who they are, which a
 * service key is not. A personal key acts as its owner but holds only
 * ViewOwnEvents, so a student's phone can list their work and read their
 * marks, while setting or managing work needs a signed-in browser.
 *
 * Scopes name `ManageOwnAssignments` on the routes whose procedures check it.
 * Reads check no bit: the procedures scope what they return to the caller,
 * their own work or their groups'. Question papers and answers are in
 * papers.ts and submissions.ts, under `/assignments/{id}/paper`,
 * `/assignments/{id}/submission(s)`, `/assignments/{id}/marks/publish` and
 * `/submissions/{submissionId}`.
 */
export const assignmentRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/assignments",
    procedure: "assignments.list",
    summary: "List the caller's tests and presentations",
    description:
      "What the caller set (everybody's, for a holder of `ManageAllAssignments`) and, for a student, their groups'. `when=upcoming` (the default) lists the soonest first and keeps an assignment until its last sitting ends; `when=past` lists the most recently ended first. Each row says the caller's `role` in it. Takes `page` and `pageSize`.",
    tag: "Assignments",
    scopes: [],
    actor: "person",
  },
  {
    method: "GET",
    path: "/assignments/teaching",
    procedure: "assignments.teaching",
    summary: "List the groups and courses the caller can set work for",
    description:
      "The (group, course) pairs of this semester that the caller teaches on the timetable, or every pair for a holder of `ManageAllAssignments`. Empty for somebody who cannot set work.",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
    input: "none",
  },
  {
    method: "GET",
    path: "/assignments/sittings",
    procedure: "assignments.sittingsFor",
    summary: "List a group's coming classes a test can be set in",
    description:
      "Sittings of the group's classes from `from` (now) to `to` (60 days on) that the caller teaches, or all of them for a holder of `ManageAllAssignments`, optionally for one `courseId`. Each says its `originalStart`, which is what a test is pinned by, and what is already pinned there.",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
  },
  {
    method: "GET",
    path: "/assignments/{id}",
    procedure: "assignments.byId",
    summary: "Fetch one test or presentation",
    description:
      "Everything about it the caller may see: its sittings and their state (`ok`, `pending`, `cancelled` or `lost`), its teams, and its paper. A student sees the other teams' names only, and an assignment of another group is not found.",
    tag: "Assignments",
    scopes: [],
    actor: "person",
  },
  {
    method: "POST",
    path: "/assignments",
    procedure: "assignments.create",
    summary: "Set a test or a presentation",
    description:
      "A test needs `sitting`: one of the group's classes the caller teaches (`eventId` and `originalStart`) or `newClass` (`roomId`, `startTime`, `endTime`), which waits for approval when the institution asks for changes to be approved. A presentation needs `window` (`start` and `end` as YYYY-MM-DD). A teacher may only set work for a group and course they teach. The group's students are told.",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
    status: 201,
  },
  {
    method: "PATCH",
    path: "/assignments/{id}",
    procedure: "assignments.update",
    summary: "Change a test's or presentation's details",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
  },
  {
    method: "PUT",
    path: "/assignments/{id}/sitting",
    procedure: "assignments.setSitting",
    summary: "Move a test to another class",
    description:
      "Replaces the test's sitting with another of the group's classes, or a new class. The class it was in stays on the timetable. The students are told.",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
  },
  {
    method: "DELETE",
    path: "/assignments/{id}",
    procedure: "assignments.remove",
    summary: "Delete a test or presentation",
    description:
      "Deletes it with its teams, paper, answers and marks. Once anybody has answered, `confirmAnswers=true` is required. `cancelScheduledClasses=true` also calls off the classes scheduled only for it.",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
    dangerous: true,
  },
  {
    method: "GET",
    path: "/assignments/{id}/students",
    procedure: "assignments.groupStudents",
    summary: "List the students a presentation's teams are formed from",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
  },
  {
    method: "PUT",
    path: "/assignments/{id}/teams",
    procedure: "assignments.saveTeams",
    summary: "Replace a presentation's teams",
    description:
      "Teams keep their ids, and their slots, where they are passed; teams left out are deleted with their slots. Every student must be in the group and in one team only.",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
  },
  {
    method: "PUT",
    path: "/assignments/{id}/teams/{teamId}/slot",
    procedure: "assignments.setSlot",
    summary: "Book a team's presentation slot",
    description:
      "In one of the group's classes inside the presentation's days, or a new class. The team's members are told.",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
  },
  {
    method: "DELETE",
    path: "/assignments/{id}/teams/{teamId}/slot",
    procedure: "assignments.clearSlot",
    summary: "Take a team's presentation slot away",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
  },
  {
    method: "PUT",
    path: "/assignments/{id}/slots/{exceptionId}/order",
    procedure: "assignments.reorderSlots",
    summary: "Set the order teams present in within one class",
    tag: "Assignments",
    scopes: ["ManageOwnAssignments"],
    actor: "person",
  },
];
