import { type Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  COMPACT_COOKIE,
  TimetableView,
} from "~/components/app/timetable/timetable-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Timetable",
  description:
    "The whole campus timetable, room by room and hour by hour, with clashes called out.",
};

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/timetable")) redirect("/");

  const params = await searchParams;
  const date = params.date ? new Date(params.date) : new Date();
  // Read here rather than in the browser so the grid is rendered the shape it
  // is about to be: discovered after paint, a compact grid would draw full size
  // and then visibly collapse. Alongside the day rather than after it — neither
  // waits on the other.
  const [initial, jar] = await Promise.all([
    api.timetable.grid({ date }),
    cookies(),
  ]);

  return (
    <TimetableView
      initialDate={date.toISOString()}
      initial={initial}
      permissions={session.user.permissions}
      defaultCompact={jar.get(COMPACT_COOKIE)?.value === "on"}
    />
  );
}
