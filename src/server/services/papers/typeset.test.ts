import { crc32, deflateSync } from "node:zlib";

import { afterAll, describe, expect, it } from "vitest";

import type { ReleasedContent } from "~/lib/assignments";
import { SAMPLE_META, SAMPLE_PAPER } from "./sample";
import {
  checkLogo,
  LOGO_MAX_SIDE,
  logoDimensions,
  PAGES_BUDGET_MS,
  pagesAsSvg,
  paperData,
  pdfPageCount,
  TypesetError,
  typesetPaper,
  type DocumentSettings,
} from "./typeset";
import { runTypesetJob, stopTypesetter } from "./typesetter";

/**
 * Typesetting papers with typst, for real: these run the compiler.
 *
 * The properties that matter are that a paper comes out, that text a teacher
 * typed is never treated as typst code, and that an answer can never reach a
 * printed page even if one is handed in by mistake.
 */

afterAll(() => stopTypesetter());

const DOC: DocumentSettings = {
  orgName: "Example Institute",
  header: ["Example Institute of Studies", "Department of Computing"],
  footer: "Confidential until the test begins",
  logo: null,
};

const decode = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1");

/** The smallest valid PNG: one transparent pixel. */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * A greyscale PNG, drawn here so no picture has to be kept in the repo.
 * `draw` gives each pixel's grey from its position.
 */
function greyPng(
  width: number,
  height: number,
  draw: (x: number, y: number) => number,
): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits per sample
  ihdr[9] = 0; // greyscale
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rows[y * (width + 1) + 1 + x] = draw(x, y);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Only a JPEG's markers up to its frame header, which is all the size needs. */
function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.alloc(14)]);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

describe("typesetting a paper", () => {
  it("sets a paper with maths, code and choices", async () => {
    const { pdf, pageCount } = await typesetPaper({
      content: SAMPLE_PAPER,
      meta: SAMPLE_META,
      doc: DOC,
    });
    expect(decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(pageCount).toBe(1);
  }, 30_000);

  it("prints text exactly as typed, markup and all", async () => {
    // Every one of these would do something in typst markup. As strings they
    // are only characters, so the paper still sets.
    const content: ReleasedContent = {
      instructions:
        '#set page(paper: "a5") and *bold* and _under_ and @ref <label>',
      sections: [
        {
          title: '#read("/data.json")',
          questions: [
            {
              key: "q1",
              text: '#import "@preview/cetz:0.3.0": * then ] [ and `raw` and // not a comment',
              marks: 1,
              kind: "text",
            },
          ],
        },
      ],
    };
    const { pageCount } = await typesetPaper({
      content,
      meta: SAMPLE_META,
      doc: DOC,
    });
    expect(pageCount).toBe(1);
  }, 30_000);

  it("refuses # in maths, naming the question", async () => {
    const content: ReleasedContent = {
      instructions: "",
      sections: [
        {
          questions: [
            { key: "q1", text: "Fine $x^2$", marks: 1, kind: "text" },
            {
              key: "q2",
              text: 'Sneaky $#read("/data.json")$',
              marks: 1,
              kind: "text",
            },
          ],
        },
      ],
    };
    const attempt = typesetPaper({ content, meta: SAMPLE_META, doc: DOC });
    await expect(attempt).rejects.toBeInstanceOf(TypesetError);
    await expect(attempt).rejects.toThrow(
      /^Question 2: maths cannot contain #/,
    );
  });

  it("refuses # in an option's maths, naming the option", () => {
    expect(() =>
      paperData({
        content: {
          instructions: "",
          sections: [
            {
              questions: [
                {
                  key: "q1",
                  text: "Pick one",
                  marks: 1,
                  kind: "choice",
                  options: ["$x$", "$#x$"],
                },
              ],
            },
          ],
        },
        meta: SAMPLE_META,
        doc: DOC,
      }),
    ).toThrow(/^Question 1, option \(b\): maths cannot contain #/);
  });

  it("says which question's maths typst could not set", async () => {
    const content: ReleasedContent = {
      instructions: "",
      sections: [
        {
          questions: [
            { key: "q1", text: "Fine $x^2$", marks: 1, kind: "text" },
            // Several letters together are a name in typst's maths, and this
            // one names nothing.
            { key: "q2", text: "Broken $speed$", marks: 1, kind: "text" },
          ],
        },
      ],
    };
    await expect(
      typesetPaper({ content, meta: SAMPLE_META, doc: DOC }),
    ).rejects.toThrow(/^The maths in question 2 could not be typeset/);
  }, 30_000);

  it("gives the same bytes whether or not an answer was cast in", async () => {
    // The type says a released question has no answer. This hands one in
    // anyway, the way a careless caller could, and the PDF must not change.
    const leaky = structuredClone(SAMPLE_PAPER);
    const first = leaky.sections[0]!.questions[0]! as unknown as Record<
      string,
      unknown
    >;
    first.answer = 1;
    first.answerKey = "THE-ANSWER-IS-B";
    const clean = await typesetPaper({
      content: SAMPLE_PAPER,
      meta: SAMPLE_META,
      doc: DOC,
    });
    const withAnswer = await typesetPaper({
      content: leaky,
      meta: SAMPLE_META,
      doc: DOC,
    });
    expect(Buffer.from(withAnswer.pdf).equals(Buffer.from(clean.pdf))).toBe(
      true,
    );
    // And the reason: what typst is given never held the answer at all.
    const given = JSON.stringify(
      paperData({ content: leaky, meta: SAMPLE_META, doc: DOC }),
    );
    expect(given).not.toContain("THE-ANSWER-IS-B");
    expect(given).not.toContain('"answer"');
  }, 30_000);

  it("prints the logo when there is one", async () => {
    const png = ONE_PIXEL_PNG;
    const { pdf } = await typesetPaper({
      content: SAMPLE_PAPER,
      meta: SAMPLE_META,
      doc: { ...DOC, logo: { bytes: new Uint8Array(png), type: "image/png" } },
    });
    const without = await typesetPaper({
      content: SAMPLE_PAPER,
      meta: SAMPLE_META,
      doc: DOC,
    });
    expect(pdf.length).toBeGreaterThan(without.pdf.length);
  }, 30_000);
});

describe("any PDF", () => {
  /** A paper long enough to need a second page. */
  const twoPages: ReleasedContent = {
    instructions: "",
    sections: [
      {
        questions: Array.from({ length: 30 }, (_, i) => ({
          key: `q${i}`,
          text: `Question about $x^${i}$. ${"Some words to fill the line. ".repeat(4)}`,
          marks: 2,
          kind: "text" as const,
        })),
      },
    ],
  };

  it("counts the pages and shows each as an SVG at A4 width", async () => {
    const { pdf, pageCount } = await typesetPaper({
      content: twoPages,
      meta: SAMPLE_META,
      doc: DOC,
    });
    expect(pageCount).toBe(2);
    expect(await pdfPageCount(pdf)).toBe(2);
    const pages = await pagesAsSvg(pdf);
    expect(pages).toHaveLength(2);
    for (const svg of pages) {
      expect(svg.startsWith("<svg")).toBe(true);
      // 210mm in points.
      expect(svg).toMatch(/viewBox="0 0 595\.2/);
      expect(svg).not.toMatch(/<script/i);
    }
  }, 60_000);

  it("counts a one-page PDF", async () => {
    const { pdf } = await typesetPaper({
      content: SAMPLE_PAPER,
      meta: SAMPLE_META,
      doc: DOC,
    });
    expect(await pdfPageCount(pdf)).toBe(1);
  }, 30_000);

  it("refuses a file that is not a PDF", async () => {
    await expect(
      pdfPageCount(new Uint8Array(Buffer.from("GIF89a not a pdf"))),
    ).rejects.toThrow(/not a PDF/);
    await expect(
      pagesAsSvg(new Uint8Array(Buffer.from("%PDF-1.7 but broken inside"))),
    ).rejects.toBeInstanceOf(TypesetError);
  }, 30_000);
});

describe("checking a logo before it is saved", () => {
  it("reads the size from a PNG's or a JPEG's header", () => {
    expect(
      logoDimensions(
        greyPng(30, 20, () => 0),
        "image/png",
      ),
    ).toEqual({
      width: 30,
      height: 20,
    });
    expect(logoDimensions(jpegHeader(640, 480), "image/jpeg")).toEqual({
      width: 640,
      height: 480,
    });
    expect(logoDimensions(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg")).toBe(
      null,
    );
  });

  it("takes a picture typst can print", async () => {
    await expect(
      checkLogo({ bytes: new Uint8Array(ONE_PIXEL_PNG), type: "image/png" }),
    ).resolves.toBeUndefined();
  }, 30_000);

  it("refuses one cut short, which would stop every paper", async () => {
    const png = greyPng(200, 100, (x, y) => (x * y) % 256);
    const cut = new Uint8Array(png.subarray(0, Math.floor(png.length / 2)));
    await expect(
      checkLogo({ bytes: cut, type: "image/png" }),
    ).rejects.toBeInstanceOf(TypesetError);
  }, 30_000);

  it("refuses one whose size would cost every paper time and memory", async () => {
    // A big blank picture compresses to almost nothing, so its file size
    // says nothing about what drawing it costs. The header gives it away.
    const huge = greyPng(LOGO_MAX_SIDE + 1, 10, () => 255);
    expect(huge.length).toBeLessThan(256 * 1024);
    await expect(
      checkLogo({ bytes: new Uint8Array(huge), type: "image/png" }),
    ).rejects.toThrow(/at most 4000 pixels/);
    await expect(
      checkLogo({
        bytes: new Uint8Array(jpegHeader(12_000, 12_000)),
        type: "image/jpeg",
      }),
    ).rejects.toThrow(/12000 by 12000/);
  }, 30_000);
});

describe("opening a long paper to students", () => {
  /**
   * A scanned paper: a page-sized picture of lines of "text" on each page.
   * Releasing draws every page inside one request that the platform stops at
   * 60 seconds, so this measures that 40 pages, the most a release takes, fit
   * well inside the time set aside for drawing them. Measured here at about
   * 60 ms a page for 150 dpi scans, and 300 ms for 600 dpi ones.
   */
  it("draws 40 scanned pages well inside the release's budget", async () => {
    const scans = [0, 1].map((seed) =>
      greyPng(1240, 1754, (x, y) => {
        const line = Math.floor(y / 28);
        const inText = y % 28 < 14 && x > 100 && x < 1140;
        const word = Math.floor((x + line * 37 + seed * 11) / 45) % 5;
        return inText && word !== 0 ? 40 : 250;
      }),
    );
    const source = Array.from(
      { length: 40 },
      (_, i) => `#image("/scan${i % 2}.png", width: 100%)`,
    ).join("\n#pagebreak()\n");
    const made = await runTypesetJob(
      {
        kind: "pdf",
        main: `#set page(paper: "a4", margin: 0pt)\n${source}`,
        files: {
          "/scan0.png": new Uint8Array(scans[0]!),
          "/scan1.png": new Uint8Array(scans[1]!),
        },
        timestamp: 0,
      },
      { timeoutMs: 30_000 },
    );
    if (!made.ok || !("pdf" in made)) throw new Error("no scan was made");
    expect(made.pages).toBe(40);

    const started = Date.now();
    const pages = await pagesAsSvg(made.pdf);
    const took = Date.now() - started;
    expect(pages).toHaveLength(40);
    expect(took).toBeLessThan(PAGES_BUDGET_MS / 2);
  }, 120_000);

  it("gives up with a message the teacher can act on when it runs out of time", async () => {
    const { pdf } = await typesetPaper({
      content: SAMPLE_PAPER,
      meta: SAMPLE_META,
      doc: DOC,
    });
    await expect(pagesAsSvg(pdf, { budgetMs: 1 })).rejects.toThrow(
      /took too long/,
    );
    // The typesetter is fine afterwards.
    expect(await pagesAsSvg(pdf)).toHaveLength(1);
  }, 60_000);
});
