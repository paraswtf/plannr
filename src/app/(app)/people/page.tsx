import { redirect } from "next/navigation";

import { PeopleView } from "~/components/app/people/people-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export default async function PeoplePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/people")) redirect("/");

  return <PeopleView permissions={session.user.permissions} />;
}
