import { TRPCError } from "@trpc/server";
import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AnswerView } from "~/components/app/assignments/answer-view";
import { ASSIGNMENT_TYPE_META } from "~/lib/assignments";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Answer the test",
  description: "Read the paper and answer it while it is open.",
};

export default async function AnswerPage({
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
  // Only students of the group answer, and only tests answered in Plannr.
  if (
    assignment.role !== "student" ||
    !ASSIGNMENT_TYPE_META[assignment.type].answeredInApp
  ) {
    redirect(`/assignments/${id}`);
  }

  return (
    <AnswerView
      assignmentId={id}
      type={assignment.type}
      title={assignment.title}
    />
  );
}
