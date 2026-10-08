import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import { AppShell, NAV_COOKIE } from "~/components/app/shell/app-shell";
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

  // Read here rather than in the browser so the sidebar is rendered the width
  // it is about to be; discovered after paint, every page would start wide and
  // visibly snap shut.
  const folded = (await cookies()).get(NAV_COOKIE)?.value === "folded";

  return (
    <HydrateClient>
      <AppShell
        defaultFolded={folded}
        permissions={session.user.permissions}
        roleNames={session.user.roles.map((r) => r.name)}
        orgName={org?.name ?? "Plannr"}
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? "",
          image: session.user.image ?? null,
        }}
      >
        {children}
      </AppShell>
      {/*
       * Where the app's toasts land. It belongs here rather than in the root
       * layout because every screen that raises one is behind this gate, and
       * because the sign-in pages have their own way of reporting themselves.
       *
       * It was missing until now, which meant `toast()` — already called by the
       * calendar sync panel — resolved to nothing at all: sonner drops a toast
       * with no `Toaster` mounted to receive it, silently and without warning.
       */}
      <Toaster
        position="bottom-right"
        closeButton
        // Sonner draws its own card; these bring it into the house style — the
        // body face, the raised height of a popover, a hairline ring for an
        // edge — so a toast reads as part of the app rather than a library's
        // default sitting on top of it.
        toastOptions={{
          style: {
            fontFamily: "var(--font-body)",
            fontSize: "13px",
            color: "var(--app-ink)",
            borderRadius: "12px",
            border: "none",
            boxShadow: "var(--ring), var(--shadow-md)",
          },
        }}
      />
    </HydrateClient>
  );
}
