import { redirect } from "next/navigation";

/**
 * Where the push switch used to live. It moved into the Notifications tab
 * beside the inbox and the per-category choices, and this address is kept so
 * a bookmark or an old link still lands on it.
 */
export default function NotificationsSettingsPage() {
  redirect("/notifications?view=settings");
}
