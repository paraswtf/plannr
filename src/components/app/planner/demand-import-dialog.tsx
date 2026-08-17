"use client";

import { useState } from "react";

import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { formatDuration } from "~/lib/dates";
import { api } from "~/trpc/react";

const TEMPLATE = `group,subject,sessions,duration,faculty,features,room type,min capacity,room,notes
BCA-A,Data Structures,3,60,Dr. Rao,projector,LECTURE,,,
BCA-A,DS Lab,2,120,Dr. Rao|Dr. Sen,computers,LAB,,,two demonstrators
BCA-B,Discrete Maths,4,60,Dr. Menon,,,,,`;

/**
 * Bulk demand from a spreadsheet.
 *
 * The whole file is resolved against this institution's groups, staff and rooms
 * before anything is written, and every line that could not be matched says
 * exactly which cell was the problem. The commit re-parses server-side, so this
 * preview is a courtesy rather than something the import trusts.
 */
export function DemandImportDialog({
  planId,
  hasExisting,
  onClose,
  onImported,
}: {
  planId: string;
  hasExisting: boolean;
  onClose: () => void;
  onImported: () => void | Promise<unknown>;
}) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | undefined>();
  const [replace, setReplace] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const preview = api.plans.importPreview.useQuery(
    { planId, csv },
    { enabled: csv.trim().length > 0, retry: false },
  );

  const commit = api.plans.importCommit.useMutation({
    onSuccess: async (result) => {
      await onImported();
      setDone(
        `Added ${result.imported} subject${result.imported === 1 ? "" : "s"}, ${result.sessions} lectures a week.`,
      );
    },
    onError: (e) => setError(e.message),
  });

  const plan = preview.data;
  const rows = plan?.rows ?? [];
  const shown = errorsOnly ? rows.filter((r) => r.status === "error") : rows;
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
      width={920}
      icon="upload"
      title="Upload the teaching load"
      onClose={onClose}
      footer={
        done ? (
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-10 items-center rounded-lg px-3.5 text-[13px] font-semibold text-white lg:min-h-0 lg:py-2"
            style={{ background: "var(--slate)" }}
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="text-muted flex min-h-10 cursor-pointer items-center rounded-lg px-3.5 text-[13px] font-semibold lg:min-h-0 lg:py-2"
              style={{ boxShadow: "var(--ring)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!plan || blocked || commit.isPending}
              onClick={() => commit.mutate({ planId, csv, replace })}
              className="flex min-h-10 items-center rounded-lg px-3.5 text-[13px] font-semibold text-white lg:min-h-0 lg:py-2"
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
                  : `Import ${plan?.summary.ready ?? 0} subjects`}
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
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-semibold lg:min-h-0 lg:py-2"
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
                  setDone(null);
                }}
                className="text-slate flex min-h-10 cursor-pointer items-center text-[12.5px] font-semibold sm:ml-auto lg:min-h-0"
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
                placeholder="group,subject,sessions,duration,faculty,features"
                className="bg-surface plr-scroll w-full resize-y rounded-[10px] px-3 py-2 font-mono text-[12px] outline-none"
                style={{ boxShadow: "var(--ring)" }}
              />
              <span className="text-faint text-[11.5px]">
                Only <b>group</b> and <b>subject</b> are required. Sessions
                defaults to 1 and length to an hour. Separate several teachers
                or features with <b>|</b> or a comma. Column names are matched
                loosely — &ldquo;Lectures per week&rdquo; and &ldquo;Taught
                by&rdquo; both work.
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
                  <Pill tone="green">{plan.summary.ready} subjects ready</Pill>
                  <Pill tone="slate">
                    {plan.summary.sessions} lectures a week
                  </Pill>
                  {plan.summary.error > 0 && (
                    <>
                      <Pill tone="red">{plan.summary.error} errors</Pill>
                      <button
                        type="button"
                        onClick={() => setErrorsOnly((v) => !v)}
                        className="text-slate flex min-h-10 cursor-pointer items-center text-[12.5px] font-semibold sm:ml-auto lg:min-h-0"
                      >
                        {errorsOnly ? "Show all rows" : "Show errors only"}
                      </button>
                    </>
                  )}
                </div>

                {plan.unmatchedHeaders.length > 0 && (
                  <p className="text-faint m-0 text-[12px]">
                    Ignored columns: {plan.unmatchedHeaders.join(", ")}
                  </p>
                )}

                {hasExisting && (
                  <label
                    className="flex items-start gap-2.5 rounded-xl p-3"
                    style={{
                      background: "rgba(246,167,59,0.10)",
                      boxShadow: "inset 0 0 0 1px rgba(246,167,59,0.35)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={replace}
                      onChange={(e) => setReplace(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-ink text-[12.5px]">
                      Replace the demand already in this plan, rather than
                      adding to it. Any timetable generated from it will need
                      regenerating.
                    </span>
                  </label>
                )}

                {/* Both axes scroll inside this box. The preview is a check
                    that the file parsed, so the seven columns are worth
                    reaching sideways for rather than folding into cards nobody
                    will read twice. */}
                <div
                  className="plr-scroll max-h-[260px] overflow-auto rounded-[10px] sm:max-h-[340px]"
                  style={{ boxShadow: "var(--ring)" }}
                >
                  <table className="w-full min-w-[640px] border-collapse">
                    <thead className="bg-surface sticky top-0">
                      <tr>
                        <Th>Line</Th>
                        <Th>Group</Th>
                        <Th>Subject</Th>
                        <Th>Per week</Th>
                        <Th>Length</Th>
                        <Th>Taught by</Th>
                        <Th>Notes</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((row) => (
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
                            {row.requirement?.groupLabel ??
                              row.raw.group ??
                              "—"}
                          </Td>
                          <Td>{row.requirement?.subject ?? row.raw.subject}</Td>
                          <Td mono>
                            {row.requirement?.sessionsPerWeek ??
                              row.raw.sessions}
                          </Td>
                          <Td mono>
                            {row.requirement
                              ? formatDuration(row.requirement.durationMinutes)
                              : "—"}
                          </Td>
                          <Td>
                            {row.requirement?.facultyNames.length
                              ? row.requirement.facultyNames.join(", ")
                              : (row.raw.faculty ?? "—")}
                          </Td>
                          <Td>
                            {row.errors.length > 0 ? (
                              <span className="text-[12px] text-[#b02636]">
                                {row.errors.join("; ")}
                              </span>
                            ) : row.warnings.length > 0 ? (
                              <span className="text-[12px] text-[#a2660f]">
                                {row.warnings.join("; ")}
                              </span>
                            ) : (
                              <span className="text-faint text-[12px]">ok</span>
                            )}
                          </Td>
                        </tr>
                      ))}
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
  tone: "green" | "slate" | "red";
}) {
  const tones = {
    green: { color: "#3f6a2e", background: "rgba(78,125,58,0.12)" },
    slate: { color: "#324464", background: "rgba(68,88,121,0.10)" },
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
