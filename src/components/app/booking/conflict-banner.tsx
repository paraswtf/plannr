import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Icon, type IconName } from "~/components/ui/icon";

export interface BannerConflict {
  type: string;
  severity: "hard" | "warning";
  message: string;
}

/*
 * The server writes its time ranges with an en dash ("10:00 am–12:00 pm"), and
 * the app's rule is that no dash of that kind reaches the screen: a range is a
 * plain hyphen. Swapped on the way in rather than at the source, because the
 * same messages are asserted on by the server's own tests.
 */
const plain = (message: string) => message.replace(/\s*[–—]\s*/g, "-");

/**
 * Why the chosen slot clashes, in full: every hard conflict (up to four, then a
 * count), and each warning on a slot that is still bookable.
 *
 * The one-line answer, and the way out of a clash, sit with the Book button
 * (`ConflictVerdict`); this is the detail behind it, kept in the form beside
 * the times that caused it. So it says nothing while the check is running or
 * when the slot is clear: the verdict already says that, where the decision is
 * made. `onUseNextFree`, when given, puts the same way out here too.
 */
export function ConflictBanner({
  conflicts,
  checking,
  onUseNextFree,
}: {
  conflicts: BannerConflict[];
  checking?: boolean;
  onUseNextFree?: () => void;
}) {
  if (checking) return null;

  const hard = conflicts.filter((c) => c.severity === "hard");
  const warnings = conflicts.filter((c) => c.severity === "warning");
  if (hard.length === 0 && warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {hard.length > 0 && (
        <Callout
          tone="bad"
          title={conflictTitle(hard.length)}
          action={
            onUseNextFree && (
              <Button size="sm" onClick={onUseNextFree}>
                Use next free slot
              </Button>
            )
          }
        >
          <ul className="mt-1 flex flex-col gap-1">
            {hard.slice(0, 4).map((c, i) => (
              <li key={i}>{plain(c.message)}</li>
            ))}
          </ul>
          {hard.length > 4 && (
            <p className="text-muted mt-1 text-xs">
              And {hard.length - 4} more.
            </p>
          )}
        </Callout>
      )}
      {/*
       * A pending request on the same slot, or a room a little small for the
       * class: neither stops the booking, so each is a note that needs a
       * decision rather than a refusal.
       */}
      {warnings.map((w, i) => (
        <Callout key={i} tone="warn">
          {plain(w.message)}
        </Callout>
      ))}
    </div>
  );
}

const conflictTitle = (count: number) =>
  count === 1 ? "Scheduling conflict" : `${count} scheduling conflicts`;

/*
 * The verdict's tones are the Callout's, line for line, so the answer by the
 * button and the detail in the form are visibly the same message.
 */
const VERDICT_TONES = {
  good: "bg-good-wash text-good shadow-[inset_0_0_0_1px_var(--good-line)]",
  warn: "bg-warn-wash text-warn shadow-[inset_0_0_0_1px_var(--warn-line)]",
  bad: "bg-bad-wash text-bad shadow-[inset_0_0_0_1px_var(--bad-line)]",
  neutral: "bg-tint-hover text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
} as const;

/**
 * The verdict on the chosen slot, in one line beside the Book button. Always
 * visible: a green "this is available" is as useful as a red clash, because it
 * tells you the check ran.
 *
 * It used to be the last thing in the form, under the requirements and the
 * title, so at a laptop's height it was below the fold in every state while
 * the button it decides sat pinned in view; on a phone it was several screens
 * down. Pinned to the button, the question ("can I have this slot?") and the
 * answer are read together, and the button can keep saying what it does
 * ("Book 406") instead of carrying the reason it cannot.
 *
 * One height in every state, so the bar does not jump each time a nudge sets
 * the check running: 48px holds the line, or the line and a small button.
 * Whether it shares the button's row is the panel's call, made from the last
 * settled answer (`draft.clashed`) so the row holds while the check runs.
 */
export function ConflictVerdict({
  id,
  conflicts,
  checking,
  blockedBy,
  onUseNextFree,
  className = "",
}: {
  /** For the Book button's `aria-describedby`. */
  id?: string;
  conflicts: BannerConflict[];
  checking?: boolean;
  /**
   * Why the slot cannot be booked when it is not a clash (a room too small,
   * a class with no group), so a free slot that still cannot be booked never
   * reads as a green light beside a disabled button.
   */
  blockedBy?: string | null;
  onUseNextFree?: () => void;
  className?: string;
}) {
  const hard = conflicts.filter((c) => c.severity === "hard");
  const warnings = conflicts.filter((c) => c.severity === "warning");

  const verdict: {
    tone: keyof typeof VERDICT_TONES;
    icon: IconName;
    text: string;
    action?: React.ReactNode;
  } = checking
    ? { tone: "neutral", icon: "clock", text: "Checking availability…" }
    : hard.length > 0
      ? {
          tone: "bad",
          icon: "alert",
          text: conflictTitle(hard.length),
          // A white button on the red wash: the way out, beside the reason.
          // Small, so it fits the bar at 40px for a thumb and 32px for a mouse.
          action: onUseNextFree && (
            <Button size="sm" onClick={onUseNextFree}>
              Use next free slot
            </Button>
          ),
        }
      : blockedBy
        ? { tone: "bad", icon: "alert", text: blockedBy }
        : warnings.length > 0
          ? {
              // Still bookable, so not red; but not a plain green either,
              // which sat above an amber "already booked" and read as a
              // contradiction.
              tone: "warn",
              icon: "alert",
              text:
                warnings.length === 1
                  ? "Available, with 1 warning"
                  : `Available, with ${warnings.length} warnings`,
            }
          : {
              tone: "good",
              icon: "checkCircle",
              text: "That slot is available",
            };

  return (
    <div
      id={id}
      // Polite, so the answer to each nudge is read out once it settles,
      // without cutting off whatever was being said.
      role="status"
      className={`flex min-h-12 items-center gap-2.5 rounded-[12px] py-1 pl-3.5 text-sm font-semibold ${verdict.action ? "pr-1" : "pr-3.5"} ${VERDICT_TONES[verdict.tone]} ${className}`}
    >
      <Icon name={verdict.icon} size={16} stroke={2} />
      <span className="min-w-0 flex-1">{verdict.text}</span>
      {verdict.action}
    </div>
  );
}
