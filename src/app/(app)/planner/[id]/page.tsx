import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { PlanWorkspace } from "~/components/app/planner/plan-workspace";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Schedule builder",
  description:
    "Draft next term's timetable and check it for clashes before anyone else sees it.",
};

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/planner")) redirect("/");

  const { id } = await params;
  return <PlanWorkspace planId={id} />;
}
