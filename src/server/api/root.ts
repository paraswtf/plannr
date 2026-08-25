import { apiKeysRouter } from "~/server/api/routers/api-keys";
import { attendanceRouter } from "~/server/api/routers/attendance";
import { calendarRouter } from "~/server/api/routers/calendar";
import { coursesRouter } from "~/server/api/routers/courses";
import { eventsRouter } from "~/server/api/routers/events";
import { groupsRouter } from "~/server/api/routers/groups";
import { plansRouter } from "~/server/api/routers/plans";
import { rolesRouter } from "~/server/api/routers/roles";
import { semestersRouter } from "~/server/api/routers/semesters";
import { buildingsRouter, roomsRouter } from "~/server/api/routers/rooms";
import { timetableRouter } from "~/server/api/routers/timetable";
import { usersRouter } from "~/server/api/routers/users";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  rooms: roomsRouter,
  buildings: buildingsRouter,
  timetable: timetableRouter,
  events: eventsRouter,
  attendance: attendanceRouter,
  courses: coursesRouter,
  semesters: semestersRouter,
  groups: groupsRouter,
  users: usersRouter,
  roles: rolesRouter,
  plans: plansRouter,
  calendar: calendarRouter,
  apiKeys: apiKeysRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const rooms = await trpc.rooms.list();
 */
export const createCaller = createCallerFactory(appRouter);
