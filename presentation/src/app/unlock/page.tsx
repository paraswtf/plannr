import { type Metadata } from "next";

import { deckSecret, safeNext } from "~/lock/totp";
import { PlannrMark } from "~/ui/brand";

export const metadata: Metadata = { title: "Presenting Plannr" };

const MESSAGES: Record<string, string> = {
  code: "That code didn't match. Try the one showing now.",
  used: "That code has just been used. Try the next one your app shows.",
  wait: "Too many tries. Wait a few minutes, then try the code showing now.",
  setup:
    "This server has no secret yet. Set DECK_TOTP_SECRET (npm run lock:setup) and restart it.",
};

/**
 * Where a locked browser lands (see src/middleware.ts). A plain form that
 * posts to /api/unlock: the deck's scripts stay behind the lock, and this page
 * works without them. Its one line of script carries the slide in the address
 * (/#combined), which never reaches the server, onto the form's address; the
 * browser keeps it through the redirects, so the deck opens on that slide.
 */
export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const message = !deckSecret()
    ? MESSAGES.setup
    : error
      ? (MESSAGES[error] ?? MESSAGES.code)
      : null;
  return (
    <main
      className="font-body text-fg fixed inset-0 flex items-center justify-center px-6"
      style={{ background: "var(--bg)" }}
    >
      <form
        id="unlock"
        method="post"
        action="/api/unlock"
        className="flex w-full max-w-[420px] flex-col items-center text-center"
      >
        <PlannrMark height={44} />
        <h1 className="font-display mt-7 text-[34px] leading-tight font-semibold tracking-[-0.02em]">
          Presenting Plannr
        </h1>
        <p className="text-muted mt-2 text-[17px] leading-relaxed">
          Enter the code from your authenticator app. This browser stays
          unlocked after.
        </p>
        <input type="hidden" name="next" value={safeNext(next)} />
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="000000"
          aria-label="Six-digit code"
          aria-invalid={message ? true : undefined}
          className="bg-raised text-fg placeholder:text-faint mt-8 w-full rounded-[22px] px-6 py-5 text-center font-mono text-[40px] font-semibold tracking-[0.35em] tabular-nums outline-none"
          style={{
            boxShadow: message
              ? "inset 0 0 0 1.5px var(--accent), var(--shadow-2)"
              : "inset 0 0 0 1px var(--line), var(--shadow-2)",
          }}
        />
        <button
          type="submit"
          className="bg-fg text-bg mt-4 w-full cursor-pointer rounded-[22px] py-4 text-[18px] font-semibold"
        >
          Unlock
        </button>
        <p
          role="status"
          className="mt-4 min-h-[24px] text-[16px]"
          style={{ color: "var(--accent)" }}
        >
          {message}
        </p>
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById("unlock").action += location.hash;`,
        }}
      />
    </main>
  );
}
