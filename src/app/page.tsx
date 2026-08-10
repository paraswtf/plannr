import { redirect } from "next/navigation";

import { homeFor } from "~/lib/role-nav";
import { auth } from "~/server/auth";

/**
 * Placeholder root. The marketing landing lands here in a later milestone; for
 * now it just routes people to the right place.
 */
export default async function Home() {
  const session = await auth();
  redirect(
    session?.user ? homeFor(BigInt(session.user.permissions)) : "/login",
  );
}
