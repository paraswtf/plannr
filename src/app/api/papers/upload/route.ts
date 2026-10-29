import { NextResponse } from "next/server";

import { PAPER_MAX_BYTES } from "~/server/api/routers/papers";
import { errorResponse } from "~/server/rest/errors";
import {
  badRequest,
  crossSite,
  jsonError,
  sessionCaller,
  signedOut,
} from "../_caller";

/**
 * POST /api/papers/upload: a question paper's PDF, as multipart form data
 * (`assignmentId`, `password`, `file`, and `questionMarks` as JSON for tests
 * answered in Plannr, or `totalMarks` for one sat on paper).
 *
 * Multipart rather than base64 in JSON, so the browser sends the file as it
 * is; it becomes base64 only inside this process, to reach `papers.uploadPdf`,
 * which makes every decision.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** scrypt and typst both run here; see the tRPC route's note on the limit. */
export const maxDuration = 60;

/** The form's other fields and its framing, on top of the file itself. */
const FORM_MARGIN = 64 * 1024;

const tooLarge = () =>
  errorResponse(
    413,
    "PAYLOAD_TOO_LARGE",
    "The file is larger than 4 MB. Save a smaller copy and upload that.",
  );

export async function POST(request: Request) {
  const refused = crossSite(request);
  if (refused) return refused;

  // Refused before a byte of the body is read, when the browser says how big
  // it is. A body that lies about its length is still bounded below.
  const length = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(length) && length > PAPER_MAX_BYTES + FORM_MARGIN) {
    return tooLarge();
  }

  const trpc = await sessionCaller(request);
  if (!trpc) return signedOut();

  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest(
        "The upload did not arrive as a form. Choose the file again and upload it.",
      );
    }

    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value : null;
    };
    const assignmentId = field("assignmentId");
    const password = field("password");
    const file = form.get("file");
    if (!assignmentId || !password || !(file instanceof File)) {
      throw badRequest(
        "The upload needs the test, the paper's password and the file. Fill them in and try again.",
      );
    }
    if (file.size > PAPER_MAX_BYTES) return tooLarge();

    const numbers = (name: string) => {
      const raw = field(name);
      if (raw === null || raw.trim() === "") return undefined;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw badRequest(
          `The ${name === "questionMarks" ? "question marks" : "total marks"} could not be read. Enter them again.`,
        );
      }
    };

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await trpc.papers.uploadPdf({
      assignmentId,
      password,
      fileBase64: bytes.toString("base64"),
      fileName: file.name,
      // Shapes are the procedure's to check; a wrong one comes back as a 400.
      questionMarks: numbers("questionMarks") as number[] | undefined,
      totalMarks: numbers("totalMarks") as number | undefined,
    });
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
