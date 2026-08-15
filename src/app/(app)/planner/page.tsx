import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { PlansView } from "~/components/app/planner/plans-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Schedule builder",
  description:
    "Draft next term's timetable and check it for clashes before anyone else sees it.",
};

export default async function PlannerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/planner")) redirect("/");

  return <PlansView permissions={session.user.permissions} />;
}
