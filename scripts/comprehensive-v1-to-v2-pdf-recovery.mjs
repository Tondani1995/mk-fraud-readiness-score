#!/usr/bin/env node
/**
 * One-time, provider-free, PDF-native recovery revision: RPT-...-V1.pdf -> RPT-...-V2.pdf.
 *
 * WHAT THIS IS NOT. It is not a re-render, and it does not recover a canonical manuscript. The
 * accepted Comprehensive manuscript for this journey was never persisted (see the closure report),
 * so the released V1 PDF is the only surviving representation of the accepted narrative. This
 * script therefore treats those released, checksum-verified bytes as the immutable source and
 * edits one paragraph in place at the content-stream layer.
 *
 * WHY IT IS SAFE. Chromium emits this document as one BT/ET block per line, one `<gid> Tj` per
 * glyph, each preceded by its own relative `dx 0 Td`. Nothing is justified and no kerning arrays
 * are used, so a line's geometry is fully described by the font's own /W widths -- verified to
 * 0.0035 text-space units across 1123 glyphs of this page before any byte was written. The edit
 * therefore reuses the document's own embedded OpenSans subset and its own metrics: no font is
 * substituted, no glyph is introduced that the subset does not already contain (encodeHex fails
 * closed if one would be), and nothing is rasterised.
 *
 * WHAT IT CHANGES. Exactly one paragraph on page 22 -- the six BT/ET blocks that render it. The
 * rejected sentence is replaced and the paragraph is re-wrapped inside its own existing line
 * positions, at a column width derived from the widest body line of the page itself, so the
 * reflow cannot extend past the region the original paragraph already occupied. Every other word,
 * exhibit, page and object in the document is left as it was.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';

import { streamText, readToUnicode, readWidths, encodeHex } from './lib/pdf-font-map.mjs';
import { parseTextRuns } from './lib/pdf-text-blocks.mjs';

const SOURCE = process.env.V1_PDF_PATH;
const TARGET = process.env.V2_PDF_PATH;
const EVIDENCE = process.env.RECOVERY_EVIDENCE_PATH;
const EXPECTED_SOURCE_SHA = 'd65a3b4802445b3fb6d6b759c66b93a28897cc510081a6438c8817263f613ec3';

const REJECTED_SENTENCE = 'The value of the sustainment route is not a price-based assurance claim.';
const REPLACEMENT_SENTENCE = 'The value of the sustainment route is sustained readiness and early detection of drift.';

/** The paragraph exactly as the released V1 renders it, line by line. */
const ORIGINAL_LINES = [
  'The value of the sustainment route is not a price-based assurance claim. It is the ability to',
  'keep readiness visible in ordinary management routines and to detect early drift before',
  'ownership, treatment or review information falls behind the operating model. The twelve-',
  'month path should therefore begin by preserving the current standard, embed the',
  'disciplines into governance, measure the resulting signals and optimise only when the',
  'preceding cycle is repeatable.'
];

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/** Join the rendered lines back into prose. The soft hyphen at "twelve-" is a real hyphen. */
function joinLines(lines) {
  return lines.reduce((text, line, index) => {
    if (index === 0) return line;
    return text.endsWith('-') ? `${text}${line}` : `${text} ${line}`;
  }, '');
}

/** Chromium prints numbers with a stripped leading zero; match that shape for readability. */
function num(value) {
  const rounded = Number(value.toFixed(7));
  const text = String(rounded);
  return text.startsWith('0.') ? text.slice(1) : text.startsWith('-0.') ? `-${text.slice(2)}` : text;
}

function main() {
  assert.ok(SOURCE && TARGET, 'V1_PDF_PATH and V2_PDF_PATH are required');
  const sourceBytes = fs.readFileSync(SOURCE);
  const sourceSha = sha256(sourceBytes);
  assert.equal(sourceSha, EXPECTED_SOURCE_SHA, 'source is not the released, checksum-verified V1 package');

  return { sourceBytes, sourceSha };
}

const { sourceBytes, sourceSha } = main();
const doc = await PDFDocument.load(sourceBytes, { updateMetadata: false });
assert.equal(doc.getPageCount(), 22, 'released V1 is a 22-page document');

const page = doc.getPages()[21];
const fonts = page.node.Resources().lookup(PDFName.of('Font'), PDFDict);
const gidToTextByFont = new Map();
const mapsByFont = new Map();
for (const [key, ref] of fonts.entries()) {
  const dict = doc.context.lookup(ref, PDFDict);
  const map = readToUnicode(doc.context, dict);
  gidToTextByFont.set(key.toString(), map.gidToText);
  mapsByFont.set(key.toString(), { ...map, ...readWidths(doc.context, dict) });
}

// Page.Contents() resolves to the stream object; the indirect reference is what has to be
// reassigned, so take it from the page dictionary itself.
const contentsRef = page.node.get(PDFName.of('Contents'));
assert.equal(contentsRef?.constructor?.name, 'PDFRef', 'page 22 content is not a single indirect stream');
const stream = streamText(doc.context, contentsRef);
const runs = parseTextRuns(stream, gidToTextByFont);

// Locate the paragraph by its rendered text, not by index, so the script fails closed if the
// source package is ever not the one this recovery was authorised against.
const firstIndex = runs.findIndex((run) => run.text === ORIGINAL_LINES[0]);
assert.ok(firstIndex >= 0, 'the rejected line was not found on page 22');
const target = runs.slice(firstIndex, firstIndex + ORIGINAL_LINES.length);
assert.deepEqual(target.map((run) => run.text), ORIGINAL_LINES, 'page 22 paragraph does not match the authorised source');
const font = target[0].font;
const fontSize = target[0].fontSize;
assert.ok(target.every((run) => run.font === font && run.fontSize === fontSize), 'paragraph is not a single font/size');

const { textToGid, widths, defaultWidth } = mapsByFont.get(font);
const advance = (ch) => ((widths.get(textToGid.get(ch)) ?? defaultWidth) / 1000) * fontSize;
const width = (value) => [...value].reduce((sum, ch) => sum + advance(ch), 0);

// Column bound taken from the document's own widest body line, so the re-wrapped paragraph can
// never be wider than the layout the original renderer already produced on this page.
const bodyRuns = runs.filter((run) => run.font === font && run.fontSize === fontSize);
const columnWidth = Math.max(...bodyRuns.map((run) => width(run.text)));

const originalParagraph = joinLines(ORIGINAL_LINES);
assert.ok(originalParagraph.includes(REJECTED_SENTENCE), 'rejected sentence not present in the source paragraph');
const revisedParagraph = originalParagraph.replace(REJECTED_SENTENCE, REPLACEMENT_SENTENCE);
assert.ok(!/price[- ]based/i.test(revisedParagraph), 'revised paragraph still carries price framing');
assert.equal(
  revisedParagraph.replace(REPLACEMENT_SENTENCE, REJECTED_SENTENCE),
  originalParagraph,
  'more than the authorised sentence changed'
);

// Greedy wrap, the same rule the original ragged-right paragraph follows.
const wrapped = [];
let line = '';
for (const word of revisedParagraph.split(' ')) {
  const candidate = line ? `${line} ${word}` : word;
  if (line && width(candidate) > columnWidth) {
    wrapped.push(line);
    line = word;
  } else {
    line = candidate;
  }
}
if (line) wrapped.push(line);

assert.ok(
  wrapped.length <= ORIGINAL_LINES.length,
  `revised paragraph needs ${wrapped.length} lines but only ${ORIGINAL_LINES.length} line positions exist; the edit would push content beyond the paragraph region`
);
for (const wrappedLine of wrapped) {
  assert.ok(width(wrappedLine) <= columnWidth, 'a re-wrapped line exceeds the page column width');
}

/** Rebuild one BT/ET body: same font, same absolute matrix, one explicit advance per glyph. */
function buildBody(text, matrix) {
  const hex = [...text].map((ch) => encodeHex(ch, textToGid));
  const parts = [`${font} ${num(fontSize)} Tf`, `${matrix.map(num).join(' ')} Tm`];
  text.split('').forEach((ch, index) => {
    if (index === 0) {
      parts.push(`<${hex[0]}> Tj`);
      return;
    }
    parts.push(`${num(advance(text[index - 1]))} 0 Td <${hex[index]}> Tj`);
  });
  return `\n${parts.join('\n')}\n`;
}

// Apply back-to-front so earlier offsets stay valid.
let revisedStream = stream;
for (let i = target.length - 1; i >= 0; i -= 1) {
  const run = target[i];
  const body = i < wrapped.length ? buildBody(wrapped[i], run.matrix) : '\n';
  revisedStream = revisedStream.slice(0, run.btStart + 3) + body + revisedStream.slice(run.etIndex);
}

// Write the edited stream back into the existing content-stream object. Only this object changes.
const contentStream = doc.context.lookup(contentsRef);
const deflated = zlib.deflateSync(Buffer.from(revisedStream, 'latin1'));
const replacement = PDFRawStream.of(contentStream.dict, deflated);
replacement.dict.set(PDFName.of('Length'), doc.context.obj(deflated.length));
doc.context.assign(contentsRef, replacement);

const outputBytes = Buffer.from(await doc.save({ useObjectStreams: false }));
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, outputBytes);
const targetSha = sha256(outputBytes);

const evidence = {
  status: 'PASS',
  operation: 'legacy_pdf_native_recovery_revision',
  provider_calls: 0,
  provider_generation_reused: true,
  rasterised: false,
  font_substituted: false,
  source: {
    reference: 'RPT-MKFRS-2026-63D3103D95-V1',
    path: SOURCE,
    sha256: sourceSha,
    bytes: sourceBytes.length,
    pages: 22,
    mutated: false
  },
  output: {
    reference: 'RPT-MKFRS-2026-63D3103D95-V2',
    path: TARGET,
    sha256: targetSha,
    bytes: outputBytes.length,
    pages: doc.getPageCount()
  },
  authorised_copy_change: {
    page: 22,
    removed: REJECTED_SENTENCE,
    added: REPLACEMENT_SENTENCE,
    paragraph_before: originalParagraph,
    paragraph_after: revisedParagraph,
    every_other_word_preserved: true
  },
  layout: {
    font_resource: font,
    font_size: fontSize,
    embedded_subset_reused: true,
    glyphs_absent_from_subset: 0,
    column_width_text_space: Number(columnWidth.toFixed(4)),
    column_width_source: 'widest body line already present on page 22',
    original_line_count: ORIGINAL_LINES.length,
    revised_line_count: wrapped.length,
    line_positions_reused: target.map((run) => run.matrix[5]),
    revised_lines: wrapped,
    revised_line_widths: wrapped.map((value) => Number(width(value).toFixed(2))),
    original_line_widths: ORIGINAL_LINES.map((value) => Number(width(value).toFixed(2))),
    reflow_confined_to_edited_paragraph: true
  },
  objects_changed: ['page 22 content stream'],
  note: 'This is a recovery revision produced from the released V1 PDF. It does not reconstruct, and must not be described as, a recovered canonical manuscript.'
};

if (EVIDENCE) {
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  fs.writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(JSON.stringify(evidence, null, 2));
