/*
 * Plannr's service worker: the part of the PWA that makes the app open, and
 * show the last thing it knew, with no network.
 *
 * Plain JavaScript in /public rather than a build plugin's output, so what runs
 * in the browser is exactly what is written here, and it can be read top to
 * bottom. It is served from the site root (see next.config.js) so its scope is
 * the whole app.
 *
 * It also receives push messages (a class moved, was cancelled, was added) and
 * turns them into notifications, whether or not Plannr is open at the time;
 * that is the part of the platform a web page alone cannot do.
 *
 * Three caches, three jobs:
 *
 *   static  hashed build files, icons and fonts. They never change under the
 *           same URL, so they are served from the cache and refreshed behind.
 *   pages   the HTML and React Server Component payload of each screen the
 *           person has opened, network first: online they always get the live
 *           screen, offline they get the last one they saw.
 *   data    tRPC queries (GET /api/trpc/...), network first for the same reason.
 *
 * What is cached belongs to one person: their schedule, their registers. So
 * every cache except the static one is emptied the moment a sign-in or sign-out
 * passes through here, and nobody inherits the previous person's screens on a
 * shared lab machine. Writes (POST) are never cached and never replayed: a
 * booking that was not sent is not pretended to have been.
 */

const VERSION = "v1";
const STATIC = `plannr-static-${VERSION}`;
const PAGES = `plannr-pages-${VERSION}`;
const DATA = `plannr-data-${VERSION}`;
const CURRENT = [STATIC, PAGES, DATA];

/** Past this many entries the oldest are dropped, so the cache cannot grow forever. */
const LIMITS = { [PAGES]: 40, [DATA]: 120, [STATIC]: 200 };

/** How long a slow network gets before a cached copy is shown instead. */
const SLOW_MS = 4000;

const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/logo.svg",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // A new version leaves no old cache behind.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith("plannr-") && !CURRENT.includes(name),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Forgets everything that belonged to a person. The static cache is shared. */
function clearPrivate() {
  return Promise.all([caches.delete(PAGES), caches.delete(DATA)]);
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "plannr:clear") event.waitUntil(clearPrivate());
});

/** Drops the oldest entries once a cache is over its limit. */
async function trim(name) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  const extra = keys.length - (LIMITS[name] ?? 100);
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

/** Only a real answer from this site is worth keeping. */
function cacheable(response) {
  return (
    response &&
    response.status === 200 &&
    response.type === "basic" &&
    // A bounce to the sign-in page is the absence of a screen, not a screen.
    !response.redirected
  );
}

async function store(name, request, response) {
  if (!cacheable(response)) return;
  const cache = await caches.open(name);
  await cache.put(request, response);
  await trim(name);
}

/**
 * The live answer when there is one, the last one saved when there is not.
 * When a copy exists, a network that has not answered in `SLOW_MS` loses to it,
 * so a weak signal in a corridor shows the saved screen instead of a spinner.
 */
async function networkFirst(event, name, { fallback } = {}) {
  const { request } = event;
  const cache = await caches.open(name);

  const network = fetch(request).then((response) => {
    // `clone()` before the body is read: the browser gets one stream, the
    // cache the other.
    event.waitUntil(store(name, request, response.clone()));
    return response;
  });

  try {
    const cached = await cache.match(request, { ignoreVary: true });
    if (!cached) return await network;
    return await Promise.race([
      network,
      new Promise((resolve) => setTimeout(() => resolve(cached), SLOW_MS)),
    ]);
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    if (fallback) return fallback();
    return Response.error();
  }
}

/** The saved copy at once, refreshed behind it for next time. */
async function staleWhileRevalidate(event, name) {
  const { request } = event;
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      event.waitUntil(store(name, request, response.clone()));
      return response;
    })
    .catch(() => undefined);
  if (cached) return cached;
  return (await refresh) ?? Response.error();
}

/** Build output is content-hashed: if it is saved, it is right. */
async function cacheFirst(event, name) {
  const { request } = event;
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  event.waitUntil(store(name, request, response.clone()));
  return response;
}

const offlinePage = async () =>
  (await caches.match(OFFLINE_URL)) ??
  new Response("You are offline.", { status: 503 });

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Signing in or out changes whose screens these are. Forget them first and
  // let the request carry on untouched.
  if (
    url.pathname.startsWith("/api/auth/signout") ||
    url.pathname.startsWith("/api/auth/callback") ||
    url.pathname.startsWith("/api/auth/signin")
  ) {
    event.waitUntil(clearPrivate());
    return;
  }

  // Writes always go to the network; so does everything that is not a read.
  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/api/trpc/")) {
    event.respondWith(networkFirst(event, DATA));
    return;
  }

  // Auth, the REST API, the calendar hand-off and the cron are never kept.
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(event, STATIC));
    return;
  }

  // A page, or the payload the router fetches when moving between pages.
  if (request.mode === "navigate" || request.headers.get("RSC")) {
    event.respondWith(
      networkFirst(event, PAGES, {
        fallback: request.mode === "navigate" ? offlinePage : undefined,
      }),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/image") ||
    ["image", "font", "style", "manifest"].includes(request.destination)
  ) {
    event.respondWith(staleWhileRevalidate(event, STATIC));
  }
});

// ─── Push ───────────────────────────────────────────────────────────────────
//
// The server sends an encrypted message through the browser vendor's push
// service; the browser wakes this worker with it even if every Plannr tab is
// closed. The payload is `{ title, body, url, tag, kind }`.

const FALLBACK_URL = "/schedule";

/** Only ever a path on this site: a payload cannot send anyone elsewhere. */
function targetOf(raw) {
  try {
    const url = new URL(raw || FALLBACK_URL, self.location.origin);
    return url.origin === self.location.origin
      ? url.href
      : new URL(FALLBACK_URL, self.location.origin).href;
  } catch {
    return new URL(FALLBACK_URL, self.location.origin).href;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Plannr", {
      body: data.body || "",
      icon: "/web-app-manifest-192x192.png",
      badge: "/favicon-96x96.png",
      // Same tag, one notification: a change sent twice is shown once.
      tag: data.tag || undefined,
      data: { url: targetOf(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || targetOf(FALLBACK_URL);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse a window that is already open rather than stacking another.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
