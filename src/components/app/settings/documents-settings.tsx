"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Field, Input, Textarea } from "~/components/ui/field";
import { Skeleton } from "~/components/ui/skeleton";
import { errorMessage } from "~/lib/error-message";
import { api } from "~/trpc/react";

const LOGO_LIMIT = 256 * 1024;
/** The server's limits (src/server/api/routers/settings.ts), checked here first. */
const HEADER_MAX_LINES = 6;
const HEADER_LINE_MAX = 150;
const FOOTER_MAX = 200;
const LOGO_TYPES = ["image/png", "image/jpeg"] as const;
type LogoType = (typeof LOGO_TYPES)[number];

/** A picked logo, held as base64 until it is saved. */
interface PickedLogo {
  base64: string;
  type: LogoType;
  /** For showing it before it is saved. */
  dataUrl: string;
}

/** Reads a file as base64 without its data-URL prefix. */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL always yields a string.
      const url = typeof reader.result === "string" ? reader.result : "";
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

/**
 * What is wrong with the header as typed, in the server's words, or null.
 * Lines are counted the way the server stores them: trimmed, blanks dropped.
 */
function headerProblem(header: string): string | null {
  const lines = header
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > HEADER_MAX_LINES) {
    return `The header can have at most ${HEADER_MAX_LINES} lines. Remove some and try again.`;
  }
  const long = lines.findIndex((line) => line.length > HEADER_LINE_MAX);
  if (long !== -1) {
    return `Line ${long + 1} is ${lines[long]!.length} characters long. Each header line can be at most ${HEADER_LINE_MAX}.`;
  }
  return null;
}

/**
 * The institution's letterhead for question papers.
 *
 * Plain lines rather than a template language: the people setting it are
 * administrators, not typesetters, and the paper's layout is Plannr's job. The
 * first line is printed largest, as the institution's name; an empty header
 * prints the organisation's name alone, which is what every paper says until
 * somebody sets this.
 */
export function DocumentsSettings() {
  const utils = api.useUtils();
  const current = api.settings.documents.useQuery();

  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  // undefined: leave the saved logo alone; null: remove it; a pick: replace it.
  const [logo, setLogo] = useState<PickedLogo | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  // Seeded once from what is saved, so a refetch never overwrites typing.
  useEffect(() => {
    if (!current.data || loaded.current) return;
    loaded.current = true;
    setHeader(current.data.header);
    setFooter(current.data.footer ?? "");
  }, [current.data]);

  // A preview is a blob the page made; let it go when it is replaced.
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const save = api.settings.setDocuments.useMutation({
    onSuccess: async () => {
      setError(null);
      setLogo(undefined);
      await utils.settings.documents.invalidate();
      toast.success("Saved. New papers will use this header and footer.");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  // What the form would save: the logo only when it was picked or removed.
  const changes = () => ({
    header,
    footer: footer.trim() || null,
    ...(logo === undefined
      ? {}
      : { logo: logo ? { base64: logo.base64, type: logo.type } : null }),
  });

  // A mutation, though it saves nothing: it carries the picked logo, too big
  // for a query string, and a cached answer would show the logo before last.
  const preview = api.settings.previewDocuments.useMutation({
    onSuccess: ({ pdfBase64 }) => {
      const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      setPreviewUrl(
        URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
      );
    },
    onError: (e) => toast.error(errorMessage(e, "The preview failed.")),
  });

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type as LogoType)) {
      setError("The logo has to be a PNG or a JPEG.");
      return;
    }
    if (file.size > LOGO_LIMIT) {
      setError("The logo has to be 256 KB or smaller.");
      return;
    }
    setError(null);
    const base64 = await readBase64(file);
    setLogo({
      base64,
      type: file.type as LogoType,
      dataUrl: `data:${file.type};base64,${base64}`,
    });
  };

  if (current.isLoading) {
    return (
      <>
        <PageHeader
          title="Documents"
          subtitle="The letterhead on question papers"
        />
        <PageBody width="narrow">
          <Skeleton className="h-64 rounded-[14px]" />
        </PageBody>
      </>
    );
  }

  if (current.error || !current.data) {
    return (
      <>
        <PageHeader
          title="Documents"
          subtitle="The letterhead on question papers"
        />
        <PageBody width="narrow">
          <Callout tone="bad" title="Could not load the document settings">
            {errorMessage(current.error, "Try again in a moment.")}
          </Callout>
        </PageBody>
      </>
    );
  }

  const savedLogo = current.data.logo;
  const showsLogo = logo === undefined ? Boolean(savedLogo) : logo !== null;
  const headerError = headerProblem(header);

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="The letterhead on every question paper written in Plannr"
      />
      <PageBody width="narrow" className="flex flex-col gap-6">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        <Card className="flex flex-col gap-5">
          <Field
            label="Header"
            hint={`Up to ${HEADER_MAX_LINES} lines. The first is printed largest, as the institution's name. Left empty, papers say "${current.data.orgName}".`}
            error={headerError}
          >
            {(id) => (
              <Textarea
                id={id}
                rows={4}
                invalid={headerError !== null}
                value={header}
                onChange={(e) => setHeader(e.target.value)}
                placeholder={`${current.data.orgName}\nAffiliated to ...\nAddress`}
              />
            )}
          </Field>

          <Field
            label="Footer"
            optional
            hint="One line along the foot of every page, beside the page number."
          >
            {(id) => (
              <Input
                id={id}
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                maxLength={FOOTER_MAX}
              />
            )}
          </Field>

          <Field
            label="Logo"
            optional
            hint="A PNG or JPEG of 256 KB or less, printed beside the header."
          >
            {() => (
              <div className="flex flex-wrap items-center gap-3">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo.dataUrl}
                    alt="The logo you picked"
                    className="h-12 w-auto rounded-[6px] shadow-[inset_0_0_0_1px_var(--hair)]"
                  />
                ) : showsLogo ? (
                  <span className="text-muted text-sm">
                    A logo is saved (
                    {Math.round((savedLogo?.bytes ?? 0) / 1024)} KB).
                  </span>
                ) : (
                  <span className="text-muted text-sm">No logo.</span>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  onChange={(e) => {
                    void pickLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  {showsLogo ? "Replace logo" : "Choose a logo"}
                </Button>
                {showsLogo && (
                  <Button
                    variant="danger-quiet"
                    size="sm"
                    onClick={() => setLogo(null)}
                  >
                    Remove logo
                  </Button>
                )}
              </div>
            )}
          </Field>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              disabled={preview.isPending || headerError !== null}
              onClick={() => preview.mutate(changes())}
            >
              {preview.isPending ? "Typesetting…" : "Preview a paper"}
            </Button>
            <Button
              variant="primary"
              disabled={save.isPending || headerError !== null}
              onClick={() => save.mutate(changes())}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>

        {previewUrl && (
          <>
            <Card pad={0} className="hidden overflow-hidden md:block">
              <iframe
                src={previewUrl}
                title="A sample question paper with this header, footer and logo"
                className="h-[70vh] w-full"
              />
            </Card>
            {/* A phone shows a PDF in a tab of its own. It opens from a link
                the person taps: a tab the page opened once the typesetting
                came back would be blocked as a pop-up. */}
            <Callout tone="good" className="md:hidden">
              The preview is ready.{" "}
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-[3px]"
              >
                Open the preview
              </a>
            </Callout>
          </>
        )}
      </PageBody>
    </>
  );
}
