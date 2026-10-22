"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Icon } from "~/components/ui/icon";

/**
 * Registers the service worker (`public/sw.js`) that lets Plannr open without a
 * network, and says so on screen when the network has gone.
 *
 * Production only. In development a worker holding last hour's build would
 * answer instead of the dev server, which is the confusing kind of stale; the
 * dev server's own hot reload is what is wanted there.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // `updateViaCache: "none"` makes the browser check for a new worker on
    // every load rather than trusting its HTTP cache for a day.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // No worker means no offline copy, not a broken app.
      });
  }, []);

  return <OfflineNotice />;
}

const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

/** True from the moment the browser reports no connection. */
function useOffline() {
  return useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    // The server cannot know, and a page that renders as online and corrects
    // itself is better than one that flashes a warning at everyone.
    () => false,
  );
}

function OfflineNotice() {
  const offline = useOffline();
  if (!offline) return null;

  return (
    <div
      role="status"
      className="plr-toast bg-surface fixed inset-x-4 bottom-4 z-40 flex items-center gap-2.5 rounded-[12px] px-4 py-2.5 shadow-[var(--ring),var(--shadow-md)] sm:inset-x-auto sm:bottom-8 sm:left-1/2 sm:-translate-x-1/2"
    >
      <Icon name="alert" size={18} stroke={2} className="text-muted" />
      <span className="text-title text-sm font-semibold">
        You&apos;re offline. Showing what was saved on this device.
      </span>
    </div>
  );
}
