import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { ApprovalsView } from "~/components/app/approvals/approvals-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Approvals",
  description:
    "Bookings and changes waiting for a decision, and what each one would collide with.",
};

export default async function ApprovalsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/approvals")) redirect("/");

  const initial = await api.events.approvalQueue();

  return <ApprovalsView initial={initial} />;
}
