import { type RouteDef } from "../types";

/**
 * Question papers.
 *
 * Every endpoint that takes a paper's password is `session`: only the teacher
 * who set the paper may open it, and only at a browser, so no key of any kind
 * reaches them, a personal one included. They name the screen to use. Seeing
 * whether a test has a paper, closing answers and removing an unopened paper
 * follow the assignment, like its other writes: `person`, so a service key,
 * which teaches nobody, is refused even when it holds ManageAllAssignments.
 */
const MANAGE: RouteDef["scopes"] = ["ManageOwnAssignments"];
const SCREEN =
  "Browser only, and only for the teacher who set the paper: it takes the paper's password, which is never sent from an app. Use the question paper card on the test's page in Plannr.";

export const paperRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/assignments/{id}/paper",
    procedure: "papers.status",
    params: { id: "assignmentId" },
    summary: "Get whether a test has a question paper and where it stands",
    description:
      "`paper` is null when there is none. `enabled` is false when question papers are not set up on this server. Never returns the paper itself.",
    tag: "Papers",
    scopes: MANAGE,
    actor: "person",
  },
  {
    method: "PUT",
    path: "/assignments/{id}/paper/authored",
    procedure: "papers.saveAuthored",
    params: { id: "assignmentId" },
    summary: "Save a question paper written in Plannr",
    description: `${SCREEN} The paper editor is at /assignments/{id}/paper.`,
    tag: "Papers",
    scopes: MANAGE,
    actor: "session",
  },
  {
    method: "POST",
    path: "/assignments/{id}/paper/upload",
    procedure: "papers.uploadPdf",
    params: { id: "assignmentId" },
    summary: "Save an uploaded PDF as the question paper",
    description: `${SCREEN} The browser uploads through POST /api/papers/upload (multipart, at most 4 MB).`,
    tag: "Papers",
    scopes: MANAGE,
    actor: "session",
  },
  {
    method: "POST",
    path: "/assignments/{id}/paper/preview",
    procedure: "papers.preview",
    params: { id: "assignmentId" },
    summary: "Typeset a question paper without saving it",
    description:
      "Returns `{ pdfBase64 }`: the `content` given, typeset without its answers, with the institution's header and footer. Nothing is stored. A POST because a paper is too long for a query string.",
    tag: "Papers",
    scopes: MANAGE,
    actor: "person",
  },
  {
    method: "POST",
    path: "/assignments/{id}/paper/unlock-for-editing",
    procedure: "papers.unlockForEditing",
    params: { id: "assignmentId" },
    summary: "Open a question paper written in Plannr for editing",
    description: `${SCREEN} Use Unlock to edit. Returns the content with its answers.`,
    tag: "Papers",
    scopes: MANAGE,
    actor: "session",
    dangerous: true,
  },
  {
    method: "POST",
    path: "/assignments/{id}/paper/unlock",
    procedure: "papers.unlockPdf",
    params: { id: "assignmentId" },
    summary: "Open a question paper's PDF for printing",
    description: `${SCREEN} Use Unlock to print, which opens the PDF through POST /api/papers/print.`,
    tag: "Papers",
    scopes: MANAGE,
    actor: "session",
    dangerous: true,
  },
  {
    method: "POST",
    path: "/assignments/{id}/paper/release",
    procedure: "papers.release",
    params: { id: "assignmentId" },
    summary: "Open a question paper to the test's students",
    description: `${SCREEN} Use Unlock and open to students. Online and in-class Plannr tests only; the group's students are told.`,
    tag: "Papers",
    scopes: MANAGE,
    actor: "session",
    dangerous: true,
  },
  {
    method: "POST",
    path: "/assignments/{id}/paper/close",
    procedure: "papers.close",
    params: { id: "assignmentId" },
    summary: "Stop answers to an open question paper",
    description:
      "Answers already begun count as handed in. Calling it again keeps the first close.",
    tag: "Papers",
    scopes: MANAGE,
    actor: "person",
    dangerous: true,
  },
  {
    method: "POST",
    path: "/assignments/{id}/paper/password",
    procedure: "papers.changePassword",
    params: { id: "assignmentId" },
    summary: "Change a question paper's password",
    description: `${SCREEN} Use Change password.`,
    tag: "Papers",
    scopes: MANAGE,
    actor: "session",
  },
  {
    method: "DELETE",
    path: "/assignments/{id}/paper",
    procedure: "papers.remove",
    params: { id: "assignmentId" },
    summary: "Remove a question paper that has not been opened to students",
    tag: "Papers",
    scopes: MANAGE,
    actor: "person",
    dangerous: true,
  },
];
