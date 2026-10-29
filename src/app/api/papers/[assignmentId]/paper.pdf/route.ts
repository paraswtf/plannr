import {
  inlineDisposition,
  sessionCaller,
  signedOut,
  textError,
} from "../../_caller";

/**
 * GET /api/papers/{assignmentId}/paper.pdf: an open paper's PDF, for students
 * of the group and whoever manages the test. `submissions.pdf` decides who;
 * this only serves the bytes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const trpc = await sessionCaller(request);
  if (!trpc) return signedOut();
  const { assignmentId } = await params;

  try {
    const { pdfBase64, fileName } = await trpc.submissions.pdf({
      assignmentId,
    });
    return new Response(Buffer.from(pdfBase64, "base64"), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": inlineDisposition(fileName),
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=60",
      },
    });
  } catch (error) {
    return textError(error);
  }
}
