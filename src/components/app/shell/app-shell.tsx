"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "~/components/ui/avatar";
import { PlannrLogo } from "~/components/ui/brand";
import { IconButton, iconButtonClass } from "~/components/ui/button";
import { Icon, type IconName } from "~/components/ui/icon";
import { contactAddress, personName } from "~/lib/people";
import { navFor } from "~/lib/role-nav";
import { api } from "~/trpc/react";

/**
 * The frame every screen sits in.
 *
 * Three states, not two. On a phone there is no sidebar at all — a bar with a
 * hamburger, and the nav arrives as an overlay over the page, because 244px of
 * permanent chrome on a 390px screen leaves nothing to read. On a laptop the
 * sidebar is there, and can be folded to a rail of icons for the screens that
 * want the width: the timetable grid and the planner are wide by nature.
 *
 * The fold is remembered in a cookie rather than localStorage so the server
 * renders the sidebar the width it is about to be. Read from the browser after
 * paint, every navigation would start expanded and snap.
 */

interface AppShellProps {
  /** The user's permission bits, as a decimal string. */
  permissions: string;
  /** Every role held, shown under the institution name. */
  roleNames: string[];
  user: { name: string | null; email: string; image: string | null };
  orgName: string;
  /** The fold state the cookie was holding when the page was rendered. */
  defaultFolded?: boolean;
  children: React.ReactNode;
}

/** Name of the cookie the fold state lives in. Read in `(app)/layout.tsx`. */
export const NAV_COOKIE = "plannr-nav";

const FULL = 244;
const RAIL = 68;

export function AppShell({
  permissions,
  roleNames,
  user,
  orgName,
  defaultFolded = false,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  // Someone who teaches and coordinates sees the union of both, so the nav is
  // derived from what they can do rather than from a single role.
  const items = navFor(BigInt(permissions));

  // Read once, here, and handed to every place that shows it: the sidebar, the
  // phone's overlay and the phone's top bar would otherwise each poll for the
  // same number. A minute is soon enough for news that is also pushed, and
  // coming back to the tab asks again at once.
  const { data: unreadData } = api.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 60_000, refetchOnWindowFocus: true },
  );
  const unread = unreadData?.count ?? 0;

  const [folded, setFolded] = useState(defaultFolded);
  const [open, setOpen] = useState(false);
  const hamburger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Arriving somewhere is the end of using the menu. Without this the overlay
  // stays up over the page it was used to reach.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    // The page behind an overlay must not scroll under it, which on a phone is
    // otherwise what a finger drag on the backdrop does.
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = scroll;
      // Put the caret back where it was, or a keyboard lands at the top of the
      // document each time the menu is closed.
      hamburger.current?.focus();
    };
  }, [open]);

  const fold = (next: boolean) => {
    setFolded(next);
    document.cookie = `${NAV_COOKIE}=${next ? "folded" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* The bar that replaces the sidebar once there is no room for one. */}
      <header
        className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-2 px-3 backdrop-blur-md lg:hidden"
        style={{
          background: "var(--glass-white)",
          boxShadow: "0 1px 0 var(--hair)",
        }}
      >
        <IconButton
          ref={hamburger}
          icon="menu"
          label="Open the menu"
          variant="quiet"
          iconSize={18}
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-nav"
        />
        <Link href="/" className="flex min-w-0 items-center">
          <PlannrLogo height={24} wordmarkSize={17} />
        </Link>
        {/*
         * The bell is out here as well as in the menu, so news is seen
         * without opening anything: on a phone the sidebar is out of sight
         * until it is asked for.
         */}
        <Link
          href="/notifications"
          aria-label={notificationsLabel(unread)}
          title={notificationsLabel(unread)}
          aria-current={isNotifications(pathname) ? "page" : undefined}
          className={iconButtonClass("ghost", "md", "relative ml-auto")}
        >
          <Icon name="bell" size={18} stroke={1.85} />
          {unread > 0 && (
            <span
              aria-hidden
              className="bg-slate text-2xs absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full px-1 text-center leading-[18px] font-semibold text-white tabular-nums"
            >
              {countLabel(unread)}
            </span>
          )}
        </Link>
      </header>

      {/* The sidebar proper, from the breakpoint where it fits. */}
      <aside
        className="bg-surface sticky top-0 hidden h-screen shrink-0 flex-col gap-1 py-6 transition-[width] duration-200 lg:flex"
        style={{
          width: folded ? RAIL : FULL,
          paddingInline: folded ? 10 : 16,
          boxShadow: "inset -1px 0 0 var(--hair)",
        }}
      >
        <SidebarBody
          items={items}
          pathname={pathname}
          orgName={orgName}
          roleNames={roleNames}
          user={user}
          folded={folded}
          unread={unread}
          onFold={() => fold(!folded)}
        />
      </aside>

      {/* The same nav as an overlay, for the screens with no room beside it. */}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setOpen(false)}
            className="plr-fade fixed inset-0 z-40 cursor-default lg:hidden"
            style={{ background: "var(--scrim)" }}
          />
          <div
            id="app-nav"
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            // It slides in from the edge it lives at, all the way from off the
            // screen: a menu that faded in where it stands would be a panel
            // that appeared rather than one that came from somewhere.
            className="plr-drawer-in bg-surface fixed top-0 left-0 z-50 flex h-full w-[272px] max-w-[86vw] flex-col gap-1 overflow-y-auto px-4 py-5 outline-none lg:hidden"
            style={{ boxShadow: "var(--shadow-float)" }}
          >
            <div className="mb-6 flex items-center justify-between">
              <Link href="/" className="flex items-center">
                <PlannrLogo height={26} wordmarkSize={18} />
              </Link>
              <IconButton
                icon="x"
                label="Close the menu"
                variant="quiet"
                onClick={() => setOpen(false)}
              />
            </div>
            <SidebarBody
              items={items}
              pathname={pathname}
              orgName={orgName}
              roleNames={roleNames}
              user={user}
              folded={false}
              unread={unread}
            />
          </div>
        </>
      )}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * What the sidebar contains, drawn the same whether it is beside the page or
 * over it. Only the fold differs, and the overlay is never folded — it is
 * summoned deliberately and then wants to be read.
 */
function SidebarBody({
  items,
  pathname,
  orgName,
  roleNames,
  user,
  folded,
  unread,
  onFold,
}: {
  items: ReturnType<typeof navFor>;
  pathname: string;
  orgName: string;
  roleNames: string[];
  user: { name: string | null; email: string };
  folded: boolean;
  /** Notifications not yet opened, for the count beside the inbox link. */
  unread: number;
  /** Absent in the overlay, which has nothing to fold. */
  onFold?: () => void;
}) {
  return (
    <>
      {onFold && (
        <div
          className={`mb-6 flex items-center ${folded ? "justify-center" : "justify-between pl-2"}`}
        >
          {!folded && (
            <Link href="/" className="flex items-center rounded-[8px]">
              <PlannrLogo height={28} wordmarkSize={19} />
            </Link>
          )}
          <IconButton
            icon="panelFold"
            label={folded ? "Expand the sidebar" : "Fold the sidebar"}
            size="sm"
            onClick={onFold}
            className={folded ? "[&>svg]:rotate-180" : undefined}
          />
        </div>
      )}

      {/*
       * Where you are and as whom. It used to sit in a ringed box, which is the
       * shape of a workspace switcher, and nothing happens when it is clicked —
       * so it is now drawn as what it is, a line of identity, and the ring is
       * left for things that can be pressed. The folded rail leaves it out: a
       * building on its own would only repeat Setup's glyph and say nothing.
       */}
      {!folded && (
        <div className="mb-4 flex items-center gap-2.5 px-2 py-1">
          <span className="bg-tint text-slate flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] shadow-[inset_0_0_0_1px_var(--hair-soft)]">
            <Icon name="building" size={16} stroke={2} />
          </span>
          <span className="min-w-0">
            <span className="font-display text-title block truncate text-sm font-semibold">
              {orgName}
            </span>
            <span className="text-faint text-2xs block truncate">
              {roleNames.length > 0 ? roleNames.join(", ") : "No role"}
            </span>
          </span>
        </div>
      )}

      <nav className="flex flex-col gap-0.5">
        {items.map((item, index) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          // A hairline and a little air between the runs of the nav: your
          // own day, the work queues, the rooms, the institution, settings.
          const startsSection =
            index > 0 && items[index - 1]!.section !== item.section;
          return (
            <div key={item.href} className="contents">
              {startsSection && (
                <span
                  aria-hidden
                  className="mx-3 my-2 h-px shrink-0"
                  style={{ background: "var(--hair-soft)" }}
                />
              )}
              <Link
                href={item.href}
                // A folded rail has no label to read, so the name has to reach
                // a screen reader some other way.
                aria-label={folded ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                title={folded ? item.label : undefined}
                className={navLinkClass(active, folded)}
              >
                <NavIcon name={item.icon as IconName} active={active} />
                {!folded && <span className="truncate">{item.label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

      {/*
       * The inbox sits at the foot, just above whoever is signed in, rather
       * than among the screens: it is not somewhere you go to do a job, it is
       * what has happened to you, and it is the same for every role.
       */}
      <div className="mt-auto pt-4">
        <NotificationsLink
          pathname={pathname}
          folded={folded}
          unread={unread}
        />
      </div>

      <div
        className={`mt-2 flex items-center gap-2.5 pt-4 ${folded ? "flex-col" : "px-1"}`}
        style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
      >
        <span title={folded ? personName(user) : undefined} className="mt-4">
          <Avatar name={personName(user)} size={32} tone="solid" />
        </span>
        {!folded && (
          <span className="mt-4 min-w-0 flex-1">
            <span className="text-title block truncate text-sm font-semibold">
              {personName(user)}
            </span>
            <span className="text-faint text-2xs block truncate">
              {contactAddress(user.email)}
            </span>
          </span>
        )}
        <Link
          href="/api/auth/signout"
          title="Sign out"
          aria-label="Sign out"
          className={iconButtonClass("ghost", "sm", folded ? "" : "mt-4")}
        >
          <Icon name="logout" size={16} stroke={2} />
        </Link>
      </div>
    </>
  );
}

/** Under /notifications, the inbox and anything beneath it. */
function isNotifications(pathname: string) {
  return (
    pathname === "/notifications" || pathname.startsWith("/notifications/")
  );
}

/** What a badge can fit: the number, until it stops being worth counting. */
function countLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

function notificationsLabel(unread: number) {
  return unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
}

function navLinkClass(active: boolean, folded: boolean) {
  return `plr-clip group flex min-h-10 items-center gap-2.5 rounded-[10px] text-base font-semibold active:scale-[0.98] ${
    folded ? "justify-center px-0" : "px-3"
  } ${
    // The current screen is a wash of slate with slate ink, not a slate fill:
    // filled slate is the primary button's colour, and a nav that wore it on
    // every screen out-shouted the one action each screen is for.
    active
      ? "bg-tint-selected text-slate-ink shadow-[inset_0_0_0_1px_var(--hair-soft)]"
      : "text-muted hover:bg-tint-hover hover:text-title"
  }`;
}

function NavIcon({ name, active }: { name: IconName; active: boolean }) {
  return (
    <Icon
      name={name}
      size={18}
      stroke={active ? 2.1 : 1.85}
      className={
        active
          ? "text-slate"
          : "text-faint group-hover:text-muted transition-colors duration-150"
      }
    />
  );
}

/**
 * The inbox, drawn as one more nav link with the count after its label. The
 * folded rail has no room for a number, so it shows a dot on the bell and
 * leaves the number to the link's name.
 */
function NotificationsLink({
  pathname,
  folded,
  unread,
}: {
  pathname: string;
  folded: boolean;
  unread: number;
}) {
  const active = isNotifications(pathname);
  const label = notificationsLabel(unread);
  return (
    <Link
      href="/notifications"
      aria-label={folded || unread > 0 ? label : undefined}
      aria-current={active ? "page" : undefined}
      title={folded ? label : undefined}
      className={navLinkClass(active, folded)}
    >
      <span className="relative flex">
        <NavIcon name="bell" active={active} />
        {folded && unread > 0 && (
          <span
            aria-hidden
            className="bg-slate absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full shadow-[0_0_0_2px_var(--surface)]"
          />
        )}
      </span>
      {!folded && (
        <>
          <span className="truncate">Notifications</span>
          {unread > 0 && (
            <span
              aria-hidden
              className="bg-info-wash text-info text-2xs ml-auto rounded-[6px] px-1.5 py-0.5 font-mono leading-none font-semibold tabular-nums"
            >
              {countLabel(unread)}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
