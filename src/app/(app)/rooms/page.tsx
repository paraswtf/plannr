import { redirect } from "next/navigation";

import { RoomsView } from "~/components/app/rooms/rooms-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function RoomsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/rooms")) redirect("/");

  const initial = await api.timetable.grid({ date: new Date() });

  return <RoomsView initial={initial} />;
}
