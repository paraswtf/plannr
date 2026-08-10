import { eventsRouter } from "~/server/api/routers/events";
import { groupsRouter } from "~/server/api/routers/groups";
import { buildingsRouter, roomsRouter } from "~/server/api/routers/rooms";
import { timetableRouter } from "~/server/api/routers/timetable";
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
  groups: groupsRouter,
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
