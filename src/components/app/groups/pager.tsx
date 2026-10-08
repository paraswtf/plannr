import { Button } from "~/components/ui/button";

/**
 * Previous, where you are, next — under the groups list and the programmes
 * list, which page their queries the same way.
 *
 * Both lists drew this for themselves from ringed spans that faded to 40% when
 * there was nowhere to go but kept the pointer cursor, so a dead button still
 * looked pressable. The shared buttons carry the disabled state properly, and
 * the count between them is sentence case like every other line in the app.
 * Nothing is drawn for a list that fits on one page.
 */
export function Pager({
  page,
  lastPage,
  onPrevious,
  onNext,
}: {
  page: number;
  lastPage: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (lastPage <= 1) return null;
  return (
    <nav
      aria-label="Pages"
      className="mt-5 flex flex-wrap items-center justify-center gap-3"
    >
      <Button
        variant="secondary"
        size="sm"
        icon="chevronLeft"
        disabled={page === 1}
        onClick={onPrevious}
      >
        Previous
      </Button>
      <span className="text-muted font-mono text-xs tabular-nums">
        Page {page} of {lastPage}
      </span>
      <Button
        variant="secondary"
        size="sm"
        iconAfter="chevronRight"
        disabled={page >= lastPage}
        onClick={onNext}
      >
        Next
      </Button>
    </nav>
  );
}
