import webpush from "web-push";

import { env } from "~/env";

/**
 * Push is on only when the deployment has a VAPID key pair and a contact. Off,
 * nothing is offered to anybody and nothing is queued, so a deployment that has
 * not set it up carries no half-working feature.
 */
export const pushEnabled = () =>
  Boolean(
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY &&
    env.VAPID_SUBJECT,
  );

let configured = false;

/** The `web-push` client, told once who this server is. */
export function webPush(): typeof webpush {
  if (!pushEnabled()) throw new Error("Push notifications are not configured.");
  if (!configured) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT!,
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return webpush;
}
