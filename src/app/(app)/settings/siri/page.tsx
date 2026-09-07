import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { SiriView } from "~/components/app/siri/siri-view";
import { appUrl } from "~/env.js";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Siri",
  description:
    "Ask your phone when your next lecture is — a key, a shortcut, and then just ask.",
};

export default async function SiriPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/settings")) redirect("/");

  /*
   * No second permission check, unlike the API-keys screen next door.
   *
   * That one is behind `ManageRoles` because minting an institutional key is
   * granting authority over the college. This is the opposite: a personal key
   * grants nothing at all — its powers are the intersection of its scopes with
   * what its owner already holds, worked out live on every request — so the
   * only thing it can do is answer questions about the person who made it.
   * Anybody with a timetable may set up their own phone, and a student is the
   * person this screen was built for.
   */
  const keys = await api.apiKeys.mine();

  return (
    // The origin is read on the server because the page prints it into URLs a
    // person copies by hand onto a phone. Deriving it in the browser from
    // `window.location` would be right nearly always and quietly wrong behind
    // a tunnel or a preview deployment — which is exactly when somebody is
    // setting this up for the first time.
    <SiriView keys={keys} origin={appUrl} />
  );
}
