"use client";

export interface SegmentedItem<T extends string | number> {
  value: T;
  label: string;
}

/** Pill group with a slate-filled active segment — the prototype's day tabs. */
export function Segmented<T extends string | number>({
  items,
  value,
  onChange,
  size = "md",
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  const pad =
    size === "sm" ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13.5px]";

  return (
    <div
      className="inline-flex gap-1 rounded-[11px] p-1"
      style={{ background: "rgba(68,88,121,0.07)" }}
      role="radiogroup"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={String(item.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.value)}
            className={`plr-clip cursor-pointer rounded-[8px] font-semibold ${pad}`}
            style={
              active
                ? {
                    background: "var(--slate)",
                    color: "#fff",
                    boxShadow: "0 2px 8px rgba(68,88,121,0.28)",
                  }
                : { color: "var(--muted)" }
            }
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
