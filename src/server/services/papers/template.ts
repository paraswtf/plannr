/**
 * The typst source every paper written in Plannr is set with.
 *
 * A fixed string: nothing a teacher types is ever pasted into it. The paper
 * arrives as `/data.json`, and the template inserts every piece of text as a
 * typst string, which typst prints exactly as written, with no markup. The
 * only text typst evaluates is maths, segment by segment, already split out by
 * `splitMath` with `#` refused, so maths mode never reaches the scripting
 * language. Its scope switches off `std` (the way back to every built-in) and,
 * for good measure, each built-in that reads a file, loads data or runs a
 * plugin. In maths mode none of those are reachable by name in the first
 * place; the scope makes that independent of what a later typst exposes.
 * Package imports need `#import`, which needs `#`, so they cannot happen.
 *
 * `include` is quoted because it is a keyword in typst's code syntax.
 */
export const MATH_SCOPE = `(std: none, eval: none, read: none, json: none, yaml: none, toml: none, csv: none, xml: none, cbor: none, image: none, plugin: none, "include": none, pdf: none, sys: none, html: none)`;

export const PAPER_TEMPLATE = `
#let data = json("/data.json")
#let doc = data.doc
#let meta = data.meta
#let mathscope = ${MATH_SCOPE}

#let rich(segments) = {
  for seg in segments {
    if "m" in seg {
      math.equation(block: false, eval(seg.m, mode: "math", scope: mathscope))
    } else {
      seg.t.split("\\n").join(linebreak())
    }
  }
}

#set document(title: meta.title, date: none)
#set text(size: 11pt, lang: "en")
#set par(leading: 0.62em)
#set page(
  paper: "a4",
  margin: (x: 2cm, top: 1.8cm, bottom: 2.2cm),
  footer: context {
    set text(size: 8.5pt, fill: luma(80))
    line(length: 100%, stroke: 0.4pt + luma(170))
    v(-0.3em)
    grid(
      columns: (1fr, auto),
      column-gutter: 1em,
      if doc.footer != none { doc.footer } else { [] },
      [Page #counter(page).get().first() of #counter(page).final().first()],
    )
  },
)

#let header-lines = stack(
  spacing: 0.4em,
  ..doc.header.enumerate().map(((i, entry)) => if i == 0 {
    text(size: 15pt, weight: "bold", entry)
  } else {
    text(size: 10pt, entry)
  }),
)

#if doc.logo == "png" or doc.logo == "jpg" {
  grid(
    columns: (auto, 1fr),
    column-gutter: 0.9em,
    align: horizon,
    if doc.logo == "png" { image("/logo.png", height: 1.7cm) } else { image("/logo.jpg", height: 1.7cm) },
    header-lines,
  )
} else {
  align(center, header-lines)
}

#v(0.3em)
#line(length: 100%, stroke: 0.8pt)
#v(0.4em)

#align(center, text(size: 14pt, weight: "bold", meta.title))
#align(center, text(size: 10pt, fill: luma(60), meta.kind))
#v(0.5em)
#grid(
  columns: (1fr, 1fr),
  row-gutter: 0.55em,
  column-gutter: 1em,
  ..meta.facts.map(fact => [#strong(fact.at(0) + ":") #fact.at(1)]),
)
#v(0.4em)
#line(length: 100%, stroke: 0.5pt + luma(150))

#if data.instructions.len() > 0 {
  v(0.3em)
  block(below: 0.5em, text(weight: "bold", "Instructions"))
  for paragraph in data.instructions {
    block(below: 0.45em, paragraph.split("\\n").join(linebreak()))
  }
  v(0.3em)
  line(length: 100%, stroke: 0.5pt + luma(150))
}

#for section in data.sections {
  v(0.8em)
  if section.title != none {
    block(below: 0.7em, text(size: 12pt, weight: "bold", section.title))
  }
  for q in section.questions {
    block(
      breakable: true,
      below: 1em,
      grid(
        columns: (1.9em, 1fr, auto),
        column-gutter: 0.6em,
        text(weight: "bold", q.number + "."),
        {
          rich(q.text)
          if q.code != none {
            v(0.2em)
            block(
              fill: luma(244),
              inset: 7pt,
              radius: 3pt,
              width: 100%,
              text(size: 9.5pt, raw(q.code, block: true)),
            )
          }
          if q.options.len() > 0 {
            v(0.2em)
            grid(
              columns: (2em, 1fr),
              row-gutter: 0.5em,
              ..q.options.map(option => (option.label, rich(option.text))).flatten(),
            )
          }
        },
        text(size: 10pt, fill: luma(40), q.marks),
      ),
    )
  }
}
`;

/** The main file that checks one question's maths on its own. */
export function mathProbeSource(index: number): string {
  return `
#let mathscope = ${MATH_SCOPE}
#for m in json("/probe.json").at(${index}) {
  math.equation(block: false, eval(m, mode: "math", scope: mathscope))
}
`;
}

/**
 * Sets a logo alone, the way the paper's header does, so a picture typst
 * cannot read is found when it is saved rather than on every paper after.
 */
export function logoProbeSource(file: "/logo.png" | "/logo.jpg"): string {
  return `#image("${file}", height: 1.7cm)`;
}

/** One page of a PDF as an image on an A4-wide page, for `pagesAsSvg`. */
export function pdfPageSource(page: number): string {
  if (!Number.isInteger(page) || page < 1) throw new Error("Bad page number.");
  return `
#set page(width: 210mm, height: auto, margin: 0pt)
#image("/paper.pdf", page: ${page}, width: 100%)
`;
}

/**
 * Asks for a page no PDF has. typst answers with how many the file does have,
 * which is the cheapest way to count them without parsing the PDF here.
 */
export const PDF_COUNT_SOURCE = `#image("/paper.pdf", page: 100000)`;
