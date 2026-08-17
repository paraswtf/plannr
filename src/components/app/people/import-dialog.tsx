"use client";

import { useState } from "react";

import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { api } from "~/trpc/react";

const TEMPLATE = `name,email,prn,roles,groups
Riya Kapoor,riya.kapoor@college.edu,22030122099,student,BCA-A
Dr. K. Menon,k.menon@college.edu,,faculty|coordinator,`;

const STATUS_STYLE: Record<
  string,
  { label: string; color: string; background: string }
> = {
  create: {
    label: "new",
    color: "#3f6a2e",
    background: "rgba(78,125,58,0.12)",
  },
  update: {
    label: "update",
    color: "#324464",
    background: "rgba(68,88,121,0.10)",
  },
  skip: {
    label: "no change",
    color: "var(--faint)",
    background: "transparent",
  },
  error: {
    label: "error",
    color: "#b02636",
    background: "rgba(220,56,72,0.10)",
  },
};

/**
 * Bulk import: paste or drop a CSV, see exactly what it would do, then commit.
 * The preview is advisory — the server re-parses and re-diffs on commit.
 */
export function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void | Promise<unknown>;
}) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | undefined>();
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [createGroups, setCreateGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const preview = api.users.importPreview.useQuery(
    { csv },
    { enabled: csv.trim().length > 0, retry: false },
  );

  const commit = api.users.importCommit.useMutation({
    onSuccess: async (r) => {
      await onImported();
      setDone(
        `Imported ${r.created} new, updated ${r.updated}, left ${r.skipped} unchanged.`,
      );
    },
    onError: (e) => setError(e.message),
  });

  const plan = preview.data;
  const rows = plan?.rows ?? [];
  const shown = showErrorsOnly
    ? rows.filter((r) => r.status === "error")
    : rows;
  const blocked = (plan?.summary.error ?? 0) > 0;

  const readFile = async (file: File) => {
    setFileName(file.name);
    setCsv(await file.text());
    setDone(null);
    setError(null);
  };

  return (
    <Dialog
      open
      title="Import people from CSV"
      icon="upload"
      width={860}
      onClose={onClose}
      footer={
        done ? (
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
            style={{ background: "var(--slate)" }}
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="text-muted min-h-10 cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
              style={{ boxShadow: "var(--ring)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!plan || blocked || commit.isPending}
              onClick={() =>
                commit.mutate({
                  csv,
                  fileName,
                  createMissingGroups: createGroups,
                })
              }
              className="min-h-10 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
              style={{
                background: "var(--grad-brand)",
                opacity: !plan || blocked || commit.isPending ? 0.5 : 1,
                cursor:
                  !plan || blocked || commit.isPending
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {commit.isPending
                ? "Importing…"
                : blocked
                  ? "Fix the errors first"
                  : `Import ${(plan?.summary.create ?? 0) + (plan?.summary.update ?? 0)} rows`}
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {done ? (
          <div
            className="flex items-center gap-2.5 rounded-xl p-4"
            style={{
              background: "rgba(78,125,58,0.08)",
              boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.3)",
            }}
          >
            <Icon name="checkCircle" size={19} color="#4e7d3a" stroke={2} />
            <span className="text-[13.5px] font-semibold text-[#3f6a2e]">
              {done}
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
                style={{ boxShadow: "var(--ring)" }}
              >
                <Icon name="upload" size={15} color="var(--slate)" />
                Choose a CSV file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readFile(file);
                  }}
                />
              </label>
              {fileName && (
                <span className="text-muted font-mono text-[12px]">
                  {fileName}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setCsv(TEMPLATE);
                  setFileName("example.csv");
                }}
                className="text-slate ml-auto inline-flex min-h-10 cursor-pointer items-center text-[12.5px] font-semibold lg:min-h-0"
              >
                Use an example
              </button>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-ink text-[13px] font-semibold">
                …or paste the rows
              </span>
              <textarea
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setDone(null);
                }}
                rows={5}
                placeholder="name,email,prn,roles,groups"
                // 16px on a phone: below that, Safari zooms the page in as the
                // field takes focus, which on a dialog leaves it half off
                // screen.
                className="bg-surface plr-scroll w-full resize-y rounded-[10px] px-3 py-2 font-mono text-[16px] outline-none sm:text-[12px]"
                style={{ boxShadow: "var(--ring)" }}
              />
              <span className="text-faint text-[11.5px]">
                Columns: name, email, prn, roles, groups. Only email is
                required. Separate multiple roles or groups with | or a comma.
              </span>
            </label>

            {(error ?? preview.error) && (
              <div
                className="rounded-xl p-3 text-[13px] font-medium text-[#b02636]"
                style={{
                  background: "rgba(220,56,72,0.07)",
                  boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
                }}
              >
                {error ?? preview.error?.message}
              </div>
            )}

            {plan && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Pill tone="green">{plan.summary.create} new</Pill>
                  <Pill tone="slate">{plan.summary.update} to update</Pill>
                  <Pill tone="neutral">{plan.summary.skip} unchanged</Pill>
                  {plan.summary.error > 0 && (
                    <Pill tone="red">{plan.summary.error} errors</Pill>
                  )}
                  {plan.summary.error > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowErrorsOnly((v) => !v)}
                      className="text-slate ml-auto inline-flex min-h-10 cursor-pointer items-center text-[12.5px] font-semibold lg:min-h-0"
                    >
                      {showErrorsOnly ? "Show all rows" : "Show errors only"}
                    </button>
                  )}
                </div>

                {plan.newGroups.length > 0 && (
                  <label
                    className="flex items-start gap-2.5 rounded-xl p-3"
                    style={{
                      background: "rgba(246,167,59,0.10)",
                      boxShadow: "inset 0 0 0 1px rgba(246,167,59,0.35)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={createGroups}
                      onChange={(e) => setCreateGroups(e.target.checked)}
                      className="mt-0.5 h-4.5 w-4.5 shrink-0"
                    />
                    <span className="text-ink text-[12.5px]">
                      Create {plan.newGroups.length} group(s) named in the file
                      that do not exist yet: <b>{plan.newGroups.join(", ")}</b>
                    </span>
                  </label>
                )}

                {/*
                 * Six columns of import diff genuinely need the width — a line
                 * number matched to the error on it is the whole point — so the
                 * preview scrolls in both directions inside its own box rather
                 * than being folded up or dragging the dialog sideways.
                 */}
                <div
                  className="plr-scroll max-h-[320px] overflow-auto rounded-[10px]"
                  style={{ boxShadow: "var(--ring)" }}
                >
                  <table className="w-full min-w-155 border-collapse">
                    <thead className="bg-surface sticky top-0">
                      <tr>
                        <Th>Line</Th>
                        <Th>Status</Th>
                        <Th>Name</Th>
                        <Th>Email</Th>
                        <Th>PRN</Th>
                        <Th>What changes</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((row) => {
                        const style = STATUS_STYLE[row.status]!;
                        return (
                          <tr
                            key={row.line}
                            style={{
                              background:
                                row.status === "error"
                                  ? "rgba(220,56,72,0.04)"
                                  : undefined,
                            }}
                          >
                            <Td mono>{row.line}</Td>
                            <Td>
                              <span
                                className="rounded-md px-2 py-1 text-[11px] font-bold"
                                style={{
                                  color: style.color,
                                  background: style.background,
                                }}
                              >
                                {style.label}
                              </span>
                            </Td>
                            <Td>{row.data.name || "—"}</Td>
                            <Td>{row.data.email || "—"}</Td>
                            <Td mono>{row.data.prn ?? "—"}</Td>
                            <Td>
                              {row.errors.length > 0 ? (
                                <span className="text-[12px] text-[#b02636]">
                                  {row.errors.join("; ")}
                                </span>
                              ) : row.changes.length > 0 ? (
                                <span className="text-muted text-[12px]">
                                  {row.changes.join("; ")}
                                </span>
                              ) : (
                                <span className="text-faint text-[12px]">
                                  —
                                </span>
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "slate" | "neutral" | "red";
}) {
  const tones = {
    green: { color: "#3f6a2e", background: "rgba(78,125,58,0.12)" },
    slate: { color: "#324464", background: "rgba(68,88,121,0.10)" },
    neutral: { color: "var(--muted)", background: "rgba(44,49,53,0.07)" },
    red: { color: "#b02636", background: "rgba(220,56,72,0.10)" },
  };
  return (
    <span
      className="rounded-md px-2.5 py-1 text-[12px] font-bold"
      style={tones[tone]}
    >
      {children}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="text-muted px-3 py-2 text-left text-[11px] font-bold tracking-wider uppercase"
      style={{ boxShadow: "inset 0 -1px 0 var(--hair)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono = false,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td
      className={`text-ink px-3 py-2 text-[12.5px] ${mono ? "font-mono" : ""}`}
      style={{ boxShadow: "inset 0 -1px 0 var(--hair-soft)" }}
    >
      {children}
    </td>
  );
}
