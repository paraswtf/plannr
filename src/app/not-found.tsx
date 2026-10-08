import { type Metadata } from "next";
import Link from "next/link";

import { StandalonePanel } from "~/components/app/shell/standalone-panel";
import { buttonClass } from "~/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Where a mistyped or out-of-date link lands.
 *
 * Next's own 404 is a black line on a white page with none of the app around
 * it, which reads as the whole site being down. This says plainly what
 * happened and offers the one way back: the root, which already knows where
 * each person's home screen is.
 */
export default function NotFound() {
  return (
    <StandalonePanel
      title="Page not found"
      lede="The link may be out of date, or the page may have moved. Everything you can open is in the menu once you are back in."
    >
      <Link href="/" className={buttonClass("primary", "lg", "w-full")}>
        Back to Plannr
      </Link>
    </StandalonePanel>
  );
}
