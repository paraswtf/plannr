import type { ReactNode } from "react";

import { PlannrMark } from "~/components/ui/brand";

/**
 * The one white panel on the paper that the screens outside the app frame are
 * built from: signing in, a page that does not exist, an account with nothing
 * to open yet.
 *
 * They share it so they read as the same doorway. The mark sits above the
 * title rather than beside it, at a size that announces the app without
 * competing with the sentence the person actually came to read, and the
 * panel floats at the raised height — it is a thing laid on the paper, not a
 * section of a page.
 *
 * `min-h-[100dvh]` rather than `min-h-screen`: on a phone the panel is
 * centred in the space the browser's own bars actually leave, and does not
 * jump when the address bar slides away.
 */
export function StandalonePanel({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede?: ReactNode;
  children?: ReactNode;
  /** Small print under the panel's content, such as which accounts may sign in. */
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10 sm:px-6">
      <div
        className="bg-surface w-full max-w-[420px] rounded-[var(--radius-dialog)] px-6 py-8 sm:px-10 sm:py-10"
        style={{ boxShadow: "var(--ring), var(--shadow-md)" }}
      >
        <div className="mb-8 flex">
          <PlannrMark height={44} alt="Plannr" />
        </div>

        <h1 className="font-display text-title text-2xl font-semibold tracking-[-0.025em]">
          {title}
        </h1>
        {lede && <p className="text-muted mt-2.5 text-base">{lede}</p>}

        {children && <div className="mt-7">{children}</div>}

        {footer && (
          <p className="text-faint mt-7 text-center font-mono text-xs">
            {footer}
          </p>
        )}
      </div>
    </main>
  );
}
