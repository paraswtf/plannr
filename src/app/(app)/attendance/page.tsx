import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { AttendanceOverview } from "~/components/app/attendance/attendance-overview";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Attendance",
  description:
    "Your attendance course by course, and the registers for the courses you teach.",
};

/**
 * Both halves are fetched, because both can belong to one person: an
 * administrator who also studies, or a lecturer taking a subject. Neither read
 * costs anything when it comes back empty, and which half is shown is decided on
 * the client from what actually arrived.
 */
export default async function AttendancePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/attendance")) redirect("/");

  const bits = new PermissionBitField(BigInt(session.user.permissions));
  const mine = await api.attendance.mine();

  // Reading a roster is a stronger right than reading your own row, and a
  // faculty profile alone does not grant it.
  const courses = bits.has(PermissionFlags.ViewAttendance)
    ? await api.attendance.myCourses()
    : [];
  const teaching = await Promise.all(
    courses.map((course) => api.attendance.forCourse({ courseId: course.id })),
  );

  return <AttendanceOverview mine={mine} teaching={teaching} />;
}
