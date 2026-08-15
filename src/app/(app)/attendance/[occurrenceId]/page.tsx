import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AttendanceView } from "~/components/app/attendance/attendance-view";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Attendance",
  description: "Mark and review attendance for a single lecture.",
};

/**
 * The register for one lecture. Reached by clicking a block on the timetable:
 * whoever can only mark attendance lands straight here, while a scheduler gets
 * the edit panel with this a button away.
 */
export default async function AttendancePage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bits = new PermissionBitField(BigInt(session.user.permissions));
  if (!bits.has(PermissionFlags.ViewAttendance)) redirect("/");

  const { occurrenceId } = await params;
  const [sitting, canMark] = await Promise.all([
    api.attendance.forOccurrence({ occurrenceId }),
    api.attendance.canMark({ occurrenceId }),
  ]);
  if (!sitting) notFound();

  return (
    <AttendanceView
      occurrenceId={occurrenceId}
      initial={sitting}
      canMark={canMark}
    />
  );
}
