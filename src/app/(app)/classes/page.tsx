import { redirect } from "next/navigation";

import { ClassesView } from "~/components/app/classes/classes-view";
import { addDays, startOfLocalDay } from "~/lib/dates";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function ClassesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(session.user.role, "/classes")) redirect("/");

  const now = new Date();
  const initialDay = await api.timetable.myDay({ date: now });

  // Monday-anchored week around today.
  const timeZone = initialDay.timeZone;
  const today = startOfLocalDay(now, timeZone);
  const weekdayIndex = (today.getDay() + 6) % 7;
  const from = addDays(today, -weekdayIndex, timeZone);
  const to = addDays(from, 7, timeZone);

  const initialWeek = await api.timetable.myWeek({ from, to });

  return (
    <ClassesView
      initialDay={initialDay}
      initialWeek={initialWeek}
      weekFrom={from.toISOString()}
      weekTo={to.toISOString()}
    />
  );
}
