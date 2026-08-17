import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ScheduleView } from "~/components/app/schedule/schedule-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Schedule",
  description:
    "Your day, in the order it happens — the classes you attend, the ones you take, or both.",
};

export default async function SchedulePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/schedule")) redirect("/");

  // No date: the screen opens on the day of the next class rather than on
  // today, so an evening or a weekend shows the day being asked about instead
  // of an empty one. A class in progress — or one that ended in the last half
  // hour — counts as that next class, which is what keeps the day still while
  // somebody is in it or has just left it. The server sends back which day it
  // chose as `from`; `Today` in the day navigator always goes back to today.
  const initial = await api.timetable.mySchedule({});

  return (
    <ScheduleView initial={initial} permissions={session.user.permissions} />
  );
}
