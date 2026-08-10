import { redirect } from "next/navigation";

import { GroupsView } from "~/components/app/groups/groups-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export default async function GroupsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/groups")) redirect("/");

  return <GroupsView permissions={session.user.permissions} />;
}
