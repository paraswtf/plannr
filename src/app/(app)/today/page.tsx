import { redirect } from "next/navigation";

import { TodayView } from "~/components/app/today/today-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/today")) redirect("/");

  const initial = await api.timetable.myDay({ date: new Date() });
  const firstName = (session.user.name ?? session.user.email ?? "there").split(
    " ",
  )[0]!;

  return <TodayView initial={initial} firstName={firstName} />;
}
