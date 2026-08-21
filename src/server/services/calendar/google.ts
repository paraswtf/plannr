/**
 * The Google Calendar and OAuth endpoints we use, over plain `fetch`.
 *
 * Deliberately not the `googleapis` package. We call six endpoints; that
 * library brings a discovery layer and every Google API with it, which is tens
 * of megabytes to cold-start a serverless function that wanted one POST.
 *
 * Every call funnels through `request` so that the one thing that genuinely
 * matters — telling apart "try again in a minute" from "this person has
 * withdrawn consent and no amount of retrying will help" — is decided once.
 */

import { appUrl, env } from "~/env";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/**
 * The one scope this feature asks for.
 *
 * `calendar.app.created` — not `calendar` or `calendar.events` — restricts us
 * to calendars this application itself created. We literally cannot read or
 * write the personal calendar somebody signs in with, which is a far easier
 * permission to grant and a far smaller thing to get wrong.
 */
export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";

/**
 * Why a call failed, in the only two senses the drain cares about.
 *
 * `permanent` means stop: consent withdrawn, the calendar deleted underneath
 * us, a malformed request that will be just as malformed next time. Retrying
 * those is how a queue turns into a loop that never drains.
 */
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "GoogleError";
  }
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

/** Where Google sends somebody back to after they consent. */
export function redirectUri(): string {
  return `${appUrl}/api/calendar/callback`;
}

/**
 * The consent screen URL.
 *
 * `access_type=offline` with `prompt=consent` is what makes Google hand back a
 * refresh token. Without both, a second connection attempt returns an access
 * token only and the sync dies quietly an hour later — Google issues the
 * refresh token on *first* consent and never again, so re-consent is the only
 * way to be sure we have one.
 *
 * `include_granted_scopes` keeps this incremental: the sign-in scopes the
 * person already granted are carried over rather than replaced.
 */
export function consentUrl(state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: env.AUTH_GOOGLE_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    // `invalid_grant` is the one that matters: the refresh token is dead —
    // revoked, expired after six months idle, or the password was changed.
    // Nothing but a fresh consent brings it back.
    const permanent =
      response.status === 400 || response.status === 401
        ? text.includes("invalid_grant") || text.includes("invalid_client")
        : false;
    throw new GoogleError(
      `Google token endpoint refused (${response.status}): ${text.slice(0, 200)}`,
      response.status,
      permanent,
    );
  }
  return JSON.parse(text) as TokenResponse;
}

/** Trades the one-time code from the consent redirect for tokens. */
export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({
    code,
    client_id: env.AUTH_GOOGLE_ID,
    client_secret: env.AUTH_GOOGLE_SECRET,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
}

export function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: env.AUTH_GOOGLE_ID,
    client_secret: env.AUTH_GOOGLE_SECRET,
    grant_type: "refresh_token",
  });
}

/**
 * Hands the refresh token back to Google on disconnect.
 *
 * Politeness with teeth: without this, revoking in Plannr would leave a live
 * standing permission on Google's side that our UI claims is gone. Best effort
 * — if it fails we still forget the token locally, which is the part we can
 * actually guarantee.
 */
export async function revokeToken(refreshToken: string): Promise<void> {
  await fetch(OAUTH_REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }).toString(),
  }).catch(() => undefined);
}

/** Reads the Google account id and address out of the id token. */
export function identityFromIdToken(
  idToken: string,
): { sub: string; email: string } | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { sub?: string; email?: string };
    if (!claims.sub || !claims.email) return null;
    return { sub: claims.sub, email: claims.email.toLowerCase() };
  } catch {
    return null;
  }
}

async function request<T>(
  accessToken: string,
  path: string,
  init: { method: string; body?: unknown } = { method: "GET" },
): Promise<T> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  // 204 on delete, and Google sometimes answers an empty body.
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (response.ok) return (text ? JSON.parse(text) : undefined) as T;

  throw new GoogleError(
    `Google Calendar ${init.method} ${path} failed (${response.status}): ${text.slice(0, 200)}`,
    response.status,
    isPermanent(response.status, text),
  );
}

/**
 * Whether there is any point trying this again.
 *
 * 403 is the awkward one: Google uses it both for "you are going too fast"
 * (`rateLimitExceeded`, `userRateLimitExceeded`) and for "you may not do this
 * at all". Treating the whole status as permanent would strand a queue that
 * only needed to slow down, so the reason field decides.
 */
function isPermanent(status: number, body: string): boolean {
  if (status === 401 || status === 404 || status === 410) return true;
  if (status === 400) return true;
  if (status === 403) {
    return !(
      body.includes("rateLimitExceeded") ||
      body.includes("userRateLimitExceeded") ||
      body.includes("quotaExceeded")
    );
  }
  return false;
}

export interface GoogleCalendar {
  id: string;
  summary?: string;
}

export interface GoogleEvent {
  id: string;
  status?: string;
}

/** Creates the secondary calendar we own and write into. */
export function createCalendar(
  accessToken: string,
  summary: string,
  description: string,
  timeZone: string,
): Promise<GoogleCalendar> {
  return request<GoogleCalendar>(accessToken, "/calendars", {
    method: "POST",
    body: { summary, description, timeZone },
  });
}

/** Confirms the calendar we think we own is still there. */
export function getCalendar(
  accessToken: string,
  calendarId: string,
): Promise<GoogleCalendar> {
  return request<GoogleCalendar>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}`,
  );
}

export function deleteCalendar(
  accessToken: string,
  calendarId: string,
): Promise<void> {
  return request<void>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}`,
    { method: "DELETE" },
  );
}

export function insertEvent(
  accessToken: string,
  calendarId: string,
  body: unknown,
): Promise<GoogleEvent> {
  return request<GoogleEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body },
  );
}

export function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  body: unknown,
): Promise<GoogleEvent> {
  return request<GoogleEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body },
  );
}

export function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  return request<void>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}
