import { redirect } from "next/navigation";

import { TimetableView } from "~/components/app/timetable/timetable-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(session.user.role, "/timetable")) redirect("/");

  const params = await searchParams;
  const date = params.date ? new Date(params.date) : new Date();
  const initial = await api.timetable.grid({ date });

  return (
    <TimetableView
      initialDate={date.toISOString()}
      initial={initial}
      role={session.user.role}
    />
  );
}
