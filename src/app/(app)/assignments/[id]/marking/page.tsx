import { TRPCError } from "@trpc/server";
import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MarkingView } from "~/components/app/assignments/marking-view";
import { ASSIGNMENT_TYPE_META } from "~/lib/assignments";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Marking",
  description:
    "Every student's answers to a test, and the marks they are given.",
};

export default async function MarkingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/assignments")) redirect("/");

  const { id } = await params;
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
  // Only whoever manages the test marks it, and only tests answered in Plannr.
  if (
    assignment.role !== "manager" ||
    !ASSIGNMENT_TYPE_META[assignment.type].answeredInApp
  ) {
    redirect(`/assignments/${id}`);
  }

  return (
    <MarkingView
      assignmentId={id}
      type={assignment.type}
      title={assignment.title}
    />
  );
}
