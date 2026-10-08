"use client";

import { useState } from "react";

import { Badge, type BadgeTone } from "~/components/ui/badge";
import { Button, buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog } from "~/components/ui/dialog";
import { Field, Textarea } from "~/components/ui/field";
import { Icon } from "~/components/ui/icon";
import { api } from "~/trpc/react";

const TEMPLATE = `name,email,prn,roles,groups
Riya Kapoor,riya.kapoor@college.edu,22030122099,student,BCA-A
Dr. K. Menon,k.menon@college.edu,,faculty|coordinator,`;

/**
 * How each line's verdict is drawn: the badge tones, which are the state
 * colours, so a new row is the same green as anything else that went well.
 */
const STATUS_STYLE: Record<string, { label: string; tone: BadgeTone }> = {
  create: { label: "New", tone: "green" },
  update: { label: "Update", tone: "slate" },
  skip: { label: "No change", tone: "neutral" },
  error: { label: "Error", tone: "red" },
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
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!plan || blocked || commit.isPending}
              onClick={() =>
                commit.mutate({
                  csv,
                  fileName,
                  createMissingGroups: createGroups,
                })
              }
            >
              {commit.isPending
                ? "Importing…"
                : blocked
                  ? "Fix the errors first"
                  : `Import ${(plan?.summary.create ?? 0) + (plan?.summary.update ?? 0)} rows`}
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
              {/*
               * A label drawn as a button, around the real file input: the
               * input is invisible, so the label shows its keyboard focus for
               * it (`has-[:focus-visible]`), the same ring as everything else.
               */}
              <label
                className={buttonClass(
                  "secondary",
                  "md",
                  "has-[:focus-visible]:outline-slate has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
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
                <span className="text-muted min-w-0 truncate font-mono text-xs">
                  {fileName}
                </span>
              )}
              <Button
                variant="quiet"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setCsv(TEMPLATE);
                  setFileName("example.csv");
                }}
              >
                Use an example
              </Button>
            </div>

            <Field
              label="Or paste the rows"
              hint="Columns: name, email, prn, roles, groups. Only email is required. Separate multiple roles or groups with | or a comma."
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
                  placeholder="name,email,prn,roles,groups"
                  // One line is one person, so lines do not wrap: a record
                  // folded mid-address on a phone reads as two. Long lines
                  // scroll sideways inside the box instead. Phones get 16px
                  // type from the global `pointer: coarse` rule, so Safari
                  // does not zoom the dialog half off screen on focus.
                  wrap="off"
                  className="plr-scroll font-mono"
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
                {/* Errors first: they are what stands between the file and
                    the import button. */}
                <div className="flex flex-wrap items-center gap-2">
                  {plan.summary.error > 0 && (
                    <Badge tone="red">
                      {plan.summary.error}{" "}
                      {plan.summary.error === 1 ? "error" : "errors"}
                    </Badge>
                  )}
                  <Badge tone="green">{plan.summary.create} new</Badge>
                  <Badge tone="slate">{plan.summary.update} to update</Badge>
                  <Badge tone="neutral">{plan.summary.skip} unchanged</Badge>
                  {plan.summary.error > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setShowErrorsOnly((v) => !v)}
                    >
                      {showErrorsOnly ? "Show all rows" : "Show errors only"}
                    </Button>
                  )}
                </div>

                {plan.newGroups.length > 0 && (
                  <Callout tone="warn" icon={null}>
                    <Checkbox
                      checked={createGroups}
                      onChange={setCreateGroups}
                      label={
                        <span className="font-normal">
                          Create {plan.newGroups.length}{" "}
                          {plan.newGroups.length === 1 ? "group" : "groups"}{" "}
                          named in the file that do not exist yet:{" "}
                          <b className="font-semibold">
                            {plan.newGroups.join(", ")}
                          </b>
                        </span>
                      }
                    />
                  </Callout>
                )}

                {/*
                 * Six columns of import diff genuinely need the width — a line
                 * number matched to the error on it is the whole point — so the
                 * preview scrolls in both directions inside its own box rather
                 * than being folded up or dragging the dialog sideways.
                 *
                 * The box's edge is an outer ring, not an inset one: the sticky
                 * header paints its white over anything drawn inside the box,
                 * and an inset ring vanished under it along the top.
                 */}
                <div className="plr-scroll max-h-[320px] overflow-auto rounded-[12px] shadow-[0_0_0_1px_var(--hair)]">
                  <table className="w-full min-w-155 border-collapse">
                    <thead className="bg-surface sticky top-0 z-[1]">
                      <tr>
                        <Th>Line</Th>
                        <Th>Status</Th>
                        <Th>Name</Th>
                        <Th>Email</Th>
                        <Th>PRN</Th>
                        <Th wide>What changes</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((row) => {
                        const style = STATUS_STYLE[row.status]!;
                        return (
                          <tr
                            key={row.line}
                            className={`[&:last-child>td]:shadow-none ${row.status === "error" ? "bg-bad-wash" : ""}`}
                          >
                            <Td mono>{row.line}</Td>
                            <Td>
                              <Badge tone={style.tone}>{style.label}</Badge>
                            </Td>
                            <Td nowrap>
                              {row.data.name || (
                                <span className="text-faint italic">
                                  No name
                                </span>
                              )}
                            </Td>
                            <Td>
                              {row.data.email || (
                                <span className="text-faint italic">
                                  No address
                                </span>
                              )}
                            </Td>
                            <Td mono>{row.data.prn ?? ""}</Td>
                            <Td>
                              {row.errors.length > 0 ? (
                                <span className="text-bad text-xs">
                                  {row.errors.join("; ")}
                                </span>
                              ) : row.changes.length > 0 ? (
                                <span className="text-muted text-xs">
                                  {row.changes.join("; ")}
                                </span>
                              ) : (
                                <span className="text-faint text-xs">
                                  {row.status === "create"
                                    ? "New person"
                                    : "No change"}
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

function Th({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  /** The column that takes the spare width, so the others stay on one line. */
  wide?: boolean;
}) {
  return (
    <th
      className={`text-muted text-2xs px-3 py-2 text-left font-semibold whitespace-nowrap shadow-[inset_0_-1px_0_var(--hair)] ${wide ? "w-full" : ""}`}
    >
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
      className={`text-ink px-3 py-2 align-middle shadow-[inset_0_-1px_0_var(--hair-soft)] ${mono ? "font-mono text-xs tabular-nums" : "text-sm"} ${nowrap ? "whitespace-nowrap" : ""}`}
    >
      {children}
    </td>
  );
}
