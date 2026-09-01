"use client";

import { Drawer } from "~/components/ui/drawer";
import {
  EventDetails,
  eventActions,
  eventHeading,
  type EventDetailProps,
} from "./event-details";

/**
 * What clicking a booked block opens: the lecture's details, docked beside the
 * calendar it was clicked on.
 *
 * Everybody gets it now — a class is noticeboard information, and until this
 * screen offered it a student's click on a block did nothing at all. What the
 * panel *offers* still depends on what the reader may do; that lives in
 * `EventDetails`, which the press-and-hold modal next door shows too.
 */
export function EventDrawer(props: EventDetailProps) {
  const { event, timeZone, canMarkAttendance, onClose } = props;

  return (
    <Drawer
      open
      {...eventHeading(event, timeZone)}
      onClose={onClose}
      footer={eventActions(event, canMarkAttendance)}
    >
      <EventDetails {...props} />
    </Drawer>
  );
}
