/**
 * What to tell a person when a request fails.
 *
 * The server's own refusals already read as sentences and are shown as they
 * are. Input the server's checks refused arrives with a message that is the
 * checks' report as JSON; the same report is sent flattened in
 * `data.zodError` (src/server/api/trpc.ts), and its messages are used instead,
 * joined into plain text. Screens should check the same limits before sending,
 * so this is the fallback, not the first line.
 */
export function errorMessage(
  error: unknown,
  fallback = "That did not work. Try again.",
): string {
  if (!error || typeof error !== "object") return fallback;

  const zod = (
    error as {
      data?: {
        zodError?: {
          formErrors?: string[];
          fieldErrors?: Record<string, string[] | undefined>;
        } | null;
      } | null;
    }
  ).data?.zodError;
  if (zod) {
    const lines = [
      ...(zod.formErrors ?? []),
      ...Object.values(zod.fieldErrors ?? {}).flatMap((list) => list ?? []),
    ].filter((line) => line.trim() !== "");
    if (lines.length > 0) return [...new Set(lines)].join(" ");
  }

  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string" || message.trim() === "") return fallback;
  // A report that was not flattened is still JSON: never show it as it is.
  const start = message.trimStart()[0];
  return start === "[" || start === "{" ? fallback : message;
}
