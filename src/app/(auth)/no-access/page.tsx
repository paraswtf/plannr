import { type Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StandalonePanel } from "~/components/app/shell/standalone-panel";
import { buttonClass } from "~/components/ui/button";
import { homeFor, navFor } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export const metadata: Metadata = { title: "No access yet" };

/**
 * Where somebody lands who is signed in but can open nothing.
 *
 * `homeFor` has always sent a person with no screens here, and until now there
 * was no page, so a signed-in account without a role met a 404 — which says
 * the link is broken, when the truth is that the account is waiting on an
 * administrator. Anybody who can open something is sent on to it instead, so
 * a stale bookmark to this page never strands a person who has been granted a
 * role since.
 */
export default async function NoAccessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const permissions = BigInt(session.user.permissions);
  if (navFor(permissions).length > 0) redirect(homeFor(permissions));

  return (
    <StandalonePanel
      title="No access yet"
      lede="You are signed in, but your account has not been given a role in Plannr. Ask the administrator at your college to add you, then sign in again."
      footer={session.user.email ?? undefined}
    >
      <Link
        href="/api/auth/signout"
        className={buttonClass("secondary", "lg", "w-full")}
      >
        Sign out
      </Link>
    </StandalonePanel>
  );
}
