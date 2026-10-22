/**
 * The browser half of push, separated from the screen that uses it so the parts
 * that can be wrong (turning a key into bytes, deciding what the device can do)
 * are small functions with names rather than lines in an effect.
 */

/** What this device can do about notifications right now. */
export type PushSupport =
  /** No service worker or no PushManager: an old browser, or a private window. */
  | "unsupported"
  /** iPhones only allow push for a site added to the Home Screen. */
  | "install-first"
  /** The person said no, and only they can change that, in browser settings. */
  | "blocked"
  | "ready";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  // The worker is only registered in production (see ServiceWorker), so in
  // development there is nothing for `serviceWorker.ready` to ever resolve to.
  if (process.env.NODE_ENV !== "production") return "unsupported";
  const capable =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  if (!capable)
    return isAppleTouch() && !isInstalled() ? "install-first" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "ready";
}

const isAppleTouch = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * The VAPID public key as the bytes `PushManager.subscribe` wants.
 *
 * It travels as URL-safe base64 (`-` and `_`, no padding), which `atob` will not
 * read, so the alphabet is mapped back and the padding restored first.
 */
export function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The plain-object form of a subscription that the server stores. */
export function describe(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
    userAgent: navigator.userAgent.slice(0, 300),
  };
}

/** This browser's current subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * Asks permission, then subscribes. Permission is requested from a click
 * handler only: browsers ignore, and some penalise, a prompt nobody asked for.
 */
export async function subscribeThisBrowser(
  publicKey: string,
): Promise<PushSubscription | "denied"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const registration = await navigator.serviceWorker.ready;
  return (
    (await registration.pushManager.getSubscription()) ??
    registration.pushManager.subscribe({
      // Required by every browser: each message must show a notification.
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(publicKey),
    })
  );
}
