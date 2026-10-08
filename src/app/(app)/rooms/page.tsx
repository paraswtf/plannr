import { type Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ROOMS_VIEW_COOKIE,
  roomsLayoutFrom,
} from "~/components/app/rooms/room-vocab";
import { RoomsView } from "~/components/app/rooms/rooms-view";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Rooms",
  description:
    "Every room on campus: what it seats, what it has and when it is free.",
};

export default async function RoomsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/rooms")) redirect("/");

  // The layout is read here rather than in the browser so the list is rendered
  // the shape it is about to be: the rooms below are server-rendered from
  // `initial`, and a choice discovered after paint would relayout every one of
  // them. Alongside the grid rather than after it — neither waits on the other.
  const [initial, jar] = await Promise.all([
    api.timetable.grid({ date: new Date() }),
    cookies(),
  ]);

  return (
    <RoomsView
      initial={initial}
      permissions={session.user.permissions}
      defaultLayout={roomsLayoutFrom(jar.get(ROOMS_VIEW_COOKIE)?.value)}
    />
  );
}
