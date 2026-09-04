/**
 * Deterministic helpers for reading an embedded Identity-H CIDFontType2 subset well enough to
 * re-emit text in the *same* font: Unicode -> glyph id (inverted from the font's own /ToUnicode
 * CMap) and glyph id -> advance width (from the descendant font's /W array).
 *
 * Nothing here rasterises, re-embeds or substitutes a font. If a character is not already in the
 * subset the caller is told, so replacement copy can never silently fall back to a different face.
 */
import zlib from 'node:zlib';
import { PDFName, PDFArray, PDFDict, PDFNumber, PDFRawStream } from 'pdf-lib';

export function streamText(context, streamOrRef) {
  const stream = context.lookup(streamOrRef);
  let raw = stream instanceof PDFRawStream ? stream.contents : stream.getContents();
  const filter = stream.dict.get(PDFName.of('Filter'))?.toString() ?? '';
  if (filter.includes('FlateDecode')) raw = zlib.inflateSync(Buffer.from(raw));
  return Buffer.from(raw).toString('latin1');
}

/** Parse a ToUnicode CMap into glyph-id -> string, then invert it. */
export function readToUnicode(context, fontDict) {
  const ref = fontDict.get(PDFName.of('ToUnicode'));
  if (!ref) throw new Error('font has no ToUnicode CMap');
  const text = streamText(context, ref);

  const gidToText = new Map();
  const hexToString = (hex) => {
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
      for (let gid = lo; gid <= hi; gid += 1) {
        gidToText.set(gid, String.fromCharCode(start + (gid - lo)));
      }
    }
  }

  const textToGid = new Map();
  for (const [gid, value] of gidToText) {
    // A subset can map several glyph ids to the same text (e.g. an "fi" ligature and its parts).
    // Keep the lowest id deterministically so repeated runs produce identical bytes.
    const existing = textToGid.get(value);
    if (existing === undefined || gid < existing) textToGid.set(value, gid);
  }
  return { gidToText, textToGid };
}

/** Parse the descendant font's /W array into glyph-id -> width in 1/1000 em. */
export function readWidths(context, fontDict) {
  const descendants = context.lookup(fontDict.get(PDFName.of('DescendantFonts')), PDFArray);
  const descendant = context.lookup(descendants.get(0), PDFDict);
  const defaultWidth = context.lookup(descendant.get(PDFName.of('DW')));
  const widths = new Map();
  const wArray = descendant.get(PDFName.of('W'));
  if (wArray) {
    const w = context.lookup(wArray, PDFArray);
    let i = 0;
    while (i < w.size()) {
      const first = context.lookup(w.get(i), PDFNumber).asNumber();
      const next = context.lookup(w.get(i + 1));
      if (next instanceof PDFArray) {
        for (let k = 0; k < next.size(); k += 1) {
          widths.set(first + k, context.lookup(next.get(k), PDFNumber).asNumber());
        }
        i += 2;
      } else {
        const last = context.lookup(w.get(i + 1), PDFNumber).asNumber();
        const width = context.lookup(w.get(i + 2), PDFNumber).asNumber();
        for (let gid = first; gid <= last; gid += 1) widths.set(gid, width);
        i += 3;
      }
    }
  }
  return { widths, defaultWidth: defaultWidth instanceof PDFNumber ? defaultWidth.asNumber() : 1000 };
}

/** Encode a string as an Identity-H hex run. Throws if any character is outside the subset. */
export function encodeHex(value, textToGid) {
  const missing = [...new Set([...value])].filter((ch) => !textToGid.has(ch));
  if (missing.length) throw new Error(`characters absent from the embedded subset: ${JSON.stringify(missing)}`);
  return [...value].map((ch) => textToGid.get(ch).toString(16).padStart(4, '0').toUpperCase()).join('');
}

/** Advance width of a string in text-space units (1/1000 em). */
export function measure(value, textToGid, widths, defaultWidth) {
  let total = 0;
  for (const ch of value) {
    const gid = textToGid.get(ch);
    total += widths.get(gid) ?? defaultWidth;
  }
  return total;
}
