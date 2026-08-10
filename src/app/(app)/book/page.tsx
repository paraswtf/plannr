import { redirect } from "next/navigation";

import { BookRoomView } from "~/components/app/booking/book-room-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(session.user.role, "/book")) redirect("/");

  const params = await searchParams;
  const [initial, groups, allFaculty] = await Promise.all([
    api.timetable.grid({ date: new Date() }),
    api.groups.list(),
    api.groups.facultyList(),
  ]);

  return (
    <BookRoomView
      initial={initial}
      groups={groups}
      allFaculty={allFaculty}
      role={session.user.role}
      preselectedRoomId={params.room}
    />
  );
}
