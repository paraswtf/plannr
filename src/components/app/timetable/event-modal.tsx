"use client";

import { Dialog } from "~/components/ui/dialog";
import {
  EventDetails,
  eventActions,
  eventHeading,
  type EventDetailProps,
} from "./event-details";

/**
 * The same details a press-and-hold or a right-click away.
 *
 * The drawer is a column beside the calendar on a laptop and a block stacked
 * *under* it on a phone, which is exactly what makes a second frame worth
 * having: a thumb that holds a block gets the answer over the block rather than
 * a screen further down. It is a shortcut, never a destination — nothing lives
 * only here, so a keyboard, which has no hold, loses nothing by opening the
 * drawer instead.
 *
 * 460px sits between the drawer's 420 and the dialog's own 520: the content is
 * short, and a 520px box around three badges reads as empty.
 */
export function EventModal(props: EventDetailProps) {
  const { event, timeZone, canMarkAttendance, onClose } = props;

  return (
    <Dialog
      open
      {...eventHeading(event, timeZone)}
      width={460}
      onClose={onClose}
      footer={eventActions(event, canMarkAttendance)}
    >
      <EventDetails {...props} overlay />
    </Dialog>
  );
}
