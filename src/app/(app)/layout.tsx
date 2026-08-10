import { redirect } from "next/navigation";

import { AppShell } from "~/components/app/shell/app-shell";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { HydrateClient } from "~/trpc/server";

/**
 * The real session gate. Middleware only checks for a cookie; this runs in Node,
 * sees the actual session, and is the boundary every app page sits behind.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isActive) redirect("/login?error=AccessDenied");

  const org = await db.organization.findUnique({
    where: { id: session.user.orgId },
    select: { name: true },
  });

  return (
    <HydrateClient>
      <AppShell
        role={session.user.role}
        orgName={org?.name ?? "Plannr"}
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? "",
          image: session.user.image ?? null,
        }}
      >
        {children}
      </AppShell>
    </HydrateClient>
  );
}
