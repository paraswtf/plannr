/**
 * Reading the documents the college sends.
 *
 * Nothing here is a data format anybody chose: the registry emails a printed
 * PDF, a Word table or a spreadsheet, whichever the office that produced it
 * happened to use. All three are zip or zlib containers underneath, so they can
 * be read with nothing but node:zlib — no dependency, and no upload step.
 *
 * These functions know about bytes and layout only. What the rows *mean* is in
 * `src/lib/roster.ts`, which is pure and tested.
 */

import { inflateRawSync, inflateSync } from "node:zlib";

// ─── Zip containers (.xlsx, .docx) ──────────────────────────────────────────

/** One file out of a zip, by name, via the central directory. */
export function zipEntry(zip: Buffer, wanted: string): Buffer {
  const end = zip.lastIndexOf(Buffer.from("PK\x05\x06", "latin1"));
  if (end < 0) throw new Error("not a zip");
  let offset = zip.readUInt32LE(end + 16);
  const count = zip.readUInt16LE(end + 10);

  for (let i = 0; i < count; i++) {
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("latin1");
    const localOffset = zip.readUInt32LE(offset + 42);

    if (name === wanted) {
      const method = zip.readUInt16LE(offset + 10);
      const size = zip.readUInt32LE(offset + 20);
      const localName = zip.readUInt16LE(localOffset + 26);
      const localExtra = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const body = zip.subarray(start, start + size);
      return method === 0 ? body : inflateRawSync(body);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${wanted} is not in this document`);
}

/** Every entry name in a zip, so a workbook can be asked what sheets it has. */
export function zipNames(zip: Buffer): string[] {
  const end = zip.lastIndexOf(Buffer.from("PK\x05\x06", "latin1"));
  if (end < 0) throw new Error("not a zip");
  let offset = zip.readUInt32LE(end + 16);
  const count = zip.readUInt16LE(end + 10);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const nameLength = zip.readUInt16LE(offset + 28);
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString("latin1"));
    offset +=
      46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return names;
}

const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const textOf = (xml: string) =>
  unescapeXml((xml.match(/<(?:w:)?t[^>]*>([^<]*)<\/(?:w:)?t>/g) ?? [])
    .map((tag) => tag.replace(/<[^>]+>/g, ""))
    .join(""));

// ─── Spreadsheets ───────────────────────────────────────────────────────────

export interface Sheet {
  name: string;
  rows: string[][];
}

/** "BC" → 54: which column a cell reference names. */
function columnOf(reference: string): number {
  const letters = /^([A-Z]+)/.exec(reference)?.[1] ?? "A";
  let n = 0;
  for (const letter of letters) n = n * 26 + (letter.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Every sheet of an .xlsx, as rows of plain strings.
 *
 * Values are read as they were typed rather than as they display, so a date
 * comes back as the serial number Excel stores. Nothing here needs one, and
 * guessing at a display format would only invent precision.
 */
export function readWorkbook(file: Buffer): Sheet[] {
  const workbook = zipEntry(file, "xl/workbook.xml").toString("utf8");
  const relationships = zipEntry(file, "xl/_rels/workbook.xml.rels").toString("utf8");

  const shared: string[] = [];
  if (zipNames(file).includes("xl/sharedStrings.xml")) {
    const xml = zipEntry(file, "xl/sharedStrings.xml").toString("utf8");
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) shared.push(textOf(si));
  }

  const target = new Map<string, string>();
  for (const rel of relationships.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = /Id="([^"]+)"/.exec(rel)?.[1];
    const path = /Target="([^"]+)"/.exec(rel)?.[1];
    if (id && path) target.set(id, path.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const sheets: Sheet[] = [];
  for (const tag of workbook.match(/<sheet\b[^>]*>/g) ?? []) {
    const name = unescapeXml(/name="([^"]+)"/.exec(tag)?.[1] ?? "");
    const id = /r:id="([^"]+)"/.exec(tag)?.[1];
    const path = id ? target.get(id) : undefined;
    if (!name || !path) continue;

    const xml = zipEntry(file, `xl/${path}`).toString("utf8");
    const rows: string[][] = [];
    for (const row of xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []) {
      const cells = new Map<number, string>();
      for (const cell of row.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const reference = /r="([A-Z]+\d+)"/.exec(cell)?.[1];
        if (!reference) continue;
        const type = /t="([^"]+)"/.exec(cell)?.[1];
        const value = /<v>([^<]*)<\/v>/.exec(cell)?.[1];
        const text =
          type === "s" && value !== undefined
            ? (shared[Number(value)] ?? "")
            : type === "inlineStr"
              ? textOf(cell)
              : (value ?? "");
        if (text.trim()) cells.set(columnOf(reference), unescapeXml(text).trim());
      }
      if (cells.size === 0) continue;
      const width = Math.max(...cells.keys()) + 1;
      rows.push(Array.from({ length: width }, (_, i) => cells.get(i) ?? ""));
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/** The rows of a Word table, which is how the older lists arrive. */
export function readDocxTables(file: Buffer): string[][][] {
  const xml = zipEntry(file, "word/document.xml").toString("utf8");
  return (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).map((table) =>
    (table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []).map((row) =>
      (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((cell) =>
        textOf(cell).replace(/\s+/g, " ").trim(),
      ),
    ),
  );
}

// ─── Printed PDFs ───────────────────────────────────────────────────────────

interface Cell {
  x: number;
  y: number;
  text: string;
}

/** Every deflated stream in the file that carries drawing operators. */
function contentStreams(file: Buffer): string[] {
  const out: string[] = [];
  const text = file.toString("latin1");
  const marker = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      const inflated = inflateSync(file.subarray(start, end)).toString("latin1");
      if (inflated.includes("BT")) out.push(inflated);
    } catch {
      // Not a deflated stream — an image or a font, which we do not want.
    }
  }
  return out;
}

const PDF_STRING = /\((?:\\.|[^\\()])*\)/g;

function unescapePdf(literal: string): string {
  return literal
    .slice(1, -1)
    .replace(/\\([nrtbf()\\])/g, (_, c: string) =>
      c === "n" ? "\n" : c === "t" ? "\t" : "nrbf".includes(c) ? "" : c,
    )
    .replace(/\\([0-7]{1,3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
}

/**
 * Where each run of text sits on the page.
 *
 * A table in a printed PDF is only text at coordinates — there are no cells —
 * so the column a value belongs to has to be read back off its x position.
 */
function positionedText(stream: string): Cell[] {
  const cells: Cell[] = [];
  let x = 0;
  let y = 0;
  for (const line of stream.replace(/\r/g, "\n").split("\n")) {
    const tm =
      /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm/.exec(
        line,
      );
    if (tm) {
      x = Number(tm[5]);
      y = Number(tm[6]);
    }
    const td = /(-?[\d.]+)\s+(-?[\d.]+)\s+Td/.exec(line);
    if (td && !tm) {
      x += Number(td[1]);
      y += Number(td[2]);
    }
    if (line.includes("TJ") || line.includes("Tj")) {
      const text = (line.match(PDF_STRING) ?? []).map(unescapePdf).join("");
      if (text.trim()) {
        cells.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, text });
      }
    }
  }
  return cells;
}

/** The x range each column of a printed table occupies. */
export type Columns = Array<[name: string, from: number, to: number]>;

export interface TableShape {
  /** The column whose 11-digit value marks where each row is. */
  anchorColumn?: string;
  /** How far above its anchor a cell of the same row may be drawn. */
  above?: number;
  /** And how far below — more than a hair only where cells are centred. */
  below?: number;
}

/**
 * The rows of a printed table, anchored on the one cell that cannot lie.
 *
 * Grouping runs by how close their baselines are does not work here, because a
 * row is not written on one line. The serial number and the division are drawn
 * a fraction off the rest — above on one row, below on the next, wherever
 * centring them in a cell of that height happened to land. And a name too long
 * for its column wraps onto a line of its own, which is nearer the row above
 * than the row it belongs to. Both sit within a whisker of a neighbouring row's
 * baseline, so height alone cannot tell them apart.
 *
 * What can is the column: a column holds one value per row, so a run landing in
 * a column already spoken for is not that row's at all — it is the first line
 * of a wrapped cell belonging to the row below. Anchoring each row on its PRN
 * and filling each column top line first puts every run back where it was
 * printed.
 */
export function readPdfTable(
  file: Buffer,
  columns: Columns,
  shape: TableShape = {},
): Array<Record<string, string>> {
  const { anchorColumn = "prn", above = 8, below = 0.5 } = shape;
  const anchorRange = columns.find(([name]) => name === anchorColumn);
  if (!anchorRange) throw new Error(`no ${anchorColumn} column to anchor rows on`);
  const rows: Array<Record<string, string>> = [];

  for (const stream of contentStreams(file)) {
    const cells = positionedText(stream);
    const anchors = cells
      .filter(
        (cell) =>
          cell.x >= anchorRange[1] &&
          cell.x < anchorRange[2] &&
          /^\d{11}$/.test(cell.text.trim()),
      )
      .map((cell) => cell.y)
      .sort((a, b) => b - a);
    if (anchors.length === 0) continue;

    const started = new Map<number, Record<string, string>>(
      anchors.map((anchor) => [anchor, {}]),
    );

    // Down the page, so a row's own cells claim their columns before the line
    // that wraps up into them from the row below.
    for (const cell of [...cells].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const column = columns.find(([, from, to]) => cell.x >= from && cell.x < to);
      if (!column) continue;

      const reachable = anchors
        .filter((anchor) => cell.y - anchor <= above && anchor - cell.y <= below)
        .sort((a, b) => Math.abs(a - cell.y) - Math.abs(b - cell.y));
      if (reachable.length === 0) continue;

      // A row whose column is still empty wants this run more than a row that
      // already has one: that is how the first line of a wrapped name, which
      // lands nearer the row above, finds the row it was printed for. When no
      // row is short of a value, the run is another line of a cell that wraps,
      // and joins what is there.
      const free = reachable.find((anchor) => started.get(anchor)![column[0]] === undefined);
      const anchor = free ?? reachable[0]!;
      const row = started.get(anchor)!;

      row[column[0]] =
        row[column[0]] === undefined
          ? cell.text.trim()
          : `${row[column[0]]} ${cell.text.trim()}`.trim();
    }

    for (const anchor of anchors) {
      const row = started.get(anchor)!;
      if (/^\d{11}$/.test(row[anchorColumn] ?? "")) rows.push(row);
    }
  }
  return rows;
}
