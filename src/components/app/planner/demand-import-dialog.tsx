"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button, buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog } from "~/components/ui/dialog";
import { Field, Textarea } from "~/components/ui/field";
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

  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

  return (
    <Dialog
      open
      width={920}
      icon="upload"
      title="Upload the teaching load"
      onClose={onClose}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!plan || blocked || commit.isPending}
              onClick={() => commit.mutate({ planId, csv, replace })}
            >
              {commit.isPending
                ? "Importing…"
                : blocked
                  ? "Fix the errors first"
                  : `Import ${plural(plan?.summary.ready ?? 0, "subject", "subjects")}`}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {done ? (
          <Callout tone="good" role="status">
            {done}
          </Callout>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {/* A label dressed as a button, so the hidden file input inside
                  it opens on a click. The input is what takes focus, so the
                  label draws the focus ring for it. */}
              <label
                className={buttonClass(
                  "secondary",
                  "md",
                  "has-[:focus-visible]:outline-slate has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-solid",
                )}
              >
                <Icon name="upload" size={15} stroke={2} />
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
                <span className="text-muted font-mono text-xs">{fileName}</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCsv(TEMPLATE);
                  setFileName("example.csv");
                  setDone(null);
                }}
                className="sm:ml-auto"
              >
                Use an example
              </Button>
            </div>

            <Field
              label="Or paste the rows"
              hint={
                <>
                  Only <b>group</b> and <b>subject</b> are required. Sessions
                  defaults to 1 and length to an hour. Separate several teachers
                  or features with <b>|</b> or a comma. Column names are matched
                  loosely, so &ldquo;Lectures per week&rdquo; and &ldquo;Taught
                  by&rdquo; both work.
                </>
              }
            >
              {(id) => (
                <Textarea
                  id={id}
                  value={csv}
                  onChange={(e) => {
                    setCsv(e.target.value);
                    setDone(null);
                  }}
                  rows={5}
                  placeholder="group,subject,sessions,duration,faculty,features"
                  className="plr-scroll font-mono text-xs"
                />
              )}
            </Field>

            {(error ?? preview.error) && (
              <Callout tone="bad" role="alert">
                {error ?? preview.error?.message}
              </Callout>
            )}

            {plan && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="green">
                    {plural(plan.summary.ready, "subject", "subjects")} ready
                  </Badge>
                  <Badge>
                    {plural(plan.summary.sessions, "lecture", "lectures")} a
                    week
                  </Badge>
                  {plan.summary.error > 0 && (
                    <>
                      <Badge tone="red">
                        {plural(plan.summary.error, "error", "errors")}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setErrorsOnly((v) => !v)}
                        className="sm:ml-auto"
                      >
                        {errorsOnly ? "Show all rows" : "Show errors only"}
                      </Button>
                    </>
                  )}
                </div>

                {plan.unmatchedHeaders.length > 0 && (
                  <p className="text-muted m-0 text-xs">
                    Ignored columns: {plan.unmatchedHeaders.join(", ")}
                  </p>
                )}

                {hasExisting && (
                  <Callout tone="warn" icon={null}>
                    <Checkbox
                      checked={replace}
                      onChange={setReplace}
                      label="Replace the demand already in this plan, rather than adding to it. Any timetable generated from it will need regenerating."
                    />
                  </Callout>
                )}

                {/* Both axes scroll inside this box. The preview is a check
                    that the file parsed, so the seven columns are worth
                    reaching sideways for rather than folding into cards nobody
                    will read twice. The ring is drawn over the table on a
                    layer of its own rather than on the box: an inset shadow
                    paints beneath its children, so the sticky head's white
                    and the error rows' wash used to cover it, and the table
                    had no top edge. */}
                <div className="relative overflow-hidden rounded-[12px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[12px] after:shadow-[var(--ring)] after:content-['']">
                  <div className="plr-scroll max-h-[260px] overflow-auto sm:max-h-[340px]">
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
                            className={
                              row.status === "error" ? "bg-bad-wash" : undefined
                            }
                          >
                            <Td mono>{row.line}</Td>
                            <Td nowrap>
                              {row.requirement?.groupLabel ?? row.raw.group ?? (
                                <Missing />
                              )}
                            </Td>
                            <Td>
                              {row.requirement?.subject ?? row.raw.subject}
                            </Td>
                            <Td mono>
                              {row.requirement?.sessionsPerWeek ??
                                row.raw.sessions}
                            </Td>
                            <Td>
                              {row.requirement ? (
                                <span className="whitespace-nowrap tabular-nums">
                                  {formatDuration(
                                    row.requirement.durationMinutes,
                                  )}
                                </span>
                              ) : (
                                <Missing />
                              )}
                            </Td>
                            <Td>
                              {row.requirement?.facultyNames.length
                                ? row.requirement.facultyNames.join(", ")
                                : (row.raw.faculty ?? <Missing />)}
                            </Td>
                            <Td>
                              {row.errors.length > 0 ? (
                                <span className="text-bad text-xs font-medium">
                                  {row.errors.join("; ")}
                                </span>
                              ) : row.warnings.length > 0 ? (
                                <span className="text-warn text-xs">
                                  {row.warnings.join("; ")}
                                </span>
                              ) : (
                                <span className="text-good text-xs">OK</span>
                              )}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** A cell with nothing in it, said in words rather than an em dash. */
function Missing() {
  return <span className="text-faint">None</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-muted text-2xs px-3 py-2 text-left font-semibold whitespace-nowrap shadow-[inset_0_-1px_0_var(--hair)]">
      {children}
    </th>
  );
}

function Td({
  children,
  mono = false,
  nowrap = false,
}: {
  children: React.ReactNode;
  mono?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td
      className={`text-ink px-3 py-2 text-sm shadow-[inset_0_-1px_0_var(--hair-soft)] ${mono ? "font-mono tabular-nums" : ""} ${nowrap ? "whitespace-nowrap" : ""}`}
    >
      {children}
    </td>
  );
}
