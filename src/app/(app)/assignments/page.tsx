import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { AssignmentsView } from "~/components/app/assignments/assignments-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Assignments",
  description: "Tests and presentations set for your groups.",
};

export default async function AssignmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/assignments")) redirect("/");

  // The view tests the bits with PermissionBitField; passed as the decimal
  // string the session already holds them in.
  return <AssignmentsView permissions={session.user.permissions} />;
}
