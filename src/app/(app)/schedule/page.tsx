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

  const initial = await api.timetable.mySchedule({ date: new Date() });

  return (
    <ScheduleView initial={initial} permissions={session.user.permissions} />
  );
}
