import { compileRoute, type CompiledRoute, type RouteDef } from "./types";
import { academicsRoutes } from "./routes/academics";
import { apiKeyRoutes } from "./routes/api-keys";
import { attendanceRoutes } from "./routes/attendance";
import { eventRoutes } from "./routes/events";
import { groupRoutes } from "./routes/groups";
import { peopleRoutes } from "./routes/people";
import { planRoutes } from "./routes/plans";
import { roomRoutes } from "./routes/rooms";
import { siriRoutes } from "./routes/siri";
import { timetableRoutes } from "./routes/timetable";

/**
 * Every endpoint the public API offers, in the order the docs list them.
 *
 * Assembled from one module per subject area so that adding a procedure means
 * touching the file it belongs to rather than a thousand-line list everybody
 * edits at once. `registry.test.ts` holds the line that matters: every
 * procedure on `appRouter` must appear here, so a new procedure fails the
 * build until somebody has decided what it looks like from outside.
 */
export const ROUTES: RouteDef[] = [
  ...roomRoutes,
  ...timetableRoutes,
  ...eventRoutes,
  ...attendanceRoutes,
  ...academicsRoutes,
  ...groupRoutes,
  ...planRoutes,
  ...peopleRoutes,
  ...apiKeyRoutes,
  ...siriRoutes,
];

/**
 * Compiled once, and sorted so the most specific match wins.
 *
 * `/events/mine` and `/events/{id}` both match the same request; ranking
 * static segments above parameters is what makes the literal one win, without
 * anybody having to remember to declare them in the right order.
 */
const COMPILED: CompiledRoute[] = ROUTES.map(compileRoute).sort(
  (a, b) => b.specificity - a.specificity,
);

export interface RouteMatch {
  route: CompiledRoute;
  params: Record<string, string>;
}

/**
 * Finds the route for a request, or reports which methods the path does allow.
 *
 * The distinction matters to a client: a 404 says "no such thing", a 405 says
 * "right thing, wrong verb", and guessing between them is exactly the kind of
 * thing that costs somebody an afternoon.
 */
export function matchRoute(
  method: string,
  pathname: string,
): RouteMatch | { allowed: string[] } | null {
  const allowed = new Set<string>();

  for (const route of COMPILED) {
    const match = route.pattern.exec(pathname);
    if (!match) continue;

    if (route.method !== method) {
      allowed.add(route.method);
      continue;
    }

    const params: Record<string, string> = {};
    route.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1]!);
    });
    return { route, params };
  }

  return allowed.size > 0 ? { allowed: [...allowed].sort() } : null;
}

export const isRouteMatch = (
  value: RouteMatch | { allowed: string[] } | null,
): value is RouteMatch => value !== null && "route" in value;
