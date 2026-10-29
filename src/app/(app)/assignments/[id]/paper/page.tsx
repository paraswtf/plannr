import { TRPCError } from "@trpc/server";
import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PaperEditor } from "~/components/app/assignments/paper-editor";
import { ASSIGNMENT_TYPE_META } from "~/lib/assignments";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Question paper",
  description: "Write a test's question paper and see it typeset as you go.",
};

export default async function PaperPage({
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
  // Only whoever manages the test writes its paper, and only tests have one.
  if (
    assignment.role !== "manager" ||
    !ASSIGNMENT_TYPE_META[assignment.type].isTest
  ) {
    redirect(`/assignments/${id}`);
  }

  return (
    <PaperEditor
      assignmentId={id}
      type={assignment.type}
      title={assignment.title}
    />
  );
}
