import {
  badRequest,
  crossSite,
  inlineDisposition,
  sessionCaller,
  signedOut,
  textError,
} from "../_caller";

/**
 * POST /api/papers/print: the decrypted question paper, for its owner to
 * print. A form post (`assignmentId`, `password`) into a new tab, so the
 * password travels in a request body and never in a URL, and the PDF opens in
 * the browser's own viewer. Nothing decrypted is stored or cached.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** scrypt and typst both run here; see the tRPC route's note on the limit. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const refused = crossSite(request);
  if (refused) return refused;
  const trpc = await sessionCaller(request);
  if (!trpc) return signedOut();

  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest("Unlock the paper from its test's page in Plannr.");
    }
    const assignmentId = form.get("assignmentId");
    const password = form.get("password");
    if (typeof assignmentId !== "string" || typeof password !== "string") {
      throw badRequest(
        "Give the paper's password to unlock it. Try again from the test's page.",
      );
    }
    const { pdfBase64, fileName } = await trpc.papers.unlockPdf({
      assignmentId,
      password,
    });
    return new Response(Buffer.from(pdfBase64, "base64"), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": inlineDisposition(fileName),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return textError(error);
  }
}
