import { Skeleton } from "~/components/ui/skeleton";

/**
 * What a screen shows between the click and its data arriving.
 *
 * Every page under the app frame fetches on the server before it renders, and
 * with nothing here the old screen simply stayed put until the new one was
 * ready — on a slow connection a tap on the menu looked like it had done
 * nothing at all. Now the frame stays, the header strip and a few plain
 * shapes stand in for the screen, and the real page replaces them in place.
 *
 * The shapes are deliberately generic: this one file stands in for every
 * screen, so it promises a header and some content and nothing about their
 * shape. The screens with skeletons of their own (the calendars) still show
 * those for their own client-side loading.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      <div
        className="sticky z-20 px-4 py-4 sm:px-6 lg:px-9 lg:py-5"
        style={{
          top: "var(--topbar-h)",
          background: "var(--glass)",
          boxShadow: "0 1px 0 var(--hair-soft)",
        }}
      >
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-3 px-4 pt-4 pb-10 sm:px-6 lg:px-9">
        <Skeleton className="h-10 w-64 max-w-full rounded-[11px]" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
