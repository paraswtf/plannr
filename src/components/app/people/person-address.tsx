"use client";

import { contactAddress, NO_ADDRESS } from "~/lib/people";

/**
 * The address line under a person's name.
 *
 * A student the college has sent no address for is an ordinary row, not a
 * broken one — there are 133 of them — so the absence is said in the same
 * place, at the same size, in italics. Nothing here is styled as a warning:
 * they are enrolled, and only the paperwork is outstanding.
 */
export function PersonAddress({
  email,
  className = "",
}: {
  /** null once the routers have decided there is nothing to write to. */
  email: string | null | undefined;
  className?: string;
}) {
  const address = contactAddress(email);
  return (
    <span
      className={`text-faint block truncate text-xs ${address ? "" : "italic"} ${className}`}
    >
      {address ?? NO_ADDRESS}
    </span>
  );
}
