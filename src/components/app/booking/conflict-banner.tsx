import { Icon } from "~/components/ui/icon";

export interface BannerConflict {
  type: string;
  severity: "hard" | "warning";
  message: string;
}

/**
 * The verdict on the currently chosen slot. Always visible — a green "this is
 * available" is as useful as a red clash, because it tells you the check ran.
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
  const hard = conflicts.filter((c) => c.severity === "hard");
  const warnings = conflicts.filter((c) => c.severity === "warning");

  if (checking) {
    return (
      <Panel background="rgba(68,88,121,0.06)" ring="rgba(68,88,121,0.25)">
        <span className="text-muted text-[13px]">Checking availability…</span>
      </Panel>
    );
  }

  if (hard.length > 0) {
    return (
      <Panel background="rgba(220,56,72,0.07)" ring="rgba(220,56,72,0.3)">
        <div className="flex gap-3">
          <Icon name="alert" size={20} color="var(--red)" stroke={2} />
          <div className="flex-1">
            <div className="text-[14px] font-bold text-[#b02636]">
              {hard.length === 1
                ? "Scheduling conflict"
                : `${hard.length} scheduling conflicts`}
            </div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {hard.slice(0, 4).map((c, i) => (
                <li key={i} className="text-ink text-[12.5px]">
                  {c.message}
                </li>
              ))}
            </ul>
            {hard.length > 4 && (
              <div className="text-muted mt-1 text-[12px]">
                …and {hard.length - 4} more.
              </div>
            )}
            {onUseNextFree && (
              <button
                type="button"
                onClick={onUseNextFree}
                className="mt-3 cursor-pointer rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-white"
                style={{ background: "var(--slate)" }}
              >
                Use next free slot
              </button>
            )}
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <Panel background="rgba(78,125,58,0.08)" ring="rgba(78,125,58,0.3)">
        <div className="flex items-center gap-2.5">
          <Icon name="checkCircle" size={19} color="#4e7d3a" stroke={2} />
          <span className="text-[13.5px] font-semibold text-[#3f6a2e]">
            That slot is available
          </span>
        </div>
      </Panel>
      {warnings.map((w, i) => (
        <Panel
          key={i}
          background="rgba(246,167,59,0.10)"
          ring="rgba(246,167,59,0.4)"
        >
          <div className="flex gap-2.5">
            <Icon name="users" size={18} color="var(--orange)" stroke={2} />
            <span className="text-ink text-[13px]">{w.message}</span>
          </div>
        </Panel>
      ))}
    </>
  );
}

function Panel({
  background,
  ring,
  children,
}: {
  background: string;
  ring: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{ background, boxShadow: `inset 0 0 0 1px ${ring}` }}
    >
      {children}
    </div>
  );
}
