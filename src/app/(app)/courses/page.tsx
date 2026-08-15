import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { CourseCatalogue } from "~/components/app/courses/course-catalogue";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Courses",
  description:
    "Every subject taught this semester, who may teach it and which groups sit for it.",
};

export default async function CoursesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/courses")) redirect("/");

  const catalogue = await api.courses.list({});

  return (
    <CourseCatalogue
      initial={catalogue}
      canManage={new PermissionBitField(BigInt(session.user.permissions)).has(
        PermissionFlags.ManageGroups,
      )}
    />
  );
}
