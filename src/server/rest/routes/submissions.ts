import { type RouteDef } from "../types";

/**
 * Answers to tests taken in Plannr, and their marks.
 *
 * Answering is `session`: it is a student at the answer screen, inside the
 * test's window, and no key of any kind answers for them. The reads are
 * `person`, so a student's own key can see their marks once published.
 * Marking and publishing follow the assignment, like its other writes, and
 * are `person` like them: a service key teaches nobody, so it cannot mark.
 */
const MANAGE: RouteDef["scopes"] = ["ManageOwnAssignments"];
const ANSWER_SCREEN =
  "Browser only: a student answers at the test's page in Plannr, during the test, and no key answers for them.";

export const submissionRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/assignments/{id}/submission",
    procedure: "submissions.mine",
    params: { id: "assignmentId" },
    summary: "Get your own answers to a test, its window and answer sheet",
    description:
      "For a student of the test's group. `marks`, `score` and `feedback` are null until the teacher publishes the marks.",
    tag: "Submissions",
    scopes: [],
    actor: "person",
  },
  {
    method: "POST",
    path: "/assignments/{id}/submission/start",
    procedure: "submissions.start",
    params: { id: "assignmentId" },
    summary: "Begin answering a test",
    description: ANSWER_SCREEN,
    tag: "Submissions",
    scopes: [],
    actor: "session",
  },
  {
    method: "PUT",
    path: "/assignments/{id}/submission/answers",
    procedure: "submissions.save",
    params: { id: "assignmentId" },
    summary: "Save answers to a test so far",
    description: `${ANSWER_SCREEN} The answers sent are merged into those saved, question by question; send a key with an empty value to clear it.`,
    tag: "Submissions",
    scopes: [],
    actor: "session",
  },
  {
    method: "POST",
    path: "/assignments/{id}/submission/submit",
    procedure: "submissions.submit",
    params: { id: "assignmentId" },
    summary: "Hand in answers to a test",
    description: ANSWER_SCREEN,
    tag: "Submissions",
    scopes: [],
    actor: "session",
  },
  {
    method: "GET",
    path: "/assignments/{id}/paper/released",
    procedure: "submissions.paper",
    params: { id: "assignmentId" },
    summary: "Get an open paper's questions and answer sheet",
    description:
      "For students of the group once the paper is open, and for whoever manages the test. `releasedQuestions` is null for an uploaded paper, which is read from its pages. Answers are never included.",
    tag: "Submissions",
    scopes: [],
    actor: "person",
  },
  {
    method: "GET",
    path: "/assignments/{id}/paper/pages/{number}",
    procedure: "submissions.page",
    params: { id: "assignmentId" },
    summary: "Get one page of an open paper as SVG text",
    description:
      "Returns `{ svg }`. Show it as an image, never as markup; the browser loads pages from GET /api/papers/{assignmentId}/pages/{number}, which serves the image itself.",
    tag: "Submissions",
    scopes: [],
    actor: "person",
  },
  {
    method: "GET",
    path: "/assignments/{id}/paper/pdf",
    procedure: "submissions.pdf",
    params: { id: "assignmentId" },
    summary: "Get an open paper's PDF",
    description:
      "Returns `{ pdfBase64, fileName }`, once the paper is open, for students of the group and whoever manages the test.",
    tag: "Submissions",
    scopes: [],
    actor: "person",
  },
  {
    method: "GET",
    path: "/assignments/{id}/submissions",
    procedure: "submissions.roster",
    params: { id: "assignmentId" },
    summary: "List the group's students and how far each got with a test",
    description:
      "`status` is one of `not started`, `in progress`, `submitted` and `handed in at the close` (begun, and the window is over).",
    tag: "Submissions",
    scopes: MANAGE,
    actor: "person",
  },
  {
    method: "GET",
    path: "/submissions/{submissionId}",
    procedure: "submissions.byId",
    summary: "Get one student's answers with the answer sheet and key",
    description:
      "`autoMarks` is what the key gives each choice question that was answered; text answers are left for the teacher.",
    tag: "Submissions",
    scopes: MANAGE,
    actor: "person",
  },
  {
    method: "PUT",
    path: "/submissions/{submissionId}/marks",
    procedure: "submissions.mark",
    summary: "Mark one student's answers",
    description:
      "`marks` is keyed by question, each at most what the question is worth; the score is their sum. Students see it once the marks are published.",
    tag: "Submissions",
    scopes: MANAGE,
    actor: "person",
  },
  {
    method: "POST",
    path: "/assignments/{id}/marks/publish",
    procedure: "submissions.publish",
    params: { id: "assignmentId" },
    summary: "Publish a test's marks to its students",
    description:
      "Every student who answered is told. Publishing again keeps the first date.",
    tag: "Submissions",
    scopes: MANAGE,
    actor: "person",
    dangerous: true,
  },
];
