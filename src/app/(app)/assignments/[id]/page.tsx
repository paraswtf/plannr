import { TRPCError } from "@trpc/server";
import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AssignmentDetail } from "~/components/app/assignments/assignment-detail";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Assignment",
  description:
    "A test or a presentation: when and where it happens, and who is in it.",
};

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/assignments")) redirect("/");

  const { id } = await params;
  // A deleted assignment and an id that was never one are the same dead link.
  const assignment = await api.assignments
    .byId({ id })
    .catch((error: unknown) => {
      if (
        error instanceof TRPCError &&
        (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")
      ) {
        return null;
      }
      throw error;
    });
  if (!assignment) notFound();

  return (
    <AssignmentDetail
      id={id}
      initial={assignment}
      permissions={BigInt(session.user.permissions).toString()}
    />
  );
}
