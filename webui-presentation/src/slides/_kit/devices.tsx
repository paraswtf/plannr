import type { ComponentProps } from "react";

import { BrowserFrame, PhoneFrame } from "~/ui/frames";

/**
 * Device frames for product mock-ups. Mock-ups keep Plannr's own colours.
 * Browser: `url`, `width` (default 1200), `height` (default 760).
 * Phone: `height` of the whole device in canvas px (default 820).
 */
export function Browser(props: ComponentProps<typeof BrowserFrame>) {
  return <BrowserFrame {...props} />;
}

export function Phone(props: ComponentProps<typeof PhoneFrame>) {
  return <PhoneFrame {...props} />;
}
