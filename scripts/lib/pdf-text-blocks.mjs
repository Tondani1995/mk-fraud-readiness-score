/**
 * Minimal reader for the text-showing shape Chromium emits: inside BT/ET it sets a font with Tf,
 * an absolute matrix with Tm, and then one `<gid> Tj` per glyph, each preceded by its own relative
 * `dx 0 Td` advance. That shape is what makes a bounded, in-place copy correction possible: every
 * glyph carries its own explicit advance, so there is no kerning array to preserve and no reflow
 * beyond the runs actually rewritten.
 *
 * This parser is deliberately narrow. It recognises exactly that shape and reports anything else,
 * rather than guessing.
 */

const TOKEN = /(<[0-9A-Fa-f]*>)|(\/[A-Za-z0-9#+.-]+)|(-?\d*\.?\d+)|([A-Za-z'"*]+)|(\[)|(\])/g;

export function parseTextRuns(stream, gidToTextByFont) {
  const runs = [];
  let btStart = -1;
  let searchFrom = 0;

  for (;;) {
    btStart = stream.indexOf('BT\n', searchFrom);
    if (btStart < 0) break;
    const etIndex = stream.indexOf('ET', btStart);
    if (etIndex < 0) break;
    const body = stream.slice(btStart + 3, etIndex);
    searchFrom = etIndex + 2;

    const operands = [];
    let font = null;
    let fontSize = null;
    let matrix = null;
    let pendingTd = null;
    const glyphs = [];

    TOKEN.lastIndex = 0;
    let match;
    while ((match = TOKEN.exec(body)) !== null) {
      const [raw, hex, name, number, op] = match;
      if (hex !== undefined) { operands.push({ hex: hex.slice(1, -1) }); continue; }
      if (name !== undefined) { operands.push({ name }); continue; }
      if (number !== undefined) { operands.push({ number: Number(number) }); continue; }
      if (raw === '[' || raw === ']') { operands.length = 0; continue; }
      if (op === undefined) continue;

      switch (op) {
        case 'Tf': {
          font = operands[operands.length - 2]?.name ?? font;
          fontSize = operands[operands.length - 1]?.number ?? fontSize;
          break;
        }
        case 'Tm': {
          matrix = operands.slice(-6).map((entry) => entry.number);
          break;
        }
        case 'Td': {
          pendingTd = operands.slice(-2).map((entry) => entry.number);
          break;
        }
        case 'Tj': {
          const value = operands[operands.length - 1];
          if (value?.hex !== undefined) {
            glyphs.push({
              gid: parseInt(value.hex, 16),
              hex: value.hex,
              dx: pendingTd ? pendingTd[0] : 0,
              dy: pendingTd ? pendingTd[1] : 0,
              font,
              fontSize,
              matrix,
              start: btStart + 3 + match.index,
              end: btStart + 3 + match.index + raw.length
            });
          }
          pendingTd = null;
          break;
        }
        default:
          break;
      }
      operands.length = 0;
    }

    if (glyphs.length) {
      const text = glyphs
        .map((glyph) => gidToTextByFont.get(glyph.font)?.get(glyph.gid) ?? '�')
        .join('');
      runs.push({ btStart, etIndex, body, glyphs, text, font: glyphs[0].font, fontSize: glyphs[0].fontSize, matrix: glyphs[0].matrix });
    }
  }
  return runs;
}
