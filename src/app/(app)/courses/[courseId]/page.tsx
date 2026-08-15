import { TRPCError } from "@trpc/server";
import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CourseDetail } from "~/components/app/courses/course-detail";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Course",
  description:
    "Who may teach a course, which groups take it, and when it meets.",
};

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/courses")) redirect("/");

  const { courseId } = await params;
  // A course that has gone, and an id that was never one, are the same dead
  // link to whoever followed it — both belong on the 404 page rather than the
  // error boundary.
  const course = await api.courses
    .byId({ courseId })
    .catch((error: unknown) => {
      if (
        error instanceof TRPCError &&
        (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")
      ) {
        return null;
      }
      throw error;
    });
  if (!course) notFound();

  return (
    <CourseDetail
      courseId={courseId}
      initial={course}
      canManage={new PermissionBitField(BigInt(session.user.permissions)).has(
        PermissionFlags.ManageGroups,
      )}
    />
  );
}
