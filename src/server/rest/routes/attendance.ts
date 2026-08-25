import { type RouteDef } from "../types";

/**
 * Registers.
 *
 * Attendance hangs off a sitting and a group, never off an event: a lecture
 * given to two divisions is one sitting and two registers, and any of them can
 * be corrected all week. That is why the write below is a PUT addressed to a
 * pair — `/occurrences/{occurrenceId}/attendance/groups/{groupId}` — rather
 * than a POST to a collection. The pair in the path is the pair the database
 * has its unique key on; the write replaces the register outright; and sending
 * it twice leaves exactly what sending it once left. A caller submitting a
 * shorter list than last time is not adding to a register, it is publishing a
 * new one, and anybody dropped from it loses their mark. PUT is the honest verb
 * for that, and POST would have implied a second register could be appended.
 *
 * The reads nest under whatever the register is being read *about* — a sitting,
 * a group, a course — because that is the noun the caller already holds an id
 * for. Only the two endpoints that report on the caller sit under `/attendance`
 * itself, and both of those refuse a key.
 *
 * One thing to know before wiring an unattended integration to the write: the
 * MarkAttendance scope is necessary and not sufficient, and the shortfall is
 * not a bug to be routed around. A register is a statement that a named teacher
 * saw these people in a room, so the procedure insists the caller *is* that
 * teacher. A key holds no faculty profile and can never be one. The endpoint is
 * documented in full below because a lecturer's own client — a phone, a room
 * kiosk, signed in as them — is a perfectly good reason to call it over HTTP.
 */
export const attendanceRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/occurrences/{occurrenceId}/attendance",
    procedure: "attendance.forOccurrence",
    summary: "Read the registers for one sitting",
    description:
      "Everything the marking screen needs: the sitting, every group the lecture is given to, each group's roster in PRN order, and whatever was marked last time and by whom. A student with no record yet reads as PRESENT with `marked: false`, because a register is taken by striking out whoever is missing rather than by ticking off a full room. Answers `null` with a 200 — not a 404 — when there is no such sitting in this organisation.",
    tag: "Attendance",
    scopes: ["ViewAttendance"],
  },
  {
    method: "PUT",
    path: "/occurrences/{occurrenceId}/attendance/groups/{groupId}",
    procedure: "attendance.mark",
    summary: "Replace one group's register for one sitting",
    description:
      "Send the whole register rather than a change to it: `records` replaces what was there, and a student you leave out of it loses the mark they had. Marking the same sitting again is how a correction is made, so this is safe to retry. Unmarked students are not absent students — they read back as present from `GET /occurrences/{occurrenceId}/attendance`.\n\nMarkAttendance gets you as far as this layer and no further: the procedure also insists the caller is the faculty member the sitting is timetabled to. That is deliberate and narrow — if the wrong person is on the lecture, the lecture is what needs correcting, not the register — and it means a service principal is refused with 403 however it is scoped, since a key holds no faculty profile. A sitting with nobody teaching it is refused for everyone, with an explanation: assign a teacher first.",
    tag: "Attendance",
    scopes: ["MarkAttendance"],
    dangerous: true,
  },
  {
    method: "GET",
    path: "/occurrences/{occurrenceId}/attendance/can-mark",
    procedure: "attendance.canMark",
    summary: "Check whether the caller may take this register",
    description:
      "True only when the caller holds MarkAttendance and is the faculty member the sitting is timetabled to. False — never an error — for every other reason, including a sitting that does not exist, because this exists for a client deciding whether to draw a button. Declared with no scope: the procedure asks the question rather than enforcing it, and MarkAttendance is one of the things it is asking about. There is no explicit-subject version, and there should not be one: the answer is a fact about somebody's account rather than about the lecture.",
    tag: "Attendance",
    scopes: [],
    actor: "session",
  },
  {
    method: "GET",
    path: "/groups/{groupId}/attendance",
    procedure: "attendance.forGroup",
    summary: "List a group's taken registers",
    description:
      "One row per register this group has actually had taken, with its totals — what the lectures list badges itself from. `from` and `to` narrow it to sittings inside a window and are both optional. Sittings nobody marked are simply absent, which is the whole difference between this and counting the timetable.",
    tag: "Attendance",
    scopes: ["ViewAttendance"],
  },
  {
    method: "GET",
    path: "/courses/{courseId}/attendance",
    procedure: "attendance.forCourse",
    summary: "Read a course's attendance for everyone taking it",
    description:
      "One row per student across every group the course is taught to, worst percentage first, because the reason to open this is to find the people in trouble rather than to admire the people who are fine. Present and late both count as attended; an excused absence counts on neither side, so being away with permission neither helps nor hurts. `scheduled` is the load a single division carries rather than the total across all of them — that total is a number no student's attendance could ever be measured against. 404 if the course is not this organisation's.",
    tag: "Attendance",
    scopes: ["ViewAttendance"],
  },
  {
    method: "GET",
    path: "/attendance/mine",
    procedure: "attendance.mine",
    summary: "Read the caller's own attendance, course by course",
    description:
      "Three numbers per course, and they answer different questions. `attended` over `conducted` is the percentage the college enforces, counted only over registers that were actually taken — a lecture nobody marked cannot count against anybody. `scheduled` is the term's whole set of sittings, so a student can see how much of the course is still ahead of them. `needed` is how many of the sittings still to be marked they must be present at to clear the threshold, and it is null both when they are already clear and when it is out of reach — read `percentage` before believing it. Defined entirely by the caller's own enrolment, so a key has nothing to be told here; `GET /courses/{courseId}/attendance` is the same figures for everybody taking a named course, and is what an app should read.",
    tag: "Attendance",
    scopes: [],
    actor: "session",
    input: "none",
  },
  {
    method: "GET",
    path: "/attendance/my-courses",
    procedure: "attendance.myCourses",
    summary: "List the courses the caller has registers for",
    description:
      "The courses the caller is the name on at least one sitting of — which is also the only thing that lets them mark anything, since the office clears several people to teach a course and picks one per lecture. Empty for anybody without a faculty profile, a key included; `GET /timetable/week?facultyId=…` names who is teaching what without needing a profile of its own.",
    tag: "Attendance",
    scopes: [],
    actor: "session",
    input: "none",
  },
];
