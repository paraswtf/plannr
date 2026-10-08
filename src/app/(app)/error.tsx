"use client";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";

/**
 * What a screen shows when rendering it throws.
 *
 * Without this, an error anywhere under the app frame took the frame with it
 * and left Next's bare error page, so a failed query on one screen looked
 * like the whole app had gone. The boundary sits inside the layout, so the
 * sidebar stays and the person can simply go somewhere else.
 *
 * The digest is shown because it is the only thing that connects what this
 * person saw to the server's log; read out to whoever runs Plannr, it finds
 * the stack trace that the browser is (rightly) never sent.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <PageHeader title="Something went wrong" />
      <PageBody width="narrow" className="flex flex-col gap-4">
        <Callout
          tone="bad"
          role="alert"
          title="This page did not load"
          action={
            <Button variant="secondary" size="sm" onClick={reset} icon="rotate">
              Try again
            </Button>
          }
        >
          Trying again usually fixes it. If it keeps happening, tell whoever
          runs Plannr at your college what you were doing.
        </Callout>
        {error.digest && (
          <p className="text-faint font-mono text-xs">
            Reference {error.digest}
          </p>
        )}
      </PageBody>
    </>
  );
}
