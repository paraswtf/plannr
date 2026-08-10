import { redirect } from "next/navigation";

import { ROLE_HOME } from "~/lib/role-nav";
import { auth } from "~/server/auth";

/**
 * Placeholder root. The marketing landing lands here in a later milestone; for
 * now it just routes people to the right place.
 */
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? ROLE_HOME[session.user.role] : "/login");
}
