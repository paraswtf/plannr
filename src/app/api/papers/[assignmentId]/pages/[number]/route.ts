import {
  sessionCaller,
  signedOut,
  textError,
  badRequest,
} from "../../../_caller";

/**
 * GET /api/papers/{assignmentId}/pages/{number}: one page of an open paper,
 * as an SVG image, for students of the group and whoever manages the test.
 *
 * Served only for `<img src>`. The policy below forbids scripts and outside
 * fetches even if somebody opens the URL directly, so the page can only ever
 * be a picture.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string; number: string }> },
) {
  const trpc = await sessionCaller(request);
  if (!trpc) return signedOut();
  const { assignmentId, number } = await params;

  try {
    if (!/^\d{1,5}$/.test(number)) {
      throw badRequest("Pages are numbered from 1.");
    }
    const { svg } = await trpc.submissions.page({
      assignmentId,
      number: Number(number),
    });
    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
        "x-content-type-options": "nosniff",
        // Private: the page depends on who asks, so no shared cache may keep it.
        "cache-control": "private, max-age=60",
      },
    });
  } catch (error) {
    return textError(error);
  }
}
