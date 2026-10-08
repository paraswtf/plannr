import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { StandalonePanel } from "~/components/app/shell/standalone-panel";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { env } from "~/env";
import { homeFor } from "~/lib/role-nav";
import { auth, signIn } from "~/server/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in with your college Google account to reach your timetable, room bookings and attendance.",
};

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: `Plannr is limited to @${env.GOOGLE_WORKSPACE_DOMAIN} accounts. Sign in with your college Google account.`,
  Configuration:
    "Sign-in is not configured correctly. Please contact the administrator.",
  Verification: "That sign-in link has expired. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user) {
    redirect(params.callbackUrl ?? homeFor(BigInt(session.user.permissions)));
  }

  const error = params.error
    ? (ERROR_MESSAGES[params.error] ??
      "Sign-in did not finish. Try again, or ask the administrator if it keeps happening.")
    : null;

  return (
    <StandalonePanel
      title="Sign in to Plannr"
      lede="Timetables, room bookings and clash-free scheduling for the whole campus."
      // The rule about which accounts may sign in is said once: by the error
      // when there is one, and by this line when there is not.
      footer={
        error ? undefined : `@${env.GOOGLE_WORKSPACE_DOMAIN} accounts only`
      }
    >
      {error && (
        <Callout tone="bad" role="alert" className="mb-5">
          {error}
        </Callout>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", {
            redirectTo: params.callbackUrl ?? "/",
          });
        }}
      >
        <Button type="submit" variant="primary" size="lg" block>
          {/*
           * Google's mark keeps its own four colours, on a white disc so they
           * are not laid straight onto slate, where the blue all but vanished.
           */}
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
            <GoogleMark />
          </span>
          Continue with Google
        </Button>
      </form>
    </StandalonePanel>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C33.6 6.1 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C33.6 6.1 29 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c4.9 0 9.4-1.9 12.8-5l-5.9-5c-2 1.5-4.5 2.4-6.9 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l5.9 5c-.4.4 6.9-5 6.9-15 0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
