import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';

/**
 * Deterministic, provider-free, PDF-native recovery of an already-released Comprehensive package.
 *
 * This exists for one historical case. The accepted manuscript for the first real Preview
 * Comprehensive package was never persisted -- the Comprehensive branch rendered the PDF from an
 * in-memory manuscript and never crossed the provenance boundary -- so the released, checksum
 * verified PDF is the only surviving representation of the accepted narrative. It cannot be
 * re-rendered, and re-deriving it from extracted text would substitute a derived document for the
 * accepted one. The one owner-rejected sentence is therefore corrected in place, in the page's own
 * content stream.
 *
 * WHY THIS IS SAFE TO DO AT THE PDF LAYER. Chromium emits this document as one BT/ET block per
 * line, one `<gid> Tj` per glyph, each preceded by its own relative `dx 0 Td`. Nothing is justified
 * and no kerning arrays are used, so a line's geometry is fully described by the font's own /W
 * widths -- verified to 0.0035 text-space units across 1123 glyphs of the target page before this
 * was first run. The edit therefore reuses the document's own embedded subset and its own metrics:
 * no font is substituted, no glyph outside the subset can be introduced (encodeGlyphs fails
 * closed), and nothing is rasterised. Every other word, exhibit, page and object is untouched.
 *
 * The function is pure: bytes in, bytes out, no I/O and no clock. Re-running it on the same input
 * reproduces the same output bytes.
 */

export const RECOVERY_METHOD = 'pdf-native-content-stream-copy-correction-v1';

export interface PdfNativeRecoveryPlan {
  /** Page (1-based) carrying the paragraph to correct. */
  page: number;
  /** The paragraph exactly as the source renders it, line by line. */
  originalLines: string[];
  /** The sentence to remove, which must appear in the joined paragraph. */
  removedSentence: string;
  /** The sentence to put in its place. */
  addedSentence: string;
}

export interface PdfNativeRecoveryResult {
  bytes: Buffer;
  sha256: string;
  pageCount: number;
  fontResource: string;
  fontSize: number;
  columnWidth: number;
  originalParagraph: string;
  revisedParagraph: string;
  revisedLines: string[];
  originalLineWidths: number[];
  revisedLineWidths: number[];
  lineBaselines: number[];
}

const sha256 = (bytes: Buffer | Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');

function streamText(context: any, ref: any): string {
  const stream = context.lookup(ref);
  let raw = stream instanceof PDFRawStream ? stream.contents : stream.getContents();
  const filter = stream.dict.get(PDFName.of('Filter'))?.toString() ?? '';
  if (filter.includes('FlateDecode')) raw = zlib.inflateSync(Buffer.from(raw));
  return Buffer.from(raw).toString('latin1');
}

/** glyph id -> text, inverted from the font's own ToUnicode CMap. */
function readToUnicode(context: any, fontDict: any) {
  const ref = fontDict.get(PDFName.of('ToUnicode'));
  if (!ref) throw new Error('font has no ToUnicode CMap');
  const text = streamText(context, ref);
  const gidToText = new Map<number, string>();
  const hexToString = (hex: string) => {
    let out = '';
    for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return out;
  };
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      gidToText.set(parseInt(pair[1], 16), hexToString(pair[2]));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const row of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(row[1], 16);
      const hi = parseInt(row[2], 16);
      const start = parseInt(row[3], 16);
      for (let gid = lo; gid <= hi; gid += 1) gidToText.set(gid, String.fromCharCode(start + (gid - lo)));
    }
  }
  const textToGid = new Map<string, number>();
  for (const [gid, value] of gidToText) {
    // A subset can map several ids to the same text. Keep the lowest deterministically so repeated
    // runs produce identical bytes.
    const existing = textToGid.get(value);
    if (existing === undefined || gid < existing) textToGid.set(value, gid);
  }
  return { gidToText, textToGid };
}

/** glyph id -> advance width in 1/1000 em, from the descendant font's /W array. */
function readWidths(context: any, fontDict: any) {
  const descendants = context.lookup(fontDict.get(PDFName.of('DescendantFonts')));
  const descendant = context.lookup(descendants.get(0), PDFDict);
  const dw = context.lookup(descendant.get(PDFName.of('DW')));
  const widths = new Map<number, number>();
  const wArray = descendant.get(PDFName.of('W'));
  if (wArray) {
    const w = context.lookup(wArray);
    let i = 0;
    while (i < w.size()) {
      const first = context.lookup(w.get(i)).asNumber();
      const next = context.lookup(w.get(i + 1));
      if (typeof next.size === 'function') {
        for (let k = 0; k < next.size(); k += 1) widths.set(first + k, context.lookup(next.get(k)).asNumber());
        i += 2;
      } else {
        const last = next.asNumber();
        const width = context.lookup(w.get(i + 2)).asNumber();
        for (let gid = first; gid <= last; gid += 1) widths.set(gid, width);
        i += 3;
      }
    }
  }
  return { widths, defaultWidth: typeof dw?.asNumber === 'function' ? dw.asNumber() : 1000 };
}

type Glyph = { gid: number; dx: number; font: string | null; fontSize: number | null; matrix: number[] | null };
type TextRun = { btStart: number; etIndex: number; glyphs: Glyph[]; text: string; font: string; fontSize: number; matrix: number[] };

const TOKEN = /(<[0-9A-Fa-f]*>)|(\/[A-Za-z0-9#+.-]+)|(-?\d*\.?\d+)|([A-Za-z'"*]+)|(\[)|(\])/g;

/**
 * Reads exactly the shape Chromium emits inside BT/ET: a Tf, an absolute Tm, then one `<gid> Tj`
 * per glyph each preceded by its own relative `dx 0 Td`. Deliberately narrow -- anything else is
 * simply not collected, so an unexpected document produces no match and the caller fails closed.
 */
function parseTextRuns(stream: string, gidToTextByFont: Map<string, Map<number, string>>): TextRun[] {
  const runs: TextRun[] = [];
  let searchFrom = 0;
  for (;;) {
    const btStart = stream.indexOf('BT\n', searchFrom);
    if (btStart < 0) break;
    const etIndex = stream.indexOf('ET', btStart);
    if (etIndex < 0) break;
    const body = stream.slice(btStart + 3, etIndex);
    searchFrom = etIndex + 2;

    const operands: Array<{ hex?: string; name?: string; number?: number }> = [];
    let font: string | null = null;
    let fontSize: number | null = null;
    let matrix: number[] | null = null;
    let pendingTd: number[] | null = null;
    const glyphs: Glyph[] = [];

    TOKEN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN.exec(body)) !== null) {
      const [raw, hex, name, number, op] = match;
      if (hex !== undefined) { operands.push({ hex: hex.slice(1, -1) }); continue; }
      if (name !== undefined) { operands.push({ name }); continue; }
      if (number !== undefined) { operands.push({ number: Number(number) }); continue; }
      if (raw === '[' || raw === ']') { operands.length = 0; continue; }
      if (op === undefined) continue;
      switch (op) {
        case 'Tf':
          font = operands[operands.length - 2]?.name ?? font;
          fontSize = operands[operands.length - 1]?.number ?? fontSize;
          break;
        case 'Tm':
          matrix = operands.slice(-6).map((entry) => entry.number as number);
          break;
        case 'Td':
          pendingTd = operands.slice(-2).map((entry) => entry.number as number);
          break;
        case 'Tj': {
          const value = operands[operands.length - 1];
          if (value?.hex !== undefined) {
            glyphs.push({ gid: parseInt(value.hex, 16), dx: pendingTd ? pendingTd[0] : 0, font, fontSize, matrix });
          }
          pendingTd = null;
          break;
        }
        default:
          break;
      }
      operands.length = 0;
    }

    if (glyphs.length && glyphs[0].font && glyphs[0].fontSize !== null && glyphs[0].matrix) {
      const text = glyphs.map((glyph) => gidToTextByFont.get(glyph.font!)?.get(glyph.gid) ?? '�').join('');
      runs.push({
        btStart, etIndex, glyphs, text,
        font: glyphs[0].font!, fontSize: glyphs[0].fontSize!, matrix: glyphs[0].matrix!
      });
    }
  }
  return runs;
}

/** Join rendered lines back into prose. A line ending in a hyphen continues the same word. */
function joinLines(lines: string[]): string {
  return lines.reduce((text, line, index) => {
    if (index === 0) return line;
    return text.endsWith('-') ? `${text}${line}` : `${text} ${line}`;
  }, '');
}

/** Chromium prints numbers with a stripped leading zero; match that shape. */
function num(value: number): string {
  const rounded = Number(value.toFixed(7));
  const text = String(rounded);
  if (text.startsWith('0.')) return text.slice(1);
  if (text.startsWith('-0.')) return `-${text.slice(2)}`;
  return text;
}

export async function applyPdfNativeCopyRecovery(
  sourceBytes: Buffer,
  plan: PdfNativeRecoveryPlan
): Promise<PdfNativeRecoveryResult> {
  const doc = await PDFDocument.load(sourceBytes, { updateMetadata: false });
  const page = doc.getPages()[plan.page - 1];
  assert.ok(page, `page ${plan.page} does not exist`);

  const resources = page.node.Resources();
  assert.ok(resources, `page ${plan.page} has no resource dictionary`);
  const fonts = resources.lookup(PDFName.of('Font'), PDFDict) as any;
  assert.ok(fonts, `page ${plan.page} has no font resources`);
  const gidToTextByFont = new Map<string, Map<number, string>>();
  const mapsByFont = new Map<string, ReturnType<typeof readToUnicode> & ReturnType<typeof readWidths>>();
  for (const [key, ref] of fonts.entries()) {
    const dict = doc.context.lookup(ref, PDFDict);
    const map = readToUnicode(doc.context, dict);
    gidToTextByFont.set(key.toString(), map.gidToText);
    mapsByFont.set(key.toString(), { ...map, ...readWidths(doc.context, dict) });
  }

  // Page.Contents() resolves to the stream object; the indirect reference is what gets reassigned.
  const contentsRef = page.node.get(PDFName.of('Contents')) as any;
  assert.equal(contentsRef?.constructor?.name, 'PDFRef', 'page content is not a single indirect stream');
  const stream = streamText(doc.context, contentsRef);
  const runs = parseTextRuns(stream, gidToTextByFont);

  // Locate by rendered text, never by index, so a document that is not the authorised source fails.
  const firstIndex = runs.findIndex((run) => run.text === plan.originalLines[0]);
  assert.ok(firstIndex >= 0, 'the paragraph to correct was not found on the target page');
  const target = runs.slice(firstIndex, firstIndex + plan.originalLines.length);
  assert.deepEqual(target.map((run) => run.text), plan.originalLines, 'the page paragraph does not match the authorised source');

  const font = target[0].font;
  const fontSize = target[0].fontSize;
  assert.ok(target.every((run) => run.font === font && run.fontSize === fontSize), 'paragraph is not a single font/size');

  const { textToGid, widths, defaultWidth } = mapsByFont.get(font)!;
  const advance = (ch: string) => ((widths.get(textToGid.get(ch)!) ?? defaultWidth) / 1000) * fontSize;
  const width = (value: string) => [...value].reduce((sum, ch) => sum + advance(ch), 0);
  const encodeGlyphs = (value: string) => {
    const missing = [...new Set([...value])].filter((ch) => !textToGid.has(ch));
    assert.equal(missing.length, 0, `characters absent from the embedded subset: ${JSON.stringify(missing)}`);
    return [...value].map((ch) => textToGid.get(ch)!.toString(16).padStart(4, '0').toUpperCase());
  };

  // Column bound taken from the page's own widest body line, so the re-wrapped paragraph can never
  // be wider than the layout the original renderer already produced.
  const bodyRuns = runs.filter((run) => run.font === font && run.fontSize === fontSize);
  const columnWidth = Math.max(...bodyRuns.map((run) => width(run.text)));

  const originalParagraph = joinLines(plan.originalLines);
  assert.ok(originalParagraph.includes(plan.removedSentence), 'the sentence to remove is not in the source paragraph');
  const revisedParagraph = originalParagraph.replace(plan.removedSentence, plan.addedSentence);
  assert.equal(
    revisedParagraph.replace(plan.addedSentence, plan.removedSentence),
    originalParagraph,
    'more than the authorised sentence changed'
  );

  // Greedy wrap, the rule the original ragged-right paragraph already follows.
  const wrapped: string[] = [];
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
    wrapped.length <= plan.originalLines.length,
    `the revised paragraph needs ${wrapped.length} lines but only ${plan.originalLines.length} line positions exist`
  );
  for (const wrappedLine of wrapped) {
    assert.ok(width(wrappedLine) <= columnWidth, 'a re-wrapped line exceeds the page column width');
  }

  const buildBody = (text: string, matrix: number[]) => {
    const hex = encodeGlyphs(text);
    const parts = [`${font} ${num(fontSize)} Tf`, `${matrix.map(num).join(' ')} Tm`];
    [...text].forEach((_, index) => {
      if (index === 0) { parts.push(`<${hex[0]}> Tj`); return; }
      parts.push(`${num(advance(text[index - 1]))} 0 Td <${hex[index]}> Tj`);
    });
    return `\n${parts.join('\n')}\n`;
  };

  // Apply back-to-front so earlier offsets stay valid.
  let revisedStream = stream;
  for (let i = target.length - 1; i >= 0; i -= 1) {
    const run = target[i];
    const body = i < wrapped.length ? buildBody(wrapped[i], run.matrix) : '\n';
    revisedStream = revisedStream.slice(0, run.btStart + 3) + body + revisedStream.slice(run.etIndex);
  }

  const contentStream = doc.context.lookup(contentsRef) as any;
  const deflated = zlib.deflateSync(Buffer.from(revisedStream, 'latin1'));
  const replacement = PDFRawStream.of(contentStream.dict, deflated);
  replacement.dict.set(PDFName.of('Length'), doc.context.obj(deflated.length));
  doc.context.assign(contentsRef, replacement);

  const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
  return {
    bytes,
    sha256: sha256(bytes),
    pageCount: doc.getPageCount(),
    fontResource: font,
    fontSize,
    columnWidth: Number(columnWidth.toFixed(4)),
    originalParagraph,
    revisedParagraph,
    revisedLines: wrapped,
    originalLineWidths: plan.originalLines.map((value) => Number(width(value).toFixed(2))),
    revisedLineWidths: wrapped.map((value) => Number(width(value).toFixed(2))),
    lineBaselines: target.map((run) => run.matrix[5])
  };
}

/**
 * The single authorised historical case: the owner-rejected price framing on page 22 of
 * RPT-MKFRS-2026-63D3103D95-V1. Pinned here rather than passed in, so the correction cannot be
 * pointed at a different document or a different sentence by a caller.
 */
export const MOTHEO_V1_PAGE_22_PLAN: PdfNativeRecoveryPlan = {
  page: 22,
  removedSentence: 'The value of the sustainment route is not a price-based assurance claim.',
  addedSentence: 'The value of the sustainment route is sustained readiness and early detection of drift.',
  originalLines: [
    'The value of the sustainment route is not a price-based assurance claim. It is the ability to',
    'keep readiness visible in ordinary management routines and to detect early drift before',
    'ownership, treatment or review information falls behind the operating model. The twelve-',
    'month path should therefore begin by preserving the current standard, embed the',
    'disciplines into governance, measure the resulting signals and optimise only when the',
    'preceding cycle is repeatable.'
  ]
};
