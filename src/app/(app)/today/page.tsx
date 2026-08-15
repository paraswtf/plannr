import { permanentRedirect } from "next/navigation";

/** Both screens became one: see src/app/(app)/schedule. */
export default function MovedPage() {
  permanentRedirect("/schedule");
}
