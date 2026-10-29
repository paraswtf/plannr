import { splitMath, type ReleasedContent } from "~/lib/assignments";
import type { Db } from "../occurrences";
import {
  logoProbeSource,
  mathProbeSource,
  PAPER_TEMPLATE,
  PDF_COUNT_SOURCE,
  pdfPageSource,
} from "./template";
import {
  runTypesetJob,
  TYPESET_TIMEOUT_MS,
  TypesetBusyError,
  TypesetCancelledError,
  TypesetCrashError,
  TypesetTimeoutError,
  type TypesetJob,
  type TypesetReply,
} from "./typesetter";

/**
 * Typesetting question papers with typst.
 *
 * The compiler is `@myriaddreamin/typst-ts-node-compiler` (typst 0.14, fonts
 * built in), run in a child process that is killed after 10 seconds (see
 * typesetter.ts for why a process and not a worker thread). A fixed template
 * reads the paper from a mapped JSON file; question text is inserted as plain
 * strings, and only `$...$` segments (split by `splitMath`, `#` refused) are
 * evaluated, in maths mode, with a scope that removes file, data and plugin
 * access and `std`. Package imports are impossible by construction.
 *
 * Takes `ReleasedContent`, never `PaperContent`: what is typeset can never
 * hold an answer. The JSON handed to typst is also built field by field
 * rather than serialised whole, so a value that carries more than its type
 * says (an answer cast in by mistake) still never reaches the compiler.
 */

/** A message fit to show the person who wrote the paper. */
export class TypesetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypesetError";
  }
}

/** A job ran past its time. Kept apart so a deadline can say more. */
class TypesetTooLongError extends TypesetError {
  constructor() {
    super("This paper took too long to typeset.");
  }
}

/**
 * What a request hands the typesetter besides the job: its abort signal, so
 * a job still waiting when the person has gone is dropped rather than run.
 */
export interface TypesetOptions {
  signal?: AbortSignal;
}

/** What the title block of a paper says. */
export interface PaperMeta {
  title: string;
  /** "Test", "Online test" ... */
  kind: string;
  course: string | null;
  group: string;
  /** "Tue 4 Nov 2026, 10am", already in the institution's time. */
  when: string | null;
  durationMinutes: number | null;
  totalMarks: number;
}

/** The institution's header and footer, as the settings hold them. */
export interface DocumentSettings {
  orgName: string;
  /** Lines; the first is printed largest. Empty means the org's name alone. */
  header: string[];
  footer: string | null;
  logo: { bytes: Uint8Array; type: "image/png" | "image/jpeg" } | null;
}

/** Header text as stored: one line each, blank lines dropped. */
export function headerLines(stored: string | null | undefined): string[] {
  return (stored ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The document settings of an organisation, with the defaults filled in. */
export async function documentSettingsFor(
  db: Db,
  orgId: string,
): Promise<DocumentSettings> {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      name: true,
      settings: {
        select: {
          documentHeader: true,
          documentFooter: true,
          documentLogo: true,
          documentLogoType: true,
        },
      },
    },
  });
  // An organisation without a settings row yet prints its name and nothing
  // else, the same as one whose administrator left everything empty.
  const settings = org.settings;
  const header = headerLines(settings?.documentHeader);
  const footer = settings?.documentFooter?.trim() ?? "";
  const stored = settings?.documentLogoType;
  const type =
    stored === "image/png"
      ? ("image/png" as const)
      : stored === "image/jpeg"
        ? ("image/jpeg" as const)
        : null;
  const logo =
    settings?.documentLogo && settings.documentLogo.length > 0 && type
      ? { bytes: new Uint8Array(settings.documentLogo), type }
      : null;
  return {
    orgName: org.name,
    header: header.length > 0 ? header : [org.name],
    footer: footer.length > 0 ? footer : null,
    logo,
  };
}

// ─── The logo ───────────────────────────────────────────────────────────────

/**
 * The largest logo, in pixels, on either side. A logo is printed 1.7 cm tall,
 * which at 600 dots an inch is about 400 pixels; a picture far bigger than
 * this only costs memory and time each time a paper with it is drawn.
 */
export const LOGO_MAX_SIDE = 4000;

/**
 * The picture's width and height, read from its header: a PNG's IHDR chunk,
 * or a JPEG's start-of-frame segment. Null when there is no such header.
 */
export function logoDimensions(
  bytes: Uint8Array,
  type: "image/png" | "image/jpeg",
): { width: number; height: number } | null {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/png") {
    // The signature, then IHDR first: length, "IHDR", width, height.
    if (buf.length < 24 || buf.toString("latin1", 12, 16) !== "IHDR") {
      return null;
    }
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // A JPEG is a run of segments, each 0xFF, a marker and (for most) a length.
  // The frame header (SOF0 to SOF15, less DHT, JPG and DAC) holds the size.
  let at = 2;
  while (at + 4 <= buf.length) {
    if (buf[at] !== 0xff) return null;
    const marker = buf[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = buf.readUInt16BE(at + 2);
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      if (at + 9 > buf.length) return null;
      return {
        height: buf.readUInt16BE(at + 5),
        width: buf.readUInt16BE(at + 7),
      };
    }
    at += 2 + length;
  }
  return null;
}

/**
 * Checks a logo before it is saved: that its header gives a sensible size and
 * that typst can set it as the header does. Every paper of the institution
 * carries the logo, so one that cannot be read would stop all of them, and
 * only an administrator could put it right. TypesetError, worded for the
 * administrator, when it is refused.
 */
export async function checkLogo(
  logo: NonNullable<DocumentSettings["logo"]>,
  options: TypesetOptions = {},
): Promise<void> {
  const size = logoDimensions(logo.bytes, logo.type);
  if (!size || size.width === 0 || size.height === 0) {
    throw new TypesetError(
      "This picture could not be read. Save it again as a PNG or JPEG and upload that.",
    );
  }
  if (size.width > LOGO_MAX_SIDE || size.height > LOGO_MAX_SIDE) {
    throw new TypesetError(
      `This picture is ${size.width} by ${size.height} pixels. Save a copy at most ${LOGO_MAX_SIDE} pixels on each side (a few hundred is plenty for a logo) and upload that.`,
    );
  }
  const file = logo.type === "image/png" ? "/logo.png" : "/logo.jpg";
  const reply = await run(
    {
      kind: "pdf",
      main: logoProbeSource(file),
      files: { [file]: new Uint8Array(logo.bytes) },
      timestamp: FIXED_TIMESTAMP,
    },
    options,
  );
  if (!reply.ok || !("pdf" in reply)) {
    throw new TypesetError(
      "This picture could not be read. Save it again as a PNG or JPEG and upload that.",
    );
  }
}

// ─── Building what typst reads ──────────────────────────────────────────────

type Segment = { t: string } | { m: string };

const OPTION_LETTERS = "abcdefgh";

function marksLabel(marks: number): string {
  return marks === 1 ? "1 mark" : `${formatNumber(marks)} marks`;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
  if (rest > 0 || hours === 0)
    parts.push(rest === 1 ? "1 minute" : `${rest} minutes`);
  return parts.join(" ");
}

function segmentsOf(text: string, where: string): Segment[] {
  const split = splitMath(String(text));
  if (!split.ok) {
    throw new TypesetError(
      `${where}: maths cannot contain #. Take the # out and try again.`,
    );
  }
  return split.segments.map((s) =>
    "math" in s ? { m: String(s.math) } : { t: String(s.text) },
  );
}

/** Text with paragraphs separated by blank lines, as the template prints it. */
function paragraphsOf(text: string): string[] {
  return String(text)
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

interface PaperData {
  doc: { header: string[]; footer: string | null; logo: "png" | "jpg" | null };
  meta: { title: string; kind: string; facts: Array<[string, string]> };
  instructions: string[];
  sections: Array<{
    title: string | null;
    questions: Array<{
      number: string;
      marks: string;
      text: Segment[];
      code: string | null;
      options: Array<{ label: string; text: Segment[] }>;
    }>;
  }>;
}

/**
 * The JSON the template reads. Every field is named and copied; nothing is
 * spread, so only what is listed here can ever be printed.
 */
export function paperData(args: {
  content: ReleasedContent;
  meta: PaperMeta;
  doc: DocumentSettings;
}): PaperData {
  const { content, meta, doc } = args;
  const facts: Array<[string, string]> = [];
  if (meta.course) facts.push(["Course", String(meta.course)]);
  facts.push(["Group", String(meta.group)]);
  if (meta.when) facts.push(["Date", String(meta.when)]);
  if (meta.durationMinutes) {
    facts.push(["Time allowed", durationLabel(meta.durationMinutes)]);
  }
  facts.push(["Total marks", formatNumber(meta.totalMarks)]);

  const header = doc.header.map(String).filter((l) => l.trim().length > 0);
  let number = 0;
  return {
    doc: {
      header: header.length > 0 ? header : [String(doc.orgName)],
      footer: doc.footer ? String(doc.footer) : null,
      logo: doc.logo ? (doc.logo.type === "image/png" ? "png" : "jpg") : null,
    },
    meta: { title: String(meta.title), kind: String(meta.kind), facts },
    instructions: paragraphsOf(content.instructions ?? ""),
    sections: content.sections.map((section) => ({
      title: section.title?.trim() ? String(section.title) : null,
      questions: section.questions.map((q) => {
        number += 1;
        const where = `Question ${number}`;
        const options =
          q.kind === "choice"
            ? (q.options ?? []).slice(0, OPTION_LETTERS.length).map((o, i) => {
                const letter = OPTION_LETTERS[i]!;
                return {
                  label: `(${letter})`,
                  text: segmentsOf(o, `${where}, option (${letter})`),
                };
              })
            : [];
        return {
          number: String(number),
          marks: marksLabel(Number(q.marks)),
          text: segmentsOf(q.text, where),
          code: q.code?.trim() ? String(q.code) : null,
          options,
        };
      }),
    })),
  };
}

// ─── Running typst ──────────────────────────────────────────────────────────

/**
 * PDFs carry no date (the template sets none), and this fixes the one typst
 * falls back to, so the same paper always gives the same bytes.
 */
const FIXED_TIMESTAMP = 0;

async function run(
  job: TypesetJob,
  options: TypesetOptions & { timeoutMs?: number } = {},
): Promise<TypesetReply> {
  try {
    return await runTypesetJob(job, options);
  } catch (error) {
    if (error instanceof TypesetTimeoutError) throw new TypesetTooLongError();
    if (error instanceof TypesetCrashError) {
      throw new TypesetError(
        "The typesetter stopped before the paper was ready. Try again.",
      );
    }
    if (error instanceof TypesetBusyError) {
      throw new TypesetError(
        "Plannr is typesetting several papers at the moment. Try again in a minute.",
      );
    }
    // TypesetCancelledError goes up as it is: the person who asked has gone,
    // so there is nobody to word it for.
    throw error;
  }
}

const encode = (value: unknown) =>
  new Uint8Array(Buffer.from(JSON.stringify(value), "utf8"));

/**
 * After a failed compile, which question's maths was it? typst's message for
 * bad maths cannot point into the paper, so each question that has maths is
 * compiled on its own until one fails. Null when the maths is not the cause.
 */
async function findBadMaths(
  data: PaperData,
  options: TypesetOptions,
): Promise<{ where: string; error: string } | null> {
  const probes: Array<{ where: string; maths: string[] }> = [];
  for (const section of data.sections) {
    for (const q of section.questions) {
      const own = q.text.flatMap((s) => ("m" in s ? [s.m] : []));
      if (own.length)
        probes.push({ where: `question ${q.number}`, maths: own });
      for (const option of q.options) {
        const maths = option.text.flatMap((s) => ("m" in s ? [s.m] : []));
        if (maths.length) {
          probes.push({
            where: `question ${q.number}, option ${option.label}`,
            maths,
          });
        }
      }
    }
  }
  if (probes.length === 0) return null;
  const reply = await run(
    {
      kind: "probe",
      mains: probes.map((_, i) => mathProbeSource(i)),
      files: { "/probe.json": encode(probes.map((p) => p.maths)) },
    },
    options,
  );
  if (!reply.ok || !("failed" in reply) || reply.failed === null) return null;
  return { where: probes[reply.failed]!.where, error: reply.error ?? "" };
}

/** Typesets a paper written in Plannr. */
export async function typesetPaper(
  args: {
    content: ReleasedContent;
    meta: PaperMeta;
    doc: DocumentSettings;
  },
  options: TypesetOptions = {},
): Promise<{ pdf: Uint8Array; pageCount: number }> {
  const data = paperData(args);
  const files: Record<string, Uint8Array> = { "/data.json": encode(data) };
  if (args.doc.logo) {
    files[data.doc.logo === "png" ? "/logo.png" : "/logo.jpg"] = new Uint8Array(
      args.doc.logo.bytes,
    );
  }

  const reply = await run(
    {
      kind: "pdf",
      main: PAPER_TEMPLATE,
      files,
      timestamp: FIXED_TIMESTAMP,
    },
    options,
  );
  if (reply.ok && "pdf" in reply) {
    return { pdf: reply.pdf, pageCount: reply.pages };
  }

  const bad = await findBadMaths(data, options);
  if (bad) {
    throw new TypesetError(
      `The maths in ${bad.where} could not be typeset (${plain(bad.error)}). Check it and try again.`,
    );
  }
  if (args.doc.logo && /image|decode|png|jpe?g/i.test(errorOf(reply))) {
    throw new TypesetError(
      "The institution's logo could not be read. Upload it again in Settings, as a PNG or JPEG.",
    );
  }
  throw new TypesetError(
    `This paper could not be typeset (${plain(errorOf(reply))}).`,
  );
}

const errorOf = (reply: TypesetReply) =>
  !reply.ok ? reply.error : "error" in reply ? (reply.error ?? "") : "";

/**
 * typst's own words, without its hints: they suggest adding a `#`, which a
 * paper may not have, and talk about command-line flags nobody here has.
 */
function plain(message: string): string {
  const text = message.split(", hints:")[0]!.trim();
  return text.length > 200 ? `${text.slice(0, 200)}...` : text || "no detail";
}

// ─── Any PDF ────────────────────────────────────────────────────────────────

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

function pdfFiles(pdf: Uint8Array): Record<string, Uint8Array> {
  if (
    pdf.length < PDF_MAGIC.length ||
    !PDF_MAGIC.equals(Buffer.from(pdf.subarray(0, PDF_MAGIC.length)))
  ) {
    throw new TypesetError(
      "This file is not a PDF. Upload the paper as a PDF.",
    );
  }
  return { "/paper.pdf": pdf };
}

/** How many pages a PDF has. TypesetError for a file that is not a PDF. */
export async function pdfPageCount(
  pdf: Uint8Array,
  options: TypesetOptions & { timeoutMs?: number } = {},
): Promise<number> {
  const reply = await run(
    { kind: "probe", mains: [PDF_COUNT_SOURCE], files: pdfFiles(pdf) },
    options,
  );
  const error = errorOf(reply);
  const count = /only has (\d+) pages?/.exec(error);
  if (count) return Number(count[1]);
  if (reply.ok && "failed" in reply && reply.failed === null) {
    throw new TypesetError("This PDF has too many pages to show.");
  }
  throw new TypesetError(
    "This PDF could not be read. Save it again as a PDF (without a password on the file) and upload that.",
  );
}

/**
 * How long drawing a released paper's pages may take in all. Releasing runs
 * scrypt, this, and a transaction of at most 25 seconds (waiting included)
 * inside one request the platform stops at 60 seconds; stopped there, it
 * stores nothing and says nothing useful. Measured on 40-page scans (up to
 * 23 MB, far past the 4 MB upload limit), a page took 60 to 300 ms, so a real
 * paper uses a small part of this.
 */
export const PAGES_BUDGET_MS = 30_000;

const TOO_LONG_TO_SHOW =
  "Turning this paper into pages for phones took too long. Try again in a minute, or upload a shorter or smaller PDF.";

/**
 * One SVG per page, for showing a paper on a phone. One job a page, each with
 * up to ten seconds, and all of them within `budgetMs`, counted from the call:
 * a page that cannot start or finish inside what is left fails the whole
 * paper with a message the teacher can act on.
 */
export async function pagesAsSvg(
  pdf: Uint8Array,
  options: TypesetOptions & { budgetMs?: number } = {},
): Promise<string[]> {
  const files = pdfFiles(pdf);
  const deadline = Date.now() + (options.budgetMs ?? PAGES_BUDGET_MS);
  // Waiting behind somebody else's jobs counts against the budget too, so
  // each job is given up once the deadline passes, queued or not.
  const within = async <T>(
    work: (step: { signal: AbortSignal; timeoutMs: number }) => Promise<T>,
  ): Promise<T> => {
    const left = deadline - Date.now();
    if (left <= 0) throw new TypesetError(TOO_LONG_TO_SHOW);
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(left)])
      : AbortSignal.timeout(left);
    try {
      return await work({
        signal,
        timeoutMs: Math.min(TYPESET_TIMEOUT_MS, left),
      });
    } catch (error) {
      // Unless the person went away, a job given up or stopped here ran into
      // the deadline: its wait and its time were both cut to what was left.
      const ranOut =
        error instanceof TypesetTooLongError ||
        error instanceof TypesetCancelledError;
      if (ranOut && !options.signal?.aborted) {
        throw new TypesetError(TOO_LONG_TO_SHOW);
      }
      throw error;
    }
  };

  const count = await within((step) => pdfPageCount(pdf, step));
  const pages: string[] = [];
  for (let page = 1; page <= count; page++) {
    const reply = await within((step) =>
      run({ kind: "svg", main: pdfPageSource(page), files }, step),
    );
    if (!reply.ok || !("svg" in reply)) {
      throw new TypesetError(
        `Page ${page} of this PDF could not be shown (${plain(errorOf(reply))}).`,
      );
    }
    pages.push(reply.svg);
  }
  return pages;
}
